// Reads one markdown card into a Card, and checks it.
//
// The format is the v1 agent card: identity fields as bold bullets
// (`- **runtime**: \`model\``), everything else in ```yaml blocks routed by
// their top-level key. A model card's `## Instructions` section is its prompt.
// A card with a mistake is rejected whole, never half-loaded: dropping a rules
// block silently would drop its rules silently.

import { parse as parseYaml } from 'yaml';
import { RUNTIMES } from './types.ts';
import type {
  Capability,
  Card,
  Dependency,
  FailureMode,
  Plug,
  Rule,
  Runtime,
  Selector,
  Step,
  Switch,
} from './types.ts';

const BULLET = /^- \*\*([a-z_]+)\*\*:\s*(.*?)\s*$/;
/** SPEC v0.1 fields this SDK does not run yet. A card using them is refused, never half-run. */
const NOT_YET = ['call', 'runtime', 'max_concurrent', 'run_first'];
const RUNTIMES_NOT_YET = ['mcp', 'a2a', 'queue'];
const IDENTITY_KEYS = ['agent_id', 'name', 'version', 'role', 'runtime'];
const BLOCK_KEYS = [
  'capabilities',
  'rules',
  'constraints',
  'dependencies',
  'failure_modes',
  'switch',
  'plug',
  'routes_to',
  'tools',
  'context_files',
];

export interface ParsedCard {
  card?: Card;
  errors: string[];
}

export interface ParseOptions {
  /** The id the file's location gives the card (file or folder name). */
  id: string;
  /** Teams (a folder's agent.md) are conductors whatever they say. */
  team?: boolean;
  source?: string;
}

export function parseCard(markdown: string, options: ParseOptions): ParsedCard {
  const errors: string[] = [];
  const bullets: Record<string, string> = {};
  const blocks: Record<string, unknown> = {};
  const instructions: string[] = [];

  let fence: string | null = null;
  let yaml: string[] = [];
  let inInstructions = false;

  for (const line of markdown.split('\n')) {
    if (fence !== null) {
      if (line.trim().startsWith('```')) {
        if (fence === 'yaml') readYamlBlock(yaml.join('\n'), blocks, errors);
        else if (inInstructions) instructions.push(line);
        fence = null;
        yaml = [];
      } else if (fence === 'yaml') {
        yaml.push(line);
      } else if (inInstructions) {
        instructions.push(line);
      }
      continue;
    }
    const opening = line.trim().match(/^```(\w*)/);
    if (opening) {
      fence = opening[1] ?? '';
      if (fence !== 'yaml' && inInstructions) instructions.push(line);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      inInstructions = /^##\s+Instructions\s*$/i.test(line.trim());
      continue;
    }
    if (inInstructions) {
      instructions.push(line);
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet && IDENTITY_KEYS.includes(bullet[1]!)) {
      bullets[bullet[1]!] = stripTicks(bullet[2]!);
    }
  }
  if (fence === 'yaml') errors.push('a ```yaml block is never closed');

  const card = buildCard(bullets, blocks, instructions.join('\n').trim(), options, errors);
  return errors.length ? { errors } : { card, errors };
}

function stripTicks(value: string): string {
  return value.replace(/^`(.*)`$/, '$1').trim();
}

function readYamlBlock(text: string, blocks: Record<string, unknown>, errors: string[]): void {
  let value: unknown;
  try {
    value = parseYaml(text);
  } catch (error) {
    errors.push(`a yaml block does not parse: ${(error as Error).message.split('\n')[0]}`);
    return;
  }
  if (!isRecord(value)) {
    errors.push('a yaml block must hold named blocks such as `capabilities:`');
    return;
  }
  for (const [key, block] of Object.entries(value)) {
    if (!BLOCK_KEYS.includes(key)) errors.push(`unknown block \`${key}\``);
    else if (key in blocks) errors.push(`block \`${key}\` appears twice`);
    else blocks[key] = block;
  }
}

function buildCard(
  bullets: Record<string, string>,
  blocks: Record<string, unknown>,
  instructions: string,
  options: ParseOptions,
  errors: string[],
): Card {
  const id = bullets.agent_id ?? options.id;
  if (id !== options.id) {
    errors.push(`agent_id \`${id}\` must match its ${options.team ? 'folder' : 'file'} name \`${options.id}\``);
  }
  const runtime = (bullets.runtime ?? (options.team ? 'conductor' : '')) as Runtime;
  if (!RUNTIMES.includes(runtime)) {
    errors.push(
      !bullets.runtime
        ? 'runtime is required'
        : RUNTIMES_NOT_YET.includes(bullets.runtime)
          ? `runtime \`${bullets.runtime}\` is in the spec but not in this SDK yet (it runs ${RUNTIMES.join(', ')})`
          : `runtime \`${bullets.runtime}\` is not one of ${RUNTIMES.join(', ')}`,
    );
  }
  if (options.team && runtime !== 'conductor') errors.push("a folder's agent.md is a team: runtime must be `conductor`");
  for (const key of ['name', 'role'] as const) {
    if (!bullets[key]) errors.push(`${key} is required`);
  }

  const card: Card = {
    id,
    name: bullets.name ?? id,
    version: bullets.version ?? '0.0.0',
    role: bullets.role ?? '',
    runtime,
    instructions: instructions || undefined,
    capabilities: readCapabilities(blocks.capabilities, errors),
    rules: readRules(blocks.rules, errors),
    constraints: readConstraints(blocks.constraints, errors),
    dependencies: readDependencies(blocks.dependencies, errors),
    failure_modes: readFailureModes(blocks.failure_modes, errors),
    switch: readSwitch(blocks.switch, errors),
    plug: readPlug(blocks.plug, errors),
    routes_to: readStringList(blocks.routes_to, 'routes_to', errors),
    members: [],
    source: options.source,
  };
  validateCard(card, errors);
  return card;
}

/** Checks one card on its own. Cross-card checks live in the registry. */
export function validateCard(card: Card, errors: string[]): void {
  if (card.capabilities.length === 0) errors.push('at least one capability is required');
  const seen = new Set<string>();
  for (const capability of card.capabilities) {
    if (seen.has(capability.id)) errors.push(`capability \`${capability.id}\` appears twice`);
    seen.add(capability.id);
    if (capability.steps && card.runtime !== 'conductor') {
      errors.push(`capability \`${capability.id}\`: only conductor cards have steps`);
    }
    if (capability.steps) validateSteps(capability.id, capability.steps, errors);
    if (capability.signals && card.runtime !== 'conductor') {
      errors.push(`capability \`${capability.id}\`: only conductor cards have signals`);
    }
    if (capability.irreversible && (capability.autonomous === false || card.constraints.requires_human_approval)) {
      errors.push(
        `capability \`${capability.id}\` is irreversible, so an approval would come after the act: approve a plan step before it instead`,
      );
    }
  }
  if (card.runtime === 'model' && !card.plug) errors.push('a model card needs a `plug:` block naming its model');
  if (card.plug && card.runtime !== 'model' && card.runtime !== 'conductor') {
    errors.push(`a ${card.runtime} card cannot have a \`plug:\` block`);
  }
  for (const rule of card.rules) {
    if (card.runtime !== 'conductor' && rule.kind !== 'before' && rule.applies_to?.agent_id && rule.applies_to.agent_id !== card.id) {
      errors.push(`rule \`${rule.id}\`: a worker card's rules apply only to its own work`);
    }
  }
  const ruleIds = new Set<string>();
  for (const rule of card.rules) {
    if (ruleIds.has(rule.id)) errors.push(`rule \`${rule.id}\` appears twice`);
    ruleIds.add(rule.id);
  }
}

/** Steps without depends_on take the step before them, like a pipe. */
export function resolveDependsOn(steps: Step[]): string[][] {
  return steps.map((step, index) => {
    if (step.depends_on) return step.depends_on;
    const previous = steps[index - 1];
    return previous ? [previous.id] : [];
  });
}

export function validateSteps(where: string, steps: Step[], errors: string[]): void {
  if (steps.length === 0) errors.push(`capability \`${where}\`: steps cannot be empty`);
  const ids = steps.map((step) => step.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) errors.push(`capability \`${where}\`: step \`${duplicate}\` appears twice`);
  const deps = resolveDependsOn(steps);
  steps.forEach((step, index) => {
    for (const dep of deps[index] ?? []) {
      if (!ids.includes(dep)) errors.push(`capability \`${where}\`: step \`${step.id}\` depends on unknown step \`${dep}\``);
    }
  });
  if (hasCycle(ids, deps)) errors.push(`capability \`${where}\`: steps depend on each other in a loop`);
}

export function hasCycle(ids: string[], deps: string[][]): boolean {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    const index = ids.indexOf(id);
    for (const dep of deps.at(index) ?? []) {
      if (ids.includes(dep) && visit(dep)) return true;
    }
    state.set(id, 'done');
    return false;
  };
  return ids.some((id) => visit(id));
}

// ---------------------------------------------------------------- blocks

function readCapabilities(value: unknown, errors: string[]): Capability[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push('`capabilities` must be a list');
    return [];
  }
  return value.flatMap((item, index) => {
    const where = `capabilities[${index}]`;
    const keys = ['id', 'description', 'complexity', 'autonomous', 'steps', 'score_scale', 'signals', 'irreversible'];
    if (!expectKeys(item, keys, where, errors)) return [];
    const capability: Capability = {
      id: requireString(item.id, `${where}.id`, errors),
      description: requireString(item.description, `${where}.description`, errors),
    };
    if (item.complexity !== undefined) {
      capability.complexity = oneOf(item.complexity, ['low', 'medium', 'high'] as const, `${where}.complexity`, errors);
    }
    if (item.autonomous !== undefined) capability.autonomous = requireBoolean(item.autonomous, `${where}.autonomous`, errors);
    if (item.score_scale !== undefined) {
      capability.score_scale = oneOf(String(item.score_scale), ['0-100', '1-5', '0-1'] as const, `${where}.score_scale`, errors);
    }
    if (item.steps !== undefined) capability.steps = readSteps(item.steps, `${where}.steps`, errors);
    if (item.signals !== undefined) capability.signals = readStringList(item.signals, `${where}.signals`, errors);
    if (item.irreversible !== undefined) capability.irreversible = requireBoolean(item.irreversible, `${where}.irreversible`, errors);
    return [capability];
  });
}

function readSteps(value: unknown, where: string, errors: string[]): Step[] {
  if (!Array.isArray(value)) {
    errors.push(`\`${where}\` must be a list`);
    return [];
  }
  return value.flatMap((item, index) => {
    const at = `${where}[${index}]`;
    if (!expectKeys(item, ['id', 'assigned_agent', 'capability_match', 'depends_on', 'description'], at, errors)) return [];
    const step: Step = {
      id: requireString(item.id, `${at}.id`, errors),
      assigned_agent: requireString(item.assigned_agent, `${at}.assigned_agent`, errors),
      capability_match: requireString(item.capability_match, `${at}.capability_match`, errors),
    };
    if (item.depends_on !== undefined) step.depends_on = readStringList(item.depends_on, `${at}.depends_on`, errors);
    if (item.description !== undefined) step.description = requireString(item.description, `${at}.description`, errors);
    return [step];
  });
}

function readRules(value: unknown, errors: string[]): Rule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push('`rules` must be a list');
    return [];
  }
  return value.flatMap((item, index): Rule[] => {
    const where = `rules[${index}]`;
    const keys = ['id', 'kind', 'applies_to', 'checker', 'min_score', 'max_revisions', 'first', 'then', 'reason'];
    if (!expectKeys(item, keys, where, errors)) return [];
    const id = requireString(item.id, `${where}.id`, errors);
    const reason = requireString(item.reason, `${where}.reason`, errors);
    const kind = oneOf(item.kind, ['approval', 'check', 'before'] as const, `${where}.kind`, errors);
    const appliesTo = item.applies_to === undefined ? undefined : readSelector(item.applies_to, `${where}.applies_to`, errors);
    const onlyFor = (allowed: string[]) => {
      for (const key of ['applies_to', 'checker', 'min_score', 'max_revisions', 'first', 'then']) {
        if (item[key] !== undefined && !allowed.includes(key)) errors.push(`${where}: \`${key}\` does not belong on a ${kind} rule`);
      }
    };
    if (kind === 'approval') {
      onlyFor(['applies_to']);
      return [{ id, kind, applies_to: appliesTo, reason }];
    }
    if (kind === 'check') {
      onlyFor(['applies_to', 'checker', 'min_score', 'max_revisions']);
      const checker = readSelector(item.checker, `${where}.checker`, errors);
      if (!checker.agent_id || typeof checker.capability !== 'string') {
        errors.push(`${where}.checker needs both \`agent_id\` and one \`capability\``);
      }
      const rule: Rule = {
        id,
        kind,
        applies_to: appliesTo,
        checker: { agent_id: checker.agent_id ?? '', capability: String(checker.capability ?? '') },
        reason,
      };
      if (item.min_score !== undefined) rule.min_score = requireNumber(item.min_score, `${where}.min_score`, errors);
      if (item.max_revisions !== undefined) rule.max_revisions = requireNumber(item.max_revisions, `${where}.max_revisions`, errors);
      return [rule];
    }
    if (kind === 'before') {
      onlyFor(['first', 'then']);
      const first = readSelector(item.first, `${where}.first`, errors);
      const then = item.then === undefined ? undefined : readSelector(item.then, `${where}.then`, errors);
      return [{ id, kind, first, then, reason }];
    }
    return [];
  });
}

function readSelector(value: unknown, where: string, errors: string[]): Selector {
  if (!expectKeys(value, ['agent_id', 'capability'], where, errors)) return {};
  const selector: Selector = {};
  if (value.agent_id !== undefined) selector.agent_id = requireString(value.agent_id, `${where}.agent_id`, errors);
  if (value.capability !== undefined) {
    selector.capability = Array.isArray(value.capability)
      ? readStringList(value.capability, `${where}.capability`, errors)
      : requireString(value.capability, `${where}.capability`, errors);
  }
  if (!selector.agent_id && !selector.capability) errors.push(`${where} must name an \`agent_id\`, a \`capability\`, or both`);
  return selector;
}

function readConstraints(value: unknown, errors: string[]): Card['constraints'] {
  if (value === undefined) return {};
  if (!expectKeys(value, ['max_runtime_minutes', 'requires_human_approval', 'cost_per_run_usd'], 'constraints', errors)) return {};
  const constraints: Card['constraints'] = {};
  if (value.max_runtime_minutes !== undefined) {
    constraints.max_runtime_minutes = requireNumber(value.max_runtime_minutes, 'constraints.max_runtime_minutes', errors);
  }
  if (value.requires_human_approval !== undefined) {
    constraints.requires_human_approval = requireBoolean(value.requires_human_approval, 'constraints.requires_human_approval', errors);
  }
  if (value.cost_per_run_usd !== undefined) {
    constraints.cost_per_run_usd = requireNumber(value.cost_per_run_usd, 'constraints.cost_per_run_usd', errors);
  }
  return constraints;
}

function readDependencies(value: unknown, errors: string[]): Card['dependencies'] {
  const empty = { required: [], optional: [] };
  if (value === undefined) return empty;
  if (!expectKeys(value, ['required', 'optional'], 'dependencies', errors)) return empty;
  const list = (items: unknown, where: string): Dependency[] => {
    if (items === undefined) return [];
    if (!Array.isArray(items)) {
      errors.push(`\`${where}\` must be a list`);
      return [];
    }
    return items.flatMap((item, index) => {
      if (!expectKeys(item, ['agent_id', 'reason'], `${where}[${index}]`, errors)) return [];
      return [{ agent_id: requireString(item.agent_id, `${where}[${index}].agent_id`, errors), reason: optionalString(item.reason) }];
    });
  };
  return { required: list(value.required, 'dependencies.required'), optional: list(value.optional, 'dependencies.optional') };
}

function readFailureModes(value: unknown, errors: string[]): FailureMode[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push('`failure_modes` must be a list');
    return [];
  }
  return value.flatMap((item, index) => {
    const where = `failure_modes[${index}]`;
    const keys = ['trigger', 'symptom', 'conductor_action', 'when', 'match', 'action', 'retries', 'delay_seconds'];
    if (!expectKeys(item, keys, where, errors)) return [];
    const mode: FailureMode = { trigger: requireString(item.trigger, `${where}.trigger`, errors) };
    if (item.symptom !== undefined) mode.symptom = optionalString(item.symptom);
    if (item.conductor_action !== undefined) mode.conductor_action = optionalString(item.conductor_action);
    if (item.when !== undefined) mode.when = oneOf(item.when, ['error', 'timeout', 'refusal', 'rejected'] as const, `${where}.when`, errors);
    if (item.match !== undefined) mode.match = readStringList(item.match, `${where}.match`, errors);
    if (item.action === 'run_first') errors.push(`\`${where}.action\`: \`run_first\` is in the spec but not in this SDK yet`);
    else if (item.action !== undefined) mode.action = oneOf(item.action, ['retry', 'revise', 'needs-human', 'fail'] as const, `${where}.action`, errors);
    if (item.retries !== undefined) mode.retries = requireNumber(item.retries, `${where}.retries`, errors);
    if (item.delay_seconds !== undefined) mode.delay_seconds = requireNumber(item.delay_seconds, `${where}.delay_seconds`, errors);
    return [mode];
  });
}

function readSwitch(value: unknown, errors: string[]): Switch | undefined {
  if (value === undefined) return undefined;
  if (!expectKeys(value, ['enabled', 'used_by', 'max_runs_per_month', 'max_usd_per_month'], 'switch', errors)) return undefined;
  const result: Switch = {};
  if (value.enabled !== undefined) result.enabled = requireBoolean(value.enabled, 'switch.enabled', errors);
  if (value.used_by !== undefined) result.used_by = readStringList(value.used_by, 'switch.used_by', errors);
  if (value.max_runs_per_month !== undefined) {
    result.max_runs_per_month = requireNumber(value.max_runs_per_month, 'switch.max_runs_per_month', errors);
  }
  if (value.max_usd_per_month !== undefined) {
    result.max_usd_per_month = requireNumber(value.max_usd_per_month, 'switch.max_usd_per_month', errors);
  }
  return result;
}

function readPlug(value: unknown, errors: string[]): Plug | undefined {
  if (value === undefined) return undefined;
  if (!expectKeys(value, ['model', 'fallback', 'effort', 'max_tokens'], 'plug', errors)) return undefined;
  const plug: Plug = { model: requireString(value.model, 'plug.model', errors) };
  if (value.fallback !== undefined) plug.fallback = readStringList(value.fallback, 'plug.fallback', errors);
  if (value.effort !== undefined) {
    plug.effort = oneOf(value.effort, ['low', 'medium', 'high', 'xhigh', 'max'] as const, 'plug.effort', errors);
  }
  if (value.max_tokens !== undefined) plug.max_tokens = requireNumber(value.max_tokens, 'plug.max_tokens', errors);
  return plug;
}

// ---------------------------------------------------------------- helpers

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectKeys(value: unknown, allowed: string[], where: string, errors: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(`\`${where}\` must be a set of named fields`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    errors.push(NOT_YET.includes(key) ? `\`${where}\`: \`${key}\` is in the spec but not in this SDK yet` : `\`${where}\`: unknown field \`${key}\``);
  }
  return true;
}

function requireString(value: unknown, where: string, errors: string[]): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  errors.push(`\`${where}\` must be text`);
  return '';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : value === undefined ? undefined : String(value);
}

function requireNumber(value: unknown, where: string, errors: string[]): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  errors.push(`\`${where}\` must be a number of 0 or more`);
  return 0;
}

function requireBoolean(value: unknown, where: string, errors: string[]): boolean {
  if (typeof value === 'boolean') return value;
  errors.push(`\`${where}\` must be true or false`);
  return false;
}

function readStringList(value: unknown, where: string, errors: string[]): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  errors.push(`\`${where}\` must be a list of names`);
  return [];
}

function oneOf<T extends string>(value: unknown, options: readonly T[], where: string, errors: string[]): T {
  if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T;
  errors.push(`\`${where}\` must be one of ${options.join(', ')}`);
  return options[0]!;
}
