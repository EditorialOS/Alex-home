// The Claude plug against a local stand-in for the Messages API: checks the
// request AgentOS sends and how it reads replies. No API key or network needed.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { RefusalError } from '../src/index.ts';
import { AnthropicModels, costOf } from '../addons/claude.ts';

interface Seen {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

const seen: Seen[] = [];
let reply: Record<string, unknown> = {};
const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    const parsed = JSON.parse(body);
    seen.push({ body: parsed, headers: request.headers });
    if (!parsed.stream) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify(reply));
    }
    // The same reply as server-sent events, the way the API streams it.
    const { content, stop_reason, stop_details, usage, ...rest } = reply as { content: Record<string, unknown>[]; stop_reason: string; stop_details: unknown; usage: { output_tokens: number } };
    const events: Record<string, unknown>[] = [{ type: 'message_start', message: { ...rest, content: [], stop_reason: null, stop_details: null, usage: { ...usage, output_tokens: 0 } } }];
    content.forEach((block, index) => {
      const { text, ...start } = block as { text?: string };
      events.push({ type: 'content_block_start', index, content_block: text === undefined ? block : { ...start, text: '' } });
      if (text !== undefined) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
      events.push({ type: 'content_block_stop', index });
    });
    events.push({ type: 'message_delta', delta: { stop_reason, stop_sequence: null, stop_details }, usage: { output_tokens: usage.output_tokens } });
    events.push({ type: 'message_stop' });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
});

let models: AnthropicModels;
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  models = new AnthropicModels({ client: new Anthropic({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 }) });
});
after(() => server.close());

const message = (overrides: Record<string, unknown>) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: 'Hello ' },
    { type: 'text', text: 'there.' },
  ],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  ...overrides,
});

test('a model card becomes one Messages call with effort, caching and server fallbacks', async () => {
  reply = message({});
  const response = await models.complete({ model: 'anthropic/claude-opus-5-5', system: 'You write.', prompt: 'Write.', effort: 'high' });
  const { body, headers } = seen.at(-1)!;
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.max_tokens, 16000);
  assert.equal(body.stream, true);
  assert.deepEqual(body.system, [{ type: 'text', text: 'You write.', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Write.' }]);
  assert.deepEqual(body.output_config, { effort: 'high' });
  assert.equal(body.fallbacks, 'default');
  assert.equal('thinking' in body, false);
  assert.match(String(headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.equal(response.text, 'Hello there.');
  assert.equal(response.model, 'claude-opus-5-5');
  assert.equal(response.cost_usd, (1000 * 4 + 200 * 20) / 1_000_000);
});

test('a schema becomes a structured output; Haiku gets no fallbacks', async () => {
  reply = message({ model: 'claude-haiku-5-5', content: [{ type: 'text', text: '{"verdict":"pass"}' }] });
  const schema = { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false };
  await models.complete({ model: 'claude-haiku-5-5', system: 's', prompt: 'p', schema, max_tokens: 500 });
  const { body, headers } = seen.at(-1)!;
  assert.deepEqual(body.output_config, { effort: 'medium', format: { type: 'json_schema', schema } });
  assert.equal(body.max_tokens, 500);
  assert.equal('fallbacks' in body, false);
  assert.equal(headers['anthropic-beta'], undefined);
});

test('a refusal is raised before any content is read', async () => {
  reply = message({ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } });
  const error = await models.complete({ model: 'claude-opus-5-5', system: 's', prompt: 'p' }).catch((caught: unknown) => caught);
  assert.ok(error instanceof RefusalError);
  assert.equal(error.category, 'cyber');
});

test('running out of tokens is an error, not a short answer', async () => {
  reply = message({ stop_reason: 'max_tokens' });
  await assert.rejects(models.complete({ model: 'claude-sonnet-5-5', system: 's', prompt: 'p' }), /ran out of output tokens/);
});

test('cost counts cache reads and writes, and is unknown for unpriced models', () => {
  const usage = { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10_000 };
  assert.equal(costOf('claude-sonnet-5-5', usage), (100 * 2 + 10 * 10 + 1000 * 2.5 + 10_000 * 0.2) / 1_000_000);
  assert.equal(costOf('some-other-model', usage), undefined);
  assert.equal(costOf('some-other-model', usage, { 'some-other-model': [1, 1, 1, 1] }), (100 + 10 + 1000 + 10_000) / 1_000_000);
});
