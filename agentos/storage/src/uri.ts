// storage://<mount>/<path>: the mount names what a folder is, and the path is
// names as Drive shows them, separated by `/`.

import { StorageError } from './types.ts';

const SCHEME = 'storage://';
export const MOUNT_NAME = /^[a-z0-9][a-z0-9_-]*$/;

export interface Address {
  mount: string;
  path: string;
}

export function parseUri(uri: string): Address {
  if (!uri.startsWith(SCHEME)) throw new StorageError('usage', `\`${uri}\` is not a storage:// address`);
  const rest = uri.slice(SCHEME.length);
  const slash = rest.indexOf('/');
  const mount = slash === -1 ? rest : rest.slice(0, slash);
  if (!MOUNT_NAME.test(mount)) throw new StorageError('usage', `\`${uri}\`: \`${mount}\` is not a mount name`);
  const tail = slash === -1 ? '' : rest.slice(slash + 1).replace(/\/+$/, '');
  const names = tail === '' ? [] : tail.split('/');
  for (const name of names) {
    if (name === '' || name === '.' || name === '..' || name.includes('\0')) {
      throw new StorageError('usage', `\`${uri}\`: \`${name}\` is not a name`);
    }
  }
  return { mount, path: names.join('/') };
}

export function formatUri(mount: string, path: string): string {
  return path === '' ? `${SCHEME}${mount}` : `${SCHEME}${mount}/${path}`;
}

/** The names in a path; `''` has none. */
export function namesOf(path: string): string[] {
  return path === '' ? [] : path.split('/');
}

export function joinPath(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

/** Whether `path` is `prefix` or sits under it. */
export function within(path: string, prefix: string): boolean {
  return prefix === '' || path === prefix || path.startsWith(`${prefix}/`);
}
