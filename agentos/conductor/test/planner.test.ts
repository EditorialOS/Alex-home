// The planner add-on: the conductor's model, used to route requests and to
// split work between agents. It prefers the simplest route.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ModelRequest } from '../src/index.ts';
import { scriptedModels } from '../addons/models.ts';
import { ModelPlanner } from '../addons/planner.ts';
import { setup, team, worker } from './helpers.ts';

test('the planner sees single agents first, is told to prefer one, and uses the capability\'s model', async () => {
  const asked: ModelRequest[] = [];
  const models = scriptedModels((request) => {
    asked.push(request);
    return JSON.stringify({ steps: [{ id: 'one', assigned_agent: 'researcher', capability_match: 'work', depends_on: [], description: 'research it' }] });
  });
  const desk = team('desk', ['studio', 'researcher', 'writer'], null, {
    plug: { model: 'planner-model', effort: 'medium' },
    capabilities: [{ id: 'run', description: 'handle a request', plug: { model: 'cheap-planner' } }],
  });
  const conductor = setup([desk, team('studio', ['writer'], [['writer', 'work']]), worker('researcher'), worker('writer')], {
    models,
    planner: new ModelPlanner({ models }),
    plugs: { researcher: async () => 'found it', writer: async () => 'wrote it' },
  });
  const mission = await conductor.start('desk', 'find three studies on four-day weeks');
  assert.equal(mission.status, 'complete');
  assert.deepEqual(Object.keys(mission.nodes), ['root', 'task-1']);
  const plan = asked[0]!;
  assert.equal(plan.model, 'cheap-planner');
  assert.equal(plan.effort, 'medium');
  assert.match(plan.system, /Prefer the simplest route/);
  const members = plan.prompt.split('## Members')[1]!;
  assert.ok(members.indexOf('- researcher') < members.indexOf('- studio (team)'), 'single agents are listed before teams');
});

test('at the depth limit, the planner is not offered teams at all', async () => {
  const asked: ModelRequest[] = [];
  const models = scriptedModels((request) => {
    asked.push(request);
    return JSON.stringify({ steps: [{ id: 'one', assigned_agent: 'writer', capability_match: 'work', depends_on: [], description: 'write it' }] });
  });
  const conductor = setup([team('desk', ['studio', 'writer'], null), team('studio', ['writer'], [['writer', 'work']]), worker('writer')], {
    models,
    planner: new ModelPlanner({ models }),
    plugs: { writer: async () => 'wrote it' },
    maxDepth: 1,
  });
  await conductor.start('desk', 'write it');
  assert.doesNotMatch(asked[0]!.prompt, /studio/);
});
