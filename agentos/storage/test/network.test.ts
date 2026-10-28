// How storage behaves when Drive pushes back: it waits when told to slow
// down, retries reads but never resends a write whose fate is unknown, and
// renews its token once when it has expired.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedToken, refreshGrant } from '../src/auth.ts';
import { setup } from './helpers.ts';

test('a rate limit waits as long as Drive says, then carries on', async () => {
  const { storage, drive, waits } = await setup();
  await storage.write('storage://drafts/post.md', 'hello');
  drive.failures.push({ status: 429, headers: { 'retry-after': '2' } });
  drive.failures.push({ status: 403, body: { error: { code: 403, message: 'User rate limit exceeded.', errors: [{ reason: 'userRateLimitExceeded' }] } } });
  assert.equal(await storage.readText('storage://drafts/post.md'), 'hello');
  assert.deepEqual(waits, [2000, 2000], 'Retry-After, then the second step of the usual backoff');
});

test('a rate limit on a write is waited out too: Drive did not take the first one', async () => {
  const { storage, drive, waits } = await setup();
  drive.failures.push({ status: 429, when: 'POST /upload' });
  await storage.write('storage://drafts/post.md', 'hello');
  assert.deepEqual(waits, [1000]);
  assert.equal(drive.requests.filter((route) => route === 'POST /upload/drive/v3/files').length, 2);
});

test('reads are retried after a server error; a write is not sent again', async () => {
  const { storage, drive, waits } = await setup();
  await storage.write('storage://drafts/post.md', 'hello');
  drive.failures.push({ status: 503 });
  assert.equal(await storage.readText('storage://drafts/post.md'), 'hello');
  assert.deepEqual(waits, [1000]);

  drive.failures.push({ status: 500, when: 'POST /upload' });
  const uploads = () => drive.requests.filter((route) => route === 'POST /upload/drive/v3/files').length;
  const before = uploads();
  await assert.rejects(storage.write('storage://drafts/second.md', 'x'), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'provider');
    assert.match(error.message, /Drive answered 500: .*It was not sent again, since it may have landed: look before you write it again$/);
    return true;
  });
  assert.equal(uploads(), before + 1, 'one upload, not two');
});

test('after three retries it gives up, and says what Drive said', async () => {
  const { storage, drive, waits } = await setup();
  for (let i = 0; i < 4; i += 1) drive.failures.push({ status: 429, body: { error: { code: 429, message: 'Too many requests.' } } });
  await assert.rejects(storage.stat('storage://drafts'), { code: 'provider', message: 'storage://drafts: Drive answered 429: Too many requests.' });
  assert.deepEqual(waits, [1000, 2000, 4000]);
});

test('an expired token is renewed once from the refresh token', async () => {
  const { storage, drive } = await setup({
    tokens: (fake) => refreshGrant(() => ({ clientId: 'client', clientSecret: 'secret', refreshToken: fake.refreshToken, tokenUrl: `${fake.url}/token` })),
  });
  await storage.write('storage://drafts/post.md', 'hello');
  drive.token = 'token-2';
  assert.equal(await storage.readText('storage://drafts/post.md'), 'hello');
  assert.equal(drive.requests.filter((route) => route === 'POST /token').length, 2, 'once to start, once when token-1 expired');
});

test("a refused refresh token, or a fixed token that expires, says what to do", async () => {
  const bad = await setup({
    tokens: (fake) => refreshGrant(() => ({ clientId: 'client', clientSecret: 'secret', refreshToken: 'revoked', tokenUrl: `${fake.url}/token` })),
  });
  await assert.rejects(bad.storage.stat('storage://drafts'), { code: 'auth', message: 'storage://drafts: Google sign-in failed (400): Token has been expired or revoked.' });

  const fixed = await setup({ tokens: () => fixedToken(() => 'old-token') });
  await assert.rejects(fixed.storage.stat('storage://drafts'), {
    code: 'auth',
    message: 'storage://drafts: Drive refused the access token: it has expired or is wrong. Get a new one.',
  });
});

test('a dropped connection on a read is retried; on a write it is not', async () => {
  const { storage, drive, waits } = await setup();
  await storage.write('storage://drafts/post.md', 'hello');
  drive.failures.push({ status: 0 });
  assert.equal(await storage.readText('storage://drafts/post.md'), 'hello');
  assert.deepEqual(waits, [1000]);

  const uploads = () => drive.requests.filter((route) => route === 'POST /upload/drive/v3/files').length;
  const before = uploads();
  drive.failures.push({ status: 0, when: 'POST /upload' });
  await assert.rejects(storage.write('storage://drafts/more.md', 'x'), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'provider');
    assert.match(error.message, /^storage:\/\/drafts\/more\.md: Drive could not be reached \(.+\)\. It was not sent again/);
    return true;
  });
  assert.equal(uploads(), before + 1, 'one upload, not two');
});
