// Loads a folder of cards. A folder with an agent.md is a team (a conductor);
// every other .md file is a worker; a team's members are the cards directly
// inside its folder. Folders without an agent.md just group cards (a pack).

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { hasCycle, parseCard, validateCard } from './card.ts';
import type { Card, Runtime } from './types.ts';

export interface CardError {
  id: string;
  source?: string;
  errors: string[];
}

export interface Registry {
  /** Valid cards only. An invalid card cannot be routed to. */
  cards: Map<string, Card>;
  /** Cards that failed to load, with why. */
  invalid: CardError[];
  get(id: string): Card | undefined;
}

export async function loadAgents(dir: string): Promise<Registry> {
  const cards: Card[] = [];
  const invalid: CardError[] = [];
  await walk(dir, null, cards, invalid, true);
  return createRegistry(cards, invalid);
}

async function walk(dir: string, team: Card | null, cards: Card[], invalid: CardError[], root: boolean): Promise<void> {
  const entries = (await readdir(dir)).sort();
  let current = team;
  if (!root && entries.includes('agent.md')) {
    const loaded = await loadFile(join(dir, 'agent.md'), basename(dir), true, invalid);
    if (team) team.members.push(basename(dir));
    if (loaded) cards.push(loaded);
    current = loaded ?? null;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) {
      await walk(path, current, cards, invalid, false);
    } else if (entry.endsWith('.md') && entry !== 'agent.md' && entry.toLowerCase() !== 'readme.md') {
      const id = entry.slice(0, -3);
      const loaded = await loadFile(path, id, false, invalid);
      if (current) current.members.push(id);
      if (loaded) cards.push(loaded);
    }
  }
}

async function loadFile(path: string, id: string, team: boolean, invalid: CardError[]): Promise<Card | undefined> {
  const { card, errors } = parseCard(await readFile(path, 'utf8'), { id, team, source: path });
  if (!card) invalid.push({ id, source: path, errors });
  return card;
}

/**
 * Builds a registry and runs the checks that need more than one card: steps and
 * rules must name cards and capabilities that exist, and teams must not route
 * into themselves. A card that fails is moved to `invalid`, and so is any team
 * that relies on it.
 */
export function createRegistry(cards: Card[], invalid: CardError[] = []): Registry {
  const byId = new Map<string, Card>();
  for (const card of cards) {
    if (byId.has(card.id)) {
      invalid.push({ id: card.id, source: card.source, errors: [`another card already has the id \`${card.id}\``] });
      byId.delete(card.id);
      continue;
    }
    byId.set(card.id, card);
  }
  // Every team in a loop is refused, found before any card is removed.
  const looping = [...byId.values()].filter((card) => card.runtime === 'conductor' && routesIntoItself(card, byId));
  for (const card of looping) {
    invalid.push({ id: card.id, source: card.source, errors: ['this team can reach itself through its members or routes_to'] });
    byId.delete(card.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const card of [...byId.values()]) {
      const errors = crossCheck(card, byId, invalid);
      if (errors.length) {
        invalid.push({ id: card.id, source: card.source, errors });
        byId.delete(card.id);
        changed = true;
      }
    }
  }
  return { cards: byId, invalid, get: (id) => byId.get(id) };
}

/** Which cards a team may hand work to: its folder plus `routes_to`. */
export function allowedFor(team: Card): string[] {
  return [...new Set([...team.members, ...team.routes_to])];
}

function crossCheck(card: Card, cards: Map<string, Card>, invalid: CardError[]): string[] {
  const errors: string[] = [];
  const known = (id: string) => cards.has(id) || invalid.some((entry) => entry.id === id);
  const usable = (id: string, where: string): Card | undefined => {
    const target = cards.get(id);
    if (!target) errors.push(known(id) ? `${where} uses \`${id}\`, which is invalid` : `${where} uses unknown card \`${id}\``);
    return target;
  };
  for (const id of card.routes_to) usable(id, 'routes_to');
  const allowed = allowedFor(card);
  for (const capability of card.capabilities) {
    for (const step of capability.steps ?? []) {
      const where = `capability \`${capability.id}\`, step \`${step.id}\``;
      if (!allowed.includes(step.assigned_agent)) {
        errors.push(`${where}: \`${step.assigned_agent}\` is not in this team's folder or routes_to`);
        continue;
      }
      const target = usable(step.assigned_agent, where);
      if (target && !target.capabilities.some((c) => c.id === step.capability_match)) {
        errors.push(`${where}: \`${step.assigned_agent}\` has no capability \`${step.capability_match}\``);
      }
    }
  }
  for (const rule of card.rules) {
    if (rule.kind !== 'check') continue;
    const checker = usable(rule.checker.agent_id, `rule \`${rule.id}\``);
    if (checker && !checker.capabilities.some((c) => c.id === rule.checker.capability)) {
      errors.push(`rule \`${rule.id}\`: checker \`${checker.id}\` has no capability \`${rule.checker.capability}\``);
    }
    if (checker && checker.runtime !== 'model' && checker.runtime !== 'function') {
      errors.push(`rule \`${rule.id}\`: a checker must be a model or function card`);
    }
  }
  return errors;
}

function routesIntoItself(start: Card, cards: Map<string, Card>): boolean {
  const conductors = [...cards.values()].filter((card) => card.runtime === 'conductor');
  const ids = conductors.map((card) => card.id);
  const deps = conductors.map((card) => allowedFor(card).filter((id) => ids.includes(id)));
  if (!hasCycle(ids, deps)) return false;
  const seen = new Set<string>();
  const stack = allowedFor(start);
  while (stack.length) {
    const id = stack.pop()!;
    if (id === start.id) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const card = cards.get(id);
    if (card?.runtime === 'conductor') stack.push(...allowedFor(card));
  }
  return false;
}

/** The fields a card written in code can set; the rest get defaults. */
export interface AgentDefinition {
  id: string;
  name?: string;
  version?: string;
  role: string;
  runtime: Runtime;
  instructions?: string;
  capabilities: Card['capabilities'];
  rules?: Card['rules'];
  constraints?: Card['constraints'];
  dependencies?: Partial<Card['dependencies']>;
  failure_modes?: Card['failure_modes'];
  switch?: Card['switch'];
  plug?: Card['plug'];
  routes_to?: string[];
  members?: string[];
}

/** Defines a card in code instead of markdown. Throws if the card is invalid. */
export function agent(definition: AgentDefinition): Card {
  const card: Card = {
    id: definition.id,
    name: definition.name ?? definition.id,
    version: definition.version ?? '0.0.0',
    role: definition.role,
    runtime: definition.runtime,
    instructions: definition.instructions,
    capabilities: definition.capabilities,
    rules: definition.rules ?? [],
    constraints: definition.constraints ?? {},
    dependencies: { required: definition.dependencies?.required ?? [], optional: definition.dependencies?.optional ?? [] },
    failure_modes: definition.failure_modes ?? [],
    switch: definition.switch,
    plug: definition.plug,
    routes_to: definition.routes_to ?? [],
    members: definition.members ?? [],
    source: 'code',
  };
  const errors: string[] = [];
  validateCard(card, errors);
  if (errors.length) throw new Error(`card \`${card.id}\` is invalid:\n- ${errors.join('\n- ')}`);
  return card;
}
