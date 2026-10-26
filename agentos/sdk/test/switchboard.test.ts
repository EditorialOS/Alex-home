// The switchboard, folded into the conductor: every call to an agent passes
// its switch (on? allowed? under quota and budget? which model?) and leaves a
// record (who, which agent, which model, cost, time, outcome).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agent, formatUsage, scriptedModels } from '../src/index.ts';
import type { AgentDefinition, FunctionPlug } from '../src/index.ts';
import { setup, worker } from './helpers.ts';

const reviewer = (extra: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id: 'contract-reviewer',
  role: 'Reviews contracts',
  runtime: 'model',
  plug: { model: 'opus', fallback: ['sonnet'] },
  capabilities: [{ id: 'review', description: 'a review' }],
  ...extra,
});

const legal = { id: 'ana', groups: ['legal'] };

test('any card can be called on its own, not only teams', async () => {
  const conductor = setup([reviewer()], { models: scriptedModels((request) => ({ text: `reviewed on ${request.model}`, model: request.model, cost_usd: 0.25 })) });
  const mission = await conductor.start('contract-reviewer', 'review this NDA', { user: legal });
  assert.equal(mission.status, 'complete');
  assert.equal(mission.output, 'reviewed on opus');
  const [run] = mission.nodes.root!.runs;
  assert.ok(run!.ms >= 0 && Date.parse(run!.at) > 0);
  assert.deepEqual({ ...run, at: undefined, ms: undefined }, {
    agent: 'contract-reviewer',
    capability: 'review',
    at: undefined,
    ms: undefined,
    usd: 0.25,
    outcome: 'ok',
    model: 'opus',
    plug: 'model',
    user: 'ana',
    by: undefined,
  });
});

test('past its spend line a card runs on its cheaper model, and stops at its budget', async () => {
  const card = reviewer({
    plug: { model: 'opus', fallback: ['sonnet'], downgrade: 'sonnet' },
    switch: { used_by: ['legal'], downgrade_after_usd: 1, max_usd_per_month: 2 },
  });
  const price: Record<string, number> = { opus: 0.6, sonnet: 0.3 };
  const conductor = setup([card], { models: scriptedModels((request) => ({ text: 'ok', model: request.model, cost_usd: price[request.model] })) });
  const models: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const mission = await conductor.start('contract-reviewer', `NDA ${i}`, { user: legal });
    models.push(mission.status === 'complete' ? `${mission.nodes.root!.runs[0]!.model}:${mission.nodes.root!.runs[0]!.plug}` : 'blocked');
  }
  // $0.60, $1.20 (past $1), then $0.30 a time on sonnet until $2.
  assert.deepEqual(models, ['opus:model', 'opus:model', 'sonnet:downgrade', 'sonnet:downgrade', 'sonnet:downgrade', 'blocked']);
  const report = await conductor.usage();
  assert.equal(report.agents[0]!.runs, 5);
  assert.equal(report.agents[0]!.usd.toFixed(2), '2.10');
  assert.deepEqual(report.agents[0]!.models, { opus: 2, 'sonnet (downgrade)': 3 });
});

test('when the model is down the next one on the plug answers, and the record says so', async () => {
  const conductor = setup([reviewer()], {
    models: scriptedModels((request) => (request.model === 'opus' ? Promise.reject(new Error('overloaded')) : { text: 'ok', model: 'sonnet', cost_usd: 0.1 })),
  });
  const mission = await conductor.start('contract-reviewer', 'review', { user: legal });
  assert.deepEqual(
    mission.nodes.root!.runs.map((run) => [run.model, run.plug, run.outcome]),
    [['opus', 'model', 'error'], ['sonnet', 'fallback', 'ok']],
  );
  const report = await conductor.usage();
  assert.deepEqual([report.agents[0]!.runs, report.agents[0]!.failed], [1, 1]);
  assert.deepEqual(report.agents[0]!.models, { opus: 1, 'sonnet (fallback)': 1 });
  assert.ok(mission.nodes.root!.events.some((event) => event.includes('opus failed (overloaded); trying the next model')));
});

test('failed calls are recorded but do not use up the run limit', async () => {
  let calls = 0;
  const flaky: FunctionPlug = async () => {
    calls += 1;
    if (calls === 1) throw new Error('service unavailable');
    return 'done';
  };
  const card = worker('filer', 'file', {
    switch: { max_runs_per_month: 1 },
    failure_modes: [{ trigger: 'down', when: 'error', action: 'retry', retries: 1 }],
  });
  const conductor = setup([card], { plugs: { filer: flaky } });
  const first = await conductor.start('filer', 'file it', { user: legal });
  assert.deepEqual(first.nodes.root!.runs.map((run) => run.outcome), ['error', 'ok']);
  const second = await conductor.start('filer', 'file another', { user: legal });
  assert.match(second.nodes.root!.error!, /used all 1 of its runs/);
  const report = await conductor.usage();
  assert.deepEqual([report.agents[0]!.runs, report.agents[0]!.failed], [1, 1]);
  assert.match(formatUsage(report, conductor.registry), /filer\s+1\s+1\s+\$0\.0000\s+\S+\s+1 of 1 runs/);
  assert.match(formatUsage(report, conductor.registry), /ana: 1 runs/);
});

test('a downgrade must be set on both the switch and the plug', () => {
  assert.throws(() => agent(reviewer({ switch: { downgrade_after_usd: 5 } })), /needs a model card whose plug names a `downgrade`/);
  assert.throws(() => agent(reviewer({ plug: { model: 'opus', downgrade: 'sonnet' } })), /set both, or neither/);
});
