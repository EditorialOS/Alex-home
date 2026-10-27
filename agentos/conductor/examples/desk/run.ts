// Routing, tracking and costing, in one run: six different requests to one
// front desk with four different agents. The desk's model decides who does
// each one; the record says who did, on which model, what it cost and how
// long it took.
//
//   node examples/desk/run.ts      offline (canned answers) unless ANTHROPIC_API_KEY is set
//
// Missions are saved to .agentos/missions. Exit code: 0 all done, 1 one
// failed, 3 one is waiting for a person.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Conductor, FileStore, loadAgents } from '../../src/index.ts';
import type { Mission, ModelRequest } from '../../src/index.ts';
import { AnthropicModels } from '../../addons/claude.ts';
import { scriptedModels } from '../../addons/models.ts';
import { ModelPlanner } from '../../addons/planner.ts';
import { formatUsage, usageReport } from '../../addons/usage.ts';

/** Each request, and the agent/capability a person would expect it to reach. */
const REQUESTS: [string, string[]][] = [
  ['Find what recent research says about four-day work weeks, with sources.', ['researcher/research']],
  ['Write a 150-word launch announcement for a bike-repair booking app.', ['writer/article']],
  ['Give me five headline options for a post about recording vocals in a small room.', ['writer/headlines']],
  ["Brief a designer on a cover image for a gardening newsletter's spring issue.", ['designer/brief']],
  ['Monthly signups were Jan 120, Feb 135, Mar 160, Apr 150. What is the trend?', ['analyst/analyze']],
  ['Research the best time of day to post on LinkedIn, then write a short post sharing what you found.', ['researcher/research', 'writer/article']],
];

const offline = !process.env.ANTHROPIC_API_KEY;
const models = offline ? cannedModels() : new AnthropicModels();
const registry = await loadAgents(fileURLToPath(new URL('./agents', import.meta.url)));
const storeDir = resolve('.agentos/missions');
const conductor = new Conductor({ registry, store: new FileStore(storeDir), models, planner: new ModelPlanner({ models }) });

console.log(offline ? 'Offline: the desk and its agents answer from canned text.\n' : 'Running on Claude.\n');
const started = Date.now();
// Six separate missions, all at once.
const missions = await Promise.all(REQUESTS.map(([request]) => conductor.start('desk', request, { user: { id: 'sam' } })));

let asExpected = 0;
REQUESTS.forEach(([request, expected], index) => {
  const mission = missions[index]!;
  const route = workDone(mission);
  const matched = route.map((step) => step.who).join(',') === expected.join(',');
  if (matched) asExpected += 1;
  const seconds = (Date.parse(mission.updated_at) - Date.parse(mission.created_at)) / 1000;
  console.log(`${matched ? '✓' : '✗'} ${request}`);
  for (const step of route) console.log(`    ${step.who} on ${step.model}`);
  if (!matched) console.log(`    expected: ${expected.join(', ')}`);
  console.log(`    ${mission.status} · $${mission.cost_usd.toFixed(4)} (routing included) · ${seconds.toFixed(1)}s\n`);
});

console.log(`${asExpected} of ${REQUESTS.length} requests went where a person would send them. All six took ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
console.log(formatUsage(usageReport(missions, new Date(started), new Date(Date.now() + 1000)), registry));
console.log(`\nSaved in ${storeDir}. Any task's full output: node addons/cli.ts output <mission> <task> --dir examples/desk/agents`);

if (missions.some((mission) => mission.status === 'failed')) process.exitCode = 1;
else if (missions.some((mission) => mission.status === 'needs-human')) process.exitCode = 3;

/** The work a mission did: each task a worker ran, in order, with its model. */
function workDone(mission: Mission): { who: string; model: string }[] {
  return Object.values(mission.nodes)
    .filter((node) => node.id !== 'root' && node.children.length === 0)
    .map((node) => ({ who: `${node.agent}/${node.capability}`, model: node.runs.filter((run) => run.agent === node.agent).at(-1)?.model ?? '-' }));
}

/** Offline stand-ins: the desk routes by keyword, and every agent answers in one line. */
function cannedModels() {
  return scriptedModels((request: ModelRequest) => {
    if ((request.schema?.properties as Record<string, unknown> | undefined)?.steps) {
      const asked = request.prompt.split('## Request\n')[1]?.split('\n')[0] ?? '';
      const step = (id: string, agent: string, capability: string, dependsOn: string[] = []) => ({ id, assigned_agent: agent, capability_match: capability, depends_on: dependsOn, description: asked });
      const steps = /then write/i.test(asked)
        ? [step('find', 'researcher', 'research'), step('write', 'writer', 'article', ['find'])]
        : /headline/i.test(asked)
          ? [step('one', 'writer', 'headlines')]
          : /brief a designer|image/i.test(asked)
            ? [step('one', 'designer', 'brief')]
            : /trend|signups|numbers/i.test(asked)
              ? [step('one', 'analyst', 'analyze')]
              : /research|find/i.test(asked)
                ? [step('one', 'researcher', 'research')]
                : [step('one', 'writer', 'article')];
      return JSON.stringify({ steps });
    }
    return `[offline] ${request.system.split('\n')[0]}`;
  });
}
