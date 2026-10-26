// Shared types for AgentOS: cards (what an agent is), missions (one request's
// tree of work), and the interfaces the conductor plugs things into.

// ---------------------------------------------------------------- cards

export type Runtime = 'model' | 'function' | 'human' | 'conductor';
export const RUNTIMES: readonly Runtime[] = ['model', 'function', 'human', 'conductor'];

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** One step of a recipe: a conductor's plan, written down in advance. */
export interface Step {
  id: string;
  assigned_agent: string;
  capability_match: string;
  /** Missing = depends on the previous step (a pipe). `[]` = depends on nothing. */
  depends_on?: string[];
  description?: string;
}

export interface Capability {
  id: string;
  description: string;
  complexity?: 'low' | 'medium' | 'high';
  /** `false` = a person approves this capability's output before it is used. */
  autonomous?: boolean;
  /** Conductors only: a recipe. Without steps, the planner plans the work. */
  steps?: Step[];
  /** Checkers only: the scale their scores use; thresholds are always 0–100. */
  score_scale?: '0-100' | '1-5' | '0-1';
  /** Conductors: words such as `/release` that pick this capability with no model call. */
  signals?: string[];
  /** Workers: the call cannot be taken back, so a failure is never retried automatically. */
  irreversible?: boolean;
}

/** Matches nodes by agent, capability, or both. */
export interface Selector {
  agent_id?: string;
  capability?: string | string[];
}

export interface ApprovalRule {
  id: string;
  kind: 'approval';
  applies_to?: Selector;
  reason: string;
}

export interface CheckRule {
  id: string;
  kind: 'check';
  applies_to?: Selector;
  checker: { agent_id: string; capability: string };
  min_score?: number;
  max_revisions?: number;
  reason: string;
}

export interface BeforeRule {
  id: string;
  kind: 'before';
  first: Selector;
  then?: Selector;
  reason: string;
}

export type Rule = ApprovalRule | CheckRule | BeforeRule;

export type FailureKind = 'error' | 'timeout' | 'refusal' | 'rejected';
export type FailureAction = 'retry' | 'revise' | 'needs-human' | 'fail';

export interface FailureMode {
  trigger: string;
  symptom?: string;
  conductor_action?: string;
  when?: FailureKind;
  match?: string[];
  action?: FailureAction;
  retries?: number;
  delay_seconds?: number;
}

/** The agent-level switch: is it on, who may use it, how much. */
export interface Switch {
  enabled?: boolean;
  used_by?: string[];
  max_runs_per_month?: number;
  max_usd_per_month?: number;
}

/** What is plugged into a model card (or a conductor's planner). */
export interface Plug {
  model: string;
  fallback?: string[];
  effort?: Effort;
  max_tokens?: number;
}

export interface Constraints {
  max_runtime_minutes?: number;
  requires_human_approval?: boolean;
  cost_per_run_usd?: number;
}

export interface Dependency {
  agent_id: string;
  reason?: string;
}

export interface Card {
  id: string;
  name: string;
  version: string;
  role: string;
  runtime: Runtime;
  /** Model cards: the agent's instructions (the `## Instructions` section). */
  instructions?: string;
  capabilities: Capability[];
  rules: Rule[];
  constraints: Constraints;
  dependencies: { required: Dependency[]; optional: Dependency[] };
  failure_modes: FailureMode[];
  switch?: Switch;
  plug?: Plug;
  /** Extra cards a team may hand work to, beyond its own folder. */
  routes_to: string[];
  /** Teams: the cards in the team's folder (filled in by the loader). */
  members: string[];
  /** Where the card came from (a file path), for error messages. */
  source?: string;
}

// ---------------------------------------------------------------- missions

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'needs-human'
  | 'complete'
  | 'failed'
  | 'blocked'
  | 'cancelled';

/** Why a node is in `needs-human`. */
export type WaitingFor = 'approval' | 'task' | 'fix';

export interface CheckRecord {
  rule: string;
  checker: string;
  verdict: 'pass' | 'revise' | 'reject';
  score?: number;
  notes?: string;
  output_hash: string;
  at: string;
}

export interface ApprovalRecord {
  rules: string[];
  by: string;
  output_hash: string;
  note?: string;
  at: string;
}

/** One call to an agent, kept for cost and for the switch's monthly limits. */
export interface RunRecord {
  agent: string;
  at: string;
  usd: number;
  model?: string;
  user?: string;
}

export interface MissionNode {
  id: string;
  parent: string | null;
  agent: string;
  capability: string;
  description: string;
  depends_on: string[];
  status: NodeStatus;
  waiting_for?: WaitingFor;
  /** Human nodes: what the person is asked to do. */
  instructions?: string;
  children: string[];
  plan_source?: 'recipe' | 'planner';
  output?: string;
  output_hash?: string;
  summary?: string;
  error?: string;
  /** +1 every time the node is dispatched again, for any reason. */
  attempt: number;
  retries: number;
  revisions: number;
  feedback?: string;
  not_before?: string;
  checks: CheckRecord[];
  approvals: ApprovalRecord[];
  runs: RunRecord[];
  cost_usd: number;
  started_at?: string;
  completed_at?: string;
  events: string[];
}

export type MissionStatus = 'running' | 'needs-human' | 'complete' | 'failed' | 'cancelled';

/** Who started a mission: checked against each card's `switch.used_by`. */
export interface Caller {
  id: string;
  groups?: string[];
}

export interface Mission {
  id: string;
  request: string;
  inputs: Record<string, string>;
  user?: Caller;
  status: MissionStatus;
  budget_usd: number;
  cost_usd: number;
  nodes: Record<string, MissionNode>;
  created_at: string;
  updated_at: string;
  output?: string;
}

// ---------------------------------------------------------------- plugs

/** What a worker receives when the conductor hands it a node. */
export interface Task {
  mission: Mission;
  node: MissionNode;
  card: Card;
  capability: Capability;
  /** The task message: description, request, inputs, earlier outputs, feedback. */
  message: string;
}

export interface PlugResult {
  output: string;
  cost_usd?: number;
  model?: string;
}

/** Code plugged into a `function` card. */
export type FunctionPlug = (task: Task) => Promise<string | PlugResult>;

export interface ModelRequest {
  model: string;
  system: string;
  prompt: string;
  effort?: Effort;
  /** When set, the reply must be JSON matching this schema. */
  schema?: Record<string, unknown>;
  max_tokens?: number;
}

export interface ModelResponse {
  text: string;
  /** The model that actually answered (a server-side fallback can change it). */
  model: string;
  cost_usd?: number;
}

/** Runs `model` cards and the planner. */
export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export class RefusalError extends Error {
  readonly category: string | null;
  constructor(message: string, category: string | null = null) {
    super(message);
    this.name = 'RefusalError';
    this.category = category;
  }
}

export interface PlanRequest {
  mission: Mission;
  node: MissionNode;
  team: Card;
  capability: Capability;
  /** The cards this team may hand work to. */
  allowed: Card[];
  /** Why the previous plan was rejected; empty on the first try. */
  violations: string[];
}

export interface PlanResult {
  steps: Step[];
  cost_usd?: number;
  model?: string;
}

export interface RouteRequest {
  mission: Mission;
  node: MissionNode;
  team: Card;
  /** A person's note from an earlier try, if any. */
  note?: string;
}

export interface RouteResult {
  /** The capability that fits, or null when none does. */
  capability: string | null;
  reason?: string;
  cost_usd?: number;
  model?: string;
}

/**
 * The conductor's model: plans a capability that has no recipe, and picks a
 * capability when a request names none and no signal matches.
 */
export interface Planner {
  plan(request: PlanRequest): Promise<Step[] | PlanResult>;
  route?(request: RouteRequest): Promise<RouteResult>;
}

export interface MissionStore {
  load(id: string): Promise<Mission | undefined>;
  save(mission: Mission): Promise<void>;
  list(): Promise<Mission[]>;
}
