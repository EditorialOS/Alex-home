// Which rules apply where. Rules on a conductor card apply to its whole subtree
// (its own node included); rules on a worker card apply to its own nodes. The
// v1 fields become rules too: `autonomous: false` and `requires_human_approval`
// are approvals, `dependencies.required` is a `before`. Children can add rules,
// never remove them.

import type { Card, Mission, MissionNode, Rule, Selector } from './types.ts';
import type { Registry } from './registry.ts';

export interface ScopedRule {
  /** `<card id>/<rule id>`: unique across the mission. */
  fullId: string;
  owner: string;
  rule: Rule;
}

/** The rules a card's v1 fields stand for. */
export function compiledRules(card: Card): Rule[] {
  const rules: Rule[] = [];
  for (const capability of card.capabilities) {
    if (capability.autonomous === false) {
      rules.push({
        id: `autonomous-${capability.id}`,
        kind: 'approval',
        applies_to: { agent_id: card.id, capability: capability.id },
        reason: `\`${capability.id}\` is not autonomous: a person approves its output.`,
      });
    }
  }
  if (card.constraints.requires_human_approval) {
    rules.push({
      id: 'requires-human-approval',
      kind: 'approval',
      applies_to: { agent_id: card.id },
      reason: `Everything \`${card.id}\` produces is approved by a person.`,
    });
  }
  for (const dep of card.dependencies.required) {
    rules.push({
      id: `required-${dep.agent_id}`,
      kind: 'before',
      first: { agent_id: dep.agent_id },
      then: { agent_id: card.id },
      reason: dep.reason ?? `\`${card.id}\` needs \`${dep.agent_id}\` first.`,
    });
  }
  return rules;
}

export function rulesOf(card: Card): ScopedRule[] {
  return [...card.rules, ...compiledRules(card)].map((rule) => ({ fullId: `${card.id}/${rule.id}`, owner: card.id, rule }));
}

/** Rules from every card on the path from the root down to `cards.at(-1)`. */
export function rulesOnPath(cards: Card[]): ScopedRule[] {
  const seen = new Map<string, ScopedRule>();
  for (const card of cards) for (const scoped of rulesOf(card)) seen.set(scoped.fullId, scoped);
  return [...seen.values()];
}

export function pathCards(mission: Mission, node: MissionNode, registry: Registry): Card[] {
  const chain: Card[] = [];
  for (let current: MissionNode | undefined = node; current; current = current.parent ? mission.nodes[current.parent] : undefined) {
    const card = registry.get(current.agent);
    if (card) chain.unshift(card);
  }
  return chain;
}

export function matches(selector: Selector | undefined, agent: string, capability: string, owner: string): boolean {
  if (!selector) return agent === owner;
  if (selector.agent_id && selector.agent_id !== agent) return false;
  if (selector.capability) {
    const capabilities = Array.isArray(selector.capability) ? selector.capability : [selector.capability];
    if (!capabilities.includes(capability)) return false;
  }
  return true;
}

/** Does `scoped` govern work by `agent`/`capability`? */
export function applies(scoped: ScopedRule, agent: string, capability: string): boolean {
  const { rule, owner } = scoped;
  if (rule.kind === 'before') return matches(rule.then, agent, capability, owner);
  return matches(rule.applies_to, agent, capability, owner);
}

export function effectiveRules(mission: Mission, node: MissionNode, registry: Registry): ScopedRule[] {
  return rulesOnPath(pathCards(mission, node, registry)).filter((scoped) => applies(scoped, node.agent, node.capability));
}

/** Turns a checker's score into 0–100. */
export function normalizeScore(score: number, scale: '0-100' | '1-5' | '0-1' = '0-100'): number {
  if (scale === '1-5') return (score - 1) * 25;
  if (scale === '0-1') return score * 100;
  return score;
}

/**
 * Could running `card`/`capability` produce work that `selector` matches? A
 * team with a recipe is looked into; a team that will be planned might, so it
 * counts (and is checked again once it has planned).
 */
export function mayProduce(registry: Registry, agent: string, capability: string, selector: Selector, depth = 0): boolean {
  if (matches(selector, agent, capability, '')) return true;
  const card = registry.get(agent);
  if (!card || card.runtime !== 'conductor' || depth > 8) return false;
  const cap = card.capabilities.find((c) => c.id === capability);
  if (!cap) return false;
  if (!cap.steps) return true;
  return cap.steps.some((step) => mayProduce(registry, step.assigned_agent, step.capability_match, selector, depth + 1));
}

/**
 * Nodes this node waits on, directly or through other nodes, at any level:
 * siblings it depends on (and everything inside them), then the same for its
 * parent, up to the root.
 */
export function upstreamNodes(mission: Mission, node: MissionNode): MissionNode[] {
  const found = new Map<string, MissionNode>();
  const addSubtree = (id: string) => {
    const target = mission.nodes[id];
    if (!target || found.has(id)) return;
    found.set(id, target);
    for (const dep of target.depends_on) addSubtree(dep);
    for (const child of target.children) addSubtree(child);
  };
  for (let current: MissionNode | undefined = node; current; current = current.parent ? mission.nodes[current.parent] : undefined) {
    for (const dep of current.depends_on) addSubtree(dep);
  }
  return [...found.values()];
}
