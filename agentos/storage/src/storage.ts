// The mounts, and the rules that hold whatever the provider: an address
// names a mount and a path, agents write only into write mounts, a write only
// ever creates a file (filed by the mount's pattern, versioned instead of
// overwritten), and everything an agent writes can carry a receipt.

import { formatBundle } from './bundle.ts';
import { checkLabel, fileName, newest, versionName, versionOf } from './names.ts';
import { StorageError, TAKEN } from './types.ts';
import type { Access, Comment, Driver, Entry, Item, Receipt } from './types.ts';
import { formatUri, joinPath, namesOf, parseUri, within } from './uri.ts';

export interface Mount {
  name: string;
  driver: Driver;
  access: Access;
  /** How new files are named, such as `{date}-{name}`. */
  fileAs?: string;
}

export interface WriteOptions {
  /** If the name is taken, write the next version (`post v2.md`) instead of failing. */
  version?: boolean;
  /** Who is writing and from what: kept on the file, out of its content. */
  receipt?: { agent?: string; job?: string; basedOn?: string[] };
  /** The clock for filing patterns. */
  now?: Date;
}

export interface ReceiptCheck {
  entry: Entry;
  receipt?: Receipt;
  sources: { id: string; name?: string; then: string; now?: string; state: 'unchanged' | 'changed' | 'missing' }[];
  /** A source has changed or gone since the file was written. */
  stale: boolean;
}

export interface Changes {
  /** Pass it back next time. */
  cursor: string;
  files: { uri: string; kind: 'new' | 'edited' | 'removed'; entry?: Entry }[];
  /** New comments and replies on recent files in write mounts. */
  comments: { uri: string; comment: Comment }[];
}

const MAX_SOURCES = 5;
const COMMENT_DAYS = 30;
const TEXT_TYPES = ['application/json', 'application/yaml', 'application/x-yaml', 'application/xml'];
const TEXT_EXTENSIONS = ['md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'csv'];

export class Storage {
  readonly mounts: readonly Mount[];
  private readonly named = new Map<string, Mount>();
  private readonly now: () => Date;

  constructor(mounts: Mount[], options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
    for (const mount of mounts) {
      if (this.named.has(mount.name)) throw new StorageError('config', `two mounts are called \`${mount.name}\``);
      this.named.set(mount.name, mount);
    }
    this.mounts = mounts;
  }

  /** One file or folder. */
  stat(uri: string): Promise<Entry> {
    return this.at(uri, async (mount, path) => {
      const item = await mount.driver.stat(path);
      if (!item) throw new StorageError('not-found', 'does not exist');
      return entryOf(mount, item);
    });
  }

  /** A folder's entries, sorted by name. A file lists as itself. */
  async list(uri: string): Promise<Entry[]> {
    const entry = await this.stat(uri);
    if (entry.kind === 'file') return [entry];
    return this.at(uri, async (mount) => (await mount.driver.list(entry)).map((item) => entryOf(mount, item)));
  }

  /** A file's bytes. Google Docs come as Markdown, Sheets as CSV, Slides as plain text. */
  async read(uri: string): Promise<{ entry: Entry; content: Uint8Array }> {
    const entry = await this.stat(uri);
    return this.at(uri, async (mount) => {
      if (entry.kind === 'folder') throw new StorageError('unsupported', 'is a folder: list it instead');
      return { entry, content: await mount.driver.read(entry) };
    });
  }

  async readText(uri: string): Promise<string> {
    return new TextDecoder().decode((await this.read(uri)).content);
  }

  /** The newest version of a name in its folder: by the date its mount's pattern put in it, then by version. */
  latest(uri: string): Promise<Entry> {
    return this.at(uri, async (mount, path) => {
      const names = namesOf(path);
      const name = names.pop();
      if (name === undefined) throw new StorageError('usage', 'name a file, not the mount');
      const folder = await mount.driver.stat(names.join('/'));
      if (!folder || folder.kind !== 'folder') throw new StorageError('not-found', 'has no versions: its folder does not exist');
      const files = (await mount.driver.list(folder)).filter((item) => item.kind === 'file');
      const pick = newest(name, mount.fileAs, files.map((item) => item.name));
      if (pick === undefined) throw new StorageError('not-found', 'has no versions');
      const matches = files.filter((item) => item.name === pick);
      if (matches.length > 1) throw new StorageError('ambiguous', `${matches.length} items in one folder are named \`${pick}\`: rename or remove all but one in Drive`);
      return entryOf(mount, matches[0]!);
    });
  }

  /**
   * Creates a file, and the folders above it. It never replaces anything: a
   * taken name is a `conflict`, or with `version`, the next version is written.
   * In a mount with a filing pattern, the name is filed by it; the entry has the real address.
   */
  write(uri: string, content: string | Uint8Array, options: WriteOptions = {}): Promise<Entry> {
    return this.at(uri, async (mount, path) => {
      if (mount.access !== 'write') {
        throw new StorageError('read-only', `the \`${mount.name}\` mount is read-only. Write somewhere else, or give the mount access: write in the config`);
      }
      if (path === '') throw new StorageError('usage', 'name a file under the mount, not the mount itself');
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      const names = namesOf(path);
      const given = names.pop()!;
      const folder = names.join('/');
      const filed = mount.fileAs ? fileName(mount.fileAs, given, options.now ?? this.now()) : given;
      const labels = options.receipt ? await this.labels(options.receipt) : undefined;
      if (!options.version) return entryOf(mount, await mount.driver.create(joinPath(folder, filed), bytes, labels));
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const next = await this.nextVersion(mount, folder, filed);
        try {
          return entryOf(mount, await mount.driver.create(joinPath(folder, versionName(filed, next)), bytes, labels));
        } catch (error) {
          // Another writer took that version's name first: try the one after.
          if (!(error instanceof StorageError && error.code === 'conflict' && error.message.startsWith(TAKEN))) throw error;
        }
      }
      throw new StorageError('conflict', 'other writers kept taking the next version name. Nothing was written: try again');
    });
  }

  /** People's comments on a file: the open ones, or all with `all`. */
  async comments(uri: string, options: { all?: boolean } = {}): Promise<Comment[]> {
    const entry = await this.stat(uri);
    return this.at(uri, async (mount) => {
      if (entry.kind === 'folder') throw new StorageError('unsupported', 'is a folder: comments are on files');
      return (await mount.driver.comments(entry)).filter((comment) => options.all || !comment.resolved);
    });
  }

  /** Who wrote a file and from what, and whether any source has changed or gone since. */
  async receipt(uri: string): Promise<ReceiptCheck> {
    const entry = await this.stat(uri);
    return this.at(uri, async (mount) => {
      const sources: ReceiptCheck['sources'] = [];
      for (const source of entry.receipt?.sources ?? []) {
        const now = await mount.driver.byId(source.id);
        sources.push({
          id: source.id,
          name: now?.name,
          then: source.revision,
          now: now?.revision,
          state: now === undefined ? 'missing' : now.revision === source.revision ? 'unchanged' : 'changed',
        });
      }
      return { entry, receipt: entry.receipt, sources, stale: sources.some((source) => source.state !== 'unchanged') };
    });
  }

  /** Every file under a folder that reads as text, as one Markdown document, within `maxBytes` (512 KB). */
  async bundle(uri: string, options: { maxBytes?: number } = {}): Promise<string> {
    const top = await this.stat(uri);
    return this.at(uri, async (mount) => {
      if (top.kind === 'file') throw new StorageError('unsupported', 'is a file: bundle its folder, or cat it');
      const maxBytes = options.maxBytes ?? 512 * 1024;
      const included: { entry: Entry; text: string }[] = [];
      const leftOut: { entry: Entry; why: string }[] = [];
      let used = 0;
      for (const item of await this.files(mount, top)) {
        const entry = entryOf(mount, item);
        if (!readsAsText(item)) {
          leftOut.push({ entry, why: "can't be read as text" });
          continue;
        }
        if (item.size !== undefined && !item.native && used + item.size > maxBytes) {
          leftOut.push({ entry, why: 'over the size limit' });
          continue;
        }
        let content: Uint8Array;
        try {
          content = await mount.driver.read(item);
        } catch (error) {
          if (!(error instanceof StorageError && error.code === 'unsupported')) throw error;
          leftOut.push({ entry, why: "can't be read as text" });
          continue;
        }
        if (used + content.byteLength > maxBytes) {
          leftOut.push({ entry, why: 'over the size limit' });
          continue;
        }
        used += content.byteLength;
        included.push({ entry, text: new TextDecoder().decode(content) });
      }
      return formatBundle(top, included, leftOut, this.now());
    });
  }

  /**
   * What's new under an address since `cursor`: files made, edited or moved to
   * the trash, and new comments on recent files in write mounts. Without a
   * cursor, it gives only a starting one.
   */
  changes(uri: string, cursor?: string): Promise<Changes> {
    return this.at(uri, async (mount, path) => {
      const now = this.now();
      if (cursor === undefined) {
        const start = await mount.driver.changes();
        return { cursor: encodeCursor(start.cursor, now), files: [], comments: [] };
      }
      const { feed, since } = decodeCursor(cursor);
      const result = await mount.driver.changes(feed);
      const files: Changes['files'] = result.changes
        .filter((change) => within(change.path, path))
        .map((change) => ({
          uri: formatUri(mount.name, change.path),
          kind: change.kind === 'removed' ? 'removed' : change.item?.created && change.item.created >= since ? 'new' : 'edited',
          ...(change.item ? { entry: entryOf(mount, change.item) } : {}),
        }));
      const comments: Changes['comments'] = [];
      if (mount.access === 'write') {
        const top = await mount.driver.stat(path);
        const recent = new Date(now.getTime() - COMMENT_DAYS * 24 * 3600 * 1000).toISOString();
        const candidates = !top ? [] : top.kind === 'file' ? [top] : await this.files(mount, top);
        for (const item of candidates) {
          if ((item.created ?? item.modified) < recent) continue;
          for (const comment of await mount.driver.comments(item, since)) {
            comments.push({ uri: formatUri(mount.name, item.path), comment });
          }
        }
      }
      return { cursor: encodeCursor(result.cursor, now), files, comments };
    });
  }

  /** Every file under a folder, in path order. */
  private async files(mount: Mount, folder: Item): Promise<Item[]> {
    const found: Item[] = [];
    for (const item of await mount.driver.list(folder)) {
      if (item.kind === 'folder') found.push(...(await this.files(mount, item)));
      else found.push(item);
    }
    return found;
  }

  /** The next free version number of `name` in a folder. */
  private async nextVersion(mount: Mount, folder: string, name: string): Promise<number> {
    const parent = await mount.driver.stat(folder);
    if (!parent || parent.kind !== 'folder') return 1;
    const taken = (await mount.driver.list(parent)).map((item) => versionOf(name, item.name)).filter((n): n is number => n !== undefined);
    return taken.length === 0 ? 1 : Math.max(...taken) + 1;
  }

  /** A receipt as the file's hidden labels: the agent, the job, and each source's id and revision now. */
  private async labels(receipt: NonNullable<WriteOptions['receipt']>): Promise<Record<string, string>> {
    const labels: Record<string, string> = {};
    if (receipt.agent) labels.storage_agent = receipt.agent;
    if (receipt.job) labels.storage_job = receipt.job;
    const sources = receipt.basedOn ?? [];
    if (sources.length > MAX_SOURCES) throw new StorageError('usage', `a receipt holds up to ${MAX_SOURCES} sources, not ${sources.length}`);
    for (const [index, source] of sources.entries()) {
      const entry = await this.stat(source);
      if (entry.kind !== 'file') throw new StorageError('usage', `${source} is a folder: a receipt's sources are files`);
      labels[`storage_source_${index + 1}`] = `${entry.id}@${entry.revision}`;
    }
    for (const [key, value] of Object.entries(labels)) checkLabel(key, value);
    return labels;
  }

  /** Runs `work` on the address's mount and path, with the address at the front of any error. */
  private async at<T>(uri: string, work: (mount: Mount, path: string) => Promise<T>): Promise<T> {
    const { mount: name, path } = parseUri(uri);
    const mount = this.named.get(name);
    if (!mount) {
      throw new StorageError('usage', `${uri}: there is no \`${name}\` mount (the mounts are: ${[...this.named.keys()].join(', ') || 'none'})`);
    }
    try {
      return await work(mount, path);
    } catch (error) {
      if (error instanceof StorageError && !error.message.startsWith('storage://')) {
        throw new StorageError(error.code, `${uri}: ${error.message}`);
      }
      throw error;
    }
  }
}

function entryOf(mount: Mount, item: Item): Entry {
  const { labels, ...rest } = item;
  const receipt = receiptOf(labels);
  return { uri: formatUri(mount.name, item.path), ...rest, ...(receipt ? { receipt } : {}) };
}

function receiptOf(labels: Record<string, string> | undefined): Receipt | undefined {
  if (!labels) return undefined;
  const sources = Object.entries(labels)
    .map(([key, value]) => ({ index: Number(/^storage_source_(\d+)$/.exec(key)?.[1]), value }))
    .filter((source) => Number.isInteger(source.index) && source.value.includes('@'))
    .sort((a, b) => a.index - b.index)
    .map(({ value }) => ({ id: value.slice(0, value.indexOf('@')), revision: value.slice(value.indexOf('@') + 1) }));
  if (!labels.storage_agent && !labels.storage_job && sources.length === 0) return undefined;
  return { ...(labels.storage_agent ? { agent: labels.storage_agent } : {}), ...(labels.storage_job ? { job: labels.storage_job } : {}), sources };
}

function readsAsText(item: Item): boolean {
  if (item.native) return true;
  const type = item.type ?? '';
  const extension = item.name.includes('.') ? item.name.slice(item.name.lastIndexOf('.') + 1).toLowerCase() : '';
  return type.startsWith('text/') || TEXT_TYPES.includes(type) || TEXT_EXTENSIONS.includes(extension);
}

function encodeCursor(feed: string, since: Date): string {
  return Buffer.from(JSON.stringify({ feed, since: since.toISOString() })).toString('base64url');
}

function decodeCursor(cursor: string): { feed: string; since: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { feed?: unknown; since?: unknown };
    if (typeof value.feed === 'string' && typeof value.since === 'string' && !Number.isNaN(Date.parse(value.since))) {
      return { feed: value.feed, since: value.since };
    }
  } catch {
    // falls through to the error
  }
  throw new StorageError('usage', "that isn't a storage changes cursor");
}
