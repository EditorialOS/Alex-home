// The v0.2 features against the stand-in Drive: filing, versions and latest,
// receipts, comments, bundles and changes. Each one keeps the rules: nothing
// is ever replaced, and nothing is guessed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPattern, fileName, newest, versionName, versionOf } from '../src/names.ts';
import { Storage } from '../src/storage.ts';
import type { Driver } from '../src/types.ts';
import { DOC, FOLDER, FORM, ROOT } from './fake-drive.ts';
import { codeOf, setup } from './helpers.ts';

const OCT_27 = new Date(2026, 9, 27, 1, 30);
const OCT_28 = new Date(2026, 9, 28, 1, 30);

test('filing patterns, version names, and the newest of them', () => {
  assert.equal(fileName('{date}-{name}', 'post.md', OCT_28), '2026-10-28-post.md');
  assert.equal(fileName('{year}-{month} {name}', 'plan.md', OCT_28), '2026-10 plan.md');
  assert.deepEqual([versionName('post.md', 1), versionName('post.md', 2), versionName('README', 3)], ['post.md', 'post v2.md', 'README v3']);
  assert.deepEqual(
    ['post.md', 'post v12.md', 'post v2.txt', 'other.md', 'post v2 v3.md'].map((name) => versionOf('post.md', name)),
    [1, 12, undefined, undefined, undefined],
  );
  assert.equal(newest('post.md', '{date}-{name}', ['2026-10-27-post v3.md', '2026-10-28-post.md', '2026-10-28-post v2.md', 'post.md', '2026-10-28-other.md']), '2026-10-28-post v2.md');
  assert.equal(newest('post.md', undefined, ['post.md', 'post v2.md', 'post v10.md']), 'post v10.md');
  assert.equal(newest('post.md', undefined, ['other.md']), undefined);
  assert.deepEqual(
    ['{date}', '{name}-{name}', '{date}/{name}', '{day}-{name}', '{date}-{name}'].map(checkPattern),
    ['must contain {name} once', 'must contain {name} once', "can't contain /: folders come from the address", 'has {day}: the placeholders are {name}, {date}, {year} and {month}', undefined],
  );
});

test('a write mount files new work by its pattern, and the entry has the real address', async () => {
  const { storage } = await setup({ fileAs: '{date}-{name}' });
  const entry = await storage.write('storage://drafts/acme/spring-post.md', '# Spring', { now: OCT_28 });
  assert.equal(entry.uri, 'storage://drafts/acme/2026-10-28-spring-post.md');
  assert.equal(await storage.readText('storage://drafts/acme/2026-10-28-spring-post.md'), '# Spring');
  await assert.rejects(storage.write('storage://drafts/acme/spring-post.md', 'again', { now: OCT_28 }), {
    code: 'conflict',
    message: 'storage://drafts/acme/spring-post.md: already exists. Nothing was written: write it under a new name',
  });
});

test('versions instead of overwriting, and latest picks by date, then by version', async () => {
  const { storage } = await setup({ fileAs: '{date}-{name}' });
  const write = async (text: string, now: Date) => (await storage.write('storage://drafts/post.md', text, { version: true, now })).uri;
  assert.deepEqual(
    [await write('a', OCT_27), await write('b', OCT_27), await write('c', OCT_27), await write('d', OCT_28), await write('e', OCT_28)],
    ['storage://drafts/2026-10-27-post.md', 'storage://drafts/2026-10-27-post v2.md', 'storage://drafts/2026-10-27-post v3.md', 'storage://drafts/2026-10-28-post.md', 'storage://drafts/2026-10-28-post v2.md'],
  );
  const latest = await storage.latest('storage://drafts/post.md');
  assert.equal(latest.uri, 'storage://drafts/2026-10-28-post v2.md');
  assert.equal(await storage.readText(latest.uri), 'e');
  assert.equal(await codeOf(storage.latest('storage://drafts/nothing.md')), 'not-found');
  assert.equal(await codeOf(storage.latest('storage://drafts/no-folder/post.md')), 'not-found');
});

test('if another writer takes the next version first, the one after it is written', async () => {
  const { drive, folders, storage: base } = await setup();
  const real = base.mounts.find((mount) => mount.name === 'drafts')!.driver;
  let raced = false;
  const racing: Driver = {
    stat: (path) => real.stat(path),
    list: (folder) => real.list(folder),
    read: (file) => real.read(file),
    comments: (file, since) => real.comments(file, since),
    byId: (id) => real.byId(id),
    changes: (cursor) => real.changes(cursor),
    create: async (path, content, labels) => {
      if (!raced) {
        raced = true;
        drive.add(path, folders.drafts, 'theirs');
      }
      return real.create(path, content, labels);
    },
  };
  const storage = new Storage([{ name: 'drafts', access: 'write', driver: racing }]);
  assert.equal((await storage.write('storage://drafts/post.md', 'ours', { version: true })).uri, 'storage://drafts/post v2.md');
  assert.equal(await storage.readText('storage://drafts/post.md'), 'theirs');
  assert.equal(await storage.readText('storage://drafts/post v2.md'), 'ours');
});

test('receipts: who wrote it, for which job, from what; stale when a source changes or goes', async () => {
  const { storage, drive, folders } = await setup();
  const brief = drive.add('Spring brief', folders.briefs, '# Spring', DOC);
  const guide = drive.add('brand.md', folders.briefs, 'Plain words.');
  const entry = await storage.write('storage://drafts/post.md', 'draft', {
    receipt: { agent: 'raya', job: 'm-20261028-1', basedOn: ['storage://briefs/Spring brief', 'storage://briefs/brand.md'] },
  });
  assert.deepEqual([entry.receipt?.agent, entry.receipt?.job, entry.receipt?.sources.map((source) => source.id)], ['raya', 'm-20261028-1', [brief, guide]]);
  assert.equal((await storage.list('storage://drafts'))[0]!.receipt?.agent, 'raya', 'listings carry receipts');

  const states = async () => (await storage.receipt('storage://drafts/post.md')).sources.map((source) => [source.name, source.state]);
  assert.deepEqual(await states(), [['Spring brief', 'unchanged'], ['brand.md', 'unchanged']]);
  assert.equal((await storage.receipt('storage://drafts/post.md')).stale, false);
  drive.edit(brief, '# Spring, now in April');
  assert.deepEqual(await states(), [['Spring brief', 'changed'], ['brand.md', 'unchanged']]);
  drive.trash(guide);
  const check = await storage.receipt('storage://drafts/post.md');
  assert.deepEqual([check.stale, check.sources[1]!.state, check.sources[1]!.name], [true, 'missing', undefined]);

  await storage.write('storage://drafts/plain.md', 'no receipt');
  assert.deepEqual(await storage.receipt('storage://drafts/plain.md'), { entry: await storage.stat('storage://drafts/plain.md'), receipt: undefined, sources: [], stale: false });
  await assert.rejects(storage.write('storage://drafts/x.md', 'x', { receipt: { agent: 'a'.repeat(120) } }), { code: 'usage', message: /the receipt's `agent` is too long for Drive/ });
  assert.equal(await codeOf(storage.write('storage://drafts/y.md', 'y', { receipt: { basedOn: Array(6).fill('storage://briefs/x.md') } })), 'usage');
  assert.equal(await codeOf(storage.write('storage://drafts/z.md', 'z', { receipt: { basedOn: ['storage://briefs'] } })), 'usage');
});

test('comments: open ones by default, with the quoted passage and replies; deleted ones left out', async () => {
  const { storage, drive, folders } = await setup();
  const id = drive.add('post.md', folders.drafts, 'draft');
  drive.comment(id, {
    author: 'Sam Lee',
    content: 'Too vague: which week?',
    quoted: 'Launch in March.',
    replies: [
      { author: 'Maya', content: 'Say the 12th.', createdTime: drive.clock() },
      { author: 'Maya', content: 'gone', createdTime: drive.clock(), deleted: true },
    ],
  });
  drive.comment(id, { author: 'Sam Lee', content: 'Fixed, thanks.', resolved: true });
  drive.comment(id, { author: 'Sam Lee', content: 'removed', deleted: true });
  drive.comment(id, { author: 'Ana', content: 'Love the opening.' });
  const open = await storage.comments('storage://drafts/post.md');
  assert.deepEqual(
    open.map((comment) => [comment.author, comment.content, comment.quoted, comment.replies.map((reply) => reply.content)]),
    [
      ['Sam Lee', 'Too vague: which week?', 'Launch in March.', ['Say the 12th.']],
      ['Ana', 'Love the opening.', undefined, []],
    ],
  );
  assert.deepEqual((await storage.comments('storage://drafts/post.md', { all: true })).map((comment) => comment.resolved), [false, true, false]);
  assert.equal(await codeOf(storage.comments('storage://drafts')), 'unsupported');
});

test('a folder reads as one brief: text in path order, Docs as Markdown, the rest left out with a reason', async () => {
  const { storage, drive, folders } = await setup();
  const people = drive.add('people', folders.briefs, '', FOLDER);
  drive.add('standing orders.md', folders.briefs, '# Standing orders\nEvery Monday: a report.\n', 'text/markdown');
  drive.add('Brand guide', folders.briefs, '# Brand\nPlain words.\n', DOC);
  drive.add('personas.yaml', people, 'buyer: owner\n', 'application/yaml');
  drive.add('logo.png', folders.briefs, Buffer.from([1, 2, 3]), 'image/png');
  drive.add('Survey', folders.briefs, '', FORM);

  const text = await storage.bundle('storage://briefs');
  assert.match(text, /^# storage:\/\/briefs\n\n3 files, as of 2026-10-28T09:\d\dZ\.\n/);
  assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]), ['Brand guide', 'people/personas.yaml', 'standing orders.md', 'Left out']);
  assert.match(text, /## Brand guide\n\n`storage:\/\/briefs\/Brand guide` · revision t:2026-10-28T09:\d\d:00\.000Z\n\n# Brand\nPlain words\.\n/);
  assert.match(text, /## Left out\n\n- Survey: can't be read as text\n- logo\.png: can't be read as text\n$/);

  const small = await storage.bundle('storage://briefs', { maxBytes: 30 });
  assert.match(small, /^# storage:\/\/briefs\n\n1 file, as of/);
  assert.match(small, /- people\/personas\.yaml: over the size limit\n- standing orders\.md: over the size limit\n$/);
  assert.equal(await codeOf(storage.bundle('storage://briefs/standing orders.md')), 'unsupported');
});

test("changes: the first call only starts; then new, edited and trashed files once, and new comments on recent drafts", async () => {
  const { storage, drive, folders } = await setup();
  const old = drive.add('old.md', folders.briefs, 'old');
  const draft = drive.add('post.md', folders.drafts, 'draft');
  const start = await storage.changes('storage://briefs');
  assert.deepEqual([start.files, start.comments], [[], []]);
  const draftsStart = (await storage.changes('storage://drafts')).cursor;

  drive.add('new brief.md', folders.briefs, 'new');
  drive.edit(old, 'old, edited');
  drive.add('outside.md', ROOT, 'not under any mount');
  drive.comment(draft, { author: 'Sam Lee', content: 'Shorter, please.' });

  const briefs = await storage.changes('storage://briefs', start.cursor);
  assert.deepEqual(
    briefs.files.map((file) => [file.kind, file.uri]),
    [
      ['new', 'storage://briefs/new brief.md'],
      ['edited', 'storage://briefs/old.md'],
    ],
  );
  assert.deepEqual(briefs.comments, [], 'comments are checked on write mounts, where agents put their work');
  const drafts = await storage.changes('storage://drafts', draftsStart);
  assert.deepEqual(drafts.files, []);
  assert.deepEqual(drafts.comments.map(({ uri, comment }) => [uri, comment.author, comment.content]), [['storage://drafts/post.md', 'Sam Lee', 'Shorter, please.']]);
  assert.deepEqual((await storage.changes('storage://drafts', drafts.cursor)).comments, [], 'nothing twice');

  const again = await storage.changes('storage://briefs', briefs.cursor);
  assert.deepEqual(again.files, [], 'nothing twice');
  drive.trash(old);
  assert.deepEqual((await storage.changes('storage://briefs', again.cursor)).files.map((file) => [file.kind, file.uri]), [['removed', 'storage://briefs/old.md']]);
  assert.equal(await codeOf(storage.changes('storage://briefs', 'not-a-cursor')), 'usage');
});
