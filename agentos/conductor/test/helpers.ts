import { agent, Conductor, createRegistry } from '../src/index.ts';
import { scriptedModels } from '../addons/models.ts';
import type { AgentDefinition, ConductorOptions, FunctionPlug, ModelRequest } from '../src/index.ts';

/** A function card that does one thing. */
export function worker(id: string, capability = 'work', extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return { id, role: `${id} worker`, runtime: 'function', capabilities: [{ id: capability, description: `${id} output` }], ...extra };
}

/** A team with a recipe: each [agent, capability] step pipes into the next. */
export function team(id: string, members: string[], steps: [string, string][] | null, extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id,
    role: `${id} team`,
    runtime: 'conductor',
    members,
    capabilities: [
      {
        id: 'run',
        description: `${id} result`,
        ...(steps ? { steps: steps.map(([assigned_agent, capability_match], index) => ({ id: `s${index + 1}`, assigned_agent, capability_match })) } : {}),
      },
    ],
    ...extra,
  };
}

export function setup(definitions: AgentDefinition[], options: Partial<ConductorOptions> = {}) {
  const registry = createRegistry(definitions.map((definition) => agent(definition)));
  if (registry.invalid.length) throw new Error(JSON.stringify(registry.invalid, null, 2));
  return new Conductor({ registry, ...options });
}

/** Plugs that echo their agent id, and record every task message they get. */
export function echoPlugs(ids: string[], messages: Record<string, string[]> = {}): Record<string, FunctionPlug> {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      async (task) => {
        (messages[id] ??= []).push(task.message);
        return `${id} done`;
      },
    ]),
  );
}

export function verdicts(...replies: object[]) {
  const queue = [...replies];
  return scriptedModels((request: ModelRequest) => {
    if (request.schema) return JSON.stringify(queue.shift() ?? { verdict: 'pass', score: 100, notes: 'ok' });
    return `model output for ${request.model}`;
  });
}
