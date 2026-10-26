# AgentOS Conductor

The conductor runs agents written as plain-text cards. Give it a folder of cards and a request. It works out which card does what, in what order, under the rules written on the cards. It waits for a person where the cards say to, and picks up where it left off.

It does not do the work, call models, set limits or host anything. Those plug in.

**Status: v0.1, unpublished.** 36 tests pass, offline and against a stand-in for the Claude API. It has not yet run on live Claude.

## Try it

Node 22.18 or later runs the TypeScript directly.

```sh
cd agentos/conductor
npm install
node examples/hello/run.ts                                   # offline unless ANTHROPIC_API_KEY is set
node addons/cli.ts check --dir examples/hello/agents         # load the cards, show the team
```

## What is in the conductor, and what plugs in

| In the conductor | Plugs in |
| --- | --- |
| Reading cards; a folder with an `agent.md` is a team, and teams nest | **models**: a `ModelProvider` runs `model` cards (`./claude` is one) |
| Routing a request: a signal word, then the router, then a person | **plugs**: your code for `function` cards |
| Recipes, and checking any plan before a step runs | **planner**: plans teams with no recipe and routes requests (`./planner`) |
| Rules: sign-offs bound to the exact output, checks that send work back, steps that must come first | **gates**: see every call before and after it: limits, budgets, model choice, logging (`./switch`) |
| Waiting for people; resuming where it stopped | **store**: where missions are kept (`MemoryStore`, `FileStore`, or yours) |
| The mission tree, and a record of every call | **clients**: the `conductor` command, or your app |

## A card

````markdown
# Writer

## Identity
- **agent_id**: `writer`
- **name**: Writer
- **version**: `0.1.0`
- **role**: Writes scripts the host can read aloud, using only the research.
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
  - id: draft
    description: "A script of about eight minutes read aloud."
```

## Instructions
Short sentences; it is read aloud. Use only facts in the research.
````

Identity is in bold bullets. Settings are in ```yaml blocks named by their top-level key. A model card's `## Instructions` is its prompt. A card with a mistake is refused whole, with every reason.

A block only an add-on reads, such as `switch:`, is accepted only when that add-on's gate is passed to `loadAgents`. Otherwise it is an error, so a typo is never silently ignored.

## From code

```ts
import { Conductor, FileStore, loadAgents } from '@agentos/conductor';
import { AnthropicModels } from '@agentos/conductor/claude';
import { ModelPlanner } from '@agentos/conductor/planner';
import { switchGate } from '@agentos/conductor/switch';

const gates = [switchGate()];
const models = new AnthropicModels();
const conductor = new Conductor({
  registry: await loadAgents('agents', { gates }),
  store: new FileStore('.agentos/missions'),
  models,
  planner: new ModelPlanner({ models }),
  gates,
});

const mission = await conductor.start('episode', 'Episode 12: mixing vocals on cheap headphones', { user: { id: 'maya' } });
// Later, in any process with the same store:
await conductor.approve(mission.id, 'task-2', { output_hash, by: 'maya' });
```

Only `registry` is required. With no models, a model card's task fails with "no model provider is configured". With no planner, a team with no recipe, or a request that names no capability and matches no signal, waits for a person.

## A gate

```ts
const noWeekends: Gate = {
  name: 'no-weekends',
  before: ({ card }, { now }) => ([0, 6].includes(now().getDay()) ? { stop: `${card.id} does not run on weekends` } : undefined),
  after: (run) => console.log(run.agent, run.model, run.usd, run.outcome),
};
```

`before` can stop a call (the task waits for a person), or choose another model for it. `after` gets the record of every call, failed ones included.

## Add-ons

| Import | What it is |
| --- | --- |
| `@agentos/conductor/claude` | Runs model cards on Claude: streamed, with refusals handled, server-side fallbacks, and cost from token usage. Needs `@anthropic-ai/sdk`. |
| `@agentos/conductor/planner` | A model plans teams with no recipe, and routes requests that name no capability. |
| `@agentos/conductor/switch` | A gate for a card's `switch:` block: on or off, who may use it, monthly runs and spend, a cheaper model past a spend line, and a budget per mission. |
| `@agentos/conductor/usage` | Who used which card, on which model, for how much, read from the records. |
| `@agentos/conductor/models` | `routeModels` (several providers by name prefix) and `scriptedModels` (canned answers, for tests and dry runs). |
| `conductor` command | check, run, status, output, list, usage, approve, reject, resolve, advance and cancel. It plugs in Claude, the planner and the switch by default. |

## Relation to the AgentOS SDK

`agentos/sdk` is the fuller product, with the switch and usage report built in. This package is the conductor alone, with those as add-ons. The two are separate, and neither depends on the other.

Cards are the same with one difference: the cheaper model goes in the switch block (`downgrade_to`), not on the plug (`plug.downgrade`).

## Development

```sh
npm test            # node --test, no network
npm run typecheck   # src, add-ons, tests and examples
npm run build       # dist/, with the conductor command
```

Licence: not chosen yet (`UNLICENSED`).
