import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAgents, parseCard } from '../src/index.ts';

const CARD = `# Writer

## Identity
- **agent_id**: \`writer\`
- **name**: Writer
- **version**: \`1.2.0\`
- **role**: Writes things.
- **runtime**: \`model\`

## Plug
\`\`\`yaml
plug:
  model: claude-opus-5-5
  fallback: [claude-sonnet-5-5]
  effort: high
\`\`\`

## Capabilities
\`\`\`yaml
capabilities:
  - id: write
    description: "A draft."
    autonomous: false
\`\`\`

## Instructions
Write well.

\`\`\`text
an example inside the instructions
\`\`\`
`;

test('a card reads into identity, blocks and instructions', () => {
  const { card, errors } = parseCard(CARD, { id: 'writer' });
  assert.deepEqual(errors, []);
  assert.equal(card?.runtime, 'model');
  assert.equal(card?.version, '1.2.0');
  assert.deepEqual(card?.plug, { model: 'claude-opus-5-5', fallback: ['claude-sonnet-5-5'], effort: 'high' });
  assert.equal(card?.capabilities[0]?.autonomous, false);
  assert.equal(card?.instructions, 'Write well.\n\n```text\nan example inside the instructions\n```');
});

test('a card with a mistake is rejected whole, with every reason', () => {
  const broken = CARD.replace('effort: high', 'effort: high\n  temperature: 2').replace('`writer`', '`author`');
  const { card, errors } = parseCard(broken, { id: 'writer' });
  assert.equal(card, undefined);
  assert.ok(errors.some((error) => error.includes('unknown field `temperature`')));
  assert.ok(errors.some((error) => error.includes('must match its file name')));
});

test('a model card needs a plug, and only conductors have steps', () => {
  const noPlug = CARD.replace(/## Plug[\s\S]*?```\n\n/, '');
  assert.ok(parseCard(noPlug, { id: 'writer' }).errors.some((error) => error.includes('needs a `plug:`')));
  const steps = CARD.replace('autonomous: false', 'steps: [{id: a, assigned_agent: x, capability_match: y}]');
  assert.ok(parseCard(steps, { id: 'writer' }).errors.some((error) => error.includes('only conductor cards have steps')));
});

test('unknown blocks and unclosed yaml are errors', () => {
  assert.ok(parseCard(`${CARD}\n\`\`\`yaml\nsecrets: {}\n\`\`\`\n`, { id: 'writer' }).errors.some((error) => error.includes('unknown block `secrets`')));
  assert.ok(parseCard(`${CARD}\n\`\`\`yaml\nrules: []\n`, { id: 'writer' }).errors.some((error) => error.includes('never closed')));
});

test('a folder is a team: its agent.md is the conductor, its files are members', async () => {
  const registry = await loadAgents(new URL('../examples/media/agents', import.meta.url).pathname);
  assert.deepEqual(registry.invalid, []);
  assert.deepEqual(registry.get('show')?.members.sort(), ['promo', 'publisher', 'researcher', 'rights-check', 'writers']);
  assert.deepEqual(registry.get('writers')?.members.sort(), ['outliner', 'script-editor', 'scriptwriter']);
  assert.equal(registry.get('promo')?.capabilities[0]?.steps, undefined);
});

test('the spec packs load; runtimes v0 does not have yet are reported, not guessed', async () => {
  const registry = await loadAgents(new URL('../../packs', import.meta.url).pathname);
  const reasons = registry.invalid.flatMap((entry) => entry.errors);
  assert.ok(registry.cards.size > 0);
  for (const reason of reasons) assert.match(reason, /is in the spec but not in this SDK yet|which is invalid/);
  assert.ok(registry.get('hiring-loop') === undefined && registry.invalid.some((entry) => entry.id === 'hiring-loop'));
});
