# storage://

**One address for files in Google Drive. Agents read what people write, and never overwrite it.**

Give each Drive folder a short name in a config file. Then any agent, script or person can:

- **read** a file by its address, `storage://briefs/spring-launch.md`. Google Docs come back as Markdown, Sheets as CSV;
- **list** a folder;
- **write** a new file. It is refused if the name is taken: nothing is ever replaced.

Folders are read-only unless the config says otherwise. Secrets stay in the environment, never in the config.

**Status: v0.1, unpublished.**
- 25 tests pass against a stand-in for the Drive API, built from Google's own client definitions.
- Against the real Drive, it has only been seen to handle a wrong token correctly. A full run needs a Google sign-in.

[SPEC.md](SPEC.md) is the full specification.

## Try it

Node 22.18 or later runs it directly.

```sh
npm install
cp storage.example.yaml storage.yaml    # add your folders' links
export GDRIVE_TOKEN=…                   # see "Signing in"
node src/cli.ts mounts
node src/cli.ts ls storage://briefs
node src/cli.ts cat "storage://briefs/Spring brief"
echo "# Draft" | node src/cli.ts put storage://drafts/2026-10-28-post.md
```

After `npm run build`, the same commands are `storage mounts`, `storage ls` and so on.

## Addresses and mounts

```yaml
drive:
  token: $GDRIVE_TOKEN

mounts:
  briefs: { folder: "https://drive.google.com/drive/folders/1AbC…" }   # read-only
  drafts: { folder: 1XyZ…, access: write }
```

- **Folders:** a mount is a Drive folder, given by its link or its id; `root` is My Drive.
- **Addresses:** `storage://<mount>/<path>` uses names exactly as Drive shows them, spaces included. Quote them in the shell.
- **Mount people's folders read-only,** and give agents a folder of their own to write in.

## The rules

1. **Writes only create.** Drive has no write that checks a file is unchanged, so replacing a file could overwrite a person's edit. A new version goes under a new name, such as a dated one.
2. **Read-only unless the config says `access: write`.**
3. **Bytes in, bytes out.** Nothing is added to what you write. Google files are exported when read, and never written.
4. **No secrets in the config.** Secret fields must name an environment variable, and a secret typed into the file is refused.
5. **No state of its own:** no database, cache or index.
6. **Fail closed.** Two files with the same name, or a write whose fate is unknown, stop with an error instead of a guess.

## Commands

| Command | What it does |
| --- | --- |
| `storage mounts` | The mounts, and whether the sign-in's variables are set. It doesn't call Drive. |
| `storage ls <address> [--json]` | What is in a folder: when each item changed, its size, its name. |
| `storage stat <address>` | One file or folder, as JSON, with its `revision`. The revision changes when the content does. |
| `storage cat <address>` | The content, to standard output. |
| `storage put <address> [--from <file>]` | A new file, from standard input or a file. It prints the new address. |

Every command takes `--config <file>`; the default is `./storage.yaml`, or `$STORAGE_CONFIG`. Exit codes:

| Exit | Meaning |
| --- | --- |
| 0 | Done. |
| 1 | An error. |
| 2 | A mistake in the command. |
| 3 | The name is taken. |
| 4 | Not found. |

It pipes:

```sh
storage cat "storage://briefs/Spring brief" | your-agent | storage put "storage://drafts/$(date +%F)-spring-post.md"
```

## From code

```ts
import { loadStorage } from '@editorialos/storage';

const storage = await loadStorage('storage.yaml');
const brief = await storage.readText('storage://briefs/Spring brief');
const entries = await storage.list('storage://briefs');
await storage.write('storage://drafts/2026-10-28-post.md', draft);   // a conflict if the name is taken
```

- Every error is a `StorageError` with a `code`: `conflict`, `not-found`, `read-only`, `ambiguous`, `auth` and so on. Its message starts with the address.
- With the Conductor, a function agent can read its brief by address:

  ```ts
  plugs: { 'brief-reader': async (task) => storage.readText(task.mission.inputs.brief!) }
  ```

- Another provider plugs in through the `Driver` interface, with four methods: `stat`, `list`, `read` and `create`.

## Signing in

The account needs the full Drive scope, `https://www.googleapis.com/auth/drive`, to read files that other people made and shared with it.

**To try it (an hour):**
1. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. In step 1, tick that scope under "Drive API v3", then click "Authorize APIs".
3. In step 2, click "Exchange authorization code for tokens".
4. Copy the access token, and run `export GDRIVE_TOKEN=…`.

**For runs nobody is watching (a refresh token):**
1. In the Google Cloud console, make a project and enable the Google Drive API.
2. Set up its OAuth consent screen. While the app is in "Testing", Google's refresh tokens expire after 7 days. Publish it, or use an "Internal" app on Google Workspace.
3. Create an OAuth client of type "Web application", with `https://developers.google.com/oauthplayground` as an authorised redirect address.
4. In the Playground's settings (the gear), tick "Use your own OAuth credentials", and enter the client's id and secret.
5. Authorise the Drive scope as above, exchange, and copy the refresh token.
6. In `storage.yaml`, set `client_id`, `client_secret: $GDRIVE_CLIENT_SECRET` and `refresh_token: $GDRIVE_REFRESH_TOKEN`. Export both variables.

Treat the refresh token like a password: it works until you revoke it.

## Limits of v0.1

- **Google Drive only:** no Box and no local folders.
- **No replacing, removing, moving or copying.** Copy with `cat | put`.
- **No "what changed since last time".** Compare `revision` and `modified` from `storage ls --json`.
- **Uploads are one request,** so files over 5 MB are refused. Drive also limits exports of Google files to 10 MB.
- **Two writers creating the same name at the same moment can make two files.** Drive checks names and creates files in separate steps. The address is then `ambiguous` until a person removes one. Dated or per-agent names avoid this.
- **Not run against the real Drive yet,** beyond a refused token.

## Development

```sh
npm test            # node --test, against the stand-in Drive; no network
npm run typecheck   # src and tests
npm run build       # dist/, with the storage command
```

## Licence

Not chosen yet (`UNLICENSED`).
