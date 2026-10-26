import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { agent, Conductor, ConflictError, createRegistry, FileStore, RefusalError, scriptedModels } from '../src/index.ts';
import type { FunctionPlug, Mission, Planner, Step } from '../src/index.ts';
import { echoPlugs, setup, team, verdicts, worker } from './helpers.ts';

const statuses = (mission: Mission) => Object.fromEntries(Object.values(mission.nodes).map((node) => [node.id, node.status]));

test('a recipe runs in order, and each task gets the outputs it depends on', async () => {
  const messages: Record<string, string[]> = {};
  const conductor = setup([team('crew', ['a', 'b'], [['a', 'work'], ['b', 'work']]), worker('a'), worker('b')], {
    plugs: echoPlugs(['a', 'b'], messages),
  });
  const mission = await conductor.start('crew', 'make the thing', { inputs: { size: 'small' } });
  assert.equal(mission.status, 'complete');
  assert.deepEqual(statuses(mission), { root: 'complete', 'task-1': 'complete', 'task-2': 'complete' });
  assert.match(messages.a![0]!, /make the thing/);
  assert.match(messages.a![0]!, /size = small/);
  assert.doesNotMatch(messages.a![0]!, /Outputs from earlier tasks/);
  assert.match(messages.b![0]!, /### task-1[\s\S]*a done/);
  assert.match(mission.output!, /## task-1: a\/work\n\na done\n\n## task-2: b\/work\n\nb done/);
});

test('teams nest: a sub-team is one step to its parent', async () => {
  const conductor = setup(
    [team('top', ['sub', 'c'], [['sub', 'run'], ['c', 'work']]), team('sub', ['a', 'b'], [['a', 'work'], ['b', 'work']]), worker('a'), worker('b'), worker('c')],
    { plugs: echoPlugs(['a', 'b', 'c']) },
  );
  const mission = await conductor.start('top', 'go');
  assert.equal(mission.status, 'complete');
  assert.deepEqual(Object.keys(mission.nodes).sort(), ['root', 'task-1', 'task-1.1', 'task-1.2', 'task-2']);
  assert.equal(mission.nodes['task-1.2']!.depends_on[0], 'task-1.1');
});

test('an approval is bound to the exact output a person saw', async () => {
  const conductor = setup([team('crew', ['a', 'b'], [['a', 'work'], ['b', 'work']]), worker('a', 'work', { constraints: { requires_human_approval: true } }), worker('b')], {
    plugs: echoPlugs(['a', 'b']),
  });
  let mission = await conductor.start('crew', 'go');
  const node = mission.nodes['task-1']!;
  assert.equal(mission.status, 'needs-human');
  assert.equal(node.waiting_for, 'approval');
  assert.equal(mission.nodes['task-2']!.status, 'pending');
  await assert.rejects(conductor.approve(mission.id, 'task-1', { output_hash: 'sha256:0000', by: 'dana' }), ConflictError);
  await assert.rejects(conductor.approve(mission.id, 'task-1', { output_hash: node.output_hash!, by: 'dana', attempt: 2 }), ConflictError);
  mission = await conductor.approve(mission.id, 'task-1', { output_hash: node.output_hash!, by: 'dana' });
  assert.equal(mission.status, 'complete');
  assert.deepEqual(mission.nodes['task-1']!.approvals[0]!.rules, ['a/requires-human-approval']);
});

test('a rejected output follows the card: revise with the note as feedback', async () => {
  const messages: Record<string, string[]> = {};
  const conductor = setup(
    [
      team('crew', ['a'], [['a', 'work']]),
      worker('a', 'work', {
        capabilities: [{ id: 'work', description: 'a draft', autonomous: false }],
        failure_modes: [{ trigger: 'rejected', when: 'rejected', action: 'revise', retries: 1 }],
      }),
    ],
    { plugs: echoPlugs(['a'], messages) },
  );
  let mission = await conductor.start('crew', 'go');
  mission = await conductor.reject(mission.id, 'task-1', { by: 'dana', note: 'shorter, please' });
  assert.equal(mission.nodes['task-1']!.waiting_for, 'approval');
  assert.equal(mission.nodes['task-1']!.attempt, 2);
  assert.match(messages.a![1]!, /## Feedback on your last attempt\nshorter, please/);
  mission = await conductor.reject(mission.id, 'task-1', { by: 'dana', note: 'still long' });
  assert.equal(mission.status, 'failed');
  assert.match(mission.nodes['task-1']!.error!, /gave up after 1 revisions/);
});

test('a check sends work back with notes until it passes', async () => {
  const messages: Record<string, string[]> = {};
  const conductor = setup(
    [
      team('crew', ['writer', 'editor'], [['writer', 'work']], {
        rules: [{ id: 'edit', kind: 'check', applies_to: { agent_id: 'writer' }, checker: { agent_id: 'editor', capability: 'score' }, min_score: 75, reason: 'good enough' }],
      }),
      worker('writer'),
      { id: 'editor', role: 'editor', runtime: 'model', plug: { model: 'm' }, capabilities: [{ id: 'score', description: 'a score', score_scale: '1-5' }] },
    ],
    {
      plugs: echoPlugs(['writer'], messages),
      models: verdicts({ verdict: 'revise', score: 2, notes: 'fix the ending' }, { verdict: 'pass', score: 3, notes: 'closer' }, { verdict: 'pass', score: 4, notes: 'good' }),
    },
  );
  const mission = await conductor.start('crew', 'go');
  const node = mission.nodes['task-1']!;
  assert.equal(mission.status, 'complete');
  assert.deepEqual(node.checks.map((check) => [check.verdict, check.score]), [['revise', 25], ['revise', 50], ['pass', 75]]);
  assert.equal(node.revisions, 2);
  assert.match(messages.writer![1]!, /fix the ending/);
});

test('a check that rejects, or is never satisfied, fails the task', async () => {
  const build = (...replies: object[]) =>
    setup(
      [
        team('crew', ['writer', 'editor'], [['writer', 'work']], {
          rules: [{ id: 'edit', kind: 'check', applies_to: { agent_id: 'writer' }, checker: { agent_id: 'editor', capability: 'score' }, max_revisions: 1, reason: 'r' }],
        }),
        worker('writer'),
        worker('editor', 'score'),
      ],
      { plugs: { ...echoPlugs(['writer']), editor: async () => JSON.stringify(replies.shift()) } },
    );
  const rejecting = await build({ verdict: 'reject', score: 0, notes: 'off topic' }).start('crew', 'go');
  assert.equal(rejecting.status, 'failed');
  assert.match(rejecting.nodes['task-1']!.error!, /rejected the output/);
  const stubborn = await build({ verdict: 'revise', score: 10, notes: 'no' }, { verdict: 'revise', score: 10, notes: 'no' }).start('crew', 'go');
  assert.match(stubborn.nodes['task-1']!.error!, /not passed after 1 revisions/);
});

test('the switch: off, who may use it, and monthly limits across missions', async () => {
  const cards = [
    team('crew', ['a'], [['a', 'work']]),
    worker('a', 'work', { switch: { used_by: ['producers'], max_runs_per_month: 2 }, constraints: { cost_per_run_usd: 0.5 } }),
  ];
  let now = new Date('2026-10-20T12:00:00Z');
  const conductor = setup(cards, { plugs: echoPlugs(['a']), now: () => now });
  const stranger = await conductor.start('crew', 'go', { user: { id: 'lee' } });
  assert.equal(stranger.nodes['task-1']!.waiting_for, 'fix');
  assert.match(stranger.nodes['task-1']!.error!, /`lee` may not use `a`/);
  const producer = { id: 'sam', groups: ['producers'] };
  assert.equal((await conductor.start('crew', 'one', { user: producer })).status, 'complete');
  assert.equal((await conductor.start('crew', 'two', { user: producer })).status, 'complete');
  const third = await conductor.start('crew', 'three', { user: producer });
  assert.match(third.nodes['task-1']!.error!, /used all 2 of its runs this month/);
  now = new Date('2026-11-01T00:00:01Z');
  assert.equal((await conductor.resolve(third.id, 'task-1', { by: 'sam', decision: 'retry' })).status, 'complete');

  const off = setup([team('crew', ['a'], [['a', 'work']]), worker('a', 'work', { switch: { enabled: false } })], { plugs: echoPlugs(['a']) });
  assert.match((await off.start('crew', 'go')).nodes['task-1']!.error!, /switched off/);
});

test('failures: retry with a delay, then a person; resolve retry unblocks what waited', async () => {
  let calls = 0;
  const flaky: FunctionPlug = async () => {
    calls += 1;
    if (calls <= 2) throw new Error('service unavailable');
    return 'finally';
  };
  const conductor = setup(
    [
      team('crew', ['a', 'b'], [['a', 'work'], ['b', 'work']]),
      worker('a', 'work', { failure_modes: [{ trigger: 'down', when: 'error', match: ['unavailable'], action: 'retry', retries: 1, delay_seconds: 0.01 }] }),
      worker('b'),
    ],
    { plugs: { a: flaky, ...echoPlugs(['b']) } },
  );
  let mission = await conductor.start('crew', 'go');
  assert.equal(mission.status, 'failed');
  assert.equal(mission.nodes['task-1']!.retries, 1);
  assert.equal(mission.nodes['task-2']!.status, 'blocked');
  mission = await conductor.resolve(mission.id, 'task-1', { by: 'dana', decision: 'retry', note: 'service is back' });
  assert.equal(mission.status, 'complete');
  assert.equal(mission.nodes['task-1']!.output, 'finally');
});

test('a refusal goes to a person by default; a person can finish the task by hand', async () => {
  const conductor = setup(
    [team('crew', ['m'], [['m', 'work']]), { id: 'm', role: 'm', runtime: 'model', plug: { model: 'x' }, capabilities: [{ id: 'work', description: 'w' }] }],
    { models: scriptedModels(() => Promise.reject(new RefusalError('declined', 'cyber'))) },
  );
  let mission = await conductor.start('crew', 'go');
  assert.equal(mission.nodes['task-1']!.waiting_for, 'fix');
  mission = await conductor.resolve(mission.id, 'task-1', { by: 'dana', decision: 'complete', output: 'written by hand' });
  assert.equal(mission.status, 'complete');
  assert.match(mission.output!, /written by hand/);
});

test('a model card falls back to the next model on its plug', async () => {
  const conductor = setup(
    [team('crew', ['m'], [['m', 'work']]), { id: 'm', role: 'm', runtime: 'model', plug: { model: 'big', fallback: ['small'] }, capabilities: [{ id: 'work', description: 'w' }] }],
    { models: scriptedModels((request) => (request.model === 'big' ? Promise.reject(new Error('overloaded')) : 'from small')) },
  );
  const mission = await conductor.start('crew', 'go');
  assert.equal(mission.nodes['task-1']!.output, 'from small');
  assert.equal(mission.nodes['task-1']!.runs[0]!.model, 'small');
});

test('a human card waits for a person and records who did it', async () => {
  const conductor = setup([team('crew', ['h'], [['h', 'work']]), { id: 'h', role: 'a person', runtime: 'human', capabilities: [{ id: 'work', description: 'sign it' }] }]);
  let mission = await conductor.start('crew', 'go');
  assert.equal(mission.nodes['task-1']!.waiting_for, 'task');
  assert.match(mission.nodes['task-1']!.instructions!, /sign it/);
  mission = await conductor.resolve(mission.id, 'task-1', { by: 'dana', decision: 'complete', output: 'signed' });
  assert.equal(mission.status, 'complete');
  assert.equal(mission.nodes['task-1']!.runs[0]!.agent, 'h');
});

const plannerOf = (...plans: Step[][]): Planner & { calls: number } => {
  const planner = {
    calls: 0,
    async plan() {
      planner.calls += 1;
      return plans.shift() ?? [];
    },
  };
  return planner;
};

test('a planned team: a bad plan is sent back once, then a person is asked', async () => {
  const cards = [team('crew', ['a', 'b'], null), worker('a'), worker('b'), worker('outsider')];
  const good: Step[] = [{ id: 'x', assigned_agent: 'b', capability_match: 'work', depends_on: [] }];
  const bad: Step[] = [{ id: 'x', assigned_agent: 'outsider', capability_match: 'work' }];
  const replanned = plannerOf(bad, good);
  const ok = await setup(cards, { plugs: echoPlugs(['a', 'b']), planner: replanned }).start('crew', 'go');
  assert.equal(ok.status, 'complete');
  assert.equal(replanned.calls, 2);
  assert.equal(ok.nodes.root!.plan_source, 'planner');

  const stuck = await setup(cards, { plugs: echoPlugs(['a', 'b']), planner: plannerOf(bad, bad) }).start('crew', 'go');
  assert.equal(stuck.nodes.root!.waiting_for, 'fix');
  assert.match(stuck.nodes.root!.error!, /`outsider` is not on team `crew`/);
});

test('a before rule: a plan that skips the first step is refused', async () => {
  const cards = [
    team('crew', ['scan', 'deploy'], null, {
      rules: [{ id: 'scan-first', kind: 'before', first: { agent_id: 'scan' }, then: { agent_id: 'deploy' }, reason: 'scan before deploy' }],
    }),
    worker('scan'),
    worker('deploy'),
  ];
  const skip: Step[] = [{ id: 'd', assigned_agent: 'deploy', capability_match: 'work' }];
  const proper: Step[] = [
    { id: 's', assigned_agent: 'scan', capability_match: 'work' },
    { id: 'd', assigned_agent: 'deploy', capability_match: 'work' },
  ];
  const refused = await setup(cards, { plugs: echoPlugs(['scan', 'deploy']), planner: plannerOf(skip, skip) }).start('crew', 'go');
  assert.match(refused.nodes.root!.error!, /crew\/scan-first: `deploy` needs `scan` first/);
  const fine = await setup(cards, { plugs: echoPlugs(['scan', 'deploy']), planner: plannerOf(skip, proper) }).start('crew', 'go');
  assert.equal(fine.status, 'complete');
});

test('routing: a signal picks the capability, then the router, else a person', async () => {
  const two = team('crew', ['a', 'b'], null, {
    capabilities: [
      { id: 'one', description: 'first', signals: ['/one'], steps: [{ id: 's', assigned_agent: 'a', capability_match: 'work' }] },
      { id: 'two', description: 'second', steps: [{ id: 's', assigned_agent: 'b', capability_match: 'work' }] },
    ],
  });
  const cards = [two, worker('a'), worker('b')];
  const signalled = await setup(cards, { plugs: echoPlugs(['a', 'b']) }).start('crew', '/one please');
  assert.equal(signalled.nodes.root!.capability, 'one');
  assert.equal(signalled.status, 'complete');

  const router: Planner = { plan: async () => [], route: async ({ note }) => ({ capability: note ? 'two' : null, reason: 'unclear' }) };
  const conductor = setup(cards, { plugs: echoPlugs(['a', 'b']), planner: router });
  let mission = await conductor.start('crew', 'something');
  assert.equal(mission.nodes.root!.waiting_for, 'fix');
  assert.match(mission.nodes.root!.error!, /No capability fits this request \(unclear\)/);
  mission = await conductor.resolve(mission.id, 'root', { by: 'dana', decision: 'retry', note: 'it is the second kind' });
  assert.equal(mission.nodes.root!.capability, 'two');
  assert.equal(mission.status, 'complete');

  const named = await setup(cards, { plugs: echoPlugs(['a', 'b']) }).start('crew', 'x');
  const resolved = await setup(cards, { plugs: echoPlugs(['a', 'b']) }).resolve(named.id, 'root', { by: 'dana', decision: 'retry', capability: 'one' }).catch((error: Error) => error);
  assert.ok(resolved instanceof Error);
});

test('an irreversible task is never retried automatically', async () => {
  let calls = 0;
  const conductor = setup(
    [
      team('crew', ['send'], [['send', 'work']]),
      worker('send', 'work', {
        capabilities: [{ id: 'work', description: 'send invitations', irreversible: true }],
        failure_modes: [{ trigger: 'cut off', when: 'error', action: 'retry', retries: 3 }],
      }),
    ],
    {
      plugs: {
        send: async () => {
          calls += 1;
          throw new Error('connection reset');
        },
      },
    },
  );
  const mission = await conductor.start('crew', 'go');
  assert.equal(calls, 1);
  assert.equal(mission.nodes['task-1']!.waiting_for, 'fix');
  assert.match(mission.nodes['task-1']!.error!, /irreversible/);
  assert.throws(() => agent(worker('bad', 'work', { capabilities: [{ id: 'work', description: 'w', irreversible: true, autonomous: false }] })), /irreversible/);
});

test('budgets stop work before it starts', async () => {
  const conductor = setup([team('crew', ['a', 'b'], [['a', 'work'], ['b', 'work']]), worker('a', 'work', { constraints: { cost_per_run_usd: 0.8 } }), worker('b', 'work', { constraints: { cost_per_run_usd: 0.8 } })], {
    plugs: echoPlugs(['a', 'b']),
  });
  const mission = await conductor.start('crew', 'go', { budget_usd: 1 });
  assert.equal(mission.status, 'failed');
  assert.equal(mission.cost_usd, 0.8);
  assert.match(mission.nodes['task-2']!.error!, /budget_exceeded/);
});

test('a mission waits on disk: a new conductor, in a new process, picks it up', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentos-'));
  const cards = [team('crew', ['a', 'b'], [['a', 'work'], ['b', 'work']]), worker('a', 'work', { constraints: { requires_human_approval: true } }), worker('b')];
  const registry = () => createRegistry(cards.map((card) => agent(card)));
  const first = new Conductor({ registry: registry(), store: new FileStore(dir), plugs: echoPlugs(['a', 'b']) });
  const started = await first.start('crew', 'go');
  const later = new Conductor({ registry: registry(), store: new FileStore(dir), plugs: echoPlugs(['a', 'b']) });
  const loaded = (await later.get(started.id))!;
  assert.equal(loaded.status, 'needs-human');
  const done = await later.approve(started.id, 'task-1', { output_hash: loaded.nodes['task-1']!.output_hash!, by: 'dana' });
  assert.equal(done.status, 'complete');
  assert.deepEqual((await later.list()).map((mission) => mission.id), [started.id]);
});

test('the registry refuses a team that routes into itself or to a missing card', () => {
  const loop = createRegistry([agent(team('a', ['b'], null)), agent(team('b', ['a'], null))]);
  assert.deepEqual(loop.invalid.map((entry) => entry.id).sort(), ['a', 'b']);
  const missing = createRegistry([agent(team('crew', ['ghost'], [['ghost', 'work']]))]);
  assert.match(missing.invalid[0]!.errors.join(), /unknown card `ghost`/);
});

test('cancel stops everything that has not finished', async () => {
  const conductor = setup([team('crew', ['h', 'a'], [['h', 'work'], ['a', 'work']]), { id: 'h', role: 'p', runtime: 'human', capabilities: [{ id: 'work', description: 'w' }] }, worker('a')], {
    plugs: echoPlugs(['a']),
  });
  const mission = await conductor.start('crew', 'go');
  const cancelled = await conductor.cancel(mission.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(Object.values(cancelled.nodes).every((node) => node.status === 'cancelled'));
});
