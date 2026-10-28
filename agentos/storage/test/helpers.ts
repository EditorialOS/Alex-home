// A Storage on the stand-in Drive: `drafts` (write) and `briefs` (read), each
// its own folder, on the stand-in's clock, with waits recorded instead of slept.

import { after } from 'node:test';
import { fixedToken } from '../src/auth.ts';
import type { Tokens } from '../src/auth.ts';
import { DriveDriver } from '../src/drive.ts';
import { Http } from '../src/http.ts';
import { Storage } from '../src/storage.ts';
import { FOLDER, fakeDrive } from './fake-drive.ts';
import type { FakeDrive } from './fake-drive.ts';

export interface Setup {
  drive: FakeDrive;
  storage: Storage;
  /** The folder ids behind each mount. */
  folders: { drafts: string; briefs: string };
  /** Every wait the client asked for, in ms. */
  waits: number[];
}

export async function setup(options: { tokens?: (drive: FakeDrive) => Tokens; fileAs?: string } = {}): Promise<Setup> {
  const drive = await fakeDrive();
  after(() => drive.close());
  const folders = { drafts: drive.add('Agent drafts', undefined, '', FOLDER), briefs: drive.add('Briefs', undefined, '', FOLDER) };
  const waits: number[] = [];
  const http = new Http({
    tokens: options.tokens?.(drive) ?? fixedToken(() => drive.token),
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  const storage = new Storage(
    [
      { name: 'drafts', access: 'write', fileAs: options.fileAs, driver: new DriveDriver({ http, folder: folders.drafts, apiUrl: drive.url }) },
      { name: 'briefs', access: 'read', driver: new DriveDriver({ http, folder: folders.briefs, apiUrl: drive.url }) },
    ],
    // Storage keeps the stand-in's time, so "since" and "recent" line up with it.
    { now: () => new Date(drive.clock()) },
  );
  return { drive, storage, folders, waits };
}

/** The StorageError code a promise is rejected with. */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? 'not a StorageError';
  }
  return 'no error';
}
