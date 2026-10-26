// Who used which agent, on which model, for how much: read from the run
// records every mission keeps, failed calls included.

import type { Registry } from './registry.ts';
import type { Mission } from './types.ts';

export interface AgentUsage {
  agent: string;
  /** Calls that succeeded: what the switch's run limit counts. */
  runs: number;
  failed: number;
  usd: number;
  ms: number;
  /** Calls per model, with how the model was chosen when it was not the card's own. */
  models: Record<string, number>;
  callers: Record<string, { runs: number; usd: number }>;
}

export interface UsageReport {
  since: string;
  until: string;
  usd: number;
  agents: AgentUsage[];
  callers: { user: string; runs: number; usd: number }[];
}

export function usageReport(missions: Mission[], since: Date, until: Date): UsageReport {
  const from = since.toISOString();
  const to = until.toISOString();
  const agents = new Map<string, AgentUsage>();
  const callers = new Map<string, { user: string; runs: number; usd: number }>();
  let total = 0;
  for (const mission of missions) {
    for (const node of Object.values(mission.nodes)) {
      for (const run of node.runs) {
        if (run.at < from || run.at >= to) continue;
        const entry = agents.get(run.agent) ?? { agent: run.agent, runs: 0, failed: 0, usd: 0, ms: 0, models: {}, callers: {} };
        agents.set(run.agent, entry);
        if (run.outcome === 'ok') entry.runs += 1;
        else entry.failed += 1;
        entry.usd += run.usd;
        entry.ms += run.ms;
        if (run.model) {
          const label = run.plug && run.plug !== 'model' ? `${run.model} (${run.plug})` : run.model;
          entry.models[label] = (entry.models[label] ?? 0) + 1;
        }
        const user = run.user ?? '(no caller)';
        const mine = (entry.callers[user] ??= { runs: 0, usd: 0 });
        const overall = callers.get(user) ?? { user, runs: 0, usd: 0 };
        callers.set(user, overall);
        if (run.outcome === 'ok') {
          mine.runs += 1;
          overall.runs += 1;
        }
        mine.usd += run.usd;
        overall.usd += run.usd;
        total += run.usd;
      }
    }
  }
  return {
    since: from,
    until: to,
    usd: total,
    agents: [...agents.values()].sort((a, b) => b.usd - a.usd || b.runs - a.runs),
    callers: [...callers.values()].sort((a, b) => b.usd - a.usd || b.runs - a.runs),
  };
}

/** The calendar month (UTC) holding `now`, or the one named `YYYY-MM`. */
export function monthOf(now: Date, month?: string): { since: Date; until: Date } {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  if (month && !match) throw new Error(`a month is YYYY-MM, not \`${month}\``);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const index = match ? Number(match[2]) - 1 : now.getUTCMonth();
  return { since: new Date(Date.UTC(year, index, 1)), until: new Date(Date.UTC(year, index + 1, 1)) };
}

export function formatUsage(report: UsageReport, registry?: Registry): string {
  const lines = [`Usage from ${report.since.slice(0, 10)} to ${report.until.slice(0, 10)}: $${report.usd.toFixed(4)}`, ''];
  if (!report.agents.length) return [...lines, 'No calls.'].join('\n');
  const width = Math.max(5, ...report.agents.map((entry) => entry.agent.length));
  lines.push(`${'agent'.padEnd(width)}  ${'runs'.padStart(5)}  ${'failed'.padStart(6)}  ${'usd'.padStart(9)}  ${'avg'.padStart(6)}  limits`);
  for (const entry of report.agents) {
    const calls = entry.runs + entry.failed;
    const average = calls ? `${(entry.ms / calls / 1000).toFixed(1)}s` : '';
    const toggle = registry?.get(entry.agent)?.switch;
    const limits = [
      toggle?.enabled === false ? 'switched off' : '',
      toggle?.max_runs_per_month !== undefined ? `${entry.runs} of ${toggle.max_runs_per_month} runs` : '',
      toggle?.max_usd_per_month !== undefined ? `$${entry.usd.toFixed(2)} of $${toggle.max_usd_per_month}` : '',
      toggle?.downgrade_after_usd !== undefined ? `cheaper model past $${toggle.downgrade_after_usd}` : '',
      toggle?.used_by?.length ? `used by ${toggle.used_by.join(', ')}` : '',
    ].filter(Boolean);
    lines.push(
      `${entry.agent.padEnd(width)}  ${String(entry.runs).padStart(5)}  ${String(entry.failed).padStart(6)}  ${`$${entry.usd.toFixed(4)}`.padStart(9)}  ${average.padStart(6)}  ${limits.join(' · ')}`,
    );
    const models = Object.entries(entry.models).map(([model, count]) => `${model} ×${count}`);
    if (models.length) lines.push(`${''.padEnd(width)}  ${models.join(', ')}`);
  }
  lines.push('', 'By caller:');
  for (const caller of report.callers) lines.push(`  ${caller.user}: ${caller.runs} runs, $${caller.usd.toFixed(4)}`);
  return lines.join('\n');
}
