// The smallest useful team: a recipe, two model cards, and a host's sign-off.
//
//   node examples/hello/run.ts      offline (canned answers) unless ANTHROPIC_API_KEY is set

import { fileURLToPath } from 'node:url';
import { Conductor, loadAgents } from '../../src/index.ts';
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
const conductor = new Conductor({ registry, models, gates });

console.log(offline ? 'Offline: model cards answer from canned text.\n' : 'Running on Claude.\n');
let mission = await conductor.start('episode', 'Episode 12: mixing vocals on cheap headphones', { user: { id: 'maya' } });
console.log(formatMission(mission));

const waiting = mission.nodes['task-2']!;
console.log(`\nThe host reads the script and approves ${waiting.output_hash}.\n`);
mission = await conductor.approve(mission.id, 'task-2', { output_hash: waiting.output_hash!, by: 'maya' });
console.log(formatMission(mission));
