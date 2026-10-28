// Shared types for storage://: an entry (a file or folder in a mount), the
// driver a provider implements, and the one error.

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
  /** When it last changed, ISO 8601 in UTC. */
  modified: string;
  /** The provider's MIME type, when it has one. */
  type?: string;
  /** A Google Doc, Sheet, Slides or other Google file: read as an export, never written. */
  native?: boolean;
}

/** What a driver returns: an entry without its address, which the mount adds. */
export type Item = Omit<Entry, 'uri'>;

/** One provider. Paths are relative to the mount's folder; `''` is the folder itself. */
export interface Driver {
  /** The item at `path`, or undefined when there is none. */
  stat(path: string): Promise<Item | undefined>;
  /** A folder's items. */
  list(folder: Item): Promise<Item[]>;
  read(file: Item): Promise<Uint8Array>;
  /**
   * Creates the file, making the folders above it as needed. Fails with
   * `conflict`, writing nothing, if anything already has that name.
   */
  create(path: string, content: Uint8Array): Promise<Item>;
}

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
