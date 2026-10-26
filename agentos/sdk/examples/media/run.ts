// The show team, end to end, in one process: start an episode, stop where
// the host must sign off the script, sign it off, and finish.
//
//   node examples/media/run.ts             offline unless ANTHROPIC_API_KEY is set
//   AGENTOS_OFFLINE=1 node examples/media/run.ts
//
// The mission is saved to .agentos/missions, so every draft and every
// checker's note can be read afterwards. Exit code: 0 done, 1 failed,
// 3 stopped and waiting for a person.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicModels, Conductor, FileStore, formatMission, formatUsage, loadAgents, ModelPlanner } from '../../src/index.ts';
import { models as offlineModels, plugs } from './setup.ts';

const registry = await loadAgents(fileURLToPath(new URL('./agents', import.meta.url)));
const models = offlineModels ?? new AnthropicModels();
const storeDir = resolve('.agentos/missions');
const conductor = new Conductor({ registry, store: new FileStore(storeDir), plugs, models, planner: new ModelPlanner({ models }) });

console.log(offlineModels ? 'Running offline: model cards answer from canned text.\n' : 'Running on Claude.\n');

let mission = await conductor.start('show', 'Episode 12 of Small Rooms: how bedroom producers can mix vocals on cheap headphones.', {
  user: { id: 'sam', groups: ['producers'] },
  budget_usd: 5,
});
console.log(formatMission(mission));

const waiting = Object.values(mission.nodes).find((node) => node.status === 'needs-human' && node.waiting_for === 'approval');
if (waiting) {
  const draft = mission.nodes[waiting.children.at(-1) ?? waiting.id]!;
  console.log(`\n----- the script (${draft.id}) -----\n${draft.output ?? ''}\n-----`);
  console.log(`\nThe host reads ${waiting.id} and approves ${waiting.output_hash}.\n`);
  mission = await conductor.approve(mission.id, waiting.id, { output_hash: waiting.output_hash!, by: 'sam', note: 'Recording Thursday.' });
  console.log(formatMission(mission));
}

if (mission.status === 'complete') {
  const release = Object.values(mission.nodes).find((node) => node.agent === 'publisher');
  console.log(`\n${release?.output ?? ''}`);
}

// The switchboard's record: every call, who asked, which model, what it cost.
console.log(`\n${formatUsage(await conductor.usage(), registry)}`);

console.log(`\nSaved: ${resolve(storeDir, `${mission.id}.json`)}`);
console.log(`Any task's full output: node src/cli.ts output ${mission.id} <task> --dir examples/media/agents`);
if (mission.status === 'needs-human') {
  console.log('\nStopped: waiting for a person. The tree above says who and why.');
  process.exitCode = 3;
} else if (mission.status === 'failed') {
  process.exitCode = 1;
}
