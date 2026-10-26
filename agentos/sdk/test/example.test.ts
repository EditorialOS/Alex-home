// The media example, end to end, offline: the cards in examples/media run on
// canned model answers, so this checks the wiring, not the writing.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Conductor, loadAgents, MemoryStore, ModelPlanner, scriptedModels } from '../src/index.ts';
import { cannedModels, plugs } from '../examples/media/setup.ts';

const REQUEST = 'Episode 12 of Small Rooms: how bedroom producers can mix vocals on cheap headphones.';

async function show() {
  const registry = await loadAgents(new URL('../examples/media/agents', import.meta.url).pathname);
  const models = cannedModels();
  return new Conductor({ registry, store: new MemoryStore(), plugs, models, planner: new ModelPlanner({ models }) });
}

test('an episode: routed, researched, written, checked, signed off, cleared, promoted, scheduled', async () => {
  const conductor = await show();
  let mission = await conductor.start('show', REQUEST, { user: { id: 'sam', groups: ['producers'] } });
  assert.equal(mission.nodes.root!.capability, 'make-episode');
  const script = mission.nodes['task-2']!;
  assert.equal(script.waiting_for, 'approval');
  assert.equal(mission.nodes['task-2.2']!.revisions, 1);
  assert.match(mission.nodes['task-2.2']!.output!, /41%/);

  mission = await conductor.approve(mission.id, 'task-2', { output_hash: script.output_hash!, by: 'sam' });
  assert.equal(mission.status, 'complete');
  assert.match(mission.nodes['task-3']!.output!, /3 cues, all cleared/);
  assert.deepEqual(mission.nodes['task-4']!.children, ['task-4.1', 'task-4.2', 'task-4.3']);
  assert.equal(mission.nodes['task-4']!.plan_source, 'planner');
  assert.match(mission.nodes['task-5']!.output!, /Release plan/);
});

test('the host sends the script back: only the draft is redone, with the note, and signed off again', async () => {
  const conductor = await show();
  let mission = await conductor.start('show', REQUEST, { user: { id: 'sam', groups: ['producers'] } });
  const first = mission.nodes['task-2']!.output_hash!;
  mission = await conductor.reject(mission.id, 'task-2', { by: 'sam', note: 'Open with the survey number.' });
  const draft = mission.nodes['task-2.2']!;
  assert.equal(mission.nodes['task-2.1']!.attempt, 1);
  assert.equal(draft.feedback, 'Open with the survey number.');
  assert.ok(draft.attempt > 2);
  assert.equal(mission.nodes['task-2']!.waiting_for, 'approval');
  assert.notEqual(mission.nodes['task-2']!.output_hash, first);
  await assert.rejects(conductor.approve(mission.id, 'task-2', { output_hash: first, by: 'sam' }), /approve that one/);
});

test('a signal skips the router', async () => {
  const conductor = await show();
  const mission = await conductor.start('show', '/promo for episode 11', { user: { id: 'sam', groups: ['producers'] } });
  assert.equal(mission.nodes.root!.capability, 'promote-episode');
  assert.equal(mission.status, 'complete');
});

test('only producers may schedule a release', async () => {
  const conductor = await show();
  let mission = await conductor.start('show', REQUEST, { user: { id: 'lee' } });
  mission = await conductor.approve(mission.id, 'task-2', { output_hash: mission.nodes['task-2']!.output_hash!, by: 'lee' });
  assert.equal(mission.status, 'needs-human');
  assert.match(mission.nodes['task-5']!.error!, /`lee` may not use `publisher`/);
  assert.equal(mission.nodes['task-4']!.status, 'complete');
});

test('a cue without a licence stops the episode until the host clears it', async () => {
  const canned = cannedModels();
  const models = scriptedModels(async (request) => {
    const response = await canned.complete(request);
    if (request.system.startsWith('Writes scripts')) response.text += '\n[MUSIC: A Famous Song]';
    return response;
  });
  const registry = await loadAgents(new URL('../examples/media/agents', import.meta.url).pathname);
  const conductor = new Conductor({ registry, store: new MemoryStore(), plugs, models, planner: new ModelPlanner({ models }) });
  let mission = await conductor.start('show', REQUEST, { user: { id: 'sam', groups: ['producers'] } });
  mission = await conductor.approve(mission.id, 'task-2', { output_hash: mission.nodes['task-2']!.output_hash!, by: 'sam' });
  assert.equal(mission.nodes['task-3']!.waiting_for, 'fix');
  assert.match(mission.nodes['task-3']!.error!, /not licensed: A Famous Song/);
  assert.equal(mission.nodes['task-5']!.status, 'pending');
  mission = await conductor.resolve(mission.id, 'task-3', { by: 'sam', decision: 'complete', output: 'Bought a licence for A Famous Song.' });
  assert.equal(mission.status, 'complete');
});
