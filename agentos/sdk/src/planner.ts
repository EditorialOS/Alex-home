// The planner: for a team capability with no recipe, a model reads the request
// and the team's members and writes the steps. The conductor checks the plan
// against the same rules as a recipe, and asks once more if it breaks them.

import type { Card, ModelProvider, Plug, PlanRequest, PlanResult, Planner, RouteRequest, RouteResult, Step } from './types.ts';

export interface ModelPlannerOptions {
  models: ModelProvider;
  /** Used when a team's card has no `plug:` block of its own. */
  plug?: Plug;
}

const DEFAULT_PLUG: Plug = { model: 'claude-opus-5-5' };

export class ModelPlanner implements Planner {
  private readonly models: ModelProvider;
  private readonly plug: Plug;

  constructor(options: ModelPlannerOptions) {
    this.models = options.models;
    this.plug = options.plug ?? DEFAULT_PLUG;
  }

  async plan(request: PlanRequest): Promise<PlanResult> {
    const plug = request.team.plug ?? this.plug;
    const response = await this.models.complete({
      model: plug.model,
      system: planSystem(request.team),
      prompt: planPrompt(request),
      effort: plug.effort ?? 'high',
      schema: planSchema(request.allowed),
      max_tokens: plug.max_tokens,
    });
    return { steps: parseSteps(response.text), cost_usd: response.cost_usd, model: response.model };
  }

  /** Picks the capability that fits a request, or none. Routing is cheap: effort low. */
  async route({ mission, team, note }: RouteRequest): Promise<RouteResult> {
    const plug = team.plug ?? this.plug;
    const ids = team.capabilities.map((c) => c.id);
    const lines = ['## Request', mission.request, '', '## Capabilities', ...team.capabilities.map((c) => `- ${c.id}: ${c.description}`)];
    if (note) lines.push('', '## A note from a person', note);
    lines.push('', 'Reply with JSON: {"capability": "<one id above, or none>", "reason": "<one sentence>"}.');
    const response = await this.models.complete({
      model: plug.model,
      system: `You route requests for ${team.name}: ${team.role}\n\nPick the one capability that fits the request. Answer none when no capability fits; never stretch one to fit.`,
      prompt: lines.join('\n'),
      effort: 'low',
      schema: {
        type: 'object',
        properties: { capability: { type: 'string', enum: [...ids, 'none'] }, reason: { type: 'string' } },
        required: ['capability', 'reason'],
        additionalProperties: false,
      },
      max_tokens: plug.max_tokens,
    });
    const value = parseJson(response.text, 'the router') as { capability?: unknown; reason?: unknown };
    const capability = typeof value.capability === 'string' && ids.includes(value.capability) ? value.capability : null;
    const reason = typeof value.reason === 'string' ? value.reason : undefined;
    return { capability, reason, cost_usd: response.cost_usd, model: response.model };
  }
}

function planSystem(team: Card): string {
  return [
    `You are the conductor of ${team.name}: ${team.role}`,
    'You plan the work and hand it out; you never do the work yourself.',
    'Give each step to one member that has the capability it needs. A step gets the outputs of the steps in its depends_on, so list every step whose output it needs; leave depends_on empty for steps that can start at once.',
    'Use as few steps as the request needs.',
    team.instructions,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function planPrompt({ mission, node, capability, allowed, violations }: PlanRequest): string {
  const lines = [`## What to plan`, `${capability.id}: ${capability.description}`, node.description === mission.request ? '' : `Task: ${node.description}`];
  lines.push('## Request', mission.request);
  const inputs = Object.entries(mission.inputs);
  if (inputs.length) lines.push(`Inputs: ${inputs.map(([key, value]) => `${key} = ${value}`).join(' · ')}`);
  lines.push('', '## Members');
  for (const card of allowed) {
    lines.push(`- ${card.id} (${card.runtime}): ${card.role}`);
    for (const c of card.capabilities) lines.push(`  - ${c.id}: ${c.description}`);
  }
  if (violations.length) {
    lines.push('', '## Your last plan was rejected', ...violations.map((violation) => `- ${violation}`), 'Write a plan that fixes these.');
  }
  lines.push('', 'Reply with JSON: {"steps": [{"id", "assigned_agent", "capability_match", "depends_on", "description"}]}.');
  return lines.filter((line) => line !== '').join('\n');
}

function planSchema(allowed: Card[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            assigned_agent: { type: 'string', enum: allowed.map((card) => card.id) },
            capability_match: { type: 'string' },
            depends_on: { type: 'array', items: { type: 'string' } },
            description: { type: 'string' },
          },
          required: ['id', 'assigned_agent', 'capability_match', 'depends_on', 'description'],
          additionalProperties: false,
        },
      },
    },
    required: ['steps'],
    additionalProperties: false,
  };
}

function parseJson(text: string, who: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error(`${who} did not reply with JSON`);
  }
}

function parseSteps(text: string): Step[] {
  const steps = (parseJson(text, 'the planner') as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) throw new Error('the planner gave no steps');
  return steps.map((raw, index) => {
    const step = raw as Partial<Record<keyof Step, unknown>>;
    const text = (key: keyof Step) => (typeof step[key] === 'string' ? (step[key] as string) : '');
    return {
      id: text('id') || `step-${index + 1}`,
      assigned_agent: text('assigned_agent'),
      capability_match: text('capability_match'),
      depends_on: Array.isArray(step.depends_on) ? step.depends_on.filter((dep): dep is string => typeof dep === 'string') : [],
      description: text('description') || undefined,
    };
  });
}
