# AgentOS SDK

A small conductor for teams of agents. You describe each agent in a plain-text card. You put cards in folders: a folder is a team. The conductor turns a request into a tree of tasks, hands each task to the right card, enforces the rules written on the cards, and keeps the record. It never does the work itself.

**Status: v0.1, unpublished.** It is tested offline (35 tests) and against a local stand-in for the Claude API. It has not yet run against the live Claude API.

## Try it

Node 20.19 or later. Node 22.18 or later runs the TypeScript directly.

```sh
cd agentos/sdk
npm install

# The example team: a one-person show that turns an idea into an episode.
node src/cli.ts check --dir examples/media/agents

# The whole flow in one process. Offline unless ANTHROPIC_API_KEY is set.
AGENTOS_OFFLINE=1 node examples/media/run.ts
```

The same flow from the command line, one step at a time. Each command is its own process, so the approval can come days later:

```sh
export AGENTOS_DIR=examples/media/agents AGENTOS_SETUP=examples/media/setup.ts AGENTOS_OFFLINE=1
node src/cli.ts run show "Episode 13: why your room matters more than your mic" --user sam --group producers
#  … task-2  writers/write-script  [needs-human: approval]
#     agentos approve m-20261026-… task-2 --hash sha256:… --by <name>
node src/cli.ts approve m-20261026-… task-2 --hash sha256:… --by sam
node src/cli.ts output m-20261026-…
```

With `ANTHROPIC_API_KEY` set and `AGENTOS_OFFLINE` unset, every model card runs on Claude.

## The example team

```
examples/media/agents/show/        a team: its agent.md is the conductor
  agent.md            show: research → writers → rights + promo → publisher
  researcher.md       model (Sonnet)
  rights-check.md     function: checks music and clip cues against licences
  publisher.md        function, with a switch: producers only, 30 a month
  writers/            a sub-team, one step to the show
    agent.md          writers: outline → draft, and the editor must score it 4/5
    outliner.md       model (Sonnet)
    scriptwriter.md   model (Opus, falls back to Sonnet)
    script-editor.md  model, the checker
  promo/              a sub-team with no recipe: its model plans the work
    agent.md
    thumbnail-brief.md, clip-picker.md, newsletter-blurb.md   models (Haiku)
```

One run shows routing (no capability named, so the conductor's model picks one), a recipe, two nested teams, a check that sends the draft back once with notes, a person's sign-off bound to the exact script they read, a rule that rights are cleared before release, a planned team, and a switch that lets only producers publish.

## A card

````markdown
# Scriptwriter

## Identity
- **agent_id**: `scriptwriter`
- **name**: Scriptwriter
- **version**: `0.1.0`
- **role**: Writes scripts the host can read aloud.
- **runtime**: `model`

## Plug
```yaml
plug:
  model: claude-opus-5-5
  fallback: [claude-sonnet-5-5]
  effort: high
```

## Capabilities
```yaml
capabilities:
  - id: draft-script
    description: "A full script, about eight minutes read aloud."
```

## Instructions
Write the script from the outline, using only facts in the research notes.
````

This is the v1 card format. Identity is in bold bullets. Everything else goes in ```yaml blocks, named by their top-level key. A model card's `## Instructions` section is its prompt. If a card has a mistake, the whole card is refused, with every reason, and is never half-loaded. `agentos check` lists the reasons.

| Block | What it does |
|---|---|
| `capabilities` | What the card can do. On a conductor, `steps` is a recipe. A conductor with no steps is planned by its model. `signals` are words such as `/promo` that pick a capability with no model call. |
| `rules` | `approval` (a person signs off), `check` (another card scores the output, and a low score sends it back with notes), `before` (one card's work must come first). A rule on a conductor covers its whole subtree. |
| `plug` | The model slot: `model`, `fallback`, `effort`, `max_tokens`. Swap the model here and nothing else changes. |
| `switch` | Whether the card is on, who may use it (`used_by`), and monthly limits (`max_runs_per_month`, `max_usd_per_month`). |
| `failure_modes` | What happens on an `error`, `timeout`, `refusal` or `rejected`: `retry`, `revise`, `needs-human` or `fail`. |
| `constraints`, `dependencies`, `routes_to` | As in v1. `autonomous: false`, `requires_human_approval` and `dependencies.required` become rules. |

Runtimes: `model` (Claude, or any provider you plug in), `function` (your code), `human` (a person does the task), and `conductor` (a team).

## Folders are teams

A folder with an `agent.md` is a team. Its `agent.md` is the conductor, and the cards directly inside the folder are its members. A team may hand work only to its members and to the cards in its `routes_to`. A folder without an `agent.md` just holds cards. That is how the spec's flat packs work: each team names its cards in `routes_to`.

## From code

```ts
import { AnthropicModels, Conductor, FileStore, loadAgents, ModelPlanner } from 'agentos';

const models = new AnthropicModels();
const conductor = new Conductor({
  registry: await loadAgents('agents'),
  store: new FileStore('.agentos/missions'),
  plugs: { 'rights-check': async (task) => checkRights(task.message) },
  models,
  planner: new ModelPlanner({ models }),
});

const mission = await conductor.start('show', 'Episode 12: mixing on cheap headphones', {
  user: { id: 'sam', groups: ['producers'] },
  budget_usd: 5,
});
// Later, in any process:
await conductor.approve(mission.id, 'task-2', { output_hash, by: 'sam' });
```

Other model providers plug in through `ModelProvider` (one method, `complete`). `routeModels({ anthropic, local })` sends `anthropic/…` and `local/…` model names to different providers. `scriptedModels(fn)` answers from your own function, for tests and dry runs.

## How a mission runs

- A mission is a tree of tasks, saved after every step. `FileStore` keeps one JSON file per mission.
- **Routing:** the request names a capability, or its first word matches a signal, or the conductor's model picks one. If none fits, a person is asked.
- **Planning:** a recipe if the capability has steps. Otherwise the model plans, using only the team's cards. Every plan, recipe or model, passes the same checks: the cards are on the team, the capabilities exist, there are no loops, the depth limit (4) and task limit (40) hold, and the `before` rules are met. A bad model plan is sent back once with the reasons, then a person is asked.
- **Each task** gets the request, its inputs, and the outputs of the tasks it depends on. It does not see the whole history.
- **Finishing:** checks first, then approvals. An approval is bound to the output's hash, so a changed output must be approved again.
- **Cost:** each call is charged to its task and the mission. Calls to Claude are priced from the reply's token usage. The mission budget and the cards' monthly limits are checked before each task starts.
- **Irreversible** capabilities are never retried automatically, and cannot also need an approval, because the approval would come after the act.

## How this differs from SPEC v0.1

This SDK is the kernel from `../SPEC.md`, minus everything that needs a server or another protocol. These parts are not built yet. A card that uses them is refused with "in the spec but not in this SDK yet", never run partly:

- the `mcp`, `a2a` and `queue` runtimes, `call:`, a per-capability `runtime`, `run_first`, `max_concurrent`
- the HTTP API (§13), dry-run estimates (§12), and the track record (§15)
- parallel tasks: one task runs at a time. A delayed retry waits in-process for up to 30 seconds, and anything longer waits until `agentos advance`
- a team's summary is the first 300 characters of its output, not a model's synthesis
- the planner is told to use few steps, but the spec's leaf bias (§9) is not enforced

The folder-as-team convention is new here. The spec's flat packs still load. Most of their cards use `mcp`, `a2a` or `queue`, so for now `agentos check --dir ../packs` reports why they are refused.

## Development

```sh
npm test            # node --test, no network
npm run typecheck   # src, tests and examples
npm run build       # dist/, with the agentos command
```

Licence: not chosen yet (`UNLICENSED`).
