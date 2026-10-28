// Reading, listing and writing through the stand-in Drive, and the rules
// that hold on every call: writes only create, read-only mounts stay read-only,
// Google files are exported and never written, and nothing guesses.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedToken } from '../src/auth.ts';
import { DriveDriver } from '../src/drive.ts';
import { Http } from '../src/http.ts';
import { Storage } from '../src/storage.ts';
import { DOC, FORM, SHEET } from './fake-drive.ts';
import { codeOf, setup } from './helpers.ts';

test('a file written is read back byte for byte, text and binary', async () => {
  const { storage } = await setup();
  const entry = await storage.write('storage://drafts/post.md', '# Small rooms\n\nShort sentences.\n');
  assert.equal(entry.uri, 'storage://drafts/post.md');
  assert.equal(entry.kind, 'file');
  assert.equal(entry.type, 'text/markdown');
  assert.equal(entry.size, 32);
  assert.match(entry.revision, /^md5:[0-9a-f]{32}$/);
  assert.equal(await storage.readText('storage://drafts/post.md'), '# Small rooms\n\nShort sentences.\n');

  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  await storage.write('storage://drafts/cover.png', bytes);
  const { entry: image, content } = await storage.read('storage://drafts/cover.png');
  assert.deepEqual(content, bytes);
  assert.equal(image.type, 'image/png');
});

test('a second write to the same address is refused, and the file is unchanged', async () => {
  const { storage } = await setup();
  await storage.write('storage://drafts/post.md', 'first');
  await assert.rejects(storage.write('storage://drafts/post.md', 'second'), {
    code: 'conflict',
    message: 'storage://drafts/post.md: already exists. Nothing was written: write it under a new name',
  });
  assert.equal(await storage.readText('storage://drafts/post.md'), 'first');
});

test('folders above a new file are made, and listings are sorted across pages', async () => {
  const { storage } = await setup();
  await storage.write('storage://drafts/2026-10/28/post.md', 'deep');
  assert.equal(await storage.readText('storage://drafts/2026-10/28/post.md'), 'deep');
  for (const name of ['c.md', 'a.md', 'b.md']) await storage.write(`storage://drafts/${name}`, name);
  const listed = await storage.list('storage://drafts');
  assert.deepEqual(
    listed.map((entry) => [entry.uri, entry.kind]),
    [
      ['storage://drafts/2026-10', 'folder'],
      ['storage://drafts/a.md', 'file'],
      ['storage://drafts/b.md', 'file'],
      ['storage://drafts/c.md', 'file'],
    ],
  );
  // A second file under the same new folders reuses them.
  await storage.write('storage://drafts/2026-10/28/notes.md', 'more');
  assert.equal((await storage.list('storage://drafts/2026-10')).length, 1);
  assert.deepEqual((await storage.list('storage://drafts/a.md')).map((entry) => entry.name), ['a.md']);
});

test('a missing address is not found; a folder is listed, not read', async () => {
  const { storage } = await setup();
  await assert.rejects(storage.stat('storage://drafts/nope.md'), { code: 'not-found', message: 'storage://drafts/nope.md: does not exist' });
  assert.equal(await codeOf(storage.read('storage://drafts/nope/deeper.md')), 'not-found');
  assert.equal(await codeOf(storage.list('storage://drafts/nope')), 'not-found');
  assert.equal(await codeOf(storage.read('storage://drafts')), 'unsupported');
  assert.equal(await codeOf(storage.stat('storage://nowhere/a.md')), 'usage');
  assert.equal(await codeOf(storage.stat('drafts/a.md')), 'usage');
});

test('a read-only mount refuses every write, and says how to allow it', async () => {
  const { storage, drive, folders } = await setup();
  drive.add('spring.md', folders.briefs, 'the brief');
  const before = drive.requests.length;
  await assert.rejects(storage.write('storage://briefs/new.md', 'x'), {
    code: 'read-only',
    message: 'storage://briefs/new.md: the `briefs` mount is read-only. Write somewhere else, or give the mount access: write in the config',
  });
  assert.equal(drive.requests.length, before, 'nothing was sent to Drive');
  assert.equal(await storage.readText('storage://briefs/spring.md'), 'the brief');
});

test('a Google Doc reads as Markdown, or plain text if Drive refuses; a Sheet as CSV; neither is written over', async () => {
  const { storage, drive, folders } = await setup();
  drive.add('Spring brief', folders.briefs, '# Spring\n\nLaunch in March.\n', DOC);
  drive.add('Budget', folders.briefs, 'line,usd\nads,400\n', SHEET);
  drive.add('Survey', folders.briefs, '', FORM);
  drive.add('Plan', folders.drafts, '# Plan', DOC);

  const doc = await storage.stat('storage://briefs/Spring brief');
  assert.equal(doc.native, true);
  assert.match(doc.revision, /^v\d+$/);
  assert.equal(await storage.readText('storage://briefs/Spring brief'), '# Spring\n\nLaunch in March.\n');
  drive.noMarkdown = true;
  assert.equal(await storage.readText('storage://briefs/Spring brief'), '# Spring\n\nLaunch in March.\n');
  assert.deepEqual(drive.requests.filter((route) => route.endsWith('/export')).length, 3, 'Markdown, then Markdown refused, then plain text');
  assert.equal(await storage.readText('storage://briefs/Budget'), 'line,usd\nads,400\n');
  await assert.rejects(storage.read('storage://briefs/Survey'), { code: 'unsupported', message: "storage://briefs/Survey: is a Google Form, which can't be read as text" });
  assert.equal(await codeOf(storage.write('storage://drafts/Plan', 'replaced')), 'conflict');
});

test('two items with one name are ambiguous; names with quotes and backslashes are found', async () => {
  const { storage, drive, folders } = await setup();
  drive.add('notes.md', folders.briefs, 'one');
  drive.add('notes.md', folders.briefs, 'two');
  await assert.rejects(storage.read('storage://briefs/notes.md'), {
    code: 'ambiguous',
    message: 'storage://briefs/notes.md: 2 items in one folder are named `notes.md`: rename or remove all but one in Drive',
  });
  await storage.write("storage://drafts/Sam's \\ notes.md", 'quoted');
  assert.equal(await storage.readText("storage://drafts/Sam's \\ notes.md"), 'quoted');
});

test('a file in the way of a folder stops the write', async () => {
  const { storage } = await setup();
  await storage.write('storage://drafts/a.md', 'a file');
  await assert.rejects(storage.write('storage://drafts/a.md/b.md', 'x'), { code: 'conflict', message: 'storage://drafts/a.md/b.md: `a.md` is a file, not a folder' });
  assert.equal(await codeOf(storage.stat('storage://drafts/a.md/b.md')), 'not-found');
});

test('a file over 5 MB is refused before anything is sent', async () => {
  const { storage, drive } = await setup();
  const before = drive.requests.length;
  await assert.rejects(storage.write('storage://drafts/big.bin', new Uint8Array(5 * 1024 * 1024 + 1)), { code: 'unsupported' });
  assert.equal(drive.requests.length, before);
});

test("a mount folder that is missing or isn't a folder is a mistake in the config", async () => {
  const { drive } = await setup();
  const http = new Http({ tokens: fixedToken(() => drive.token) });
  const file = drive.add('stray.md', undefined, 'x');
  const storage = new Storage([
    { name: 'gone', access: 'read', driver: new DriveDriver({ http, folder: 'missing-id', apiUrl: drive.url }) },
    { name: 'file', access: 'read', driver: new DriveDriver({ http, folder: file, apiUrl: drive.url }) },
  ]);
  await assert.rejects(storage.stat('storage://gone'), { code: 'config', message: "storage://gone: the mount's folder `missing-id` was not found, or this Google account can't see it" });
  await assert.rejects(storage.stat('storage://file/a.md'), { code: 'config' });
});
