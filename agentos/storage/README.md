# storage://

**One address for files in Google Drive. Agents read what people write, file their work where it belongs, and never overwrite anything.**

The Drive connector gives an agent your whole Drive. Storage gives it the folders you choose, with rules:

- **Named folders.** Agents only see the folders you name, and write only into the ones you mark for writing. That's never the root of your Drive.
- **Read-only unless you say otherwise.**
- **Never overwrites a file.** A taken name is refused, or gets the next version: `post v2.md`. `latest` reads the newest.
- **A place for everything.** A folder's filing rule names new work, such as `{date}-{name}`.
- **Google Docs read as Markdown,** Sheets as CSV.
- **People's comments,** with the passage they're about and the replies.
- **Receipts on every file:** which agent wrote it, for which job, from which version of the brief. A draft whose brief changed shows as stale.
- **What's new since last night:** new briefs, edited drafts, new comments.
- **A whole folder read as one brief:** brand guide, personas and standing orders in one Markdown document.
- **Agents never hold the keys.** The connector keeps the Google token, so an agent gets tools, not credentials.
- **Secrets kept out of files.**

**Status: v0.2, unpublished.**
- 39 tests pass against a stand-in for the Drive API, built from Google's own client definitions.
- Against the real Drive, only a wrong token has been tried; it got the right refusal. A full run needs a Google sign-in.

[SPEC.md](SPEC.md) is the full specification.

## Try it

Node 22.18 or later runs it directly.

```sh
npm install
cp storage.example.yaml storage.yaml    # add your folders' links
export GDRIVE_TOKEN=…                   # see "Signing in"
node src/cli.ts mounts
node src/cli.ts bundle storage://briefs
echo "# Draft" | node src/cli.ts put storage://drafts/spring-post.md --agent raya --based-on "storage://briefs/Spring brief"
```

After `npm run build`, the commands are `storage` and `storage-mcp`.

## Folders

```yaml
drive:
  token: $GDRIVE_TOKEN

mounts:
  briefs: { folder: "https://drive.google.com/drive/folders/1AbC…" }            # read-only
  drafts: { folder: 1XyZ…, access: write, file_as: "{date}-{name}" }
```

- **Folders:** a mount is a Drive folder, given by its link or its id.
- **Filing:** `file_as` names new files in a write mount. Its placeholders are `{name}`, `{date}`, `{year}` and `{month}`, with dates in the machine's time zone. `storage://drafts/acme/post.md` is then filed as `storage://drafts/acme/2026-10-28-post.md`.
- **Addresses:** `storage://<mount>/<path>` uses names exactly as Drive shows them. Quote them in the shell.

## The connector

`storage-mcp` is a local MCP server for Claude Desktop, Cowork, Claude Code or any MCP client. It reads the config and the token itself; the agent sees seven tools:
- `list`, `read` (with `latest`);
- `write` (with `new_version`, `based_on`, `job`);
- `comments`, `receipt`, `bundle`, and `changes`.

Refusals come back as tool errors the agent can read, such as "already exists" and "read-only". Receipts name the agent, from `--agent`, `$STORAGE_AGENT`, or the client's own name.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "storage": {
      "command": "node",
      "args": ["/path/to/storage/dist/addons/storage-mcp.js", "--config", "/path/to/storage.yaml", "--agent", "raya"],
      "env": { "GDRIVE_CLIENT_SECRET": "…", "GDRIVE_REFRESH_TOKEN": "…" }
    }
  }
}
```

**Claude Code:**

```sh
claude mcp add storage -e GDRIVE_TOKEN=… -- node /path/to/storage/dist/addons/storage-mcp.js --config /path/to/storage.yaml
```

- **Paths:** give `--config` an absolute path; clients don't start it in your project folder.
- **State:** `changes` keeps its place in `--cursors` (default `./.storage/cursors`).
- **Keep the client's config private:** that's where the secrets go.

## Commands

| Command | What it does |
| --- | --- |
| `storage mounts` | The mounts, their filing rules, and whether the sign-in is set. |
| `storage ls <address> [--json]` | What is in a folder. |
| `storage stat <address> [--latest]` | One file or folder, as JSON, with its revision and receipt. |
| `storage cat <address> [--latest]` | The content. `--latest` reads the newest version of the name. |
| `storage put <address> [--from <file>] [--version] [--agent <name>] [--job <id>] [--based-on <address>]…` | A new file, from standard input or a file. It never replaces one: a taken name exits 3, or `--version` writes the next version. The other three flags add a receipt. It prints the real address. |
| `storage comments <address> [--all]` | People's open comments on a file. |
| `storage receipt <address>` | Who wrote a file, from what, and whether it's stale. |
| `storage bundle <address> [--max-bytes <n>]` | A folder as one Markdown document (512 KB by default). |
| `storage changes <address> --cursor-file <file>` | What's new since the last run. The first run starts watching. |

- **Every command takes:** `--config <file>`. Most take `--json`.
- **Exit codes:**

| Exit | Meaning |
| --- | --- |
| 0 | Done. |
| 1 | An error. |
| 2 | A mistake in the command. |
| 3 | The name is taken. |
| 4 | Not found. |

A nightly run, piped:

```sh
storage changes storage://drafts --cursor-file .storage/drafts.cursor     # new comments on yesterday's work
storage bundle storage://clients/acme/context | your-agent | storage put storage://drafts/acme/report.md --version --agent raya
```

## From code

```ts
import { loadStorage } from '@editorialos/storage';

const storage = await loadStorage('storage.yaml');
const context = await storage.bundle('storage://clients/acme/context');
const feedback = await storage.comments('storage://drafts/acme/2026-10-27-report.md');
const entry = await storage.write('storage://drafts/acme/report.md', draft, {
  version: true,
  receipt: { agent: 'raya', job: mission.id, basedOn: ['storage://briefs/Spring brief'] },
});
if ((await storage.receipt(entry.uri)).stale) { /* the brief changed: redo it */ }
```

- Every error is a `StorageError` with a `code`, and its message starts with the address.
- Another provider plugs in through the `Driver` interface.
- `@editorialos/storage/mcp` exports `storageServer`, to run the connector your own way.

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
6. In `storage.yaml`, set `client_id`, `client_secret: $GDRIVE_CLIENT_SECRET` and `refresh_token: $GDRIVE_REFRESH_TOKEN`.

Treat the refresh token like a password: it works until you revoke it.

## Limits of v0.2

- **Google Drive only.**
- **No replacing, removing, moving or copying.** Copy with `cat | put`.
- **Agents don't write Google Docs yet,** so their drafts are files people can comment on, but not edit as Docs.
- **Folders aren't limited per agent yet.** Every agent on one connector sees all its mounts. Give each client its own connector and config until the Conductor can do this.
- **The keys stay with the connector, not in the agent's context.** An agent with a shell on the same machine could still find them on disk.
- **Two writers can make duplicate files.** Drive checks names and creates files in separate steps, so two writers creating the same name at the same moment can make two files, and the address is then `ambiguous`. Filing rules and versions make this rare.
- **Comments are checked file by file:** one call for each file made in the last 30 days in a write mount.
- **Uploads are one request,** so files over 5 MB are refused.
- **Not run against the real Drive yet,** beyond a refused token.

## Development

```sh
npm test            # node --test, against the stand-in Drive; no network
npm run typecheck   # src, add-ons and tests
npm run build       # dist/, with the storage and storage-mcp commands
```

## Licence

Not chosen yet (`UNLICENSED`).
