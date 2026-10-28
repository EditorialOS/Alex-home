// A stand-in for the parts of Google Drive's v3 API that storage uses, built
// from the official client's definitions: queries by parent and name, pages,
// downloads, exports, multipart uploads with properties, folders, comments,
// the change feed, sign-in and errors. It pages two at a time, so paging is
// always exercised, and has helpers that act as a person: edit, trash, comment.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const FOLDER = 'application/vnd.google-apps.folder';
export const DOC = 'application/vnd.google-apps.document';
export const SHEET = 'application/vnd.google-apps.spreadsheet';
export const FORM = 'application/vnd.google-apps.form';
export const ROOT = 'root-0';
const PAGE = 2;

export interface FakeComment {
  id: string;
  author: string;
  content: string;
  quoted?: string;
  resolved?: boolean;
  deleted?: boolean;
  createdTime: string;
  modifiedTime: string;
  replies: { author: string; content: string; createdTime: string; deleted?: boolean }[];
}

export interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: Buffer;
  version: number;
  createdTime: string;
  modifiedTime: string;
  trashed: boolean;
  properties?: Record<string, string>;
  comments: FakeComment[];
}

export interface Failure {
  /** 0 drops the connection without answering. */
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** Only for requests this matches, such as `POST /upload`. Default: the next request. */
  when?: string;
}

export interface FakeDrive {
  url: string;
  /** The access token it accepts. Change it to make the client's token expire. */
  token: string;
  /** The refresh token its sign-in accepts. */
  refreshToken: string;
  files: Map<string, FakeFile>;
  /** Every request, as `METHOD /path`. */
  requests: string[];
  /** Answers to give instead of the real ones, first come first served. */
  failures: Failure[];
  /** Refuse to export Docs as Markdown, as Drive would for a format it doesn't offer. */
  noMarkdown: boolean;
  add(name: string, parent?: string, content?: string | Buffer, mimeType?: string): string;
  /** A person edits a file. */
  edit(id: string, content: string): void;
  /** A person moves a file to the trash. */
  trash(id: string): void;
  /** A person comments on a file. */
  comment(id: string, comment: Partial<FakeComment> & { author: string; content: string }): void;
  /** The fake's clock, a minute a tick: the next time it will stamp. */
  clock(): string;
  close(): Promise<void>;
}

export async function fakeDrive(): Promise<FakeDrive> {
  let ids = 0;
  let minutes = 0;
  const files = new Map<string, FakeFile>();
  const feed: string[] = [];
  const now = () => new Date(Date.UTC(2026, 9, 28, 9, minutes++)).toISOString();
  const changed = (file: FakeFile) => {
    file.version += 1;
    file.modifiedTime = now();
    feed.push(file.id);
  };

  const add = (name: string, parent = ROOT, content: string | Buffer = '', mimeType = 'text/plain'): string => {
    const id = `id-${++ids}`;
    const at = now();
    files.set(id, { id, name, mimeType, parents: [parent], content: Buffer.from(content), version: 1, createdTime: at, modifiedTime: at, trashed: false, comments: [] });
    feed.push(id);
    return id;
  };
  const at = now();
  files.set(ROOT, { id: ROOT, name: 'My Drive', mimeType: FOLDER, parents: [], content: Buffer.alloc(0), version: 1, createdTime: at, modifiedTime: at, trashed: false, comments: [] });

  const fake: FakeDrive = {
    url: '',
    token: 'token-1',
    refreshToken: 'refresh-1',
    files,
    requests: [],
    failures: [],
    noMarkdown: false,
    add,
    edit: (id, content) => {
      const file = files.get(id)!;
      file.content = Buffer.from(content);
      changed(file);
    },
    trash: (id) => {
      const file = files.get(id)!;
      file.trashed = true;
      changed(file);
    },
    comment: (id, comment) => {
      const at = now();
      files.get(id)!.comments.push({ id: `c-${++ids}`, createdTime: at, modifiedTime: at, replies: [], ...comment });
    },
    clock: () => new Date(Date.UTC(2026, 9, 28, 9, minutes)).toISOString(),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake');
    const route = `${request.method} ${url.pathname}`;
    fake.requests.push(route);
    const body = await readBody(request);
    try {
      handle(route, url, request, body, response);
    } catch (error) {
      send(response, 500, { error: { code: 500, message: (error as Error).message } });
    }
  });

  function handle(route: string, url: URL, request: IncomingMessage, body: Buffer, response: ServerResponse): void {
    if (route === 'POST /token') {
      const form = new URLSearchParams(body.toString());
      if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === fake.refreshToken && form.get('client_secret')) {
        send(response, 200, { access_token: fake.token, expires_in: 3599, token_type: 'Bearer' });
      } else {
        send(response, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      }
      return;
    }
    const failure = fake.failures.findIndex((item) => !item.when || route.startsWith(item.when));
    if (failure !== -1) {
      const { status, headers, body: answer } = fake.failures.splice(failure, 1)[0]!;
      if (status === 0) request.socket.destroy();
      else send(response, status, answer ?? { error: { code: status, message: `failure ${status}` } }, headers);
      return;
    }
    if (request.headers.authorization !== `Bearer ${fake.token}`) {
      send(response, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.', errors: [{ reason: 'authError' }] } });
      return;
    }

    const id = (url.pathname.match(/^\/drive\/v3\/files\/([^/]+)/)?.[1] ?? '').replace(/^root$/, ROOT);
    if (route === 'GET /drive/v3/changes/startPageToken') return send(response, 200, { startPageToken: String(feed.length) });
    if (route === 'GET /drive/v3/changes') {
      const start = Number(url.searchParams.get('pageToken'));
      if (!Number.isInteger(start)) return send(response, 400, { error: { code: 400, message: 'Invalid Value', errors: [{ reason: 'invalid' }] } });
      const page = feed.slice(start, start + PAGE).map((fileId) => ({ kind: 'drive#change', fileId, removed: false, file: view(files.get(fileId)!) }));
      const more = start + PAGE < feed.length;
      return send(response, 200, { changes: page, ...(more ? { nextPageToken: String(start + PAGE) } : { newStartPageToken: String(feed.length) }) });
    }
    if (route === 'GET /drive/v3/files') return list(url, response);
    if (route === 'POST /drive/v3/files') return created(response, JSON.parse(body.toString()), Buffer.alloc(0));
    if (route === 'POST /upload/drive/v3/files') {
      if (url.searchParams.get('uploadType') !== 'multipart') return send(response, 400, { error: { code: 400, message: 'uploadType' } });
      const boundary = /boundary=(.+)$/.exec(request.headers['content-type'] ?? '')?.[1] ?? '';
      const [metadata, media] = parts(body, boundary);
      if (!metadata || !media) return send(response, 400, { error: { code: 400, message: 'Malformed multipart body.' } });
      return created(response, JSON.parse(metadata.data.toString()), media.data, /Content-Type: (.+)/.exec(media.headers)?.[1]);
    }
    const file = files.get(id);
    if (!file) return send(response, 404, { error: { code: 404, message: `File not found: ${id}.`, errors: [{ reason: 'notFound' }] } });
    if (route.endsWith('/comments')) {
      if (!url.searchParams.get('fields')) return send(response, 400, { error: { code: 400, message: "The 'fields' parameter is required for this method.", errors: [{ reason: 'required' }] } });
      const since = url.searchParams.get('startModifiedTime');
      const found = file.comments.filter((comment) => !comment.deleted && (!since || comment.modifiedTime >= since));
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const next = start + PAGE < found.length ? String(start + PAGE) : undefined;
      const comments = found.slice(start, start + PAGE).map((comment) => ({
        id: comment.id,
        author: { displayName: comment.author },
        content: comment.content,
        ...(comment.quoted ? { quotedFileContent: { mimeType: 'text/html', value: comment.quoted } } : {}),
        resolved: comment.resolved === true,
        deleted: false,
        createdTime: comment.createdTime,
        modifiedTime: comment.modifiedTime,
        replies: comment.replies.map((reply) => ({ author: { displayName: reply.author }, content: reply.deleted ? undefined : reply.content, createdTime: reply.createdTime, deleted: reply.deleted === true })),
      }));
      return send(response, 200, { comments, ...(next ? { nextPageToken: next } : {}) });
    }
    if (route === `GET /drive/v3/files/${url.pathname.split('/')[4]}/export`) {
      const type = url.searchParams.get('mimeType');
      const offered = file.mimeType === DOC ? (fake.noMarkdown ? ['text/plain'] : ['text/markdown', 'text/plain']) : file.mimeType === SHEET ? ['text/csv'] : [];
      if (!type || !offered.includes(type)) return send(response, 400, { error: { code: 400, message: 'The requested conversion is not supported.', errors: [{ reason: 'badRequest' }] } });
      return raw(response, file.content, type);
    }
    if (request.method === 'GET') {
      if (url.searchParams.get('alt') !== 'media') return send(response, 200, view(file));
      if (file.mimeType.startsWith('application/vnd.google-apps.')) {
        return send(response, 403, { error: { code: 403, message: 'Only files with binary content can be downloaded. Use Export with Docs Editors files.', errors: [{ reason: 'fileNotDownloadable' }] } });
      }
      return raw(response, file.content, file.mimeType);
    }
    send(response, 404, { error: { code: 404, message: 'Not Found' } });
  }

  function list(url: URL, response: ServerResponse): void {
    const q = url.searchParams.get('q') ?? '';
    const match = /^'((?:[^'\\]|\\.)*)' in parents(?: and name = '((?:[^'\\]|\\.)*)')? and trashed = false$/.exec(q);
    if (!match) return send(response, 400, { error: { code: 400, message: `Invalid Value: ${q}`, errors: [{ reason: 'invalid' }] } });
    const parent = unquote(match[1]!).replace(/^root$/, ROOT);
    const name = match[2] === undefined ? undefined : unquote(match[2]);
    const found = [...files.values()].filter((file) => !file.trashed && file.parents.includes(parent) && (name === undefined || file.name === name));
    const start = Number(url.searchParams.get('pageToken') ?? 0);
    const size = Math.min(Number(url.searchParams.get('pageSize') ?? 100), PAGE);
    const next = start + size < found.length ? String(start + size) : undefined;
    send(response, 200, { files: found.slice(start, start + size).map(view), ...(next ? { nextPageToken: next } : {}) });
  }

  function created(response: ServerResponse, metadata: { name: string; mimeType?: string; parents?: string[]; properties?: Record<string, string> }, content: Buffer, type?: string): void {
    const id = add(metadata.name, metadata.parents?.[0] ?? ROOT, content, metadata.mimeType ?? type ?? 'application/octet-stream');
    if (metadata.properties) files.get(id)!.properties = metadata.properties;
    send(response, 200, view(files.get(id)!));
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  fake.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  return fake;
}

/** A file as Drive shows it. */
function view(file: FakeFile): Record<string, unknown> {
  const blob = !file.mimeType.startsWith('application/vnd.google-apps.');
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    version: String(file.version),
    parents: file.parents,
    trashed: file.trashed,
    ...(file.properties ? { properties: file.properties } : {}),
    ...(file.mimeType === FOLDER ? {} : { size: String(file.content.length) }),
    ...(blob ? { md5Checksum: createHash('md5').update(file.content).digest('hex') } : {}),
  };
}

function unquote(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

/** The parts of a multipart/related body. */
function parts(body: Buffer, boundary: string): { headers: string; data: Buffer }[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const found: { headers: string; data: Buffer }[] = [];
  let at = body.indexOf(delimiter);
  while (at !== -1) {
    const from = at + delimiter.length;
    if (body.subarray(from, from + 2).toString() === '--') break;
    const next = body.indexOf(delimiter, from);
    if (next === -1) break;
    const part = body.subarray(from + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    found.push({ headers: part.subarray(0, split).toString(), data: part.subarray(split + 4) });
    at = next;
  }
  return found;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function raw(response: ServerResponse, content: Buffer, type: string): void {
  response.writeHead(200, { 'content-type': type });
  response.end(content);
}
