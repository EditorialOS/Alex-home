// The mounts, and the rules that hold whatever the provider: an address
// names a mount and a path, a mount is read-only unless it says otherwise,
// and a write only ever creates a file.

import { StorageError } from './types.ts';
import type { Access, Driver, Entry, Item } from './types.ts';
import { formatUri, parseUri } from './uri.ts';

export interface Mount {
  name: string;
  driver: Driver;
  access: Access;
}

export class Storage {
  readonly mounts: readonly Mount[];
  private readonly named = new Map<string, Mount>();

  constructor(mounts: Mount[]) {
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

  /** Creates a file, and the folders above it. It never replaces anything: if the name is taken, it is a `conflict`. */
  write(uri: string, content: string | Uint8Array): Promise<Entry> {
    return this.at(uri, async (mount, path) => {
      if (mount.access !== 'write') {
        throw new StorageError('read-only', `the \`${mount.name}\` mount is read-only. Write somewhere else, or give the mount access: write in the config`);
      }
      if (path === '') throw new StorageError('usage', 'name a file under the mount, not the mount itself');
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      return entryOf(mount, await mount.driver.create(path, bytes));
    });
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
  return { uri: formatUri(mount.name, item.path), ...item };
}
