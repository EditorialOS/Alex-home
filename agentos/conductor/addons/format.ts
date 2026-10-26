// Prints a mission as a tree, with what each waiting task needs from a person.

import type { Mission, MissionNode } from '../src/types.ts';

export function formatMission(mission: Mission): string {
  const lines = [`${mission.id} · ${mission.status} · $${mission.cost_usd.toFixed(4)}${typeof mission.meta.budget_usd === 'number' ? ` of $${mission.meta.budget_usd.toFixed(2)}` : ''}`, `request: ${mission.request}`, ''];
  const walk = (node: MissionNode, prefix: string, last: boolean, top: boolean) => {
    const branch = top ? '' : last ? '└─ ' : '├─ ';
    lines.push(`${prefix}${branch}${describe(node)}`);
    const inner = top ? '' : `${prefix}${last ? '   ' : '│  '}`;
    const note = noteFor(mission, node);
    if (note) lines.push(...note.map((line) => `${inner}${node.children.length ? '│  ' : '   '}${line}`));
    node.children.forEach((id, index) => walk(mission.nodes[id]!, inner, index === node.children.length - 1, false));
  };
  walk(mission.nodes.root!, '', true, true);
  return lines.join('\n');
}

function describe(node: MissionNode): string {
  const status = node.waiting_for ? `${node.status}: ${node.waiting_for}` : node.status;
  const extra = [
    node.attempt > 1 ? `attempt ${node.attempt}` : '',
    node.cost_usd > 0 ? `$${node.cost_usd.toFixed(4)}` : '',
    node.runs.filter((run) => run.agent === node.agent).at(-1)?.model ?? '',
  ].filter(Boolean);
  return `${node.id}  ${node.agent}/${node.capability || '(not routed)'}  [${status}]${extra.length ? `  ${extra.join(' · ')}` : ''}`;
}

function noteFor(mission: Mission, node: MissionNode): string[] | undefined {
  if (node.status === 'needs-human' && node.waiting_for === 'approval') {
    return [
      `${node.events.at(-1)?.replace(/^\S+ /, '') ?? 'waiting for approval'}`,
      `conductor approve ${mission.id} ${node.id} --hash ${node.output_hash} --by <name>`,
    ];
  }
  if (node.status === 'needs-human' && node.waiting_for === 'task') {
    return [`a person does this task, then: conductor resolve ${mission.id} ${node.id} --decision complete --output-file <file> --by <name>`];
  }
  if (node.status === 'needs-human' || node.status === 'failed') {
    const lines = node.error ? [node.error] : [];
    // A check that stopped the work: show what the checker said, in full.
    const check = node.checks.at(-1);
    if (check && check.verdict !== 'pass' && check.notes) {
      lines.push(`${check.checker}'s notes${check.score === undefined ? '' : ` (score ${check.score})`}:`, ...check.notes.split('\n').map((line) => `  ${line}`));
    }
    return lines.length ? lines : undefined;
  }
  return undefined;
}
