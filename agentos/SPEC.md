# AgentOS — Specification

Version: 0.1.0
Status: Draft. Not built yet.
Grows out of: Conductor v1 (1.0.0, May 2026)

## 1. What this is

AgentOS is a small operating system for agents, each described by a plain-text **card**. It turns each request into a tree of tasks, hands each task to the right agent, enforces the cards' rules and keeps a full record.

AgentOS is the v1 Conductor, grown up: the conductor becomes the **kernel**, a small core that, like v1, does no work itself. The new idea is the **sub-conductor**: a card that does its job by handing pieces to other cards. Its parent routes to it like any agent and never knows it is a team.

The kernel knows nothing about any domain: no domain word appears in its code, prompts or API. Each domain lives in a **pack**, a folder of cards.

### Words used in this spec

| Word | Meaning |
|---|---|
| Card | One markdown file describing one agent. |
| Agent | Anything that does work: an MCP server, an A2A agent, a batch job, a person, a team. |
| Worker | A card that does its job itself. |
| Conductor | A card with `runtime: conductor`: it hands pieces of its job to other cards. A **sub-conductor** is one that another conductor routes to. |
| Mission | One request, from arrival to result. |
| Node | One task in a mission: v1's subtask, plus a parent. |
| Checker | A worker that a `check` rule names. It returns JSON: `verdict` (pass, revise or reject), `score`, `notes`. |
| Recipe | A conductor capability's `steps`: its plan, written down in advance. |
| Runtime | How the kernel reaches an agent. |
| Rule | Something the kernel enforces: `before`, `check` or `approval`. |
| Upstream | A is upstream of B when B waits on A, directly or through other nodes. |
| Deterministic | Decided by fixed code, with no Claude call. |

### What changed from v1

| v1 | AgentOS |
|---|---|
| The conductor; `agents/*.md` | The kernel; `packs/<pack>/*.md`. Same card format: v1 cards using only v1's documented keys load unchanged (§6, §7). |
| A flat list of subtasks | A tree of nodes. |
| POST /missions blocks until done | Returns 202 at once; a background loop does the work. |
| Approvals, dependencies and failure modes were prompt text or logs | Rules and actions, enforced in code. |
| No context passing | Each node gets the outputs of the nodes it depends on. |
| Queue results were never collected | Queue workers hand results back through the API. |
| The live run planned again after a dry run | The tree you dry-ran is the tree that runs. |
| `claude-sonnet-4-20250514` | `claude-opus-5-5` |

## 2. Design rules

### The operating-system idea

| OS idea | AgentOS |
|---|---|
| Program | Agent |
| Program manifest | Card |
| Kernel / scheduler | The kernel's background loop |
| Process starting a child | A conductor handing work to a sub-conductor |
| Process tree | Mission tree |
| Permissions | Rules |
| Resource limits | Budgets, depth limits |
| Blocked waiting on input | `needs-human` |
| Drivers | Runtimes |
| Packages | Packs |
| Logs | The record |

```
  requests ──► ADAPTERS ──► KERNEL ──► ADAPTERS ──► results
                              │
                    RUNTIMES  (mcp · a2a · queue · human · conductor)
                              │
                    PACKS of CARDS  (workers · sub-conductors)
```

### Design rules from the Unix tradition

1. **A tiny kernel**, small enough to read in one sitting (target: under 2,000 lines of Python).
2. **Everything is a card**: agents, teams, checkers, human roles, the root. No hidden built-in agent.
3. **Each card does one job.** A builder builds; a checker checks; a conductor hands out work.
4. **Compose.** Recipes chain cards the way pipes chain programs.
5. **Plain text.** Markdown and YAML: versioned, diffable, editable by people who are not engineers.
6. **Standard interfaces at the edges**: MCP and A2A.

### Design rules for sub-conductors

Why sub-conductors exist (each holds within the depth limit, §11):

- **Stays simple.** The parent knows WHAT a sub-conductor does, not HOW. `release` knows `build-and-test` returns a tested build, not what is inside.
- **Rules stay local.** A rule about one part of the work lives on that part's conductor. "Every test must pass" lives on `build-and-test`.
- **It's reusable.** Any workflow can call the same sub-conductor. A future `mobile-release` conductor could route to `build-and-test` and call `build-and-verify` unchanged.
- **It's swappable.** Replace a sub-conductor with a single agent (or the other way round) by swapping the card; the parent never notices. A CI agent card with the same agent_id and capability could replace `build-and-test`.

## 3. Directory structure

```
agentos/
├── api.py         # Flask: HTTP endpoints and auth
├── kernel.py      # card parser, missions, the loop, routing, rules, record
├── runtimes.py    # mcp, a2a, queue, human, conductor
├── start.sh       # gunicorn launch script
├── packs/         # cards: root.md, events/, release/, hiring/
└── state/         # written by the kernel
    ├── mission-YYYYMMDD-HHMMSS-xxxx.json   # one file per mission
    ├── queue/<agent-id>/*.json             # job files for queue workers
    └── proposals/*.diff                    # recipe proposals
```

## 4. Environment

Required: `ANTHROPIC_API_KEY` (Claude calls) and `AGENTOS_API_KEY` (API auth, §13). Optional:

| Setting | Default | Purpose |
|---|---|---|
| AGENTOS_PORT | 8090 | gunicorn port |
| AGENTOS_ROOT | root | agent_id of the root conductor |
| AGENTOS_MODEL | claude-opus-5-5 | model for every Claude call |
| AGENTOS_DEFAULT_BUDGET_USD | 10.00 | budget when a request gives none (§11) |
| AGENTOS_TOKEN_PRICES | — | USD per million input and output tokens, per model (§15) |
| AGENTOS_PROMOTE_AFTER | 3 | successful Claude plans before a recipe is proposed (§15) |
| AGENTOS_RUNTIME_ALIASES | {} | old runtime names mapped to new ones (§7) |

The limits in §11 are set as AGENTOS_MAX_DEPTH, AGENTOS_MAX_NODES and AGENTOS_MAX_RETRIES.

Python dependencies are v1's: anthropic, flask, gunicorn, httpx, pyyaml.

## 5. Running the service

```
gunicorn --bind 0.0.0.0:${AGENTOS_PORT:-8090} --workers 1 --threads 4 --timeout 300 api:app
```

Keep **one** worker: the loop lives in it. Cards are re-read when they change; restart only after code changes, as in v1. Mount `state/` on a persistent volume.

## 6. Cards

### Format

A card is v1's agent card: identity and interface fields as bold bullets, everything else in YAML blocks read by their top-level key. Other text is for people. Write `true` or `false` for yes/no values. From `packs/release/changelog-writer.md`:

````markdown
# Changelog Writer

## Identity
- **agent_id**: `changelog-writer`
- **name**: Changelog Writer
- **version**: `1.0.0`
- **role**: Writes the user-facing changelog for one build from the changes merged since the last release.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://changelog.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
```yaml
capabilities:
  - id: write-changelog
    description: "Write the changelog for this build: new features, fixes and known issues, in plain language for users."
    complexity: low
    autonomous: true
```
````

Required: `agent_id`, `name`, `version`, `role`, `runtime` (§7), and `endpoint` when the card or any capability uses `mcp` or `a2a`. A file without `agent_id` is listed under `skipped_files`. `transport` is informational.

### Blocks

| Top-level key | v1? | Strict? | Holds |
|---|---|---|---|
| capabilities | v1 | yes | What the card can do. At least one. |
| routes_to | new | yes | Required on conductors: who they may hand work to. |
| rules | new | yes | The card's rules (§10). |
| constraints | v1 | yes | `max_runtime_minutes`, `requires_human_approval`, `cost_per_run_usd`; new `max_concurrent` (§11), for v1's agent that "cannot run multiple clients in parallel". |
| dependencies | v1 | yes | `required` and `optional` lists of `{agent_id, reason}`. |
| failure_modes | v1 | no | What can go wrong and what to do (§11). |
| tools, context_files | v1 | no | Informational; `context_files` go into the task message. |

A mistake in a strict block makes the card invalid (below); a non-strict block that fails to parse is skipped with a warning, as in v1.

### Capability fields

| Field | v1? | Meaning, and the v1 gap it fixes |
|---|---|---|
| id, description | v1 | Required. Rules and recipes use the id. |
| complexity | v1 | low, medium or high. Default medium. |
| autonomous | v1 | Default true. `false`: a person approves the output (§10). |
| signals | new | Conductors: exact words, such as `/release`, that route here with no Claude call. |
| steps | new | Conductors: a recipe. Without steps, Claude plans the capability. |
| runtime | new | Workers: overrides the card's runtime. v1 had an agent with overnight and on-demand modes, and no way to say so. |
| call | new | `mcp` only: maps onto a tool with another name or arguments. v1 forced tool name = capability id. |
| score_scale | new | Checkers: `"0-100"` (default), `"1-5"` or `"0-1"`; all thresholds use 0–100. |
| irreversible | new | Workers: the call cannot be taken back (§8). |

### Recipes and `call:`

A recipe uses v1's subtask field names. From `build-and-test`:

```yaml
    steps:
      - id: build
        assigned_agent: builder
        capability_match: build-release
      - id: test
        assigned_agent: test-runner
        capability_match: run-tests
```

No `depends_on`: each step takes the one before, like a pipe. To branch, list step ids in `depends_on`, as `release` does. Step *i* becomes node `<parent id>.<i>` (`task-<i>` under the root, as in v1). `description` is optional. A recipe is checked when the card loads (§9).

By default an MCP call uses the capability id as the tool name, with one argument, `mission`, holding the task message (v1's payload). `call:` maps it elsewhere. From `builder`:

```yaml
    call:
      tool: start_build
      arguments:
        branch: "{inputs.branch}"
        version: "{inputs.version}"
        instructions: "{message}"
```

Placeholders: `{message}` (the task message, §8), `{description}`, `{node_id}`, `{inputs.<name>}`. A missing input is an error at dispatch (`missing input: branch`), never a silent blank.

### Invalid and skipped cards

A card is **invalid** when:
- a strict block has a parse error, an unknown key (so a typo like `autonomus` cannot drop an approval) or a bad value, or a required field is missing;
- a recipe names an agent outside `routes_to`, an invalid card or a missing capability, has a cycle, or breaks the rules of its own card or of the cards it uses;
- conductor cards form a cycle through `routes_to`;
- two cards share an agent_id;
- a capability is `irreversible` and also needs approval, which would come after the act (approve a plan step first, as `deployer` does).

An invalid card cannot be routed to; GET /agents shows it with `valid: false` and its `errors`. It is never half-loaded: dropping a rules block would silently drop rules.

## 7. Runtimes

A runtime is a driver. Runtimes are named by protocol, never by host.

| runtime | The kernel sends | The result comes back | Node status meanwhile |
|---|---|---|---|
| mcp | MCP `tools/call` to `endpoint` | in the call's response | running |
| a2a | an A2A task to `endpoint` | the loop follows the task | waiting (agent) |
| queue | a job file in `state/queue/<agent-id>/` | the outside worker calls `resolve` | waiting (queue) |
| human | instructions on the node | the person calls `resolve` | needs-human (task) |
| conductor | nothing; it plans children in-process (§9) | its children finish | running |

Every result goes through `finish()` (§8), so no runtime can skip a rule.

**mcp** (v1's hosted MCP runtime): JSON-RPC 2.0 over HTTP, after MCP's `initialize` handshake, with v1's payload unless `call:` says otherwise (§6). The text of `result.content` is the output; a JSON-RPC error or `result.isError` is an error. The call times out after `max_runtime_minutes` (default 10).

**a2a** (new): the kernel sends the task message, saves the task id, and reads the task once per loop tick (§8) until it ends. If the agent answers with a plain message instead of a task, that message is the output.

| A2A task state | AgentOS |
|---|---|
| submitted, working | waiting (agent) |
| input-required | needs-human (answer); `answer` replies to the same task |
| auth-required | needs-human (auth); a person gives the agent its credentials, outside AgentOS |
| completed | finish, with the task's artifacts as output |
| failed / rejected | raises `error` / `rejected` |
| canceled | cancelled if AgentOS asked, otherwise raises `error` |

These state and method names (such as `message/send`, `tasks/get`) come from secondary sources and vary by version: confirm them against yours.

**queue** (v1's overnight queue, generalized): the kernel writes one job file, and the node waits.

```json
{"mission_id": "mission-20261013-140500-7c2e", "node_id": "task-1.2", "attempt": 1,
 "agent_id": "security-scan", "capability": "full-scan", "message": "<the task message>",
 "reply_to": "/api/agentos/missions/mission-20261013-140500-7c2e/nodes/task-1.2/resolve"}
```

The file name, `<mission_id>.<node_id>.a<attempt>.json`, makes a rewrite after a crash harmless. An outside worker (a nightly batch, a cron job) claims a job by renaming its file, then calls `resolve`. The kernel deletes the file once the node stops waiting; a retry writes a new one. A worker on another machine needs a shared folder or a small bridge script: an adapter, not a kernel concept.

**human** (v1's human and plugin runtimes, merged): the task message becomes the node's instructions, and the person calls `resolve` with the output.

A capability's `runtime` overrides the card's: `security-scan` runs on `queue`, but its `quick-scan` and `update-database` run on `mcp`. v1's runtime values named hosts. They load through AGENTOS_RUNTIME_ALIASES, a JSON map from old name to `mcp`, `queue` or `human`, so the kernel holds no host names.

## 8. How the kernel works

### A mission is a tree

POST /missions writes `state/mission-<id>.json` and returns 202; the request thread does nothing else. The mission file is the tree: v1's `subtasks` list, each node gaining `parent`. Node ids are paths, and depth is the number of parts: `task-1.1.1` is depth 3. The mission itself is node `root`, depth 0.

A node keeps v1's subtask fields, in order, then adds the new ones. `task-1.4` from §17, after Dana's approval:

```jsonc
{
  "id": "task-1.4",
  "description": "Write the deploy plan for one build: …",
  "assigned_agent": "deployer",
  "capability_match": "plan-deploy",
  "depends_on": ["task-1.1", "task-1.2", "task-1.3"],
  "status": "complete",
  "output": "Deploy plan for 2.4.0-418: …",
  "error": null,
  "retries": 0,
  "started_at": "2026-10-14T01:40:20Z",
  "completed_at": "2026-10-14T09:12:05Z",
  "parent": "task-1",                  // new from here on
  "runtime": "mcp",                    // after any capability override
  "waiting_for": null,                 // why it waits (below)
  "attempt": 1,                        // +1 on every new dispatch, for any reason
  "revisions": 0,
  "output_hash": "sha256:b41f…",       // what checks and approvals bind to
  "summary": "Rolling deploy in four steps.",  // for the parent's synthesis
  "feedback": null,                    // notes for the next attempt
  "checks": [{"rule": "deployer/autonomous-plan-deploy", "by": "dana", "output_hash": "sha256:b41f…"}],
  "handle": {},                        // task id, job file or intent
  "cost_usd": 0.15,
  "events": ["…"]                      // append-only log
}
```

Conductors add `plan_source` (`recipe` or `claude`) and `budget_usd`. The mission file adds `inputs`, `budget_usd`, `cost_usd`, `dry_run` and `estimate` to v1's fields. A v1 mission file reads as a tree of depth 1.

### Statuses: waiting without holding a thread

Every wait is a status on disk, never a held thread. Only `waiting` and `cancelled` are new.

| Node status | Meaning |
|---|---|
| pending | Not started: waiting on dependencies, a retry delay or a free slot |
| running | A call is in flight, or a conductor's children are working |
| waiting | Out of the process: a queue job, an A2A task or a check |
| needs-human | A person must act |
| complete | Done, with a recorded pass for every rule that applies |
| failed | No recovery left (`resolve` retry can reopen it) |
| blocked | A dependency failed, was blocked or was cancelled |
| cancelled | The mission was cancelled |

| Why it waits (`waiting_for`) | Status | What moves it |
|---|---|---|
| retry | pending | the retry delay ends |
| slot | pending | a `max_concurrent` slot frees up |
| queue | waiting | the queue worker's `resolve` |
| agent | waiting | the loop reads the A2A task each tick |
| check | waiting | the checker's verdict |
| approval | needs-human | `approve` or `reject` |
| answer | needs-human | `answer`: the A2A agent asked a question |
| auth | needs-human | the agent gets its credentials; the loop keeps reading |
| task | needs-human | the person's `resolve` (human runtime) |
| fix | needs-human | a person's `resolve`: a failure, a rule or a crash needs a decision |

| Mission status | Meaning |
|---|---|
| planned | Dry run: the whole tree is planned, and nothing ran |
| executing | Work can move without anyone outside acting |
| awaiting | Nothing can move until someone outside acts: every open worker waits on a queue, an A2A agent or a person, or is pending behind one |
| complete | Every node completed |
| partial | Done; some workers completed, others did not |
| failed | Done; no worker completed |
| cancelled | Cancelled through the API |

### The loop

One background thread, the kernel's scheduler, moves every open mission forward once a **tick** (10 seconds), oldest first. It dispatches nodes whose dependencies are complete (a conductor plans; a worker is called), blocks those whose dependency failed, finishes conductors whose children are done, and reads each A2A task. Slow calls (MCP, Claude) run on four helper threads, so the loop never stalls. Every change is saved before the next step, so a restart loses nothing. API actions step the mission at once.

Every result ends in one function:

```python
def finish(node, output):
    node.output, node.output_hash = output, sha256(output)
    if not all_checks_passed(node): return set_status(node, "waiting", "check")
    if needs_approval(node) and not approved(node, node.output_hash):
        return set_status(node, "needs-human", "approval")
    record_before_rules(node)
    return set_status(node, "complete")
```

### Record before acting, and restart

Starting an A2A task, and any capability marked `irreversible: true`, cannot be taken back. For these the kernel saves the intent (`handle.intent`), makes the call, then saves the outcome (the task id or the result). They are never re-sent automatically when the outcome is unknown.

On start, the loop picks up every open mission from disk. A node with an intent but no outcome goes to needs-human (fix): "This call may have happened. Check, then resolve." Any other cut-off MCP call counts as a retry. A2A nodes keep reading their task, queue nodes keep waiting, and a conductor with no children plans again.

### Context flow

Every runtime gets the same task message:

```
<the node's description>

## Mission
<the mission objective, word for word>
Inputs: version = 2.4.0 · branch = release/2.4
Part of: <the parent's description>
Expected output: <the capability's description>
Context files: <the card's context_files>

## Outputs from earlier tasks
### task-1.1: <its description>
<the output of task-1.1>

## Feedback on your last attempt
<checker notes, a person's note, or the error>
```

`Inputs` are the request's named values (§13). The rest:
1. A node receives the outputs of its own `depends_on` nodes, and no others.
2. A conductor's first children (those that depend on no sibling) also receive the outputs the conductor itself received, so outputs cross levels.
3. Each earlier output is cut at 20,000 characters, with the marker `[truncated: full output in <mission_id>/<node_id>]`. The full output stays in the mission file.

Every node returns its output and a short summary (a JSON output's `summary` field, or its first 300 characters). A conductor's output is its children's outputs, labelled, in order; its summary is Claude's synthesis of theirs.

## 9. Routing and planning

Only conductor nodes route. The kernel picks a capability, then a plan, deterministic options first.

Which capability:
1. **Named.** The parent's recipe or plan set `capability_match` (always so below the mission's first conductor), or the request named a `capability`.
2. **Signals.** The objective's first word matches a capability's `signals` (exact, ignoring case). `/release` matches `ship-release` on the root.
3. **Claude classifies** (effort `low`). If it answers "none", the node goes to needs-human (fix): "No capability fits this request." A person retries with a note for Claude, or fails it. This replaces v1's built-in human/manual assignment.

Which plan:
1. **Recipe.** The capability has `steps`: expand them. No Claude call.
2. **Claude plans** (effort `high`), using only the cards in `routes_to`.

**Leaf bias** (workers are the tree's leaves). If one worker capability fits, the plan assigns it directly instead of decomposing. Conductors cost more and use up depth, so the planner sees them last, and not at all near the depth limit.

### The validator

Every plan, recipe or Claude, passes the same deterministic code before any child exists:
1. Shape: unique ids; `depends_on` names only siblings, with no cycle; at least one step.
2. Cards: each agent is in `routes_to` (or is a checker named by a rule that applies), its card is valid, and the capability exists.
3. No routing to the node itself or any ancestor.
4. Depth, size and budget (§11).
5. Rules: the plan-time checks (§10), over the whole known tree.

A failing Claude plan gets one re-plan with the violations listed; if it still fails, the node goes to needs-human (fix). The kernel never adds a missing step itself. A recipe is never re-planned: breaking its own card's rules makes the card invalid at load, and breaking an inherited rule sends the node to needs-human (fix).

### Claude calls

There are three: classify (effort `low`), plan (`high`), and synthesize when a conductor's children are done (`low`; `medium` for the root, which writes v1's mission summary). Adaptive thinking is always on for claude-opus-5-5; effort sets its depth and defaults to `medium`, so the kernel always sets it. Plans come back as valid JSON through structured outputs, never forced `tool_choice` (a 400 on this model).

```python
resp = client.beta.messages.create(
    model=AGENTOS_MODEL,                                    # "claude-opus-5-5"
    max_tokens=16000,
    betas=["server-side-fallback-2026-07-01"],
    fallbacks="default",
    system=[{"type": "text",
             "text": PLANNER_RULES + render_registry(card),  # sorted, byte-stable: caches once
             "cache_control": {"type": "ephemeral"}}],          # past the model's minimum length
    messages=[{"role": "user", "content": plan_request(node)}],  # volatile, after the cache
    output_config={"effort": "high",
                   "format": {"type": "json_schema", "schema": plan_schema(card)}},
)
if resp.stop_reason == "refusal":                           # check before reading content
    return handle_failure(node, when="refusal")
if resp.stop_reason != "end_turn":                          # e.g. max_tokens: JSON cut off
    return handle_failure(node, when="error")
plan = json.loads(next(b.text for b in resp.content if b.type == "text"))
```

`render_registry` renders the `routes_to` cards as v1 did, with failure-mode advice, sorted by agent_id. `plan_request` holds what changes: description, objective, inputs, effective rules, budget and depth left, the track record of cards in scope (§15), and any violations. `plan_schema` asks for `subtasks` with v1's fields. A refused synthesis falls back to a plain list of the children's summaries.

## 10. Rules

Rules are enforced in code, in three kinds.

| Kind | Means | Checked at plan time |
|---|---|---|
| before | `first` is complete before `then` runs | a `first` node is upstream of every `then` node |
| check | the output of `applies_to` must pass `checker` | a checker node depends on every `applies_to` node |
| approval | a person approves the output of `applies_to` before anything downstream uses it | listed in the dry run |

From `release` and `build-and-test`:

```yaml
rules:
  - id: scan-before-deploy
    kind: before
    first: {agent_id: security-scan, capability: [full-scan, quick-scan]}
    then: {agent_id: deployer}
    reason: "Nothing is planned for production or deployed until the same build has been scanned."
```

```yaml
rules:
  - id: tests-must-pass
    kind: check
    applies_to: {agent_id: builder}
    checker: {agent_id: test-runner, capability: run-tests}
    min_score: 100
    max_revisions: 2
    reason: "A build moves on only when every test passes."
```

Every rule has `id`, `kind` and `reason`; its full id is `<agent_id>/<id>`. An approval rule needs only `applies_to`, as in `hiring-loop/approve-shortlist`. A selector (`first`, `then`, `applies_to`, `checker`) matches on every key it gives: `agent_id`, `capability` (one or a list), or both; `checker` needs both. `check` also takes `min_score` (0–100) and `max_revisions` (default 2). On a worker card, a missing `then` or `applies_to` means the card's own nodes. Any other key makes the card invalid.

### v1 fields are rules

| v1 field on card C | Becomes | Full id |
|---|---|---|
| capability K has `autonomous: false` | approval, applies_to {agent_id: C, capability: K} | `C/autonomous-K` |
| `constraints.requires_human_approval: true` | approval, applies_to {agent_id: C} | `C/requires-human-approval` |
| `dependencies.required: [{agent_id: X}]` | before, first {agent_id: X}, then {agent_id: C} | `C/required-X` |

### Where rules apply

Rules a **conductor** card writes apply to its whole subtree, itself included. Rules on a **worker** card apply to its own nodes wherever they run. Compiled v1 rules always apply to the card's own nodes, conductor or worker. A node's effective rules are those of every conductor on its path from the root, plus its own card's. Children can add rules, never remove them; no syntax switches one off. When two rules apply, both must hold, so the stricter wins.

### Plan time

Each time a plan joins the tree, the kernel re-checks the whole known tree.
- **before:** under `release/scan-before-deploy`, every deployer node must wait on a scan, directly or through other nodes, at any level: the scan may sit inside a sibling sub-conductor or upstream of the parent. If the only candidate is a conductor that has not planned yet, the rule "may match" and is re-checked when it plans.
- **check:** the checker node must be in the same plan; the kernel never adds it. A checker is never subject to the rule that names it.

### Completion time

`finish()` runs checks, then approvals, then records `before` passes. A node cannot complete without a recorded pass for every rule that applies.

**Checks.** A node under a check rule goes to waiting (check) when it produces output. Its checker depends on it and may now start: it is the only node allowed to use an output that is still waiting. The score becomes 0–100 by `score_scale`: `"0-100"` as is, `"1-5"` as (score − 1) × 25, `"0-1"` as score × 100.
- **pass**, with at least `min_score` if set: a pass bound to the `output_hash` is recorded; the checked node moves on and the checker completes.
- **revise**, or a score under `min_score`: the checked node raises `low_score` (§11). By default it is revised with the checker's notes as feedback, up to `max_revisions`, and its checker goes back to pending.
- **reject**: the checked node fails. Its card's `when: rejected` entries cannot soften this; they act only on a person's or an A2A agent's rejection.

No verdict and no score is an error on the checker. If a checker node ends failed, blocked or cancelled, every node waiting (check) on it raises `error`, `checker failed: <node id>`.

**Approvals.** The node goes to needs-human (approval). `approve` must carry the current `output_hash`, or it gets 409; the approval is recorded with who, when and that hash. A revised output has a new hash and needs approval again, so a person always approves the exact output that moves on.

## 11. Failures and limits

### Failure modes

v1's `trigger`, `symptom` and `conductor_action` stay. New optional fields make the action happen. From `changelog-writer`:

```yaml
failure_modes:
  - trigger: "Cold start"
    symptom: "The first call after an idle period times out"
    conductor_action: "Retry once after 10 seconds. The server is warm by then."
    when: timeout
    action: retry
    retries: 1
    delay_seconds: 10
```

| `when` | Raised when | Default if no entry matches |
|---|---|---|
| timeout | a call ran past `max_runtime_minutes` (on a conductor: one Claude call, not the node); an A2A task is still open then | mcp: retry once after 5 seconds (v1). a2a: fail. |
| error | the runtime or a resolve reported an error, a checker failed, or a conductor's children failed (`children failed: …`) | fail |
| refusal | Claude refused to classify or plan | needs-human |
| low_score | a checker said revise, or the score is under `min_score` | revise, up to `max_revisions`, then fail |
| rejected | a person rejected the output, or an A2A agent rejected the task | fail |

The kernel takes the first entry on the node's own card whose `when` matches and, if `match` is given, whose error text contains a `match` string (ignoring case). On an A2A timeout it always cancels the task first; a retry then starts a new task, recorded before acting.

| `action` | What the kernel does |
|---|---|
| retry | Runs the node again after `delay_seconds` (default 5). |
| revise | Runs it again with notes as feedback: the checker's, the person's, or the error. |
| run_first | Adds one sibling (`run_first: {agent_id, capability}`) at the next free index, such as task-1.6, makes this node depend on it, and runs this node again. Once per entry per node, validated like a plan: the only way a node joins after planning. |
| needs-human | Stops, showing `conductor_action`, until a person resolves it (§13). |
| fail | Fails the node. |

`retries` (default 1) caps how often one entry acts on a node. An entry with no `action` works as in v1: logged, and shown to the planner as advice. An irreversible call or an A2A start whose outcome is unknown (it timed out or was cut off) always goes to needs-human (fix).

### How failure spreads

A failed, blocked or cancelled node blocks the siblings that depend on it (v1's rule), and a failed checker raises `error` on the nodes awaiting its verdict; the others keep going. A conductor whose children are done but not all complete raises `error` (`children failed: task-1.3 (failed)`); by default it fails and blocks its own dependents. `resolve` retry on a failed node reopens it and the dependents it blocked, and returns to running every ancestor that failed or went to needs-human (fix) because its children failed.

### Limits and budget

| Limit | Default |
|---|---|
| Depth: a node at the maximum depth must be a worker | 4 (the release pack uses root → conductor → sub-conductor → workers, so any of its workers can still become a team) |
| Nodes per mission, run_first nodes included | 40 |
| Retries per node (check revisions use `max_revisions`) | 2 |
| `max_concurrent`: a card's nodes running or waiting (queue, agent) at once, across all missions; the rest wait as pending (slot). Needs-human and waiting (check) take no slot. | unlimited |

**Budget.** The mission budget is the request's `budget_usd`, or the default. A worker's estimate is its average real cost after 5 runs; before that, `cost_per_run_usd` (0.25 if none, 0 for human cards). A conductor's estimate is its own `cost_per_run_usd` (its Claude calls) plus its children's. Each conductor keeps its own cost, sets aside its workers' estimates, and splits the rest among its conductor children by estimate; a plan that does not fit is invalid. In §17, root keeps 0.05 of 10.00 and passes 9.95 to release; release keeps 0.10, sets aside 0.68 for its four workers, and gives build-and-test 9.17. Each attempt is charged its real cost if reported, else its estimate. A dispatch that would overrun any ancestor's budget fails with `budget_exceeded`, which nothing retries past.

## 12. Dry run

Pass `"dry_run": true`. The kernel plans the whole tree and runs no worker: recipes expand, Claude plans every other conductor (with placeholder inputs), and the validator runs at every level. The mission ends `planned`, with an estimate. For §17's release:

```json
"estimate": {"cost_usd": {"expected": 1.48, "worst": 4.44}, "budget_usd": 10.00, "within_budget": true,
             "approvals": ["task-1.4"], "waits": ["task-1.2: queue (security-scan)"], "violations": []}
```

Every mission records this `estimate` once planned; a dry run stops there. `worst` is expected × (1 + AGENTOS_MAX_RETRIES). POST /missions/{id}/run then runs exactly that tree, planning nothing again, except declared `run_first` nodes, each validated as it joins. It re-validates against the current cards first, and answers 409, naming the cards, if any changed.

## 13. API reference

All paths are under `/api/agentos/` (v1: `/api/conductor/`). Every endpoint except GET /healthz needs `Authorization: Bearer <AGENTOS_API_KEY>`, compared in constant time; an unset key means 401 everywhere.

| Method and path | v1? | What it does |
|---|---|---|
| GET /healthz | v1 | `{"status": "ok", "service": "agentos", "last_tick": "…"}`. No auth. |
| GET /agents | v1 | Every card, with `valid`, `errors`, `warnings`, compiled `rules`, `track_record`, `proposals`; plus `skipped_files`. |
| POST /missions | v1 | Starts a mission (below). |
| GET /missions | v1 | All missions, newest first, with `waiting_count` and `cost_usd`. |
| GET /missions/{id} | v1 | The mission file. `?view=tree` gives a text tree (§17). |
| POST /missions/{id}/run | new | Runs a dry-run mission exactly as planned. |
| POST /missions/{id}/cancel | new | Cancels every open node, A2A tasks and job files included. |
| POST /missions/{id}/nodes/{node_id}/approve, /reject, /answer, /resolve | new | Node actions (below). |

POST /missions takes:

```json
{
  "objective": "/release Ship version 2.4.0 of the mobile app",
  "inputs": {"version": "2.4.0", "branch": "release/2.4"},
  "budget_usd": 10.00,
  "dry_run": false
}
```

Only `objective` is required, as in v1. Optional: `inputs` (named values for the task message and `call:`), `capability` (one of the root's, skipping routing), `budget_usd` and `dry_run`. The response is 202 (v1 returned 201 with the finished mission):

```json
{"mission_id": "mission-20261013-140500-7c2e", "status": "executing",
 "poll": "/api/agentos/missions/mission-20261013-140500-7c2e"}
```

Node actions: every body carries `attempt` (the node's current attempt; stale gets 409) and `by` (who is acting). Node id `root` addresses the mission itself.

| Action | Allowed when | Body | Effect |
|---|---|---|---|
| approve | needs-human (approval) | `output_hash`, optional `note` | Records the approval bound to that hash; the node completes. |
| reject | needs-human (approval) | `note` | Raises `rejected`, with the note as feedback. |
| answer | needs-human (answer) | `text` | Replies to the same A2A task. |
| resolve | waiting (queue), needs-human (task, fix), failed | `decision` (complete, error, retry, fail), with `output`, `error` or `note` | complete: the output goes through `finish()`, so every rule applies. error: raises `error`. retry: runs it again. fail: fails it. |

On a conductor node, retry reopens its failed and blocked children (it plans again only if it has none), and complete makes the person's output the conductor's output.

Errors: 400 bad body, 401 auth, 404 unknown mission or node, 409 wrong state, stale attempt or wrong hash.

## 14. Packs, the root and adapters

A **pack** is a folder of cards for one domain, `packs/<pack>/<agent-id>.md`, with one top conductor. This draft ships three, far apart on purpose:

| Pack | Top conductor | What it shows |
|---|---|---|
| events | `event-planner` | a Claude-planned capability, an A2A agent, a 1–5 checker, a delivery step |
| release | `release` | a sub-conductor, a check revision, a queue job with on-demand overrides, `call:`, `run_first`, an irreversible step, `max_concurrent` |
| hiring | `hiring-loop` | a human role, a queue provider, an explicit approval rule, `requires_human_approval` |

The **root** is just a card, `packs/root.md`. Its `routes_to` lists each pack's top conductor, and each of its capabilities has `signals` and a one-step recipe into one pack. To add a pack, write its cards, add its top conductor to the root's `routes_to`, and give the root a capability for it.

**Adapters** connect AgentOS to the world, and add **no** kernel concept. An inbound adapter is just a program that calls the API (a chat bot, a form, a cron job): POST /missions, then approve, answer or resolve. An outbound delivery is just a worker card (`mcp` or `human`) used as the last step: `invitation-sender/send-invitations` is how the events pack delivers. This is the Unix move: small parts with one interface, joined at the edges.

### Adding a new agent

1. Create `packs/<pack>/<agent-id>.md` (§6).
2. Set `runtime`, plus `endpoint` for `mcp` or `a2a`.
3. Add its agent_id to the `routes_to` of the conductor that should use it.
4. Check that GET /agents shows it with `valid: true`.

```
curl -s -H "Authorization: Bearer $AGENTOS_API_KEY" localhost:8090/api/agentos/agents \
  | python3 -m json.tool | grep -E '"agent_id"|"valid"'
```

## 15. The record and learning

**The record.** Each mission is one JSON file, written atomically after every change: the whole tree, every output, check, approval and event. It serves audit and crash recovery. Nothing is deleted; archive old files as in v1.

**Track record.** Computed from the mission files, per capability:

```json
"build-release": {"runs": 42, "success_rate": 0.95, "avg_check_score": 99.1,
                  "avg_cost_usd": 0.43, "avg_minutes": 14.2, "stepped_in_rate": 0.05}
```

`avg_check_score` is the final check score, where a check applies. `avg_cost_usd` is real cost: Claude usage priced with AGENTOS_TOKEN_PRICES by the model that answered (`resp.model`, which a fallback can change), and any `cost_usd` a worker reports (otherwise its declared cost). `avg_minutes` excludes time waiting for a person. `stepped_in_rate` is how often a person had to fix, answer or reject; planned approvals and human tasks don't count. The planner sees the track record of the cards in scope, and budgets use real costs (§11).

**Recipe promotion.** When Claude has planned the same kind of work successfully AGENTOS_PROMOTE_AFTER times (default 3), the kernel **proposes** a recipe. "The same kind" means the same conductor capability and plan shape: the same steps (agent and capability) and dependencies. "Successfully" means every check passed and no person had to step in. The proposal is a card diff in `state/proposals/`, listed under the card in GET /agents:

```diff
   - id: plan-event
     ...
     autonomous: true
+    steps:
+      - id: venue
+        assigned_agent: venue-finder
+        capability_match: find-venues
+      - id: budget
+        assigned_agent: budget-checker
+        capability_match: check-budget
+      - id: draft
+        assigned_agent: invitation-sender
+        capability_match: draft-invitations
+        depends_on: [venue]
+      - id: send
+        assigned_agent: invitation-sender
+        capability_match: send-invitations
```

A person applies it to the card, or doesn't; it is never applied automatically. Once applied, the capability is a recipe. The cards are the weights: readable, diffable, reversible. Deferred: retrieving past plans as examples, evals and prompt tuning, and training model weights.

## 16. A2A at the edges (PROPOSAL)

An A2A Agent Card (at `/.well-known/agent-card.json`) lists a name, a description, skills (id, name, description, tags, examples) and endpoints.

**Import** turns one into a worker card with `runtime: a2a`: name, description and version map to name, role and version, the endpoint to `endpoint`, and each skill to a capability (its tags and examples shown to the planner). The author adds the governing fields A2A has no place for. **Export** would serve each card as an A2A Agent Card, and the root behind an inbound adapter, so another AgentOS could reach this one as an `a2a` worker.

A2A cards **describe** an agent; AgentOS cards also **govern** it (approval, dependencies, constraints, failure modes, the human and conductor runtimes), and none of that is exported. Field names differ between A2A versions; confirm them against yours.

## 17. Worked example: shipping a release

One mission through root → release → build-and-test, using the cards in `packs/`. Costs are illustrative; times are UTC.

### Request and routing

Tuesday 13 October, 14:05: a release script sends the POST /missions body from §13 and gets 202 with `mission-20261013-140500-7c2e`. With no `capability` in the body, the root checks signals: `/release` matches `root/ship-release`, a one-step recipe, so `task-1` is `release/ship-update`. Release expands that recipe into five children, and build-and-test (`task-1.1`) expands `build-and-verify` into two.

### The tree (final state, from `?view=tree`)

```
mission-20261013-140500-7c2e  root/ship-release  signal /release · recipe  complete  $2.16 of $10.00
└─ task-1          release/ship-update                recipe                          complete
   ├─ task-1.1     build-and-test/build-and-verify    recipe                          complete
   │  ├─ task-1.1.1  builder/build-release            revised once · tests 100/100    complete
   │  └─ task-1.1.2  test-runner/run-tests            checker · ran twice             complete
   ├─ task-1.2     security-scan/full-scan            queue · overnight               complete
   ├─ task-1.3     changelog-writer/write-changelog   retried once (timeout)          complete
   ├─ task-1.4     deployer/plan-deploy               approved by dana                complete
   └─ task-1.5     deployer/deploy                    irreversible · waited for slot  complete
```

### Plan-time checks

| When | Rule | Result |
|---|---|---|
| release plans | `release/scan-before-deploy` | task-1.2 is upstream of task-1.4 and task-1.5 ✓ |
| release plans | `deployer/autonomous-plan-deploy` (v1 field) | listed: task-1.4 will stop for a person |
| build-and-test plans | `build-and-test/tests-must-pass` | task-1.1.2 (test-runner/run-tests) depends on task-1.1.1 ✓ |
| each level | budget, depth | root 1.48 ≤ 10.00; release 1.43 ≤ 9.95; build-and-test 0.65 ≤ 9.17; workers at depth 3, limit 4 ✓ |

### Timeline

| Time | Node | What happens | Status after |
|---|---|---|---|
| Tue 14:05 | task-1.1.1 | MCP call to `start_build` through `call:` | running |
| 14:18 | task-1.1.1 | Returns build 2.4.0-417, hash `sha256:9c1e…` | waiting (check) |
| 14:24 | task-1.1.2, 1.1.1 | **Check revision.** `{"verdict": "revise", "score": 97, "notes": "3 of 112 tests fail: checkout_total_rounding, …"}`, recorded against `9c1e…`. The builder has no low_score entry, so by default it revises, with the notes as feedback. | pending; running |
| 14:41 | task-1.1.1, 1.1.2 | Build 2.4.0-418 passes, 100; the pass is recorded against `sha256:5d2a…`. | complete |
| 14:41 | task-1.1, 1.2 | Synthesis (low): "Built 2.4.0-418; all 112 tests pass after one fix." The scan's job file is written. | complete; waiting (queue) |
| 14:43 | task-1.3 | **Failure.** The changelog call times out after 2 minutes; the card's `when: timeout` entry says retry after 10 seconds. | pending (retry) |
| 14:44 | task-1.3 | **Recovery.** The second call returns the changelog. The mission is now awaiting. | complete |
| Wed 01:40 | task-1.2 | The nightly scanner calls resolve: `{"attempt": 1, "by": "nightly-scanner", "decision": "complete", "output": "0 critical, 0 high, 1 low: …"}` | complete |
| 01:41 | task-1.4 | plan-deploy returns the plan, hash `sha256:b41f…`; `deployer/autonomous-plan-deploy` applies | needs-human (approval) |
| 09:12 | task-1.4, 1.5 | Dana approves (below). Another mission is deploying, and `max_concurrent: 1` is full. | complete; pending (slot) |
| 09:20 | task-1.5 | **Record before acting:** intent saved, then the MCP call `deploy` | running |
| 09:38 | task-1.5 | "Rolled out 2.4.0-418 to 100%. Health checks green." Outcome saved. Release and root synthesize. | complete |

**The approval is bound to the exact output:**

```
POST /api/agentos/missions/mission-20261013-140500-7c2e/nodes/task-1.4/approve
{"attempt": 1, "by": "dana", "output_hash": "sha256:b41f…", "note": "Go for the 09:15 window"}
```

Had the plan changed after Dana opened it, her hash would be stale and the call would get 409. The deploy node's dispatch event records the plan hash it received: `b41f…`, the one she approved.

**Waiting without holding a thread.** From 14:44 Tuesday to 09:20 Wednesday nothing in the process waits: the file says waiting (queue), then needs-human (approval), then pending (slot). A restart just reloads the file. A crash during the deploy call, after the intent, would put task-1.5 in needs-human (fix) instead of deploying twice.

### Completion-time checks

| Node | Rule | Recorded pass |
|---|---|---|
| task-1.1.1 | `build-and-test/tests-must-pass` | revise 97 (`9c1e…`), then pass 100 (`5d2a…`), by task-1.1.2 |
| task-1.4 | `deployer/autonomous-plan-deploy` | approved by dana at 09:12, `b41f…` |
| task-1.4, task-1.5 | `release/scan-before-deploy` | task-1.2, completed Wed 01:40 |

### Final synthesis and totals

```
Version 2.4.0 (build 2.4.0-418) is live: 112/112 tests after one fix, full scan,
changelog, deploy plan approved by dana, rollout at 100% with health checks green.
Needs attention: one low-severity scan finding. Next: watch error rates for 24 hours.
```

Spend: 2.16 of 10.00, against the plan-time estimate of 1.48. The difference is the revision (builder 0.40, test runner 0.20) and the changelog retry (0.08).

Each capability's track record gains a run: `builder/build-release` passed at 100 after one revision, $0.80, 36 minutes; `test-runner/run-tests` two runs; `changelog-writer/write-changelog` one retry; `security-scan/full-scan` 11 hours queued; `deployer/plan-deploy` a planned approval (not stepping in); `deployer/deploy` 18 minutes; each conductor its real Claude cost. No recipe is proposed: every level already ran one.

## 18. Left out, and known limits

Left out: more rule kinds, such as forbid, and conditions on content; branches and loops in recipes; adding missing steps automatically; timeouts for waits on people and queue workers; remote sub-conductors (possible as `a2a` workers once §16's export exists); editing a running tree or topping up its budget; push to callers, a database, a broker, more than one worker process; per-user keys and roles; semantic failure matching; learning beyond §15.

Known limits:
- **Claude plans can differ between runs.** Recipes, the validator and dry-run-then-run reduce this.
- **Interrupted MCP calls are retried.** A tool with side effects that is not marked `irreversible` could act twice after a crash.
- **Rules match ids.** Renaming a capability silently stops a rule matching it; GET /agents warns about selectors that match nothing.
- **Late violations.** An inherited rule is checked only when a sub-conductor plans; a dry run finds it first.
- **Depth binds swaps.** The default limit of 4 leaves the release pack one spare level: `builder` can become a team, but a team inside that team would pass the limit. A dry run shows it first.
- **One process**, so no high availability.
- **Card edits during a long mission** affect nodes not yet planned. Only `/run` re-validates a whole tree.
