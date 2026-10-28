// The connector end to end: an MCP client calls each tool against the
// stand-in Drive. Refusals come back as tool errors, receipts name the agent,
// the cursor survives a restart, and the token never appears in an answer.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { storageServer } from '../addons/mcp.ts';
import type { Storage } from '../src/storage.ts';
import { DOC } from './fake-drive.ts';
import { setup } from './helpers.ts';

async function connect(storage: Storage, cursors: string): Promise<Client> {
  const client = new Client({ name: 'raya', version: '1.0.0' });
  const [ours, theirs] = InMemoryTransport.createLinkedPair();
  await Promise.all([storageServer(storage, { cursors }).connect(ours), client.connect(theirs)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ text: string; error: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[]).map((part) => part.text).join('\n');
  return { text, error: result.isError === true };
}

test('the seven tools, end to end, with refusals as tool errors and receipts naming the agent', async () => {
  const { storage, drive, folders } = await setup();
  drive.add('Spring brief', folders.briefs, '# Spring\nLaunch in March.\n', DOC);
  drive.add('logo.png', folders.briefs, Buffer.from([0xff, 0xfe, 0x00]), 'image/png');
  const client = await connect(storage, await mkdtemp(join(tmpdir(), 'storage-cursors-')));
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), ['bundle', 'changes', 'comments', 'list', 'read', 'receipt', 'write']);

  assert.equal((await call(client, 'read', { address: 'storage://briefs/Spring brief' })).text, '# Spring\nLaunch in March.\n');
  assert.match((await call(client, 'read', { address: 'storage://briefs/logo.png' })).text, /is a binary file \(image\/png, 3 bytes\)/);
  const wrote = await call(client, 'write', { address: 'storage://drafts/post.md', content: '# Draft', based_on: ['storage://briefs/Spring brief'], job: 'm-1' });
  assert.match(wrote.text, /^Wrote storage:\/\/drafts\/post\.md \(revision md5:[0-9a-f]{32}\)\.$/);
  const receipt = JSON.parse((await call(client, 'receipt', { address: 'storage://drafts/post.md' })).text);
  assert.deepEqual([receipt.receipt.agent, receipt.receipt.job, receipt.stale], ['raya', 'm-1', false]);

  assert.deepEqual(await call(client, 'write', { address: 'storage://drafts/post.md', content: 'again' }), {
    text: 'storage://drafts/post.md: already exists. Nothing was written: write it under a new name',
    error: true,
  });
  assert.match((await call(client, 'write', { address: 'storage://drafts/post.md', content: 'v2', new_version: true })).text, /^Wrote storage:\/\/drafts\/post v2\.md/);
  assert.deepEqual((await call(client, 'read', { address: 'storage://drafts/post.md', latest: true })).text, 'The latest version is storage://drafts/post v2.md.\nv2');
  const readOnly = await call(client, 'write', { address: 'storage://briefs/x.md', content: 'x' });
  assert.equal(readOnly.error, true);
  assert.match(readOnly.text, /the `briefs` mount is read-only/);

  const draft = [...drive.files.values()].find((file) => file.name === 'post v2.md')!;
  drive.comment(draft.id, { author: 'Sam Lee', content: 'Shorter.' });
  assert.deepEqual(JSON.parse((await call(client, 'comments', { address: 'storage://drafts/post v2.md' })).text).map((comment: { content: string }) => comment.content), ['Shorter.']);
  assert.match((await call(client, 'bundle', { address: 'storage://briefs' })).text, /## Spring brief[\s\S]*## Left out\n\n- logo\.png: can't be read as text/);
  assert.deepEqual(await call(client, 'list', { address: 'storage://nowhere' }), { text: 'storage://nowhere: there is no `nowhere` mount (the mounts are: drafts, briefs)', error: true });
});

test('changes starts watching, reports once, and keeps its place across a restart', async () => {
  const { storage, drive, folders } = await setup();
  const cursors = await mkdtemp(join(tmpdir(), 'storage-cursors-'));
  const first = await connect(storage, cursors);
  assert.equal((await call(first, 'changes', { address: 'storage://briefs' })).text, "Watching storage://briefs from now. Ask again later to see what's new.");
  drive.add('autumn.md', folders.briefs, 'autumn');
  await first.close();

  const second = await connect(storage, cursors);
  const news = JSON.parse((await call(second, 'changes', { address: 'storage://briefs' })).text);
  assert.deepEqual(news.files.map((file: { kind: string; uri: string }) => [file.kind, file.uri]), [['new', 'storage://briefs/autumn.md']]);
  assert.equal((await call(second, 'changes', { address: 'storage://briefs' })).text, 'Nothing new under storage://briefs.');
});

test('the command starts on standard input and output, holding the token itself', { timeout: 20_000 }, async () => {
  const { drive, folders } = await setup();
  drive.add('brief.md', folders.briefs, 'the brief');
  const dir = await mkdtemp(join(tmpdir(), 'storage-mcp-'));
  await writeFile(join(dir, 'storage.yaml'), `drive:\n  token: $TEST_TOKEN\n  api_url: ${drive.url}\nmounts:\n  briefs: { folder: ${folders.briefs} }\n`);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../addons/storage-mcp.ts', import.meta.url)), '--config', join(dir, 'storage.yaml')], {
    env: { PATH: process.env.PATH ?? '', TEST_TOKEN: drive.token },
  });
  let out = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const reply = (id: number) =>
    new Promise<{ result?: { content?: { text: string }[] } }>((resolve) => {
      const check = () => {
        const line = out.split('\n').find((text) => text.includes(`"id":${id}`));
        if (line) resolve(JSON.parse(line));
        else setTimeout(check, 10);
      };
      check();
    });
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  await reply(1);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read', arguments: { address: 'storage://briefs/brief.md' } } });
  assert.equal((await reply(2)).result?.content?.[0]?.text, 'the brief');
  assert.doesNotMatch(out, new RegExp(drive.token), 'the token never reaches the agent');
  child.kill();
});
