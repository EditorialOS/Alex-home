// The smallest useful team: a recipe, two model cards, and a host's sign-off.
//
//   node examples/hello/run.ts      offline (canned answers) unless ANTHROPIC_API_KEY is set
//
// The mission is saved to .agentos/missions. Exit code: 0 done, 1 failed,
// 3 stopped and waiting for a person.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Conductor, FileStore, loadAgents } from '../../src/index.ts';
import { AnthropicModels } from '../../addons/claude.ts';
import { formatMission } from '../../addons/format.ts';
import { scriptedModels } from '../../addons/models.ts';
import { switchGate } from '../../addons/switch.ts';

const gates = [switchGate()];
const registry = await loadAgents(fileURLToPath(new URL('./agents', import.meta.url)), { gates });
const offline = !process.env.ANTHROPIC_API_KEY;
const models = offline
  ? scriptedModels((request) =>
      request.system.startsWith('Finds what')
        ? '[offline] 1. Cheap earbuds roll off below about 80 Hz (manufacturer specs).'
        : '[offline] You are wearing the headphones that came free with your phone. Good.',
    )
  : new AnthropicModels();
const storeDir = resolve('.agentos/missions');
const conductor = new Conductor({ registry, store: new FileStore(storeDir), models, gates });

console.log(offline ? 'Offline: model cards answer from canned text.\n' : 'Running on Claude.\n');
let mission = await conductor.start('episode', 'Episode 12: mixing vocals on cheap headphones', { user: { id: 'maya' } });
console.log(formatMission(mission));

const waiting = Object.values(mission.nodes).find((node) => node.status === 'needs-human' && node.waiting_for === 'approval');
if (waiting) {
  console.log(`\n----- the script (${waiting.id}) -----\n${waiting.output ?? ''}\n-----`);
  console.log(`\nThe host reads the script and approves ${waiting.output_hash}.\n`);
  mission = await conductor.approve(mission.id, waiting.id, { output_hash: waiting.output_hash!, by: 'maya' });
  console.log(formatMission(mission));
}

console.log(`\nSaved: ${resolve(storeDir, `${mission.id}.json`)}`);
console.log(`Any task's full output: node addons/cli.ts output ${mission.id} <task> --dir examples/hello/agents`);
if (mission.status === 'needs-human') {
  console.log('\nStopped: waiting for a person. The tree above says who and why.');
  process.exitCode = 3;
} else if (mission.status === 'failed') {
  process.exitCode = 1;
}
