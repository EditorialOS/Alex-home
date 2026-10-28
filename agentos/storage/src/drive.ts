// Google Drive, through its v3 REST API. Paths are walked by name, one folder
// at a time. Google Docs, Sheets and Slides are exported when read and never
// written. Files are only created, never replaced: Drive has no write that
// checks a file is unchanged, so replacing one could overwrite a person's edit.

import { randomBytes } from 'node:crypto';
import type { Http } from './http.ts';
import { StorageError } from './types.ts';
import type { Driver, Item } from './types.ts';
import { joinPath, namesOf } from './uri.ts';

const FOLDER = 'application/vnd.google-apps.folder';
const GOOGLE = 'application/vnd.google-apps.';
const FIELDS = 'id,name,mimeType,size,modifiedTime,md5Checksum,version';
const MAX_UPLOAD = 5 * 1024 * 1024;

/** What each kind of Google file is read as, in order of preference. */
const EXPORTS: Record<string, string[]> = {
  'application/vnd.google-apps.document': ['text/markdown', 'text/plain'],
  'application/vnd.google-apps.spreadsheet': ['text/csv'],
  'application/vnd.google-apps.presentation': ['text/plain'],
};

const GOOGLE_NAMES: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.form': 'Google Form',
  'application/vnd.google-apps.shortcut': 'shortcut',
};

const TYPES: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  csv: 'text/csv',
  html: 'text/html',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  md5Checksum?: string;
  version?: string;
}

export interface DriveOptions {
  http: Http;
  /** The mount's folder id; `root` is My Drive. */
  folder: string;
  /** Default https://www.googleapis.com. */
  apiUrl?: string;
}

export class DriveDriver implements Driver {
  private readonly http: Http;
  private readonly folder: string;
  private readonly api: string;
  private root?: Promise<DriveFile>;

  constructor(options: DriveOptions) {
    this.http = options.http;
    this.folder = options.folder;
    this.api = (options.apiUrl ?? 'https://www.googleapis.com').replace(/\/+$/, '');
  }

  async stat(path: string): Promise<Item | undefined> {
    let file = await this.top();
    for (const name of namesOf(path)) {
      if (file.mimeType !== FOLDER) return undefined;
      const next = await this.child(file.id, name);
      if (!next) return undefined;
      file = next;
    }
    return itemOf(file, path);
  }

  async list(folder: Item): Promise<Item[]> {
    const files = await this.query(`'${quote(folder.id)}' in parents and trashed = false`);
    return files.map((file) => itemOf(file, joinPath(folder.path, file.name))).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async read(file: Item): Promise<Uint8Array> {
    if (!file.native) {
      return this.http.bytes('GET', `${this.api}/drive/v3/files/${file.id}`, { query: { alt: 'media', supportsAllDrives: true }, safe: true });
    }
    const types = EXPORTS[file.type ?? ''];
    if (!types) throw new StorageError('unsupported', `is a ${describeType(file.type)}, which can't be read as text`);
    for (const [index, type] of types.entries()) {
      try {
        return await this.http.bytes('GET', `${this.api}/drive/v3/files/${file.id}/export`, { query: { mimeType: type }, safe: true });
      } catch (error) {
        // Drive refusing one export format (400) moves on to the next.
        const last = index === types.length - 1;
        if (last || !(error instanceof StorageError) || error.code !== 'provider') throw error;
      }
    }
    throw new StorageError('unsupported', `is a ${describeType(file.type)}, which can't be read as text`);
  }

  async create(path: string, content: Uint8Array): Promise<Item> {
    if (content.byteLength > MAX_UPLOAD) {
      throw new StorageError('unsupported', `is ${(content.byteLength / 1024 / 1024).toFixed(1)} MB: Drive takes up to 5 MB in one request, and v0.1 sends only one`);
    }
    const names = namesOf(path);
    const name = names.pop()!;
    const parent = await this.folderAt(names);
    if (await this.child(parent.id, name)) {
      throw new StorageError('conflict', 'already exists. Nothing was written: write it under a new name');
    }
    const { body, type } = related({ name, parents: [parent.id] }, content, typeOf(name));
    const file = await this.http.json<DriveFile>('POST', `${this.api}/upload/drive/v3/files`, {
      query: { uploadType: 'multipart', supportsAllDrives: true, fields: FIELDS },
      headers: { 'content-type': type },
      body,
    });
    return itemOf(file, path);
  }

  /** The mount's folder, looked up once. */
  private top(): Promise<DriveFile> {
    this.root ??= this.http
      .json<DriveFile>('GET', `${this.api}/drive/v3/files/${this.folder}`, { query: { fields: FIELDS, supportsAllDrives: true }, safe: true })
      .then(
        (file) => {
          if (file.mimeType !== FOLDER) throw new StorageError('config', `the mount's folder \`${this.folder}\` is a file, not a folder`);
          return file;
        },
        (error: unknown) => {
          if (error instanceof StorageError && error.code === 'not-found') {
            throw new StorageError('config', `the mount's folder \`${this.folder}\` was not found, or this Google account can't see it`);
          }
          throw error;
        },
      )
      .catch((error: unknown) => {
        this.root = undefined; // try again next time
        throw error;
      });
    return this.root;
  }

  /** The one item called `name` in a folder. */
  private async child(parent: string, name: string): Promise<DriveFile | undefined> {
    const found = await this.query(`'${quote(parent)}' in parents and name = '${quote(name)}' and trashed = false`);
    if (found.length > 1) {
      throw new StorageError('ambiguous', `${found.length} items in one folder are named \`${name}\`: rename or remove all but one in Drive`);
    }
    return found[0];
  }

  /** The folder at `names` under the mount, made where missing. */
  private async folderAt(names: string[]): Promise<DriveFile> {
    let folder = await this.top();
    for (const name of names) {
      const next = await this.child(folder.id, name);
      if (next && next.mimeType !== FOLDER) throw new StorageError('conflict', `\`${name}\` is a file, not a folder`);
      folder =
        next ??
        (await this.http.json<DriveFile>('POST', `${this.api}/drive/v3/files`, {
          query: { supportsAllDrives: true, fields: FIELDS },
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, mimeType: FOLDER, parents: [folder.id] }),
        }));
    }
    return folder;
  }

  /** Every file matching `q`, across Drive's pages. */
  private async query(q: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.http.json<{ files?: DriveFile[]; nextPageToken?: string }>('GET', `${this.api}/drive/v3/files`, {
        query: {
          q,
          fields: `nextPageToken,files(${FIELDS})`,
          pageSize: 1000,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          ...(pageToken ? { pageToken } : {}),
        },
        safe: true,
      });
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }
}

/** A Google file's kind, in words: "Google Doc", "shortcut". */
export function describeType(type: string | undefined): string {
  return GOOGLE_NAMES[type ?? ''] ?? 'Google file';
}

function itemOf(file: DriveFile, path: string): Item {
  const folder = file.mimeType === FOLDER;
  return {
    path,
    name: file.name,
    kind: folder ? 'folder' : 'file',
    id: file.id,
    revision: file.md5Checksum ? `md5:${file.md5Checksum}` : `v${file.version ?? '0'}`,
    size: file.size === undefined ? undefined : Number(file.size),
    modified: new Date(file.modifiedTime).toISOString(),
    type: file.mimeType,
    native: !folder && file.mimeType.startsWith(GOOGLE) ? true : undefined,
  };
}

/** A name or id inside a Drive query string. */
function quote(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function typeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 && TYPES[name.slice(dot + 1).toLowerCase()]) || 'application/octet-stream';
}

/** A multipart/related body: the file's metadata as JSON, then its bytes. */
function related(metadata: object, content: Uint8Array, type: string): { body: Uint8Array; type: string } {
  const boundary = `storage-${randomBytes(16).toString('hex')}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    body: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--`)]),
    type: `multipart/related; boundary=${boundary}`,
  };
}
