// The Northlight case study (examples/case-study): the numbers the write-up
// quotes, pinned, so the simulation and the write-up cannot drift apart.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personSteps, simulate } from '../examples/case-study/simulate.ts';

test('one simulated month at Northlight', async () => {
  const { missions, usage } = await simulate();
  const episodes = missions.filter((mission) => mission.nodes.root!.capability === 'make-episode');
  assert.equal(missions.length, 15);
  assert.equal(episodes.filter((mission) => mission.status === 'complete').length, 13);
  assert.equal(missions.find((mission) => mission.id === 'nl-guest-dec')!.status, 'failed');

  const steps = personSteps(missions);
  assert.equal(steps.length, 21);
  assert.equal(steps.filter((step) => step.what.startsWith('approved')).length, 13);
  assert.equal(steps.filter((step) => step.what.startsWith('rejected')).length, 2);
  assert.equal(steps.filter((step) => step.who === 'sam').length, 5);

  const scripts = usage.agents.find((entry) => entry.agent === 'scriptwriter')!;
  assert.deepEqual(scripts.models, { 'claude-opus-5-5': 15, 'claude-sonnet-5-5 (fallback)': 1, 'claude-sonnet-5-5 (downgrade)': 5 });
  assert.equal(scripts.usd.toFixed(2), '1.88');
  assert.equal(usage.usd.toFixed(2), '2.69');
  const revisions = missions.flatMap((mission) => Object.values(mission.nodes).flatMap((node) => node.checks)).filter((check) => check.verdict !== 'pass');
  assert.equal(revisions.length, 5);
});
