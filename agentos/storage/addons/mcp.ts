// The connector: storage as a local MCP server. Claude Desktop, Cowork,
// Claude Code and other MCP clients start it, and it reads the config and the
// environment itself, so the agent gets seven tools and never the token.
// Refusals come back as tool errors with storage's own message, so the agent
// can act on them: "already exists", "read-only", "not found".

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Storage } from '../src/storage.ts';
import { StorageError } from '../src/types.ts';

export interface ConnectorOptions {
  /** The agent's name on receipts. Default: the name the MCP client gives. */
  agent?: string;
  /** Where `changes` keeps its place between calls. Default ./.storage/cursors. */
  cursors?: string;
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

export function storageServer(storage: Storage, options: ConnectorOptions = {}): McpServer {
  const server = new McpServer({ name: 'storage', version: '0.2.0' });
  const agent = () => options.agent ?? server.server.getClientVersion()?.name;
  const cursors = options.cursors ?? join('.storage', 'cursors');
  const address = z.string().describe('A storage:// address, such as storage://briefs/spring-launch.md');

  server.registerTool(
    'list',
    { description: "What is in a folder: each item's address, kind, size, when it changed, its revision, and its receipt if an agent wrote it.", inputSchema: { address }, annotations: READ_ONLY },
    ({ address }) => answer(async () => json(await storage.list(address))),
  );

  server.registerTool(
    'read',
    {
      description: 'Read a file as text. Google Docs come as Markdown, Sheets as CSV. With latest, read the newest version of the name instead (by the date in its name, then its version).',
      inputSchema: { address, latest: z.boolean().optional().describe('Read the newest version of this name') },
      annotations: READ_ONLY,
    },
    ({ address, latest }) =>
      answer(async () => {
        const uri = latest ? (await storage.latest(address)).uri : address;
        const { entry, content } = await storage.read(uri);
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(content);
        } catch {
          return `${entry.uri} is a binary file (${entry.type ?? 'unknown type'}, ${content.byteLength} bytes), which this tool doesn't return.`;
        }
        return latest ? [`The latest version is ${entry.uri}.`, text] : text;
      }),
  );

  server.registerTool(
    'write',
    {
      description:
        "Create a new file. It never replaces one: if the name is taken, it fails unless new_version is set, which writes the next version (post v2.md). The mount may file it under a dated name: the answer gives the real address. Every file gets a receipt naming you, the job, and the sources it was based on.",
      inputSchema: {
        address,
        content: z.string().describe('The whole file, as text'),
        new_version: z.boolean().optional().describe('If the name is taken, write the next version instead of failing'),
        based_on: z.array(z.string()).max(5).optional().describe('Addresses of the files this work was based on, such as the brief'),
        job: z.string().optional().describe("An id for the job this is part of, such as the Conductor's mission id"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ address, content, new_version, based_on, job }) =>
      answer(async () => {
        const entry = await storage.write(address, content, { version: new_version, receipt: { agent: agent(), job, basedOn: based_on } });
        return `Wrote ${entry.uri} (revision ${entry.revision}).`;
      }),
  );

  server.registerTool(
    'comments',
    {
      description: "People's comments on a file: who, what, the passage it is about, and the replies. Only open comments, unless all is set.",
      inputSchema: { address, all: z.boolean().optional().describe('Include resolved comments') },
      annotations: READ_ONLY,
    },
    ({ address, all }) => answer(async () => json(await storage.comments(address, { all }))),
  );

  server.registerTool(
    'receipt',
    { description: 'Who wrote a file, for which job, from which sources, and whether it is stale: a source changed or went since it was written.', inputSchema: { address }, annotations: READ_ONLY },
    ({ address }) => answer(async () => json(await storage.receipt(address))),
  );

  server.registerTool(
    'bundle',
    {
      description: 'Read a whole folder as one Markdown document: every file in it that reads as text (brand guide, personas, standing orders), each under its name and address, and what was left out.',
      inputSchema: { address, max_bytes: z.number().int().positive().optional().describe('The most to include, in bytes. Default 512 KB') },
      annotations: READ_ONLY,
    },
    ({ address, max_bytes }) => answer(async () => storage.bundle(address, { maxBytes: max_bytes })),
  );

  server.registerTool(
    'changes',
    {
      description: "What's new under an address since you last asked: files made, edited or trashed, and new comments on recent work. The first call starts watching and returns nothing.",
      inputSchema: { address },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ address }) =>
      answer(async () => {
        const file = join(cursors, `${createHash('sha256').update(address).digest('hex').slice(0, 16)}.cursor`);
        let cursor: string | undefined;
        try {
          cursor = (await readFile(file, 'utf8')).trim() || undefined;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        const result = await storage.changes(address, cursor);
        await mkdir(cursors, { recursive: true });
        await writeFile(`${file}.tmp`, `${result.cursor}\n`);
        await rename(`${file}.tmp`, file);
        if (cursor === undefined) return `Watching ${address} from now. Ask again later to see what's new.`;
        if (result.files.length === 0 && result.comments.length === 0) return `Nothing new under ${address}.`;
        return json({ files: result.files, comments: result.comments });
      }),
  );

  return server;
}

/** A tool's answer: its text, or storage's refusal as a tool error the agent can read. */
async function answer(work: () => Promise<string | string[]>): Promise<CallToolResult> {
  try {
    const text = await work();
    return { content: (Array.isArray(text) ? text : [text]).map((part) => ({ type: 'text', text: part })) };
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
