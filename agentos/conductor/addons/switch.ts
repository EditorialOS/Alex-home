// The switch, as a gate: per card, whether it is on, who may use it, how much
// it may run in a month, and a cheaper model past a spend line. Also a budget
// per mission. None of this is in the conductor; the gate sees every call.
//
//   switch:
//     used_by: [producers]
//     max_runs_per_month: 30
//     max_usd_per_month: 40
//     downgrade_after_usd: 20
//     downgrade_to: claude-sonnet-5-5

import type { Card, Gate, GateContext } from '../src/types.ts';

export interface Switch {
  enabled?: boolean;
  used_by?: string[];
  max_runs_per_month?: number;
  max_usd_per_month?: number;
  /** Past this much spend in a month, a model card runs on `downgrade_to`. */
  downgrade_after_usd?: number;
  downgrade_to?: string;
}

export interface SwitchOptions {
  /** A budget for every mission, in USD. A mission's own `meta.budget_usd` wins. Default: none. */
  budgetUsd?: number;
}

export function switchGate(options: SwitchOptions = {}): Gate {
  return {
    name: 'switch',
    blocks: { switch: checkSwitch },
    async before({ mission, card }, context) {
      const budget = typeof mission.meta.budget_usd === 'number' ? mission.meta.budget_usd : options.budgetUsd;
      const next = card.constraints.cost_per_run_usd ?? 0;
      if (budget !== undefined && mission.cost_usd + next > budget) {
        return { stop: `the mission's $${budget.toFixed(2)} budget is spent ($${mission.cost_usd.toFixed(2)} so far)` };
      }
      const toggle = switchOf(card);
      if (!toggle) return;
      if (toggle.enabled === false) return { stop: `\`${card.id}\` is switched off` };
      if (toggle.used_by?.length) {
        const who = mission.user ? [mission.user.id, ...(mission.user.groups ?? [])] : [];
        if (!who.some((name) => toggle.used_by!.includes(name))) {
          const caller = mission.user ? `\`${mission.user.id}\`` : 'a caller with no name';
          return { stop: `${caller} may not use \`${card.id}\` (used by: ${toggle.used_by.join(', ')})` };
        }
      }
      if (toggle.max_runs_per_month === undefined && toggle.max_usd_per_month === undefined && toggle.downgrade_after_usd === undefined) return;
      const usage = await usageThisMonth(card.id, context);
      if (toggle.max_runs_per_month !== undefined && usage.runs >= toggle.max_runs_per_month) {
        return { stop: `\`${card.id}\` has used all ${toggle.max_runs_per_month} of its runs this month` };
      }
      if (toggle.max_usd_per_month !== undefined && usage.usd + next > toggle.max_usd_per_month) {
        return { stop: `\`${card.id}\` would pass its $${toggle.max_usd_per_month} monthly budget ($${usage.usd.toFixed(2)} spent)` };
      }
      if (card.runtime === 'model' && toggle.downgrade_to && toggle.downgrade_after_usd !== undefined && usage.usd >= toggle.downgrade_after_usd) {
        return {
          model: toggle.downgrade_to,
          via: 'downgrade',
          note: `\`${card.id}\` is past $${toggle.downgrade_after_usd} this month ($${usage.usd.toFixed(2)} spent): using ${toggle.downgrade_to}`,
        };
      }
    },
  };
}

/** The card's `switch:` block, if it has one (checked when the cards were loaded). */
export function switchOf(card: Card): Switch | undefined {
  return card.blocks.switch as Switch | undefined;
}

/** Checks a `switch:` block; returns what is wrong with it. */
export function checkSwitch(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['must be a set of named fields'];
  const errors: string[] = [];
  const fields = value as Record<string, unknown>;
  const numbers = ['max_runs_per_month', 'max_usd_per_month', 'downgrade_after_usd'];
  for (const [key, field] of Object.entries(fields)) {
    if (key === 'enabled') {
      if (typeof field !== 'boolean') errors.push('`enabled` must be true or false');
    } else if (key === 'used_by') {
      if (!Array.isArray(field) || !field.every((name) => typeof name === 'string')) errors.push('`used_by` must be a list of names');
    } else if (numbers.includes(key)) {
      if (typeof field !== 'number' || !Number.isFinite(field) || field < 0) errors.push(`\`${key}\` must be a number of 0 or more`);
    } else if (key === 'downgrade_to') {
      if (typeof field !== 'string' || !field.trim()) errors.push('`downgrade_to` must name a model');
    } else {
      errors.push(`unknown field \`${key}\``);
    }
  }
  if ((fields.downgrade_after_usd === undefined) !== (fields.downgrade_to === undefined)) {
    errors.push('`downgrade_after_usd` and `downgrade_to` go together: set both, or neither');
  }
  return errors;
}

/** Runs that succeeded, and spend, for one card since the start of this month (UTC). */
export async function usageThisMonth(agent: string, context: GateContext): Promise<{ runs: number; usd: number }> {
  const now = context.now();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  let runs = 0;
  let usd = 0;
  for (const mission of await context.missions()) {
    for (const node of Object.values(mission.nodes)) {
      for (const run of node.runs) {
        if (run.agent !== agent || run.at < since) continue;
        if (run.outcome === 'ok') runs += 1;
        usd += run.usd;
      }
    }
  }
  return { runs, usd };
}
