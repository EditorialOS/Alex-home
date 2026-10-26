#!/usr/bin/env node
// The agentos command. Every command loads the same folder of cards and the
// same setup module, so a mission started in one shell can be approved,
// resolved or resumed from another, days later.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Conductor } from './conductor.ts';
import { formatMission } from './format.ts';
import { ModelPlanner } from './planner.ts';
import { AnthropicModels } from './plugs/anthropic.ts';
import { allowedFor, loadAgents } from './registry.ts';
import type { Registry } from './registry.ts';
import { FileStore } from './store.ts';
import { formatUsage, monthOf } from './usage.ts';
import type { FunctionPlug, Mission, ModelProvider, Planner } from './types.ts';

const USAGE = `agentos: run teams of agents described in cards

  agentos check                               load the cards and show the teams
  agentos run <agent> "<request>"             start a mission
      [--capability <id>] [--input key=value]... [--user <id>] [--group <name>]... [--budget <usd>]
  agentos status <mission> [--json]
  agentos output <mission> [<task>]           print what a mission (or one task) produced
  agentos list
  agentos usage [--month YYYY-MM]             who used which agent, on which model, for how much
  agentos approve <mission> <task> --hash <output hash> [--by <name>] [--note <text>]
  agentos reject  <mission> <task> --note <why> [--by <name>]
  agentos resolve <mission> <task> --decision complete|error|retry|fail
      [--output <text> | --output-file <file>] [--error <text>] [--note <text>] [--capability <id>] [--by <name>]
  agentos advance <mission>                   resume a mission (after a delay, or a fix to a card)
  agentos cancel  <mission>

Every command takes:
  --dir <folder>     the cards (default ./agents, or $AGENTOS_DIR)
  --setup <module>   exports plugs (code for function cards), and optionally models or planner
                     (default $AGENTOS_SETUP)
  --store <folder>   where missions are kept (default ./.agentos/missions)

Model cards run on Claude with $ANTHROPIC_API_KEY unless the setup module exports models.

Exit codes: 0 done (or cancelled), 1 failed or an error, 2 a mistake in the command,
3 the mission is waiting for a person.`;

const OPTIONS = {
  dir: { type: 'string' },
  setup: { type: 'string' },
  store: { type: 'string' },
  capability: { type: 'string' },
  input: { type: 'string', multiple: true },
  user: { type: 'string' },
  group: { type: 'string', multiple: true },
  budget: { type: 'string' },
  json: { type: 'boolean' },
  output: { type: 'string' },
  'output-file': { type: 'string' },
  hash: { type: 'string' },
  by: { type: 'string' },
  note: { type: 'string' },
  decision: { type: 'string' },
  error: { type: 'string' },
  month: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

interface Setup {
  plugs?: Record<string, FunctionPlug>;
  models?: ModelProvider;
  planner?: Planner;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, ...args] = positionals;
  if (!command || values.help) {
    console.log(USAGE);
    return command ? 0 : 2;
  }
  const dir = resolve(values.dir ?? process.env.AGENTOS_DIR ?? 'agents');
  const registry = await loadAgents(dir);
  if (command === 'check') return check(registry, dir);

  const setup = await loadSetup(values.setup ?? process.env.AGENTOS_SETUP);
  const models = setup.models ?? new AnthropicModels();
  const conductor = new Conductor({
    registry,
    store: new FileStore(resolve(values.store ?? '.agentos/missions')),
    plugs: setup.plugs,
    models,
    planner: setup.planner ?? new ModelPlanner({ models }),
  });
  const by = values.by ?? process.env.USER ?? 'someone';
  const need = (value: string | undefined, name: string): string => {
    if (!value) throw new UsageError(`${command} needs ${name}`);
    return value;
  };
  const [missionId, taskId] = args;

  switch (command) {
    case 'run': {
      const [agentId, request] = args;
      const inputs = Object.fromEntries(
        (values.input ?? []).map((pair) => {
          const at = pair.indexOf('=');
          if (at < 1) throw new UsageError(`--input takes key=value, not \`${pair}\``);
          return [pair.slice(0, at), pair.slice(at + 1)];
        }),
      );
      const mission = await conductor.start(need(agentId, 'an agent'), need(request, 'a request'), {
        capability: values.capability,
        inputs,
        user: values.user ? { id: values.user, groups: values.group } : undefined,
        budget_usd: values.budget === undefined ? undefined : budget(values.budget),
      });
      return report(mission);
    }
    case 'status': {
      const mission = await conductor.get(need(missionId, 'a mission id'));
      if (!mission) throw new UsageError(`no mission \`${missionId}\``);
      console.log(values.json ? JSON.stringify(mission, null, 2) : formatMission(mission));
      return 0;
    }
    case 'output': {
      const mission = await conductor.get(need(missionId, 'a mission id'));
      const node = mission?.nodes[taskId ?? 'root'];
      if (!node) throw new UsageError(mission ? `mission ${missionId} has no task \`${taskId}\`` : `no mission \`${missionId}\``);
      if (node.output === undefined) throw new UsageError(`${node.id} has no output yet (it is ${node.status})`);
      console.log(node.output);
      return 0;
    }
    case 'list': {
      for (const mission of await conductor.list()) {
        console.log(`${mission.id}  ${mission.status.padEnd(11)}  $${mission.cost_usd.toFixed(4)}  ${mission.request.slice(0, 70)}`);
      }
      return 0;
    }
    case 'usage': {
      if (values.month && !/^\d{4}-\d{2}$/.test(values.month)) throw new UsageError(`--month is YYYY-MM, not \`${values.month}\``);
      const { since, until } = monthOf(new Date(), values.month);
      console.log(formatUsage(await conductor.usage({ since, until }), registry));
      return 0;
    }
    case 'approve':
      return report(
        await conductor.approve(need(missionId, 'a mission id'), need(taskId, 'a task id'), {
          output_hash: need(values.hash, '--hash'),
          by,
          note: values.note,
        }),
      );
    case 'reject':
      return report(await conductor.reject(need(missionId, 'a mission id'), need(taskId, 'a task id'), { by, note: need(values.note, '--note') }));
    case 'resolve': {
      const decision = need(values.decision, '--decision');
      if (!['complete', 'error', 'retry', 'fail'].includes(decision)) throw new UsageError('--decision is complete, error, retry or fail');
      const output = values['output-file'] ? await readFile(values['output-file'], 'utf8') : values.output;
      return report(
        await conductor.resolve(need(missionId, 'a mission id'), need(taskId, 'a task id'), {
          by,
          decision: decision as 'complete' | 'error' | 'retry' | 'fail',
          output,
          error: values.error,
          note: values.note,
          capability: values.capability,
        }),
      );
    }
    case 'advance':
      return report(await conductor.advance(need(missionId, 'a mission id')));
    case 'cancel':
      return report(await conductor.cancel(need(missionId, 'a mission id')));
    default:
      throw new UsageError(`unknown command \`${command}\``);
  }
}

function check(registry: Registry, dir: string): number {
  const cards = [...registry.cards.values()];
  console.log(`${cards.length} cards in ${dir}`);
  const inTeam = new Set(cards.flatMap((card) => (card.runtime === 'conductor' ? card.members : [])));
  const show = (id: string, indent: string, seen: Set<string>) => {
    const card = registry.get(id);
    if (!card) return console.log(`${indent}${id}  (invalid)`);
    const plug = card.plug ? `  ${card.plug.model}` : '';
    const off = card.switch?.enabled === false ? '  [switched off]' : '';
    console.log(`${indent}${card.id}  ${card.runtime}${plug}${off}  ${card.capabilities.map((c) => c.id).join(', ')}`);
    if (card.runtime !== 'conductor' || seen.has(id)) return;
    for (const member of card.members) show(member, `${indent}  `, new Set([...seen, id]));
    const extra = allowedFor(card).filter((other) => !card.members.includes(other));
    if (extra.length) console.log(`${indent}  routes_to: ${extra.join(', ')}`);
  };
  for (const card of cards) if (!inTeam.has(card.id)) show(card.id, '  ', new Set());
  for (const entry of registry.invalid) {
    console.log(`\ninvalid: ${entry.id}${entry.source ? ` (${entry.source})` : ''}`);
    for (const error of entry.errors) console.log(`  - ${error}`);
  }
  return registry.invalid.length ? 1 : 0;
}

async function loadSetup(path: string | undefined): Promise<Setup> {
  if (!path) return {};
  const module = (await import(pathToFileURL(resolve(path)).href)) as Setup & { default?: Record<string, FunctionPlug> };
  return { plugs: module.plugs ?? module.default, models: module.models, planner: module.planner };
}

/** Prints a mission. The exit code says where it stands: 0 done, 1 failed, 3 waiting for a person. */
function report(mission: Mission): number {
  console.log(formatMission(mission));
  if (mission.status === 'complete') console.log(`\nThe output: agentos output ${mission.id}`);
  if (mission.status === 'needs-human') console.log('\nWaiting for a person (exit code 3).');
  if (mission.status === 'failed') return 1;
  return mission.status === 'needs-human' ? 3 : 0;
}

function budget(text: string): number {
  const usd = Number(text);
  if (!Number.isFinite(usd) || usd < 0) throw new UsageError(`--budget is an amount in USD, not \`${text}\``);
  return usd;
}

class UsageError extends Error {}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`agentos: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) console.error('\nRun `agentos --help` for the commands.');
    process.exitCode = error instanceof UsageError ? 2 : 1;
  },
);
