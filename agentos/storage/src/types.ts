// Shared types for storage://: an entry (a file or folder in a mount), a
// comment, a receipt, the driver a provider implements, and the one error.

export type Access = 'read' | 'write';

/** A file or folder in a mount. */
export interface Entry {
  /** Its address: `storage://<mount>/<path>`. */
  uri: string;
  /** Its path under the mount; `''` is the mount's folder itself. */
  path: string;
  name: string;
  kind: 'file' | 'folder';
  /** The provider's own id for it. */
  id: string;
  /** Changes whenever the content changes. Compare it; never parse it. */
  revision: string;
  size?: number;
  /** When it was made, ISO 8601 in UTC. */
  created?: string;
  /** When it last changed, ISO 8601 in UTC. */
  modified: string;
  /** The provider's MIME type, when it has one. */
  type?: string;
  /** A Google Doc, Sheet, Slides or other Google file: read as an export, never written. */
  native?: boolean;
  /** Who wrote it and from what, when storage wrote it with a receipt. */
  receipt?: Receipt;
}

/** What a driver returns: an entry without its address or parsed receipt, which the mount adds. */
export type Item = Omit<Entry, 'uri' | 'receipt'> & {
  /** The provider's hidden labels on the file, where receipts live. */
  labels?: Record<string, string>;
};

export interface Receipt {
  agent?: string;
  job?: string;
  /** The files it was based on, by id and the revision they had when it was written. */
  sources: { id: string; revision: string }[];
}

export interface Comment {
  id: string;
  author: string;
  content: string;
  /** The passage the comment is about, when it is anchored to one. */
  quoted?: string;
  resolved: boolean;
  created: string;
  modified: string;
  replies: { author: string; content: string; created: string }[];
}

export interface DriverChange {
  path: string;
  kind: 'changed' | 'removed';
  item?: Item;
}

/** One provider. Paths are relative to the mount's folder; `''` is the folder itself. */
export interface Driver {
  /** The item at `path`, or undefined when there is none. */
  stat(path: string): Promise<Item | undefined>;
  /** A folder's items. */
  list(folder: Item): Promise<Item[]>;
  read(file: Item): Promise<Uint8Array>;
  /**
   * Creates the file, with `labels` hidden on it, making the folders above it
   * as needed. Fails with `conflict`, writing nothing, if the name is taken.
   */
  create(path: string, content: Uint8Array, labels?: Record<string, string>): Promise<Item>;
  /** A file's comments, all of them or those changed since `since`. */
  comments(file: Item, since?: string): Promise<Comment[]>;
  /** Any file by its id, wherever it is now, or undefined if it is gone or in the trash. */
  byId(id: string): Promise<{ name: string; revision: string } | undefined>;
  /** Without a cursor: a starting cursor and no changes. With one: what changed under the mount since, and a new cursor. */
  changes(cursor?: string): Promise<{ changes: DriverChange[]; cursor: string }>;
}

/** How a driver's `conflict` message starts when the name is taken, so versions know to try the next. */
export const TAKEN = 'already exists';

export type ErrorCode =
  | 'usage'
  | 'config'
  | 'not-found'
  | 'conflict'
  | 'read-only'
  | 'ambiguous'
  | 'unsupported'
  | 'auth'
  | 'provider';

export class StorageError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}
