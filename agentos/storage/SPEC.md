# storage:// v0.1 specification

One address for files in Google Drive, Box or a local folder, for agents and the people they work with. Above all, an agent never overwrites work it hasn't seen.

This replaces the earlier "Minimal OS Storage Protocol" draft. It keeps that draft's aims: plain files, no database, one address scheme, and people's edits never silently overwritten. It drops what the providers can't do:
- appending to a cloud file;
- conditional writes on Drive;
- frontmatter on JSON files and Google Docs;
- a live mirror between two clouds.

## 1. Rules

These hold for every provider. The tests in section 10 check each one.

1. **Never overwrite unseen work.** A write either creates a file that doesn't exist yet, or replaces one only when the caller passes the revision it read *and* that revision is still current. There is no blind overwrite. A conflict error does not include the current revision: a caller has to read the file to get it.
2. **Read-only unless the config says otherwise.** A mount is read-only unless it says `access: write`. Mount people's folders read-only, and give agents a folder of their own to write in.
3. **Bytes in, bytes out.** Storage never changes what is written or read: no frontmatter added, no conversion. The one exception is Google Docs, Sheets and Slides. They are exported when read (Markdown, CSV, plain text) and are never written.
4. **No secrets in files.** The config names environment variables for secrets. A secret written into the config is refused.
5. **No state of its own.** No database, no cache on disk, no index. The only state is a change cursor, which the caller keeps in a file of its choosing.
6. **Fail closed.** When storage can't be sure, it stops with an error rather than guessing. That covers two files with the same name, a revision it can't check, or a write that may or may not have happened.

## 2. Addresses

```
storage://<mount>/<path>
storage://briefs/spring-launch.md
storage://drafts/2026-10-28/post.md
storage://briefs                      the mount itself
```

- **`<mount>`** is a name from the config: lowercase letters, digits, `-` and `_`, starting with a letter or digit. It names *what* the folder is, not which provider holds it. Moving a mount from Drive to Box changes no address.
- **`<path>`** is a series of names separated by `/`, exactly as they appear in the provider, spaces included. Names are not URL-encoded. Empty names, `.` and `..` are refused. A trailing `/` is ignored.
- **One name, one item.** Drive allows two files with the same name in one folder. An address that matches more than one is an `ambiguous` error.

## 3. Mounts and accounts

The config is a YAML file. Its default name is `./storage.yaml`, or `$STORAGE_CONFIG`.

```yaml
accounts:
  drive:
    provider: gdrive
    client_id: 1234-abc.apps.googleusercontent.com
    client_secret: $GDRIVE_CLIENT_SECRET
    refresh_token: $GDRIVE_REFRESH_TOKEN
  box:
    provider: box
    client_id: abc123
    client_secret: $BOX_CLIENT_SECRET
    enterprise_id: "987654"

mounts:
  briefs:  { account: drive, folder: "https://drive.google.com/drive/folders/1AbC" }   # read-only
  drafts:  { account: drive, folder: 1XyZ, access: write }
  scratch: { account: box, folder: "123456789", access: write }
  work:    { path: ./work, access: write }                                          # a local folder
```

**Mount fields:**

| Field | Meaning |
| --- | --- |
| `account` | Which account holds the folder. Leave it out for a local folder. |
| `folder` | The provider's folder id, or the folder's web address (the id is taken from it). For Drive, `root` is My Drive; for Box, `0` is All Files. |
| `path` | A local folder, relative to the config file. It must already exist. |
| `access` | `read` (the default) or `write`. |

**Sign-in.** Each account uses exactly one of these:

| Method | Fields | Notes |
| --- | --- | --- |
| A token | `token: $VAR` | An access token, for trying things out: Drive's last an hour, and so does a Box developer token. |
| A command | `token_command: <command>` | Any command that prints an access token, such as `gcloud auth print-access-token` or a password manager's CLI. It is run again when the token is refused. |
| Drive refresh | `client_id`, `client_secret: $VAR`, `refresh_token: $VAR` | Your own OAuth client, signed in once. |
| Box client credentials | `client_id`, `client_secret: $VAR`, and `enterprise_id` or `user_id` | A Box Platform app authorised by an admin, using Box's client-credentials grant. |

- **Secrets must be `$NAME` references:** `token`, `client_secret` and `refresh_token`. Any field may be one.
- **References are looked up only when a mount is first used,** so a missing variable doesn't stop the other mounts.
- **Unknown fields are errors.** A config with any mistake is refused, with every reason listed.
- **Test overrides:** `api_url`, `upload_url` and `token_url` change an account's endpoints, for proxies and tests.

## 4. Operations

| Operation | Library | Command | Gives back |
| --- | --- | --- | --- |
| stat | `stat(uri)` | `storage stat <uri>` | One entry. |
| list | `list(uri)` | `storage ls <uri>` | A folder's entries, sorted by name. A file lists as itself. |
| read | `read(uri)`, `readText(uri)` | `storage cat <uri>` | The bytes, and the entry. |
| write | `write(uri, content, { ifRevision })` | `storage put <uri> [--if <revision>]` | The new entry. |
| changes | `changes(uri, cursor?)` | `storage changes <uri> --cursor-file <file>` | What changed under the address, and a new cursor. |

**write:**
- **Without a revision,** write creates the file and fails with `conflict` if anything is already at that address. It makes the folders above the file as needed.
- **With a revision,** write replaces the file only if its revision is still the one given. Otherwise it fails with `conflict`. If the file no longer exists, that is also a `conflict`.
- **Refused:** writes to a read-only mount (`read-only`) and writes to Google Docs, Sheets and Slides (`unsupported`).
- **Atomicity:** where a provider can do it, the check and the write are one step (Box, and creating local files). Where it can't, they are two (Drive, and replacing local files). Section 6 states the gap for each.

**changes:**
- **The first call,** without a cursor, gives a starting cursor and no changes.
- **Each later call** gives what changed since its cursor, and a new cursor. Each file appears at most once per call, as it is now.
- **What's reported:**
  - `changed`: a file was created, written, renamed, moved in, or restored from the trash;
  - `removed`: a file or folder was moved to the trash.
- **Delivery is at least once.** The command saves the new cursor only after it has printed every change. If anything fails before then, the next run reports the same changes again.
- **A cursor holds no secrets.** It is tied to an account, not a mount, and it doesn't expire.

## 5. Entries and revisions

| Field | Meaning |
| --- | --- |
| `uri` | Its address. |
| `path` | Its path under the mount (`""` for the mount). |
| `name` | Its name. |
| `kind` | `file` or `folder`. |
| `id` | The provider's own id (a Drive file id, a Box id, or the local path). |
| `revision` | Changes whenever the content changes. Opaque: compare it, never parse it. |
| `size` | In bytes, when the provider gives one. |
| `modified` | When it last changed, in ISO 8601 UTC. |
| `type` | The provider's MIME type, when it has one. |
| `native` | `true` for Google Docs, Sheets and Slides. |

| Provider | Revision |
| --- | --- |
| Drive, an ordinary file | `md5:` plus Drive's MD5 of the content. |
| Drive, a Google Doc, Sheet or Slides, or a folder | `v` plus Drive's version number, which also moves on changes that aren't to the content. |
| Box | The item's `etag`. |
| Local file | `sha256:` plus the SHA-256 of the content. |
| Local folder | `mtime:` plus its modified time. |

## 6. Providers

### Google Drive (`provider: gdrive`)

| Call | Used for |
| --- | --- |
| `GET /drive/v3/files/{id}?fields=…` | The mount's folder; a parent's name and parents, for changes. |
| `GET /drive/v3/files?q='{parent}' in parents and name = '{name}' and trashed = false` | Finding a name in a folder, one level at a time. |
| `GET /drive/v3/files?q='{folder}' in parents and trashed = false` | list (`pageSize` 1000, following `nextPageToken`). |
| `GET /drive/v3/files/{id}?alt=media` | Reading a file. |
| `GET /drive/v3/files/{id}/export?mimeType=…` | Reading a Doc (`text/markdown`, falling back to `text/plain`), a Sheet (`text/csv`, first sheet only) or Slides (`text/plain`). |
| `POST /upload/drive/v3/files?uploadType=multipart` | Creating a file: its name, parent and type, then its bytes. |
| `PATCH /upload/drive/v3/files/{id}?uploadType=media` | Replacing a file's bytes. |
| `POST /drive/v3/files` | Creating a folder. |
| `GET /drive/v3/changes/startPageToken`, then `GET /drive/v3/changes?pageToken=…` | changes. |

Every call sends `supportsAllDrives=true`; listings and changes also send `includeItemsFromAllDrives=true`.

**What follows from the API:**
- **Paths are walked by name,** one folder at a time, so a deep path costs one call per level.
- **There is no conditional write.** Drive's v3 API has no `etag` and no If-Match, so a replace is a check, then a write. An edit made by a person between the two is overwritten. Drive keeps it in the file's version history.
- **Creating isn't atomic either.** Two writers creating the same name at once can make two files. From then on that address is `ambiguous` until a person removes one.
- **Size limits:** an upload is one request, which Drive limits to 5 MB; larger files are refused before sending. An export is limited to 10 MB by Drive.
- **The change feed covers the whole account,** so changes are kept only when a file's parents lead up to the mount's folder.
  - A file moved to the trash is reported as `removed`.
  - A file deleted for good without going to the trash is not reported, because the feed no longer says where it was.
  - Change feeds for shared drives are not tested.

### Box (`provider: box`)

| Call | Used for |
| --- | --- |
| `GET /2.0/folders/{id}?fields=…` | The mount's folder. |
| `GET /2.0/folders/{id}/items?usemarker=true&limit=1000&marker=…` | list, and finding a name in a folder. |
| `GET /2.0/files/{id}?fields=…,path_collection` | A file's current state and place, for changes. |
| `GET /2.0/files/{id}/content` | Reading a file (it redirects to the download). |
| `POST upload.box.com/api/2.0/files/content` | Creating a file: the `attributes` part, then the `file` part. |
| `POST upload.box.com/api/2.0/files/{id}/content` with `If-Match: {etag}` | Replacing a file. |
| `POST /2.0/folders` | Creating a folder. |
| `GET /2.0/events?stream_type=changes&stream_position=…` | changes (`now` gives the starting position). |
| `POST /oauth2/token` | Sign-in by client credentials. |

**What follows from the API:**
- **Writes are atomic.** Box names are unique in a folder, so creating answers `409` if the name is taken. A replace sends `If-Match` and answers `412` if the file changed: the revision check and the write are one step.
- **Size limit:** an upload is one request, which Box limits to 50 MB; larger files are refused before sending.
- **Events can repeat.** Each event id is used once.
- **How events become changes:**
  - A changed file is reported where it is now.
  - A file moved to the trash is reported only when the event says where it was.

### Local folder (`path:`)

- **No address can reach outside the folder,** symlinks included. Names starting with `.` are left out of listings.
- **Creating is atomic:** the new file is written beside the target, then hard-linked into place, which fails if the name exists. On file systems without hard links, it falls back to an exclusive create.
- **Replacing is a check, then an atomic rename.** An edit made in the moment between the two is overwritten.
- **Changes are found by modified time.** Removals are not reported.

## 7. Errors and exit codes

Every error is a `StorageError` with a `code`. The command prints `storage: <message>` to standard error and exits with:

| Code | Meaning | Exit |
| --- | --- | --- |
| `conflict` | Something is already there, or it changed since the revision given. | 3 |
| `not-found` | Nothing at that address. | 4 |
| `usage` | A mistake in the command or the address. | 2 |
| `config` | A mistake in the config, or a missing environment variable. | 1 |
| `read-only` | A write to a mount without `access: write`. | 1 |
| `ambiguous` | More than one item has that name. | 1 |
| `unsupported` | Something v0.1 can't do: writing a Google Doc, reading a folder, a file over the upload limit. | 1 |
| `auth` | The provider refused the sign-in or the access. | 1 |
| `provider` | Any other provider or network failure. | 1 |

Success exits 0.

## 8. Network behaviour

- **Timeouts:** each request has 60 seconds.
- **Retries:** a request is retried up to 3 times when the provider says to slow down, waiting as long as its `Retry-After` header says (at most 60 seconds), or 1, 2 and 4 seconds. That means a 429; on Drive, a 403 for `rateLimitExceeded` or `userRateLimitExceeded`; and on Box, a 202 with `Retry-After`.
- **Reads** are also retried after a server error (5xx) or a dropped connection.
- **Writes** are never sent again after a server error or a dropped connection, because the first may have landed. The error says so.
- **Sign-in:** a `401` gets a fresh token once (by running the command or the grant again), then the request is sent again.
- **Secrets are never printed.** Error messages carry the provider's message, never a token.

## 9. Not in v0.1

- **Removing, moving and copying.** Copying is `storage cat a | storage put b`. Removing is done in Drive or Box.
- **A mirror between providers.**
- **Search, and provider metadata** (Drive file properties, Box metadata templates).
- **Watching, by webhooks or a long-running process.** Run `storage changes` from cron or a scheduled task.
- **Uploads over 5 MB to Drive or 50 MB to Box.**
- **Sign-offs, cost and who did what.** Those are the Conductor's job; storage only holds the files.

## 10. Acceptance tests

`npm test` checks each of these, against a local folder and stand-ins for the Drive and Box APIs:

1. A file written is read back byte for byte, text and binary.
2. Writing to an address that exists, without a revision, is a `conflict`, and the file is unchanged.
3. A replace with the current revision works. With an older revision it is a `conflict`, and the file is unchanged.
4. On Box, a person's edit that lands between the check and the upload is caught by `If-Match`.
5. Folders above a new file are made as needed. Listings are sorted, and a missing address is `not-found`.
6. A read-only mount refuses every write.
7. Changes: the first call gives only a cursor. A write appears in the next call, then not again. On Drive and Box, changes outside the mount are left out and the trash is reported as `removed`.
8. A Google Doc reads as Markdown and can't be written. Two files with one name are `ambiguous`.
9. Rate limits wait for `Retry-After`. A failed write is not sent again. An expired token is replaced once.
10. A config with a secret written into it, an unknown field or two sign-in methods is refused, with every reason.
11. The command: piping in and out, the exit codes, and a cursor file that moves only after the changes are printed.
