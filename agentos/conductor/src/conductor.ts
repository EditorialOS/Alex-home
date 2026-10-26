// The conductor: turns one request into a tree of tasks, hands each task to
// the right card, enforces the cards' rules, and keeps the record. It never
// does the work itself, and it sets no limits: every call passes the gates it
// was given (limits, budgets and model choice live there).
//
// A mission is a plain object saved after every step. `advance()` moves it as
// far as it can go; when it waits on a person it stops, and `approve()`,
// `reject()` or `resolve()` (from any process, any time later) moves it on.

import { createHash, randomUUID } from 'node:crypto';
import { resolveDependsOn, validateSteps } from './card.ts';
import { allowedFor } from './registry.ts';
import type { Registry } from './registry.ts';
import {
  applies,
  effectiveRules,
  matches,
  mayProduce,
  normalizeScore,
  pathCards,
  rulesOnPath,
  upstreamNodes,
} from './rules.ts';
import { MemoryStore } from './store.ts';
import { RefusalError } from './types.ts';
import type {
  BeforeRule,
  Call,
  Caller,
  Capability,
  Card,
  CheckRecord,
  CheckRule,
  FailureKind,
  FunctionPlug,
  Gate,
  GateContext,
  GateDecision,
  Mission,
  MissionNode,
  MissionStore,
  ModelProvider,
  NodeStatus,
  Planner,
  PlugResult,
  RunOutcome,
  RunRecord,
  Selector,
  Step,
  Task,
  WaitingFor,
} from './types.ts';

export interface ConductorOptions {
  registry: Registry;
  store?: MissionStore;
  /** Code for `function` cards, by agent id. */
  plugs?: Record<string, FunctionPlug>;
  /** Runs `model` cards. */
  models?: ModelProvider;
  /** Plans conductor capabilities that have no recipe, and routes requests that name none. */
  planner?: Planner;
  /** Asked before every call and told after it: where limits, budgets and model choice plug in. */
  gates?: Gate[];
  /** A node at this depth must be a worker. Default 4. */
  maxDepth?: number;
  /** Tasks per mission. Default 40. */
  maxNodes?: number;
  /** How long `advance()` waits in-process for a retry delay. Default 30 s. */
  maxWaitMs?: number;
  now?: () => Date;
}

export interface StartOptions {
  capability?: string;
  inputs?: Record<string, string>;
  user?: Caller;
  id?: string;
  /** Kept with the mission for gates and callers (a budget, a client). */
  meta?: Record<string, unknown>;
}

export interface ApproveInput {
  output_hash: string;
  by: string;
  note?: string;
  attempt?: number;
}

export interface RejectInput {
  by: string;
  note: string;
  attempt?: number;
}

export interface ResolveInput {
  by: string;
  decision: 'complete' | 'error' | 'retry' | 'fail';
  /** With `retry` on a task not yet planned: the capability to use, skipping routing. */
  capability?: string;
  output?: string;
  error?: string;
  note?: string;
  attempt?: number;
}

/** The request no longer matches the mission (a stale hash or attempt, a wrong state). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** A gate stopped a call; the task waits for a person. */
export class GateStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateStop';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** When a model call's answering attempt began, and which model answered and why. */
interface Timing {
  started?: number;
  via?: string;
}

const TERMINAL: NodeStatus[] = ['complete', 'failed', 'blocked', 'cancelled'];
/** Errors whose failed call is already in the run record (a model attempt records its own). */
const RECORDED = new WeakSet<object>();
const OUTPUT_LIMIT = 20_000;
const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise', 'reject'] },
    score: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['verdict', 'score', 'notes'],
  additionalProperties: false,
};

export class Conductor {
  readonly registry: Registry;
  readonly store: MissionStore;
  private readonly plugs: Record<string, FunctionPlug>;
  private readonly models?: ModelProvider;
  private readonly planner?: Planner;
  private readonly maxDepth: number;
  private readonly maxNodes: number;
  private readonly gates: Gate[];
  private readonly maxWaitMs: number;
  private readonly now: () => Date;

  constructor(options: ConductorOptions) {
    this.registry = options.registry;
    this.store = options.store ?? new MemoryStore();
    this.plugs = options.plugs ?? {};
    this.models = options.models;
    this.planner = options.planner;
    this.maxDepth = options.maxDepth ?? 4;
    this.maxNodes = options.maxNodes ?? 40;
    this.gates = options.gates ?? [];
    this.maxWaitMs = options.maxWaitMs ?? 30_000;
    this.now = options.now ?? (() => new Date());
  }

  // ------------------------------------------------------------ public API

  /** Starts a mission on any card (usually a team) and runs it as far as it can go. */
  async start(agentId: string, request: string, options: StartOptions = {}): Promise<Mission> {
    const card = this.registry.get(agentId);
    if (!card) {
      const invalid = this.registry.invalid.find((entry) => entry.id === agentId);
      throw new Error(invalid ? `card \`${agentId}\` is invalid: ${invalid.errors.join('; ')}` : `no card \`${agentId}\``);
    }
    // With several capabilities and none named, the root node routes itself when it runs.
    const capability = options.capability || card.capabilities.length === 1 ? pickCapability(card, options.capability) : undefined;
    const at = this.stamp();
    const mission: Mission = {
      id: options.id ?? newMissionId(this.now()),
      request,
      inputs: options.inputs ?? {},
      user: options.user,
      status: 'running',
      cost_usd: 0,
      meta: options.meta ?? {},
      nodes: {},
      created_at: at,
      updated_at: at,
    };
    mission.nodes.root = newNode('root', null, card.id, capability?.id ?? '', request, []);
    await this.save(mission);
    return this.advance(mission.id);
  }

  /** Moves a mission as far as it can go without a person. */
  async advance(id: string): Promise<Mission> {
    const mission = await this.mustLoad(id);
    if (isFinished(mission)) return mission;
    for (;;) {
      if (await this.step(mission)) {
        await this.save(mission);
        continue;
      }
      const wait = this.nextRetryWait(mission);
      if (wait !== null && wait <= this.maxWaitMs) {
        await sleep(wait);
        continue;
      }
      break;
    }
    this.updateStatus(mission);
    await this.save(mission);
    return mission;
  }

  /** Approves the exact output a person saw. A changed output needs approval again. */
  async approve(id: string, nodeId: string, input: ApproveInput): Promise<Mission> {
    const mission = await this.mustLoad(id);
    const node = this.mustNode(mission, nodeId);
    if (node.status !== 'needs-human' || node.waiting_for !== 'approval') {
      throw new ConflictError(`${nodeId} is not waiting for approval (it is ${describeStatus(node)})`);
    }
    checkAttempt(node, input.attempt);
    if (input.output_hash !== node.output_hash) {
      throw new ConflictError(`the output of ${nodeId} is now ${node.output_hash}; approve that one`);
    }
    const rules = effectiveRules(mission, node, this.registry)
      .filter((scoped) => scoped.rule.kind === 'approval')
      .map((scoped) => scoped.fullId);
    node.approvals.push({ rules, by: input.by, output_hash: node.output_hash, note: input.note, at: this.stamp() });
    this.event(node, `approved by ${input.by}${input.note ? `: ${input.note}` : ''}`);
    this.complete(node);
    await this.save(mission);
    return this.advance(id);
  }

  /** Rejects an output waiting for approval; the card's failure modes decide what happens. */
  async reject(id: string, nodeId: string, input: RejectInput): Promise<Mission> {
    const mission = await this.mustLoad(id);
    const node = this.mustNode(mission, nodeId);
    if (node.status !== 'needs-human' || node.waiting_for !== 'approval') {
      throw new ConflictError(`${nodeId} is not waiting for approval (it is ${describeStatus(node)})`);
    }
    checkAttempt(node, input.attempt);
    this.event(node, `rejected by ${input.by}: ${input.note}`);
    await this.handleFailure(mission, node, 'rejected', input.note);
    await this.save(mission);
    return this.advance(id);
  }

  /** A person's answer to a human task, a fix, or a failed task. */
  async resolve(id: string, nodeId: string, input: ResolveInput): Promise<Mission> {
    const mission = await this.mustLoad(id);
    const node = this.mustNode(mission, nodeId);
    const waiting = node.status === 'needs-human' && (node.waiting_for === 'task' || node.waiting_for === 'fix');
    if (!waiting && node.status !== 'failed' && node.status !== 'blocked') {
      throw new ConflictError(`${nodeId} has nothing to resolve (it is ${describeStatus(node)})`);
    }
    checkAttempt(node, input.attempt);
    this.event(node, `resolved by ${input.by}: ${input.decision}${input.note ? ` (${input.note})` : ''}`);
    if (input.decision === 'complete') {
      if (input.output === undefined) throw new Error('`complete` needs an output');
      const card = this.registry.get(node.agent);
      if (card?.runtime === 'human' && node.children.length === 0) {
        const started = node.started_at ? Date.parse(node.started_at) : this.now().getTime();
        await this.record({ mission, node, card, capability: node.capability, kind: 'work' }, {}, started, 'ok', input.by);
      }
      node.status = 'running';
      await this.finish(mission, node, input.output);
    } else if (input.decision === 'error') {
      node.status = 'running';
      await this.handleFailure(mission, node, 'error', input.error ?? `reported by ${input.by}`);
    } else if (input.decision === 'retry') {
      if (input.capability) {
        if (node.children.length) throw new ConflictError(`${nodeId} is already planned; its capability cannot change`);
        const card = this.registry.get(node.agent);
        if (!card?.capabilities.some((c) => c.id === input.capability)) {
          throw new Error(`\`${node.agent}\` has no capability \`${input.capability}\``);
        }
        node.capability = input.capability;
      }
      this.reopen(mission, node, input.note);
    } else {
      this.fail(node, input.note ?? `failed by ${input.by}`);
    }
    if (isFinished(mission) && mission.status !== 'cancelled') mission.status = 'running';
    await this.save(mission);
    return this.advance(id);
  }

  async cancel(id: string): Promise<Mission> {
    const mission = await this.mustLoad(id);
    for (const node of Object.values(mission.nodes)) {
      if (!TERMINAL.includes(node.status)) {
        node.status = 'cancelled';
        node.waiting_for = undefined;
        this.event(node, 'cancelled');
      }
    }
    mission.status = 'cancelled';
    await this.save(mission);
    return mission;
  }

  async get(id: string): Promise<Mission | undefined> {
    return this.store.load(id);
  }

  async list(): Promise<Mission[]> {
    return this.store.list();
  }

  // ------------------------------------------------------------ the loop

  /** Takes one step. Returns false when nothing can move without a person or a clock. */
  private async step(mission: Mission): Promise<boolean> {
    const nodes = Object.values(mission.nodes);
    for (const node of nodes) {
      const failedDep = node.depends_on.find((dep) => ['failed', 'blocked', 'cancelled'].includes(mission.nodes[dep]?.status ?? ''));
      if (node.status === 'pending' && failedDep) {
        node.status = 'blocked';
        this.event(node, `blocked: ${failedDep} did not complete`);
        return true;
      }
    }
    for (const node of nodes) {
      if (node.status === 'running' && node.children.length > 0 && node.children.every((id) => TERMINAL.includes(mission.nodes[id]!.status))) {
        await this.finishTeam(mission, node);
        return true;
      }
    }
    const now = this.now().getTime();
    for (const node of nodes) {
      if (node.status !== 'pending') continue;
      const parent = node.parent ? mission.nodes[node.parent] : undefined;
      if (parent && parent.status !== 'running') continue;
      if (!node.depends_on.every((dep) => mission.nodes[dep]?.status === 'complete')) continue;
      if (node.not_before && Date.parse(node.not_before) > now) continue;
      await this.dispatch(mission, node);
      return true;
    }
    return false;
  }

  private nextRetryWait(mission: Mission): number | null {
    const now = this.now().getTime();
    const waits = Object.values(mission.nodes)
      .filter((node) => node.status === 'pending' && node.not_before)
      .map((node) => Date.parse(node.not_before!) - now)
      .filter((wait) => wait > 0);
    return waits.length ? Math.min(...waits) : null;
  }

  private async dispatch(mission: Mission, node: MissionNode): Promise<void> {
    const card = this.registry.get(node.agent);
    if (card && !node.capability) return this.route(mission, node, card);
    const capability = card?.capabilities.find((c) => c.id === node.capability);
    if (!card || !capability) {
      return this.needsHuman(node, 'fix', `card \`${node.agent}\` or its capability \`${node.capability}\` is missing or invalid`);
    }
    node.status = 'running';
    node.started_at ??= this.stamp();
    node.waiting_for = undefined;
    node.error = undefined;
    node.not_before = undefined;

    const call: Call = { mission, node, card, capability: capability.id, kind: 'work' };
    const decision = await this.askGates(call);
    if (decision.stop) return this.needsHuman(node, 'fix', decision.stop);
    const unmet = this.unmetBefore(mission, node);
    if (unmet) return this.needsHuman(node, 'fix', unmet);

    if (card.runtime === 'conductor') return this.expand(mission, node, card, capability);
    if (card.runtime === 'human') {
      node.instructions = taskMessage(mission, node, capability);
      return this.needsHuman(node, 'task', `waiting for a person: ${card.name}`);
    }
    let result: PlugResult;
    try {
      const message = taskMessage(mission, node, capability);
      result = await this.call(call, (gate) => this.callWorker(call, capability, message, gate), decision);
    } catch (error) {
      if (error instanceof GateStop) return this.needsHuman(node, 'fix', error.message);
      return this.handleFailure(mission, node, kindOf(error), messageOf(error));
    }
    await this.finish(mission, node, result.output);
  }

  // ------------------------------------------------------------ routing

  /** Picks the capability for a request that names none: signals first, then the router. */
  private async route(mission: Mission, node: MissionNode, card: Card): Promise<void> {
    node.started_at ??= this.stamp();
    const word = mission.request.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const signalled = card.capabilities.find((c) => c.signals?.some((signal) => signal.toLowerCase() === word));
    if (signalled) {
      node.capability = signalled.id;
      this.event(node, `routed to ${signalled.id} by the signal ${word}`);
      return this.dispatch(mission, node);
    }
    const choices = card.capabilities.map((c) => c.id).join(', ');
    if (!this.planner?.route) {
      return this.needsHuman(node, 'fix', `No signal matches and no router is configured. Retry naming a capability (${choices}).`);
    }
    node.status = 'running';
    const router = this.planner;
    let result;
    try {
      const call: Call = { mission, node, card, capability: '(route)', kind: 'route' };
      result = await this.call(call, () => router.route!({ mission, node, team: card, note: node.feedback }));
    } catch (error) {
      if (error instanceof GateStop) return this.needsHuman(node, 'fix', error.message);
      return this.handleFailure(mission, node, kindOf(error), messageOf(error));
    }
    const chosen = card.capabilities.find((c) => c.id === result.capability);
    const why = result.reason ? ` (${result.reason.replace(/\.$/, '')})` : '';
    if (!chosen) {
      return this.needsHuman(node, 'fix', `No capability fits this request${why}. Retry with a note, retry naming a capability (${choices}), or fail it.`);
    }
    node.capability = chosen.id;
    node.feedback = undefined;
    this.event(node, `routed to ${chosen.id}${why}`);
    return this.dispatch(mission, node);
  }

  // ------------------------------------------------------------ teams

  private async expand(mission: Mission, node: MissionNode, team: Card, capability: Capability): Promise<void> {
    const allowed = allowedFor(team)
      .map((id) => this.registry.get(id))
      .filter((card): card is Card => card !== undefined);
    let steps: Step[];
    let source: 'recipe' | 'planner';
    if (capability.steps) {
      steps = capability.steps;
      source = 'recipe';
    } else {
      if (!this.planner) {
        return this.needsHuman(node, 'fix', `\`${capability.id}\` has no recipe and no planner is configured`);
      }
      source = 'planner';
      const planner = this.planner;
      const plan = async (violations: string[]): Promise<Step[]> => {
        const call: Call = { mission, node, card: team, capability: capability.id, kind: 'plan' };
        const result = await this.call(call, async () => {
          const planned = await planner.plan({ mission, node, team, capability, allowed, violations });
          return Array.isArray(planned) ? { steps: planned } : planned;
        });
        return result.steps;
      };
      try {
        steps = await plan([]);
        const violations = this.validatePlan(mission, node, team, capability, steps);
        if (violations.length) {
          this.event(node, `plan rejected (${violations.join('; ')}); planning once more`);
          steps = await plan(violations);
        }
      } catch (error) {
        if (error instanceof GateStop) return this.needsHuman(node, 'fix', error.message);
        return this.handleFailure(mission, node, kindOf(error), messageOf(error));
      }
    }
    const violations = this.validatePlan(mission, node, team, capability, steps);
    if (violations.length) return this.needsHuman(node, 'fix', `the plan breaks the rules: ${violations.join('; ')}`);

    const deps = resolveDependsOn(steps);
    const ids = steps.map((_, index) => childId(node.id, index + 1));
    steps.forEach((step, index) => {
      const target = this.registry.get(step.assigned_agent)!;
      const targetCapability = target.capabilities.find((c) => c.id === step.capability_match)!;
      const dependsOn = (deps[index] ?? []).map((dep) => ids[steps.findIndex((s) => s.id === dep)]!);
      const id = ids[index]!;
      mission.nodes[id] = newNode(id, node.id, target.id, targetCapability.id, step.description ?? targetCapability.description, dependsOn);
    });
    node.children = ids;
    node.plan_source = source;
    this.event(node, `planned ${ids.length} tasks from ${source === 'recipe' ? 'its recipe' : 'the planner'}`);
  }

  private async finishTeam(mission: Mission, team: MissionNode): Promise<void> {
    const children = team.children.map((id) => mission.nodes[id]!);
    if (children.every((child) => child.status === 'complete')) {
      const output = children.map((child) => `## ${child.id}: ${child.agent}/${child.capability}\n\n${child.output ?? ''}`).join('\n\n');
      return this.finish(mission, team, output);
    }
    const notDone = children.filter((child) => child.status !== 'complete').map((child) => `${child.id} (${child.status})`);
    return this.handleFailure(mission, team, 'error', `children failed: ${notDone.join(', ')}`);
  }

  validatePlan(mission: Mission, parent: MissionNode, team: Card, capability: Capability, steps: Step[]): string[] {
    const violations: string[] = [];
    validateSteps(capability.id, steps, violations);
    const allowed = allowedFor(team);
    const above = new Set(pathCards(mission, parent, this.registry).map((card) => card.id));
    const depth = depthOf(parent.id) + 1;
    for (const step of steps) {
      if (!allowed.includes(step.assigned_agent)) {
        violations.push(`\`${step.assigned_agent}\` is not on team \`${team.id}\``);
        continue;
      }
      const target = this.registry.get(step.assigned_agent);
      if (!target) {
        violations.push(`\`${step.assigned_agent}\` is missing or invalid`);
        continue;
      }
      if (!target.capabilities.some((c) => c.id === step.capability_match)) {
        violations.push(`\`${target.id}\` has no capability \`${step.capability_match}\``);
      }
      if (above.has(target.id)) violations.push(`\`${target.id}\` would hand work back to itself or a team above it`);
      if (depth > this.maxDepth) violations.push(`depth ${depth} is past the limit of ${this.maxDepth}`);
      else if (target.runtime === 'conductor' && depth >= this.maxDepth) {
        violations.push(`\`${target.id}\` is a team, but depth ${depth} is the limit: only workers fit here`);
      }
    }
    if (Object.keys(mission.nodes).length + steps.length > this.maxNodes) {
      violations.push(`the mission would pass ${this.maxNodes} tasks`);
    }
    violations.push(...this.beforeViolations(mission, parent, steps));
    return violations;
  }

  /** Plan time: every node a `before` rule governs must have its `first` upstream. */
  private beforeViolations(mission: Mission, parent: MissionNode, steps: Step[]): string[] {
    const violations: string[] = [];
    const deps = resolveDependsOn(steps);
    const parentPath = pathCards(mission, parent, this.registry);
    const outside = upstreamNodes(mission, parent);
    steps.forEach((step, index) => {
      const target = this.registry.get(step.assigned_agent);
      if (!target) return;
      for (const scoped of rulesOnPath([...parentPath, target])) {
        if (scoped.rule.kind !== 'before' || !applies(scoped, step.assigned_agent, step.capability_match)) continue;
        const first = scoped.rule.first;
        const inPlan = upstreamIndexes(index, steps, deps).some((at) =>
          mayProduce(this.registry, steps[at]!.assigned_agent, steps[at]!.capability_match, first),
        );
        const before = outside.some((node) => matches(first, node.agent, node.capability, ''));
        if (!inPlan && !before) {
          violations.push(`${scoped.fullId}: \`${step.assigned_agent}\` needs ${describeSelector(first)} first (${scoped.rule.reason})`);
        }
      }
    });
    return violations;
  }

  /** Dispatch time: the `first` of each `before` rule must have completed upstream. */
  private unmetBefore(mission: Mission, node: MissionNode): string | undefined {
    const upstream = upstreamNodes(mission, node);
    for (const scoped of effectiveRules(mission, node, this.registry)) {
      if (scoped.rule.kind !== 'before') continue;
      const rule: BeforeRule = scoped.rule;
      if (!upstream.some((other) => other.status === 'complete' && matches(rule.first, other.agent, other.capability, ''))) {
        return `${scoped.fullId}: ${describeSelector(rule.first)} must complete before ${node.agent} runs (${rule.reason})`;
      }
    }
    return undefined;
  }

  // ------------------------------------------------------------ workers

  private async callWorker(call: Call, capability: Capability, message: string, gate: GateDecision): Promise<PlugResult & Timing> {
    const { mission, node, card } = call;
    const timeoutMs = (card.constraints.max_runtime_minutes ?? 10) * 60_000;
    if (card.runtime === 'function') {
      const plug = this.plugs[card.id];
      if (!plug) throw new Error(`no plug is registered for \`${card.id}\``);
      const task: Task = { mission, node, card, capability, message };
      const result = await withTimeout(plug(task), timeoutMs, card.id);
      return typeof result === 'string' ? { output: result } : result;
    }
    return this.callModel(call, message, undefined, timeoutMs, gate);
  }

  /**
   * Tries the card's model (or the one a gate chose), then each fallback on
   * its plug, in order. Every failed attempt is recorded.
   */
  private async callModel(
    call: Call,
    prompt: string,
    schema: Record<string, unknown> | undefined,
    timeoutMs: number,
    gate: GateDecision,
  ): Promise<PlugResult & Timing> {
    const { node, card } = call;
    if (!this.models) throw new Error('no model provider is configured');
    const plug = card.plug!;
    const first = gate.model ?? plug.model;
    const models = [first, ...(plug.fallback ?? []).filter((model) => model !== first)];
    let lastError: unknown;
    for (const [index, model] of models.entries()) {
      const started = this.now().getTime();
      const via = index > 0 ? 'fallback' : gate.model ? gate.via : undefined;
      try {
        const response = await withTimeout(
          this.models.complete({
            model,
            system: [card.role, card.instructions].filter(Boolean).join('\n\n'),
            prompt,
            effort: plug.effort ?? 'medium',
            schema,
            max_tokens: plug.max_tokens,
          }),
          timeoutMs,
          card.id,
        );
        return { output: response.text, cost_usd: response.cost_usd, model: response.model, via, started };
      } catch (error) {
        lastError = error;
        await this.record(call, { model, via }, started, kindOf(error));
        if (typeof error === 'object' && error !== null) RECORDED.add(error);
        if (model !== models.at(-1)) this.event(node, `${model} failed (${messageOf(error)}); trying the next model`);
      }
    }
    throw lastError;
  }

  // ------------------------------------------------------------ gates and the record

  /** Asks every gate about a call. The first stop wins, and so does the first model change. */
  private async askGates(call: Call): Promise<GateDecision> {
    const decision: GateDecision = {};
    const notes: string[] = [];
    for (const gate of this.gates) {
      const answer = await gate.before?.(call, this.contextFor(call.mission));
      if (!answer) continue;
      if (answer.stop && !decision.stop) decision.stop = answer.stop;
      if (answer.model && !decision.model) {
        decision.model = answer.model;
        decision.via = answer.via ?? gate.name;
      }
      if (answer.note) notes.push(answer.note);
    }
    if (notes.length) decision.note = notes.join('; ');
    if (decision.note && !decision.stop) this.event(call.node, decision.note);
    return decision;
  }

  /** Makes a call through the gates and records it, whether it succeeds or not. */
  private async call<T extends Timing & { cost_usd?: number; model?: string }>(
    call: Call,
    make: (gate: GateDecision) => Promise<T>,
    decided?: GateDecision,
  ): Promise<T> {
    const gate = decided ?? (await this.askGates(call));
    if (gate.stop) throw new GateStop(gate.stop);
    const started = this.now().getTime();
    try {
      const result = await make(gate);
      // A model call that fell back reports when its answering attempt began.
      await this.record(call, result, result.started ?? started, 'ok');
      return result;
    } catch (error) {
      const recorded = typeof error === 'object' && error !== null && RECORDED.has(error);
      if (!recorded) await this.record(call, {}, started, kindOf(error));
      throw error;
    }
  }

  private async record(
    call: Call,
    result: { cost_usd?: number; model?: string; via?: string },
    started: number,
    outcome: RunOutcome,
    by?: string,
  ): Promise<void> {
    const { mission, node, card, capability, kind } = call;
    const estimate = outcome === 'ok' ? card.constraints.cost_per_run_usd : undefined;
    const usd = result.cost_usd ?? estimate ?? 0;
    const ms = Math.max(0, this.now().getTime() - started);
    const run: RunRecord = { agent: card.id, capability, kind, at: this.stamp(), ms, usd, outcome, model: result.model, via: result.via, user: mission.user?.id, by };
    node.runs.push(run);
    node.cost_usd += usd;
    mission.cost_usd += usd;
    const on = result.model ? ` on ${result.model}${result.via ? ` (${result.via})` : ''}` : '';
    const ended = outcome === 'ok' ? 'ran' : `${outcome} from`;
    this.event(node, `${ended} ${card.id}${on} ($${usd.toFixed(4)}, ${(ms / 1000).toFixed(1)}s)`);
    for (const gate of this.gates) await gate.after?.(run, call, this.contextFor(mission));
  }

  /** What a gate may read: every mission, with this one as it stands now. */
  private contextFor(current: Mission): GateContext {
    return {
      missions: async () => (await this.store.list()).filter((mission) => mission.id !== current.id).concat(current),
      now: () => this.now(),
    };
  }

  // ------------------------------------------------------------ finishing

  /** Every result ends here: checks, then approvals, then complete. */
  private async finish(mission: Mission, node: MissionNode, output: string): Promise<void> {
    node.output = output;
    node.output_hash = hashOf(output);
    node.summary = output.slice(0, 300);
    const rules = effectiveRules(mission, node, this.registry);
    for (const scoped of rules) {
      if (scoped.rule.kind !== 'check') continue;
      const passed = node.checks.some((c) => c.rule === scoped.fullId && c.output_hash === node.output_hash && c.verdict === 'pass');
      if (passed) continue;
      let record: CheckRecord;
      try {
        record = await this.runCheck(mission, node, scoped.fullId, scoped.rule);
      } catch (error) {
        if (error instanceof GateStop) return this.needsHuman(node, 'fix', `checker stopped: ${error.message}`);
        return this.handleFailure(mission, node, 'error', `checker failed: ${messageOf(error)}`);
      }
      node.checks.push(record);
      const score = record.score === undefined ? '' : ` (score ${record.score})`;
      if (record.verdict === 'pass') {
        this.event(node, `check ${scoped.fullId} passed${score}`);
        continue;
      }
      if (record.verdict === 'reject') return this.fail(node, `check ${scoped.fullId} rejected the output${score}: ${record.notes ?? ''}`);
      if (this.isIrreversible(node)) {
        return this.needsHuman(node, 'fix', `check ${scoped.fullId} asked for a revision, but \`${node.capability}\` is irreversible: a person decides${score}`);
      }
      const limit = scoped.rule.max_revisions ?? 2;
      if (node.revisions >= limit) {
        return this.fail(node, `check ${scoped.fullId} not passed after ${node.revisions} revisions${score}`);
      }
      node.revisions += 1;
      this.sendBack(mission, node, record.notes ?? `the check ${scoped.fullId} asked for a revision`);
      this.event(node, `check ${scoped.fullId} asked for a revision${score}: revision ${node.revisions} of ${limit}`);
      return;
    }
    const approvals = rules.filter((scoped) => scoped.rule.kind === 'approval');
    if (approvals.length && !node.approvals.some((approval) => approval.output_hash === node.output_hash)) {
      return this.needsHuman(node, 'approval', `waiting for approval (${approvals.map((scoped) => scoped.fullId).join(', ')})`);
    }
    this.complete(node);
  }

  private async runCheck(mission: Mission, node: MissionNode, fullId: string, rule: CheckRule): Promise<CheckRecord> {
    const checker = this.registry.get(rule.checker.agent_id);
    const capability = checker?.capabilities.find((c) => c.id === rule.checker.capability);
    if (!checker || !capability) throw new Error(`checker \`${rule.checker.agent_id}\` is missing or invalid`);
    const message = checkMessage(mission, node, rule, capability);
    const timeoutMs = (checker.constraints.max_runtime_minutes ?? 10) * 60_000;
    const call: Call = { mission, node, card: checker, capability: capability.id, kind: 'check' };
    const result = await this.call(call, async (gate): Promise<PlugResult & Timing> => {
      if (checker.runtime !== 'function') return this.callModel(call, message, CHECK_SCHEMA, timeoutMs, gate);
      const plug = this.plugs[checker.id];
      if (!plug) throw new Error(`no plug is registered for \`${checker.id}\``);
      const raw = await withTimeout(plug({ mission, node, card: checker, capability, message }), timeoutMs, checker.id);
      return typeof raw === 'string' ? { output: raw } : raw;
    });
    const parsed = parseVerdict(result.output);
    const score = parsed.score === undefined ? undefined : normalizeScore(parsed.score, capability.score_scale);
    let verdict = parsed.verdict;
    if (verdict === 'pass' && rule.min_score !== undefined && (score ?? 0) < rule.min_score) verdict = 'revise';
    return { rule: fullId, checker: checker.id, verdict, score, notes: parsed.notes, output_hash: node.output_hash!, at: this.stamp() };
  }

  // ------------------------------------------------------------ failures

  private async handleFailure(mission: Mission, node: MissionNode, kind: FailureKind, message: string): Promise<void> {
    this.event(node, `${kind}: ${message}`);
    if (this.isIrreversible(node)) {
      return this.needsHuman(node, 'fix', `${message}. \`${node.capability}\` is irreversible, so it is never retried automatically: check whether it happened, then resolve.`);
    }
    const card = this.registry.get(node.agent);
    const lower = message.toLowerCase();
    const mode = card?.failure_modes.find(
      (entry) =>
        entry.action !== undefined &&
        (entry.when === undefined || entry.when === kind) &&
        (!entry.match?.length || entry.match.some((word) => lower.includes(word.toLowerCase()))),
    );
    const action = mode?.action ?? (kind === 'refusal' ? 'needs-human' : 'fail');
    if (action === 'retry' || action === 'revise') {
      const limit = mode?.retries ?? 1;
      if (node.retries >= limit) {
        return this.fail(node, `${message} (gave up after ${node.retries} ${action === 'retry' ? 'retries' : 'revisions'})`);
      }
      node.retries += 1;
      this.sendBack(mission, node, action === 'revise' ? message : undefined);
      if (!node.children.length && mode?.delay_seconds) {
        node.not_before = new Date(this.now().getTime() + mode.delay_seconds * 1000).toISOString();
      }
      this.event(node, `${action} ${node.retries} of ${limit}${mode?.conductor_action ? `: ${mode.conductor_action}` : ''}`);
      return;
    }
    if (action === 'needs-human') {
      return this.needsHuman(node, 'fix', mode?.conductor_action ? `${message}. ${mode.conductor_action}` : message);
    }
    this.fail(node, message);
  }

  /** A person's retry: the node runs again, and what it blocked is unblocked. */
  private reopen(mission: Mission, node: MissionNode, note: string | undefined): void {
    this.sendBack(mission, node, note);
    clearOutcome(node);
    this.unblockDependents(mission, node.id);
    for (let parent = node.parent ? mission.nodes[node.parent] : undefined; parent; parent = parent.parent ? mission.nodes[parent.parent] : undefined) {
      const stuck = parent.status === 'failed' || (parent.status === 'needs-human' && parent.waiting_for === 'fix');
      if (stuck && parent.children.length) {
        parent.status = 'running';
        clearOutcome(parent);
        this.unblockDependents(mission, parent.id);
      }
    }
  }

  /**
   * Runs a node again. A worker runs again with the feedback. A team reopens
   * its children that did not finish, or, when all finished (its output was
   * sent back), its last steps, which get the feedback.
   */
  private sendBack(mission: Mission, node: MissionNode, feedback: string | undefined): void {
    if (feedback) node.feedback = feedback;
    node.waiting_for = undefined;
    if (node.children.length) {
      this.reopenChildren(mission, node, feedback);
      node.status = 'running';
    } else {
      node.status = 'pending';
      node.attempt += 1;
    }
  }

  private reopenChildren(mission: Mission, team: MissionNode, feedback: string | undefined): void {
    const children = team.children.map((id) => mission.nodes[id]!);
    const unfinished = children.filter((child) => child.status === 'failed' || child.status === 'blocked' || child.status === 'cancelled');
    const last = children.filter((child) => !children.some((other) => other.depends_on.includes(child.id)));
    for (const child of unfinished.length ? unfinished : last) {
      this.sendBack(mission, child, unfinished.length ? undefined : feedback);
      clearOutcome(child);
      this.event(child, unfinished.length ? 'reopened' : `sent back: ${feedback ?? 'run again'}`);
    }
  }

  private unblockDependents(mission: Mission, id: string): void {
    for (const other of Object.values(mission.nodes)) {
      if (other.status === 'blocked' && other.depends_on.includes(id)) {
        other.status = 'pending';
        this.event(other, `unblocked: ${id} is running again`);
        this.unblockDependents(mission, other.id);
      }
    }
  }

  // ------------------------------------------------------------ small things

  private isIrreversible(node: MissionNode): boolean {
    if (node.children.length) return false;
    return this.registry.get(node.agent)?.capabilities.find((c) => c.id === node.capability)?.irreversible === true;
  }

  private needsHuman(node: MissionNode, why: WaitingFor, message: string): void {
    node.status = 'needs-human';
    node.waiting_for = why;
    node.error = why === 'fix' ? message : undefined;
    this.event(node, message);
  }

  private fail(node: MissionNode, message: string): void {
    node.status = 'failed';
    node.waiting_for = undefined;
    node.error = message;
    node.completed_at = this.stamp();
    this.event(node, `failed: ${message}`);
  }

  private complete(node: MissionNode): void {
    node.status = 'complete';
    node.waiting_for = undefined;
    node.error = undefined;
    node.completed_at = this.stamp();
    this.event(node, 'complete');
  }

  private updateStatus(mission: Mission): void {
    if (mission.status === 'cancelled') return;
    const root = mission.nodes.root!;
    if (root.status === 'complete') {
      mission.status = 'complete';
      mission.output = root.output;
    } else if (root.status === 'failed' || root.status === 'blocked') {
      mission.status = 'failed';
    } else if (Object.values(mission.nodes).some((node) => node.status === 'needs-human')) {
      mission.status = 'needs-human';
    } else {
      mission.status = 'running';
    }
  }

  private event(node: MissionNode, text: string): void {
    node.events.push(`${this.stamp()} ${text}`);
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private async save(mission: Mission): Promise<void> {
    mission.updated_at = this.stamp();
    await this.store.save(mission);
  }

  private async mustLoad(id: string): Promise<Mission> {
    const mission = await this.store.load(id);
    if (!mission) throw new Error(`no mission \`${id}\``);
    return mission;
  }

  private mustNode(mission: Mission, id: string): MissionNode {
    const node = mission.nodes[id];
    if (!node) throw new Error(`mission ${mission.id} has no task \`${id}\``);
    return node;
  }
}

// ---------------------------------------------------------------- messages

/** What every worker receives: the task, the request, and the outputs it depends on. */
export function taskMessage(mission: Mission, node: MissionNode, capability: Capability): string {
  const lines = [node.description, '', '## Request', mission.request];
  const inputs = Object.entries(mission.inputs);
  if (inputs.length) lines.push(`Inputs: ${inputs.map(([key, value]) => `${key} = ${value}`).join(' · ')}`);
  const parent = node.parent ? mission.nodes[node.parent] : undefined;
  if (parent && parent.id !== 'root') lines.push(`Part of: ${parent.description}`);
  lines.push(`Expected output: ${capability.description}`);
  const earlier = receivedOutputs(mission, node);
  if (earlier.length) {
    lines.push('', '## Outputs from earlier tasks');
    for (const other of earlier) lines.push(`### ${other.id}: ${other.description}`, truncate(other.output ?? '', mission.id, other.id), '');
  }
  if (node.feedback) lines.push('', '## Feedback on your last attempt', node.feedback);
  return lines.join('\n').trimEnd();
}

/** A node gets its dependencies' outputs; a team's first tasks get what the team received. */
function receivedOutputs(mission: Mission, node: MissionNode): MissionNode[] {
  if (node.depends_on.length) return node.depends_on.map((id) => mission.nodes[id]!).filter((other) => other.output !== undefined);
  const parent = node.parent ? mission.nodes[node.parent] : undefined;
  return parent ? receivedOutputs(mission, parent) : [];
}

function checkMessage(mission: Mission, node: MissionNode, rule: CheckRule, capability: Capability): string {
  const scale = capability.score_scale ?? '0-100';
  return [
    'Check the output below against this rule.',
    `Rule: ${rule.reason}`,
    `It was meant to be: ${node.description}`,
    `Request: ${mission.request}`,
    '',
    `## Output to check (${node.id}: ${node.agent}/${node.capability})`,
    node.output ?? '',
    '',
    `Reply with JSON only: {"verdict": "pass" | "revise" | "reject", "score": <a number on a ${scale} scale>, "notes": "<what to fix, or why it passes>"}.`,
    'Use "revise" when it can be fixed, and "reject" only when it cannot be used at all.',
  ].join('\n');
}

function parseVerdict(text: string): { verdict: 'pass' | 'revise' | 'reject'; score?: number; notes?: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let value: unknown;
  try {
    value = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    throw new Error('the checker did not reply with JSON');
  }
  const record = value as { verdict?: unknown; score?: unknown; notes?: unknown };
  if (record.verdict !== 'pass' && record.verdict !== 'revise' && record.verdict !== 'reject') {
    throw new Error('the checker gave no verdict');
  }
  return {
    verdict: record.verdict,
    score: typeof record.score === 'number' ? record.score : undefined,
    notes: typeof record.notes === 'string' ? record.notes : undefined,
  };
}

function truncate(output: string, missionId: string, nodeId: string): string {
  if (output.length <= OUTPUT_LIMIT) return output;
  return `${output.slice(0, OUTPUT_LIMIT)}\n[truncated: full output in ${missionId}/${nodeId}]`;
}

// ---------------------------------------------------------------- helpers

function newNode(id: string, parent: string | null, agent: string, capability: string, description: string, dependsOn: string[]): MissionNode {
  return {
    id,
    parent,
    agent,
    capability,
    description,
    depends_on: dependsOn,
    status: 'pending',
    children: [],
    attempt: 1,
    retries: 0,
    revisions: 0,
    checks: [],
    approvals: [],
    runs: [],
    cost_usd: 0,
    events: [],
  };
}

function clearOutcome(node: MissionNode): void {
  node.waiting_for = undefined;
  node.error = undefined;
  node.completed_at = undefined;
  node.not_before = undefined;
}

function pickCapability(card: Card, wanted: string | undefined): Capability {
  if (wanted) {
    const found = card.capabilities.find((c) => c.id === wanted);
    if (!found) throw new Error(`\`${card.id}\` has no capability \`${wanted}\``);
    return found;
  }
  if (card.capabilities.length === 1) return card.capabilities[0]!;
  throw new Error(`\`${card.id}\` has several capabilities (${card.capabilities.map((c) => c.id).join(', ')}); name one`);
}

function childId(parent: string, index: number): string {
  return parent === 'root' ? `task-${index}` : `${parent}.${index}`;
}

function depthOf(id: string): number {
  return id === 'root' ? 0 : id.split('.').length;
}

function upstreamIndexes(index: number, steps: Step[], deps: string[][]): number[] {
  const found = new Set<number>();
  const visit = (at: number) => {
    for (const dep of deps[at] ?? []) {
      const target = steps.findIndex((step) => step.id === dep);
      if (target >= 0 && !found.has(target)) {
        found.add(target);
        visit(target);
      }
    }
  };
  visit(index);
  return [...found];
}

function describeSelector(selector: Selector): string {
  const capability = Array.isArray(selector.capability) ? selector.capability.join(' or ') : selector.capability;
  if (selector.agent_id && capability) return `\`${selector.agent_id}/${capability}\``;
  return `\`${selector.agent_id ?? capability}\``;
}

function describeStatus(node: MissionNode): string {
  return node.waiting_for ? `${node.status} (${node.waiting_for})` : node.status;
}

function checkAttempt(node: MissionNode, attempt: number | undefined): void {
  if (attempt !== undefined && attempt !== node.attempt) {
    throw new ConflictError(`${node.id} is on attempt ${node.attempt}, not ${attempt}`);
  }
}

function isFinished(mission: Mission): boolean {
  return mission.status === 'complete' || mission.status === 'failed' || mission.status === 'cancelled';
}

function hashOf(output: string): string {
  return `sha256:${createHash('sha256').update(output).digest('hex').slice(0, 16)}`;
}

function newMissionId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `m-${stamp}-${randomUUID().slice(0, 4)}`;
}

function kindOf(error: unknown): Exclude<FailureKind, 'rejected'> {
  if (error instanceof TimeoutError) return 'timeout';
  if (error instanceof RefusalError) return 'refusal';
  return 'error';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${what} ran past ${Math.round(ms / 1000)} seconds`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
