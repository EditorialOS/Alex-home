#!/usr/bin/env node
// The storage command: read, list and write files in Google Drive by address.
// It reads from standard input and writes to standard output, so it pipes:
//   storage cat "storage://briefs/Spring brief" | your-agent | storage put storage://drafts/spring-post.md

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultConfigFile, loadConfig, openStorage, signIn } from './config.ts';
import { describeType } from './drive.ts';
import type { Changes, ReceiptCheck } from './storage.ts';
import { StorageError } from './types.ts';
import type { Comment, Entry } from './types.ts';

const USAGE = `storage: read and write files in Google Drive by address

  storage mounts                        the mounts in the config, and the sign-in
  storage ls <address> [--json]         what is in a folder
  storage stat <address> [--latest]     one file or folder, as JSON
  storage cat <address> [--latest]      a file's content (Google Docs as Markdown, Sheets as CSV)
  storage put <address> [--from <file>] [--version]
      [--agent <name>] [--job <id>] [--based-on <address>]...
                                        a new file, from standard input or --from. It never
                                        replaces one: a taken name exits 3, or --version writes
                                        the next version. --agent, --job and --based-on add a receipt.
  storage comments <address> [--all] [--json]   people's open comments on a file
  storage receipt <address> [--json]    who wrote a file, from what, and whether it's stale
  storage bundle <address> [--max-bytes <n>]    a folder as one Markdown document
  storage changes <address> --cursor-file <file> [--json]
                                        what's new since the last run: files and comments

An address is storage://<mount>/<path>, such as storage://briefs/spring-launch.md.
--latest reads the newest version of a name. --agent defaults to $STORAGE_AGENT.

  --config <file>   the config (default ./storage.yaml, or $STORAGE_CONFIG)

Exit codes: 0 done, 1 an error, 2 a mistake in the command, 3 the name is taken, 4 not found.`;

const OPTIONS = {
  config: { type: 'string' },
  from: { type: 'string' },
  json: { type: 'boolean' },
  latest: { type: 'boolean' },
  version: { type: 'boolean' },
  agent: { type: 'string' },
  job: { type: 'string' },
  'based-on': { type: 'string', multiple: true },
  all: { type: 'boolean' },
  'max-bytes': { type: 'string' },
  'cursor-file': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

const COMMANDS = ['mounts', 'ls', 'stat', 'cat', 'put', 'comments', 'receipt', 'bundle', 'changes'];
const EXIT: Partial<Record<StorageError['code'], number>> = { usage: 2, conflict: 3, 'not-found': 4 };

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new StorageError('usage', `${(error as Error).message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  const [command, ...args] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (!COMMANDS.includes(command)) throw new StorageError('usage', `there is no \`${command}\` command\n\n${USAGE}`);
  const wanted = command === 'mounts' ? 0 : 1;
  if (args.length !== wanted) throw new StorageError('usage', `\`storage ${command}\` takes ${wanted === 0 ? 'no address' : 'one address'}\n\n${USAGE}`);

  const config = await loadConfig(values.config ?? defaultConfigFile());
  if (command === 'mounts') {
    const width = Math.max(...config.mounts.map((mount) => mount.name.length));
    for (const mount of config.mounts) {
      console.log(`${mount.name.padEnd(width)}  ${mount.access.padEnd(5)}  folder ${mount.folder}${mount.fileAs ? `  files as ${mount.fileAs}` : ''}`);
    }
    const { method, missing } = signIn(config);
    console.log(`\nsign-in: ${method}, ${missing.length === 0 ? 'set' : `missing ${missing.join(', ')}`}`);
    return 0;
  }

  const storage = openStorage(config);
  const address = args[0]!;
  const at = async () => (values.latest ? (await storage.latest(address)).uri : address);
  switch (command) {
    case 'ls': {
      const entries = await storage.list(address);
      console.log(values.json ? JSON.stringify(entries, null, 2) : entries.map(line).join('\n'));
      return 0;
    }
    case 'stat':
      console.log(JSON.stringify(await storage.stat(await at()), null, 2));
      return 0;
    case 'cat':
      await out((await storage.read(await at())).content);
      return 0;
    case 'put': {
      if (values.from === undefined && process.stdin.isTTY) throw new StorageError('usage', 'pipe the content in, or pass --from <file>');
      const content = values.from === undefined ? await stdin() : new Uint8Array(await readFile(values.from));
      const agent = values.agent ?? process.env.STORAGE_AGENT;
      const basedOn = values['based-on'] ?? [];
      const receipt = agent || values.job || basedOn.length > 0 ? { agent, job: values.job, basedOn } : undefined;
      const entry = await storage.write(address, content, { version: values.version, receipt });
      console.log(values.json ? JSON.stringify(entry, null, 2) : entry.uri);
      return 0;
    }
    case 'comments': {
      const comments = await storage.comments(address, { all: values.all });
      console.log(values.json ? JSON.stringify(comments, null, 2) : commentsText(comments, values.all === true));
      return 0;
    }
    case 'receipt': {
      const check = await storage.receipt(address);
      console.log(values.json ? JSON.stringify(check, null, 2) : receiptText(check));
      return 0;
    }
    case 'bundle': {
      const maxBytes = values['max-bytes'] === undefined ? undefined : Number(values['max-bytes']);
      if (maxBytes !== undefined && !(Number.isInteger(maxBytes) && maxBytes > 0)) throw new StorageError('usage', '--max-bytes is a number of bytes');
      await out(new TextEncoder().encode(await storage.bundle(address, { maxBytes })));
      return 0;
    }
    default:
      return changes(storage, address, values['cursor-file'], values.json === true);
  }
}

/** Prints what's new, then moves the cursor: if anything fails first, the next run sees the same changes again. */
async function changes(storage: ReturnType<typeof openStorage>, address: string, file: string | undefined, json: boolean): Promise<number> {
  if (!file) throw new StorageError('usage', '`storage changes` needs --cursor-file <file>: where to keep its place between runs');
  let cursor: string | undefined;
  try {
    cursor = (await readFile(file, 'utf8')).trim() || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const result = await storage.changes(address, cursor);
  if (cursor === undefined) {
    console.error(`storage: watching ${address} from now. Run this again to see what's new.`);
  } else if (json) {
    console.log(JSON.stringify({ files: result.files, comments: result.comments }, null, 2));
  } else {
    const text = changesText(result);
    if (text) console.log(text);
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, `${result.cursor}\n`);
  await rename(`${file}.tmp`, file);
  return 0;
}

/** One `ls` line: when it changed, its size, its name. */
function line(entry: Entry): string {
  const when = entry.modified.slice(0, 16).replace('T', ' ');
  const size = entry.kind === 'folder' || entry.size === undefined ? '-' : bytes(entry.size);
  const name = entry.kind === 'folder' ? `${entry.name}/` : entry.native ? `${entry.name}  (${describeType(entry.type)})` : entry.name;
  return `${when}  ${size.padStart(8)}  ${name}`;
}

function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function commentsText(comments: Comment[], all: boolean): string {
  if (comments.length === 0) return all ? 'no comments' : 'no open comments';
  return comments
    .map((comment) => {
      const head = `${comment.author} · ${comment.created.slice(0, 16).replace('T', ' ')}${comment.quoted ? ` · on "${comment.quoted}"` : ''}${comment.resolved ? ' · resolved' : ''}`;
      const replies = comment.replies.map((reply) => `  ↳ ${reply.author}: ${reply.content}`);
      return [head, ...comment.content.split('\n').map((text) => `  ${text}`), ...replies].join('\n');
    })
    .join('\n\n');
}

function receiptText({ entry, receipt, sources, stale }: ReceiptCheck): string {
  if (!receipt) return `${entry.uri}\nno receipt: storage didn't write it with one`;
  const lines = [entry.uri];
  if (receipt.agent || receipt.job) lines.push(`written by ${receipt.agent ?? 'an unnamed agent'}${receipt.job ? `, for job ${receipt.job}` : ''}`);
  if (sources.length > 0) {
    lines.push('based on:');
    const width = Math.max(...sources.map((source) => (source.name ?? source.id).length));
    for (const source of sources) {
      const state = source.state === 'unchanged' ? 'unchanged' : source.state === 'changed' ? 'changed since it was written' : 'gone, or in the trash';
      lines.push(`  ${(source.name ?? source.id).padEnd(width)}  ${state}`);
    }
  }
  lines.push(stale ? 'stale: a source has changed or gone since this was written' : sources.length > 0 ? 'fresh: its sources are unchanged' : 'it names no sources');
  return lines.join('\n');
}

function changesText({ files, comments }: Changes): string {
  const lines = files.map((file) => `${file.kind.padEnd(8)} ${file.uri}`);
  for (const { uri, comment } of comments) lines.push(`comment  ${uri}  ${comment.author}: ${comment.content.split('\n')[0]}`);
  return lines.join('\n');
}

async function stdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function out(content: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(content, (error) => {
      // A reader that stops early (`| head`) is not a failure.
      if (error && (error as NodeJS.ErrnoException).code !== 'EPIPE') reject(error);
      else resolve();
    });
  });
}

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') throw error;
});

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`storage: ${(error as Error).message}`);
    process.exitCode = error instanceof StorageError ? (EXIT[error.code] ?? 1) : 1;
  },
);
