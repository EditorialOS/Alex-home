// Addresses, and the config: a config with any mistake is refused with
// every reason, secrets must come from the environment, and a missing
// variable is named when Drive is first called, not before.

import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig, openStorage, signIn } from '../src/config.ts';
import { parseUri } from '../src/uri.ts';

async function configFile(text: string): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), 'storage-config-')), 'storage.yaml');
  await writeFile(file, text);
  return file;
}

test('addresses', () => {
  assert.deepEqual(parseUri('storage://briefs/spring launch.md'), { mount: 'briefs', path: 'spring launch.md' });
  assert.deepEqual(parseUri('storage://briefs/2026/oct/'), { mount: 'briefs', path: '2026/oct' });
  assert.deepEqual(parseUri('storage://briefs'), { mount: 'briefs', path: '' });
  for (const bad of ['briefs/a.md', 'storage://Briefs/a.md', 'storage://briefs//a.md', 'storage://briefs/../a.md', 'storage://briefs/./a.md', 'storage://']) {
    assert.throws(() => parseUri(bad), { code: 'usage' }, bad);
  }
});

test('a good config: folder links or ids, read-only unless it says write', async () => {
  const config = await loadConfig(
    await configFile(`
drive:
  client_id: 1234-abc.apps.googleusercontent.com
  client_secret: $GDRIVE_CLIENT_SECRET
  refresh_token: $GDRIVE_REFRESH_TOKEN
mounts:
  briefs: { folder: "https://drive.google.com/drive/u/0/folders/1AbC-d_E?usp=sharing" }
  drafts: { folder: 1XyZ, access: write }
  home: { folder: root }
`),
  );
  assert.deepEqual(
    config.mounts.map((mount) => [mount.name, mount.folder, mount.access]),
    [
      ['briefs', '1AbC-d_E', 'read'],
      ['drafts', '1XyZ', 'write'],
      ['home', 'root', 'read'],
    ],
  );
  assert.deepEqual(signIn(config, { GDRIVE_CLIENT_SECRET: 'x' }), { method: 'refresh token', missing: ['$GDRIVE_REFRESH_TOKEN'] });
});

test('a config with mistakes is refused, with every reason', async () => {
  const file = await configFile(`
drive:
  token: ya29.a0AfH6SMBthis-looks-like-a-real-token
  client_id: abc
  colour: blue
mounts:
  Briefs: { folder: "https://example.com/not-drive" }
  drafts: { folder: 1XyZ, access: everyone }
extra: true
`);
  await assert.rejects(loadConfig(file), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'config');
    const reasons = error.message.split('\n  - ').slice(1);
    assert.deepEqual(reasons, [
      'unknown field `extra`',
      'unknown field `drive.colour`',
      '`drive.token` is a secret, so it must name an environment variable, such as $GDRIVE_TOKEN, not hold the value',
      '`drive` has a token and refresh-token fields: use one way to sign in, not both',
      '`mounts.Briefs`: a mount name is lowercase letters, digits, - and _',
      "`mounts.Briefs` needs a `folder`: a Drive folder's id or its link, or `root` for My Drive",
      '`mounts.drafts`: `access` is `read` or `write`',
    ]);
    assert.doesNotMatch(error.message, /ya29/, 'a secret written into the config is never repeated back');
    return true;
  });
  await assert.rejects(loadConfig(await configFile('drive:\n  client_id: abc\n  client_secret: $S\nmounts: {}\n')), {
    message: /has 2 mistakes:\n {2}- `drive` signs in with a refresh token but has no `refresh_token`\n {2}- `mounts` names no folders/,
  });
  await assert.rejects(loadConfig(join(tmpdir(), 'no-such-dir', 'storage.yaml')), { code: 'config', message: /there is no config at/ });
});

test('a missing environment variable is named when Drive is first called, not before', async () => {
  const config = await loadConfig(await configFile('drive:\n  token: $GDRIVE_TOKEN\nmounts:\n  briefs: { folder: 1AbC }\n'));
  const storage = openStorage(config, {});
  await assert.rejects(storage.stat('storage://briefs'), { code: 'config', message: 'storage://briefs: drive.token names $GDRIVE_TOKEN, and the environment has no $GDRIVE_TOKEN' });
  assert.deepEqual(signIn(config, {}), { method: 'token', missing: ['$GDRIVE_TOKEN'] });
});

test('filing patterns go on write mounts, and My Drive is never a write mount', async () => {
  const config = await loadConfig(await configFile('drive:\n  token: $T\nmounts:\n  drafts: { folder: 1XyZ, access: write, file_as: "{date}-{name}" }\n'));
  assert.equal(config.mounts[0]!.fileAs, '{date}-{name}');
  await assert.rejects(
    loadConfig(
      await configFile(`
drive:
  token: $T
mounts:
  home: { folder: root, access: write }
  briefs: { folder: 1AbC, file_as: "{date}-{name}" }
  drafts: { folder: 1XyZ, access: write, file_as: "{date}/{name}" }
`),
    ),
    (error: Error) => {
      assert.deepEqual(error.message.split('\n  - ').slice(1), [
        '`mounts.home`: agents never write into My Drive itself. Make a folder for them, and mount that',
        '`mounts.briefs`: `file_as` names new files, so it only goes on a mount with access: write',
        "`mounts.drafts`: `file_as` can't contain /: folders come from the address",
      ]);
      return true;
    },
  );
});
