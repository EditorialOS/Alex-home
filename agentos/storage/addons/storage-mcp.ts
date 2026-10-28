#!/usr/bin/env node
// The connector's command: an MCP client starts it, and it talks MCP over
// standard input and output.
//
//   storage-mcp [--config storage.yaml] [--agent raya] [--cursors .storage/cursors]

import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defaultConfigFile, loadConfig, openStorage } from '../src/config.ts';
import { storageServer } from './mcp.ts';

try {
  const { values } = parseArgs({
    options: { config: { type: 'string' }, agent: { type: 'string' }, cursors: { type: 'string' } },
  });
  const storage = openStorage(await loadConfig(values.config ?? defaultConfigFile()));
  const server = storageServer(storage, { agent: values.agent ?? process.env.STORAGE_AGENT, cursors: values.cursors });
  await server.connect(new StdioServerTransport());
} catch (error) {
  // Standard output is the MCP channel, so problems go to standard error.
  console.error(`storage-mcp: ${(error as Error).message}`);
  process.exitCode = 1;
}
