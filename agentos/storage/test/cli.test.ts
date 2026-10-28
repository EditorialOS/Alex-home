// The storage command against the stand-in Drive: piping in and out,
// --from, and every exit code.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DOC, FOLDER, fakeDrive } from './fake-drive.ts';
import type { FakeDrive } from './fake-drive.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
let drive: FakeDrive;
let dir: string;

before(async () => {
  drive = await fakeDrive();
  const drafts = drive.add('Agent drafts', undefined, '', FOLDER);
  const briefs = drive.add('Briefs', undefined, '', FOLDER);
  drive.add('Spring brief', briefs, '# Spring\n', DOC);
  dir = await mkdtemp(join(tmpdir(), 'storage-cli-'));
  await writeFile(
    join(dir, 'storage.yaml'),
    `drive:\n  token: $TEST_TOKEN\n  api_url: ${drive.url}\nmounts:\n  briefs: { folder: ${briefs} }\n  drafts: { folder: ${drafts}, access: write }\n`,
  );
});
after(() => drive.close());

function run(args: string[], input?: string, env: Record<string, string> = { TEST_TOKEN: drive.token }): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: dir, env: { PATH: process.env.PATH ?? '', ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
}

test('put from standard input, then cat, ls and stat it', async () => {
  const put = await run(['put', 'storage://drafts/2026-10-28-post.md'], '# Post\n');
  assert.deepEqual([put.code, put.stdout, put.stderr], [0, 'storage://drafts/2026-10-28-post.md\n', '']);
  assert.deepEqual(await run(['cat', 'storage://drafts/2026-10-28-post.md']), { code: 0, stdout: '# Post\n', stderr: '' });
  const ls = await run(['ls', 'storage://drafts']);
  assert.equal(ls.code, 0);
  assert.match(ls.stdout, /^2026-10-28 \d\d:\d\d +7 B {2}2026-10-28-post\.md\n$/);
  const stat = JSON.parse((await run(['stat', 'storage://drafts/2026-10-28-post.md'])).stdout);
  assert.equal(stat.uri, 'storage://drafts/2026-10-28-post.md');
  assert.match(stat.revision, /^md5:/);
});

test('--from a file, and a Google Doc read as Markdown', async () => {
  await writeFile(join(dir, 'notes.md'), 'from a file');
  assert.equal((await run(['put', 'storage://drafts/notes.md', '--from', 'notes.md'])).code, 0);
  assert.equal((await run(['cat', 'storage://drafts/notes.md'])).stdout, 'from a file');
  assert.equal((await run(['cat', 'storage://briefs/Spring brief'])).stdout, '# Spring\n');
  assert.match((await run(['ls', 'storage://briefs'])).stdout, /Spring brief {2}\(Google Doc\)/);
});

test('exit codes: 3 when the name is taken, 4 when missing, 2 for a mistake, 1 for the rest', async () => {
  await run(['put', 'storage://drafts/taken.md'], 'one');
  const taken = await run(['put', 'storage://drafts/taken.md'], 'two');
  assert.deepEqual([taken.code, taken.stderr], [3, 'storage: storage://drafts/taken.md: already exists. Nothing was written: write it under a new name\n']);
  assert.equal((await run(['cat', 'storage://drafts/taken.md'])).stdout, 'one');
  assert.equal((await run(['cat', 'storage://drafts/missing.md'])).code, 4);
  assert.equal((await run(['frobnicate'])).code, 2);
  assert.equal((await run(['cat'])).code, 2);
  assert.equal((await run(['cat', 'drafts/taken.md'])).code, 2);
  assert.equal((await run(['ls', '--nope', 'storage://drafts'])).code, 2);
  const readOnly = await run(['put', 'storage://briefs/new.md'], 'x');
  assert.equal(readOnly.code, 1);
  assert.match(readOnly.stderr, /the `briefs` mount is read-only/);
  const noToken = await run(['ls', 'storage://drafts'], undefined, {});
  assert.deepEqual([noToken.code, noToken.stderr], [1, 'storage: storage://drafts: drive.token names $TEST_TOKEN, and the environment has no $TEST_TOKEN\n']);
});

test('mounts shows the folders and whether the sign-in is set, without calling Drive', async () => {
  const before = drive.requests.length;
  const { code, stdout } = await run(['mounts'], undefined, {});
  assert.equal(code, 0);
  assert.match(stdout, /^briefs {2}read {3}folder id-\d+\ndrafts {2}write {2}folder id-\d+\n\nsign-in: token, missing \$TEST_TOKEN\n$/);
  assert.equal(drive.requests.length, before);
});
