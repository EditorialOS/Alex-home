#!/usr/bin/env node
// The storage command: read, list and write files in Google Drive by address.
// It reads from standard input and writes to standard output, so it pipes:
//   storage cat storage://briefs/spring.md | your-agent | storage put storage://drafts/2026-10-28-post.md

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { defaultConfigFile, loadConfig, openStorage, signIn } from './config.ts';
import { describeType } from './drive.ts';
import { StorageError } from './types.ts';
import type { Entry } from './types.ts';

const USAGE = `storage: read and write files in Google Drive by address

  storage mounts                         the mounts in the config, and the sign-in
  storage ls <address> [--json]          what is in a folder
  storage stat <address>                 one file or folder, as JSON
  storage cat <address>                  a file's content (Google Docs as Markdown, Sheets as CSV)
  storage put <address> [--from <file>]  a new file, from standard input or --from.
                                         It never replaces one: a taken name exits 3.

An address is storage://<mount>/<path>, such as storage://briefs/spring-launch.md.

  --config <file>   the config (default ./storage.yaml, or $STORAGE_CONFIG)

Exit codes: 0 done, 1 an error, 2 a mistake in the command, 3 the name is taken, 4 not found.`;

const OPTIONS = {
  config: { type: 'string' },
  from: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

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
  if (!['mounts', 'ls', 'stat', 'cat', 'put'].includes(command)) throw new StorageError('usage', `there is no \`${command}\` command\n\n${USAGE}`);
  const wanted = command === 'mounts' ? 0 : 1;
  if (args.length !== wanted) throw new StorageError('usage', `\`storage ${command}\` takes ${wanted === 0 ? 'no address' : 'one address'}\n\n${USAGE}`);

  const config = await loadConfig(values.config ?? defaultConfigFile());
  if (command === 'mounts') {
    const width = Math.max(...config.mounts.map((mount) => mount.name.length));
    for (const mount of config.mounts) console.log(`${mount.name.padEnd(width)}  ${mount.access.padEnd(5)}  folder ${mount.folder}`);
    const { method, missing } = signIn(config);
    console.log(`\nsign-in: ${method}, ${missing.length === 0 ? 'set' : `missing ${missing.join(', ')}`}`);
    return 0;
  }

  const storage = openStorage(config);
  const address = args[0]!;
  switch (command) {
    case 'ls': {
      const entries = await storage.list(address);
      console.log(values.json ? JSON.stringify(entries, null, 2) : entries.map(line).join('\n'));
      return 0;
    }
    case 'stat':
      console.log(JSON.stringify(await storage.stat(address), null, 2));
      return 0;
    case 'cat':
      await out((await storage.read(address)).content);
      return 0;
    default: {
      if (values.from === undefined && process.stdin.isTTY) {
        throw new StorageError('usage', 'pipe the content in, or pass --from <file>');
      }
      const content = values.from === undefined ? await stdin() : new Uint8Array(await readFile(values.from));
      const entry = await storage.write(address, content);
      console.log(values.json ? JSON.stringify(entry, null, 2) : entry.uri);
      return 0;
    }
  }
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
