# storage:// v0.1 specification

One address for files in Google Drive, for agents and the people they work with. Agents read what people write, and never overwrite it.

v0.1 does one provider, Drive, and three things: read, list, and write new files. It replaces the earlier "Minimal OS Storage Protocol" draft. It keeps that draft's aims: plain files, no database, one address scheme, and people's edits never silently overwritten. It drops what Drive can't do safely:
- replacing a file someone may have just edited;
- appending;
- frontmatter added to files;
- a mirror to Box.

## 1. Rules

The tests in section 9 check each one.

1. **Writes only create.** A write makes a new file, and is refused if anything already has that name. Nothing is ever replaced. Drive has no write that checks a file is unchanged, so replacing could overwrite a person's edit. An agent that wants a new version writes it under a new name, such as a dated one.
2. **Read-only unless the config says otherwise.** A mount is read-only unless it says `access: write`. Mount people's folders read-only, and give agents a folder of their own to write in.
3. **Bytes in, bytes out.** Storage never changes what is written or read: nothing is added or converted. The one exception is Google Docs, Sheets and Slides. They are exported when read (Markdown, CSV, plain text), and are never written.
4. **No secrets in files.** The config names environment variables for secrets. A secret written into the config is refused.
5. **No state of its own.** No database, no cache on disk, no index.
6. **Fail closed.** When storage can't be sure, it stops with an error rather than guessing. That covers two files with the same name, and a write that may or may not have landed.

## 2. Addresses

```
storage://<mount>/<path>
storage://briefs/spring-launch.md
storage://drafts/2026-10-28/post.md
storage://briefs                      the mount's folder itself
```

- **`<mount>`** is a name from the config: lowercase letters, digits, `-` and `_`, starting with a letter or digit. It names what the folder is, not where it lives.
- **`<path>`** is a series of names separated by `/`, exactly as Drive shows them, spaces included. Names are not URL-encoded. Empty names, `.` and `..` are refused, and a trailing `/` is ignored.
- **One name, one item.** Drive allows two items with the same name in one folder. An address that matches more than one is an `ambiguous` error.

## 3. The config

The config is a YAML file. Its default name is `./storage.yaml`, or `$STORAGE_CONFIG`.

```yaml
drive:
  client_id: 1234-abc.apps.googleusercontent.com
  client_secret: $GDRIVE_CLIENT_SECRET
  refresh_token: $GDRIVE_REFRESH_TOKEN

mounts:
  briefs: { folder: "https://drive.google.com/drive/folders/1AbC" }   # read-only
  drafts: { folder: 1XyZ, access: write }
```

**`drive:` signs in one Google account, in one of two ways:**

| Way | Fields | For |
| --- | --- | --- |
| A token | `token: $VAR` | Trying it out. A Google access token lasts an hour. |
| A refresh token | `client_id`, `client_secret: $VAR`, `refresh_token: $VAR` | Runs nobody is watching. The token is renewed as needed. |

- **Secrets must be `$NAME` references:** `token`, `client_secret` and `refresh_token`. Any field may be one.
- **References are looked up the first time Drive is called,** not when the config is read.
- **Endpoint overrides:** `api_url` and `token_url` change the endpoints, for proxies and tests.

**`mounts:` names folders:**

| Field | Meaning |
| --- | --- |
| `folder` | The folder's id, or its address in the browser (the id is taken from it). `root` is My Drive. |
| `access` | `read` (the default) or `write`. |

Unknown fields are errors. A config with any mistake is refused, with every reason listed.

## 4. Operations

| Operation | Library | Command | Gives back |
| --- | --- | --- | --- |
| stat | `stat(uri)` | `storage stat <uri>` | One entry. |
| list | `list(uri)` | `storage ls <uri>` | A folder's entries, sorted by name. A file lists as itself. |
| read | `read(uri)`, `readText(uri)` | `storage cat <uri>` | The bytes, and the entry. |
| write | `write(uri, content)` | `storage put <uri>` | The new file's entry. |

**Write:**
- **What it does:** write creates the file, making any folders above it that don't exist yet.
- **Conflicts:** it fails with `conflict`, and writes nothing, if anything already has that name, or if a name on the way is a file, not a folder.
- **Refused:** writes to a read-only mount (`read-only`), and files over 5 MB (`unsupported`).

## 5. Entries

| Field | Meaning |
| --- | --- |
| `uri` | Its address. |
| `path` | Its path under the mount (`""` for the mount's folder). |
| `name` | Its name. |
| `kind` | `file` or `folder`. |
| `id` | Drive's id for it. |
| `revision` | Changes whenever the content changes. For an ordinary file it is `md5:` plus Drive's MD5 of the content. For Google Docs, Sheets, Slides and folders it is `v` plus Drive's version number, which also moves on changes that aren't to the content. Compare it to tell whether a file changed since it was last read; never parse it. |
| `size` | In bytes, when Drive gives one. |
| `modified` | When it last changed, ISO 8601 in UTC. |
| `type` | Drive's MIME type. |
| `native` | `true` for Google Docs, Sheets, Slides and other Google files. |

## 6. How it uses Drive

| Call | Used for |
| --- | --- |
| `GET /drive/v3/files/{folder}?fields=…` | The mount's folder, once per run. |
| `GET /drive/v3/files?q='{parent}' in parents and name = '{name}' and trashed = false` | Finding a name in a folder, one level at a time. |
| `GET /drive/v3/files?q='{folder}' in parents and trashed = false` | list (`pageSize` 1000, following `nextPageToken`). |
| `GET /drive/v3/files/{id}?alt=media` | Reading a file. |
| `GET /drive/v3/files/{id}/export?mimeType=…` | Reading a Doc (`text/markdown`, falling back to `text/plain` if Drive refuses), a Sheet (`text/csv`, first sheet only) or Slides (`text/plain`). |
| `POST /upload/drive/v3/files?uploadType=multipart` | Creating a file: its name and parent, then its bytes. |
| `POST /drive/v3/files` | Creating a folder. |
| `POST https://oauth2.googleapis.com/token` | Renewing the access token from the refresh token. |

- Every call sends `supportsAllDrives=true`, and listings also send `includeItemsFromAllDrives=true`.
- Names in queries escape `\` and `'` with a backslash.
- A new file's type comes from its extension: `.md` is `text/markdown`, `.json` is `application/json`, and so on, with `application/octet-stream` otherwise.

**What follows from the API:**
- **Paths are walked by name,** one folder at a time, so a deep path costs one call per level.
- **Checking a name and creating the file are two calls.** Two writers creating the same name at the same moment can make two files. From then on that address is `ambiguous` until a person removes one. Give each agent its own names, such as dated ones, so they never race.
- **Size limits:** an upload is one request, which Drive limits to 5 MB. An export is limited to 10 MB by Drive.

## 7. Errors and exit codes

Every error is a `StorageError` with a `code`, and its message starts with the address. The command prints `storage: <message>` to standard error and exits with:

| Code | Meaning | Exit |
| --- | --- | --- |
| `conflict` | Something already has that name, or a name on the way is a file. | 3 |
| `not-found` | Nothing at that address. | 4 |
| `usage` | A mistake in the command or the address. | 2 |
| `config` | A mistake in the config, or a missing environment variable. | 1 |
| `read-only` | A write to a mount without `access: write`. | 1 |
| `ambiguous` | More than one item has that name. | 1 |
| `unsupported` | Reading a folder or a Google file that can't be exported as text, or writing a file over 5 MB. | 1 |
| `auth` | Google refused the sign-in or the access. | 1 |
| `provider` | Any other Drive or network failure. | 1 |

Success exits 0.

## 8. Network behaviour

- **Timeouts:** each request has 60 seconds.
- **Retries:** a request is retried up to 3 times when Drive says to slow down, waiting as long as its `Retry-After` header says (at most 60 seconds), or 1, 2 and 4 seconds. That means a 429, or a 403 for `rateLimitExceeded` or `userRateLimitExceeded`.
- **Reads** are also retried after a server error (5xx) or a dropped connection.
- **Writes** are never sent again after a server error or a dropped connection, because the first may have landed. The error says so.
- **Sign-in:** a `401` renews the token once, then sends the request again. A fixed token that is refused says to get a new one.
- **Secrets are never printed.** Error messages carry Google's message, never a token.

## 9. Acceptance tests

`npm test` checks each of these against a stand-in for the Drive API:

1. A file written is read back byte for byte, text and binary.
2. A second write to the same address is a `conflict`, and the file is unchanged.
3. Folders above a new file are made as needed, and listings are sorted and follow Drive's pages. A missing address is `not-found`; reading a folder is `unsupported`.
4. A read-only mount refuses every write.
5. A Google Doc reads as Markdown, or as plain text when Drive refuses Markdown. A Sheet reads as CSV. Neither can be written over.
6. Two items with one name are `ambiguous`. Names with quotes and backslashes are found.
7. A file over 5 MB is refused before anything is sent.
8. Rate limits wait for `Retry-After`. Reads are retried after a server error; a write is not sent again. A renewed token is fetched once after a `401`.
9. A config with a secret written into it, an unknown field, two sign-in methods or a bad folder is refused, with every reason. A missing environment variable is named when Drive is first called.
10. The command: piping in and out, `--from`, and every exit code.

## 10. Not in v0.1

- **Replacing, removing, moving and copying.** Copying is `storage cat a | storage put b`.
- **"What changed since last time."** Compare `revision` and `modified` from `storage ls --json` instead.
- **Box, local folders, and a mirror between providers.** The `Driver` interface in the code is where another provider plugs in.
- **Uploads over 5 MB.**
- **Search, and Drive file properties.**
- **Sign-offs, cost and who did what.** Those are the Conductor's job; storage only holds the files.
