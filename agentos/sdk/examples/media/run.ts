// The show team, end to end, in one process: start an episode, stop where
// the host must sign off the script, sign it off, and finish.
//
//   node examples/media/run.ts             offline unless ANTHROPIC_API_KEY is set
//   AGENTOS_OFFLINE=1 node examples/media/run.ts

import { fileURLToPath } from 'node:url';
import { AnthropicModels, Conductor, formatMission, formatUsage, loadAgents, MemoryStore, ModelPlanner } from '../../src/index.ts';
import { models as offlineModels, plugs } from './setup.ts';

const registry = await loadAgents(fileURLToPath(new URL('./agents', import.meta.url)));
const models = offlineModels ?? new AnthropicModels();
const conductor = new Conductor({ registry, store: new MemoryStore(), plugs, models, planner: new ModelPlanner({ models }) });

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
