// The switch and usage add-ons, attached to the conductor through a gate:
// every call passes the card's switch (on? allowed? under quota and budget?
// which model?) and leaves a record that the usage report reads.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentDefinition, FunctionPlug } from '../src/index.ts';
import { scriptedModels } from '../addons/models.ts';
import { checkSwitch, switchGate } from '../addons/switch.ts';
import { formatUsage, usageReport } from '../addons/usage.ts';
import { echoPlugs, setup, team, worker } from './helpers.ts';

const reviewer = (extra: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id: 'contract-reviewer',
  role: 'Reviews contracts',
  runtime: 'model',
  plug: { model: 'opus', fallback: ['sonnet'] },
  capabilities: [{ id: 'review', description: 'a review' }],
  ...extra,
});

const legal = { id: 'ana', groups: ['legal'] };
const month = { since: new Date('2000-01-01'), until: new Date('3000-01-01') };

test('without the gate, a switch block does nothing; the conductor has no limits of its own', async () => {
  const conductor = setup([reviewer({ blocks: { switch: { enabled: false } } })], { models: scriptedModels(() => 'done') });
  assert.equal((await conductor.start('contract-reviewer', 'review this NDA')).status, 'complete');
});

test('off, and who may use it', async () => {
  const gates = [switchGate()];
  const off = setup([reviewer({ blocks: { switch: { enabled: false } } })], { gates, models: scriptedModels(() => 'done') });
  assert.match((await off.start('contract-reviewer', 'review')).nodes.root!.error!, /switched off/);
  const legalOnly = setup([reviewer({ blocks: { switch: { used_by: ['legal'] } } })], { gates, models: scriptedModels(() => 'done') });
  assert.match((await legalOnly.start('contract-reviewer', 'review', { user: { id: 'lee' } })).nodes.root!.error!, /`lee` may not use `contract-reviewer`/);
  assert.equal((await legalOnly.start('contract-reviewer', 'review', { user: legal })).status, 'complete');
});

test('past its spend line a card runs on its cheaper model, and stops at its monthly budget', async () => {
  const card = reviewer({ blocks: { switch: { used_by: ['legal'], downgrade_after_usd: 1, downgrade_to: 'sonnet', max_usd_per_month: 2 } } });
  const price: Record<string, number> = { opus: 0.6, sonnet: 0.3 };
  const conductor = setup([card], {
    gates: [switchGate()],
    models: scriptedModels((request) => ({ text: 'ok', model: request.model, cost_usd: price[request.model] })),
  });
  const models: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const mission = await conductor.start('contract-reviewer', `NDA ${i}`, { user: legal });
    const run = mission.nodes.root!.runs[0];
    models.push(mission.status === 'complete' ? `${run!.model}:${run!.via ?? 'own'}` : 'stopped');
  }
  // $0.60, $1.20 (past $1), then $0.30 a time on sonnet until $2.
  assert.deepEqual(models, ['opus:own', 'opus:own', 'sonnet:downgrade', 'sonnet:downgrade', 'sonnet:downgrade', 'stopped']);
  const report = usageReport(await conductor.list(), month.since, month.until);
  assert.equal(report.agents[0]!.runs, 5);
  assert.equal(report.agents[0]!.usd.toFixed(2), '2.10');
  assert.deepEqual(report.agents[0]!.models, { opus: 2, 'sonnet (downgrade)': 3 });
});

test('a budget per mission stops work before it starts', async () => {
  const conductor = setup(
    [team('crew', ['a', 'b'], [['a', 'work'], ['b', 'work']]), worker('a', 'work', { constraints: { cost_per_run_usd: 0.8 } }), worker('b', 'work', { constraints: { cost_per_run_usd: 0.8 } })],
    { gates: [switchGate()], plugs: echoPlugs(['a', 'b']) },
  );
  const mission = await conductor.start('crew', 'go', { meta: { budget_usd: 1 } });
  assert.equal(mission.cost_usd, 0.8);
  assert.equal(mission.nodes['task-2']!.waiting_for, 'fix');
  assert.match(mission.nodes['task-2']!.error!, /\$1\.00 budget is spent/);
});

test('failed calls are recorded but do not use up the run limit', async () => {
  let calls = 0;
  const flaky: FunctionPlug = async () => {
    calls += 1;
    if (calls === 1) throw new Error('service unavailable');
    return 'done';
  };
  const card = worker('filer', 'file', {
    blocks: { switch: { max_runs_per_month: 1 } },
    failure_modes: [{ trigger: 'down', when: 'error', action: 'retry', retries: 1 }],
  });
  const conductor = setup([card], { gates: [switchGate()], plugs: { filer: flaky } });
  const first = await conductor.start('filer', 'file it', { user: legal });
  assert.deepEqual(first.nodes.root!.runs.map((run) => run.outcome), ['error', 'ok']);
  const second = await conductor.start('filer', 'file another', { user: legal });
  assert.match(second.nodes.root!.error!, /used all 1 of its runs/);
  const report = usageReport(await conductor.list(), month.since, month.until);
  assert.deepEqual([report.agents[0]!.runs, report.agents[0]!.failed], [1, 1]);
  assert.match(formatUsage(report, conductor.registry), /ana: 1 runs/);
});

test('a switch block is checked when the cards load', () => {
  assert.deepEqual(checkSwitch({ downgrade_after_usd: 5 }), ['`downgrade_after_usd` and `downgrade_to` go together: set both, or neither']);
  assert.deepEqual(checkSwitch({ used_by: 'legal', colour: 'red' }), ['`used_by` must be a list of names', 'unknown field `colour`']);
  assert.deepEqual(checkSwitch({ enabled: true, used_by: ['legal'], max_runs_per_month: 30 }), []);
});
