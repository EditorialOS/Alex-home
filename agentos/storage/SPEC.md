# storage:// v0.2 specification

One address for files in Google Drive, for agents and the people they work with. Agents read what people write, file their work where it belongs, and never overwrite anything.

v0.2 does one provider, Drive. It keeps the earlier draft's aims: plain files, no database, one address scheme, and people's edits never silently overwritten. It adds what the generic Drive connector doesn't give agents:
- a connector that holds the keys;
- people's comments;
- receipts on every file;
- filing rules;
- versions;
- what's new since the last run;
- a whole folder read as one brief.

## 1. Rules

The tests in section 11 check each one.

1. **Writes only create.** A write makes a new file, and nothing is ever replaced. Drive has no write that checks a file is unchanged, so replacing a file could overwrite a person's edit. A new version gets a new name (section 4).
2. **Agents write only into named folders.** A mount is read-only unless it says `access: write`, and a write mount can't be My Drive itself. Mount people's folders read-only, and give agents a folder of their own.
3. **Bytes in, bytes out.** Storage never changes what is written or read. Google Docs, Sheets and Slides are exported when read (Markdown, CSV, plain text) and never written. Receipts go in the file's hidden properties, not its content.
4. **Agents never hold the keys.** Through the connector (section 8), an agent gets tools, not a token. The config names environment variables for secrets, and a secret written into the config is refused.
5. **No database.** No cache, no index. The only thing kept between runs is a change cursor, in a file the caller chooses.
6. **Fail closed.** When storage can't be sure, it stops with an error rather than guessing. That covers two files with the same name, and a write that may or may not have landed.

## 2. Addresses

```
storage://<mount>/<path>
storage://briefs/Spring brief
storage://drafts/acme/2026-10-28-spring-post.md
storage://briefs                      the mount's folder itself
```

- **`<mount>`** is a name from the config: lowercase letters, digits, `-` and `_`, starting with a letter or digit.
- **`<path>`** is a series of names separated by `/`, exactly as Drive shows them, spaces included. Names are not URL-encoded. Empty names, `.` and `..` are refused, and a trailing `/` is ignored.
- **One name, one item.** An address that matches more than one item is an `ambiguous` error.

## 3. The config

The config is a YAML file. Its default name is `./storage.yaml`, or `$STORAGE_CONFIG`.

```yaml
drive:
  client_id: 1234-abc.apps.googleusercontent.com
  client_secret: $GDRIVE_CLIENT_SECRET
  refresh_token: $GDRIVE_REFRESH_TOKEN

mounts:
  briefs: { folder: "https://drive.google.com/drive/folders/1AbC" }    # read-only
  drafts: { folder: 1XyZ, access: write, file_as: "{date}-{name}" }
```

**`drive:` signs in one Google account, in one of two ways:**

| Way | Fields | For |
| --- | --- | --- |
| A token | `token: $VAR` | Trying it out. A Google access token lasts an hour. |
| A refresh token | `client_id`, `client_secret: $VAR`, `refresh_token: $VAR` | Runs nobody is watching. |

- **Secrets must be `$NAME` references:** `token`, `client_secret` and `refresh_token`. They are looked up the first time Drive is called.
- **Endpoint overrides:** `api_url` and `token_url` change the endpoints, for proxies and tests.

**`mounts:` names folders:**

| Field | Meaning |
| --- | --- |
| `folder` | The folder's id, or its address in the browser. `root` is My Drive, which can only be read. |
| `access` | `read` (the default) or `write`. |
| `file_as` | Write mounts only. How new files are named: a pattern with `{name}`, and optionally `{date}` (`2026-10-28`), `{year}` and `{month}`. It may not contain `/`. Dates are in the machine's time zone (set `TZ` to change it). |

Unknown fields are errors. A config with any mistake is refused, with every reason listed.

## 4. Operations

| Operation | Library | Command | Gives back |
| --- | --- | --- | --- |
| stat | `stat(uri)` | `storage stat <uri>` | One entry. |
| list | `list(uri)` | `storage ls <uri>` | A folder's entries, sorted by name. A file lists as itself. |
| read | `read(uri)`, `readText(uri)` | `storage cat <uri>` | The bytes, and the entry. |
| latest | `latest(uri)` | `--latest` on `cat` and `stat` | The newest version of a name (below). |
| write | `write(uri, content, options)` | `storage put <uri>` | The new file's entry. |
| comments | `comments(uri, { all })` | `storage comments <uri>` | People's comments on a file. |
| receipt | `receipt(uri)` | `storage receipt <uri>` | Who wrote a file and from what, and whether its sources have changed since. |
| bundle | `bundle(uri, { maxBytes })` | `storage bundle <uri>` | A folder read as one Markdown document. |
| changes | `changes(uri, cursor?)` | `storage changes <uri> --cursor-file <file>` | What's new since the cursor. |

**write** creates the file, and any folders above it that don't exist yet.
- **Filing.** In a mount with `file_as`, the name in the address is filed by the pattern. `storage://drafts/acme/post.md` with `"{date}-{name}"` becomes `storage://drafts/acme/2026-10-28-post.md`. The entry that comes back has the real address.
- **Versions.** If the filed name is taken, the write is a `conflict` and nothing is written. With `version: true` (`put --version`), it writes the next version instead: `post.md`, then `post v2.md`, then `post v3.md`. If another writer takes that name first, it tries the next, up to three times.
- **Receipts.** With `receipt: { agent, job, basedOn }` (`put --agent --job --based-on <uri>`), the file's hidden properties record who wrote it, for which job, and the id and revision of each source it was based on. Up to 5 sources; each label fits in Drive's 124 bytes.
- **Refused:** writes to a read-only mount (`read-only`), and files over 5 MB (`unsupported`).

**latest** finds every file in the address's folder that is a version of the name, filed by the mount's pattern if it has one. It picks the newest by the date in its name, then by its version number. For `storage://drafts/post.md` with `"{date}-{name}"`, `2026-10-28-post v2.md` beats `2026-10-28-post.md`, which beats `2026-10-27-post v3.md`.

**comments** gives each comment's author, text, the passage it quotes, when it was made, whether it's resolved, and its replies. Only open comments are given unless `all` is set. Deleted comments and replies are left out.

**receipt** gives the receipt and checks each source by its id:
- a source is `changed` if its revision is different now;
- it is `missing` if it is gone or in the trash;
- the file is `stale` if any source is changed or missing.

**bundle** reads every file under the folder that can be read as text: Google Docs, Sheets and Slides, and files whose type or extension is text, Markdown, JSON, YAML or CSV.
- Files are taken in path order. Each starts with its name, address and revision.
- **Left out:** files that can't be read as text, and files past the size limit (512 KB by default). They are listed by name at the end, with the reason.

**changes:**
- **The first call,** without a cursor, gives a starting cursor and nothing else.
- **Each later call** gives what's new under the address since its cursor, and a new cursor:
  - **files:** `new` (made since the cursor), `edited`, or `removed` (moved to the trash);
  - **comments:** new comments and replies on files in write mounts, made in the last 30 days.
- **Delivery is at least once.** The command saves the new cursor only after it has printed everything.

## 5. Entries

| Field | Meaning |
| --- | --- |
| `uri` | Its address. |
| `path` | Its path under the mount. |
| `name` | Its name. |
| `kind` | `file` or `folder`. |
| `id` | Drive's id for it. |
| `revision` | Changes whenever the content changes. An ordinary file's is `md5:` plus Drive's MD5 of the content; a Google file's or folder's is `t:` plus when it was last modified. Compare it; never parse it. |
| `size` | In bytes, when Drive gives one. |
| `created` | When it was made, ISO 8601 in UTC. |
| `modified` | When it last changed, ISO 8601 in UTC. |
| `type` | Drive's MIME type. |
| `native` | `true` for Google Docs, Sheets, Slides and other Google files. |
| `receipt` | Who wrote it, for which job, from which sources, if storage wrote it with a receipt. |

## 6. How it uses Drive

| Call | Used for |
| --- | --- |
| `GET /drive/v3/files/{id}?fields=…` | A mount's folder; a receipt's sources; a parent's name and parents, for changes. |
| `GET /drive/v3/files?q='{parent}' in parents and name = '{name}' and trashed = false` | Finding a name in a folder, one level at a time. |
| `GET /drive/v3/files?q='{folder}' in parents and trashed = false` | Listing (`pageSize` 1000, following `nextPageToken`). |
| `GET /drive/v3/files/{id}?alt=media` | Reading a file. |
| `GET /drive/v3/files/{id}/export?mimeType=…` | Reading a Doc (`text/markdown`, falling back to `text/plain`), a Sheet (`text/csv`, first sheet only) or Slides (`text/plain`). |
| `POST /upload/drive/v3/files?uploadType=multipart` | Creating a file: its name, parent and receipt `properties`, then its bytes. |
| `POST /drive/v3/files` | Creating a folder. |
| `GET /drive/v3/files/{id}/comments?fields=…` | Comments (`pageSize` 100; `startModifiedTime` for changes). |
| `GET /drive/v3/changes/startPageToken`, then `GET /drive/v3/changes?pageToken=…` | changes. |
| `POST https://oauth2.googleapis.com/token` | Renewing the access token. |

- Every call sends `supportsAllDrives=true`, and listings and changes also send `includeItemsFromAllDrives=true`.
- Names in queries escape `\` and `'` with a backslash.
- A new file's type comes from its extension.

**What follows from the API:**
- **Checking a name and creating the file are two calls.** Two writers creating the same name at once can make two files, and that address is then `ambiguous` until a person removes one. Filing patterns and versions make this rare.
- **Size limits:** an upload is one request, which Drive limits to 5 MB. An export is limited to 10 MB by Drive.
- **Receipts are file properties,** which any app with access can see. They are not shown in Drive's own screens.
- **The change feed covers the whole account,** so changes are kept only when a file's parents lead up to the mount's folder.
  - A file moved to the trash is reported as `removed`.
  - A file deleted for good without going to the trash is not reported.
- **Comments are checked file by file:** one call for each file made in the last 30 days in a write mount under the address.

## 7. Errors and exit codes

Every error is a `StorageError` with a `code`, and its message starts with the address. The command prints `storage: <message>` and exits with:

| Code | Meaning | Exit |
| --- | --- | --- |
| `conflict` | Something already has that name, or a name on the way is a file. | 3 |
| `not-found` | Nothing at that address. | 4 |
| `usage` | A mistake in the command, the address or the cursor. | 2 |
| `config` | A mistake in the config, or a missing environment variable. | 1 |
| `read-only` | A write to a mount without `access: write`. | 1 |
| `ambiguous` | More than one item has that name. | 1 |
| `unsupported` | Reading a folder or a Google file that can't be exported as text; writing a file over 5 MB. | 1 |
| `auth` | Google refused the sign-in or the access. | 1 |
| `provider` | Any other Drive or network failure. | 1 |

Success exits 0.

## 8. The connector

`storage-mcp` is a local MCP server. Claude Desktop, Cowork, Claude Code and other MCP clients start it, and it reads the config and the environment itself. The agent sees seven tools and never the token:

| Tool | Does |
| --- | --- |
| `list` | Lists a folder. |
| `read` | Reads a file as text, or its newest version with `latest`. |
| `write` | Creates a file. It is filed by the mount's pattern, with `new_version`, `based_on` and `job`, and gets a receipt naming the agent. |
| `comments` | People's open comments on a file. |
| `receipt` | Who wrote a file, from what, and whether it's stale. |
| `bundle` | A folder as one Markdown document. |
| `changes` | What's new since the last call. The cursor is kept in the connector's cursor folder (default `./.storage/cursors`). The first call starts watching. |

- The agent's name on receipts is `--agent`, else `$STORAGE_AGENT`, else the name the MCP client gives.
- An error comes back as a tool error with storage's message, so the agent can act on it: "already exists", "read-only", and so on.
- A binary file is described, not returned.

## 9. Network behaviour

- **Timeouts:** each request has 60 seconds.
- **Retries:** a request is retried up to 3 times when Drive says to slow down, waiting as long as its `Retry-After` header says (at most 60 seconds), or 1, 2 and 4 seconds. That means a 429, or a 403 for `rateLimitExceeded` or `userRateLimitExceeded`.
- **Reads** are also retried after a server error (5xx) or a dropped connection.
- **Writes** are never sent again after a server error or a dropped connection, because the first may have landed. The error says so.
- **Sign-in:** a `401` renews the token once, then sends the request again. A fixed token that is refused says to get a new one.
- **Secrets are never printed.** Error messages carry Google's message, never a token.

## 10. Not in v0.2

- **Replacing, removing, moving and copying.** Copying is `storage cat a | storage put b`.
- **Writing Google Docs** (drafts that open as Docs).
- **Each agent seeing only its own client's folders.** This is planned through the Conductor.
- **Box, local folders, and a mirror between providers.** The `Driver` interface is where another provider plugs in.
- **Uploads over 5 MB.**
- **Search and memory.** Supermemory and Drive do these.
- **Sign-offs and cost.** The Conductor does these.

## 11. Acceptance tests

`npm test` checks each of these against a stand-in for the Drive API:

1. **Writing and reading:**
   - A file written is read back byte for byte, text and binary.
   - A second write to the same address is a `conflict`, and the file is unchanged.
   - Folders above a new file are made as needed, and listings are sorted and follow Drive's pages.
   - A missing address is `not-found`.
2. **Read-only:** a read-only mount refuses every write, and My Drive can't be a write mount.
3. **Google files:** a Doc reads as Markdown, or as plain text when Drive refuses Markdown, and a Sheet reads as CSV. Neither can be written over.
4. **Names:** two items with one name are `ambiguous`, and names with quotes and backslashes are found. A file over 5 MB is refused before anything is sent.
5. **Filing:** a write is filed by its mount's pattern, with dates in the machine's time zone, and the entry has the real address.
6. **Versions:** these come after the original name: `v2`, `v3`, and the next one if another writer takes a name first. `latest` picks by date, then by version.
7. **Receipts:** they hold the agent, job and sources. A source edited after the write makes the file stale, and a source in the trash is missing. Oversized labels are refused.
8. **Comments:** only open comments are given unless asked, with the quoted passage and replies, and deleted ones are left out.
9. **Bundles:** they hold text files in path order, Docs as Markdown, and list what was left out and why. The size limit holds.
10. **Changes:**
    - The first call only starts.
    - New, edited and trashed files are reported once, and changes outside the mount are ignored.
    - New comments on recent files in write mounts are reported.
    - A cursor from elsewhere is a `usage` error.
11. **Network:** rate limits wait for `Retry-After`, and reads are retried after a server error. A write is not sent again. A renewed token is fetched once after a `401`.
12. **Config:** a config with a secret written into it, an unknown field, two sign-in methods, a bad folder or a bad filing pattern is refused, with every reason. A missing environment variable is named when Drive is first called.
13. **The command and the connector:** piping, flags and every exit code work. The connector's tools work end to end, refusals come back as tool errors, and its cursor survives a restart.
