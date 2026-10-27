# Conductor SDK

**Routes, tracks and costs agent work.** By Signal&.

You describe each agent in a plain-text card and put the cards in a folder. Give the conductor a request:

- **Route:** it decides which agent does each piece of the work, on which model, and in what order. It stops for a person wherever the cards say to.
- **Track:** it records every call: who asked, which agent, which model and why, what came back, and who approved what.
- **Cost:** it prices every call from its token usage, so you can see what each agent and each person spent.

It does not do the work, host anything or set limits. Models, your own code, limits and storage plug in.

**Status: v0.1, unpublished.** 42 tests pass offline and against a stand-in for the Claude API. On live Claude (27 October 2026), the desk example sent six varied requests at once: all six went to the agents and models a person would choose, in 18 seconds, for an estimated $0.09.

## Try it

Node 22.18 or later runs the TypeScript directly.

```sh
npm install
node examples/desk/run.ts      # six requests, four agents: who did what, on which model, for how much
node examples/hello/run.ts     # a recipe and a host's sign-off
node addons/cli.ts check --dir examples/desk/agents
```

Both examples run offline with canned answers unless `ANTHROPIC_API_KEY` is set.

## Route

**Who does the work.** A folder with an `agent.md` is a team, and teams can sit inside teams. A team splits a request between its members in one of two ways:
- a recipe written on its card, for work that always runs the same way;
- its own model reads the request and picks the members, for work that varies.

When a team offers several kinds of work, a request picks one by a signal word such as `/promo`. If there is none, the team's model chooses, and if nothing fits, a person is asked.

The conductor checks every plan before a step runs: the agents must be on the team and able to do the job, and the team's rules must hold. It prefers the simplest route: one agent when one can do the whole job, and a team only when no single agent fits. Pieces that don't wait on each other run at the same time.

**Which model.** A card names its model. Each of its capabilities can name its own, so headlines can run on a small model and long articles on a large one. If a model fails, the next one on the card's fallback list answers. A gate can choose a different model for a call, for example a cheaper one past a spend line.

**Where people come in.** Rules on a card:
- **Sign-offs** are tied to the exact output a person read.
- **Checks** let another agent score the work and send it back with notes.
- **Must-come-first rules** keep one step ahead of another, such as rights cleared before release.

Work waits for a person as long as it takes, then picks up where it stopped.

## Track

Each request becomes a mission: a tree of tasks, saved after every step. Every call to an agent, failed ones included, leaves a record: the agent and capability, the model and why it answered, the cost, the time, and how it ended. Sign-offs, send-backs and fixes record who made them.

Each task receives the output of every task upstream of it. A checker receives what the checked task was given, then its output.

```sh
conductor status <mission>          # the tree, and what is waiting for whom
conductor output <mission> <task>   # any task's full output
conductor usage                     # this month, by agent and by person
```

## Cost

The Claude add-on prices each call from its token usage, against a dated list of Anthropic's prices that you can override. A call with no known price is recorded as **unpriced**, never as $0. The `usage` report shows spend by agent, model and person, next to each agent's limits. Limits themselves are an add-on: the switch.

## A card

````markdown
# Writer

## Identity
- **agent_id**: `writer`
- **name**: Writer
- **version**: `0.1.0`
- **role**: Writes finished copy: posts, announcements, short articles, and headlines.
- **runtime**: `model`

## Plug
```yaml
plug:
  model: claude-opus-5-5
  fallback: [claude-sonnet-5-5]
  effort: medium
```

## Capabilities
```yaml
capabilities:
  - id: article
    description: "A finished piece of writing: a post, an announcement or a short article."
  - id: headlines
    description: "Five headline or title options for a piece, nothing else."
    plug:
      model: claude-haiku-5-5
      effort: low
```

## Instructions
Write plainly, in short sentences. If research or notes came with the task, use only the facts in them.
````

Identity goes in bold bullets. Settings go in ```yaml blocks, named by their top-level key. A model card's `## Instructions` section is its prompt. A card with a mistake is refused whole, with every reason. [WRITING-CARDS.md](WRITING-CARDS.md) has the full format, and a prompt for having Claude write cards from a plain description of your team.

## From code

```ts
import { Conductor, FileStore, loadAgents } from '@agentos/conductor';
import { AnthropicModels } from '@agentos/conductor/claude';
import { ModelPlanner } from '@agentos/conductor/planner';

const models = new AnthropicModels();
const conductor = new Conductor({
  registry: await loadAgents('agents'),
  store: new FileStore('.agentos/missions'),
  models,
  planner: new ModelPlanner({ models }),
});

const mission = await conductor.start('desk', 'Give me five headline options for a post about small rooms', { user: { id: 'sam' } });
// Later, in any process with the same store:
// await conductor.approve(mission.id, 'task-2', { output_hash, by: 'maya' });
```

Only `registry` is required. With no models, a model card's task fails with "no model provider is configured". With no planner, a team with no recipe, or a request that names no capability and matches no signal word, waits for a person.

## What plugs in

| Plug point | What it is |
| --- | --- |
| **models** | A `ModelProvider` runs model cards. `@agentos/conductor/claude` is one; `routeModels` mixes providers by name prefix. |
| **plugs** | Your code, for `function` cards. |
| **planner** | The model that routes requests and splits a team's work. `@agentos/conductor/planner` is one. |
| **gates** | See every call before it is made, and its record after. A gate can stop a call (a person is asked) or choose another model. Limits, budgets and logging live here. |
| **store** | Where missions are kept: `MemoryStore`, `FileStore`, or your own. |

```ts
const noWeekends: Gate = {
  name: 'no-weekends',
  before: ({ card }, { now }) => ([0, 6].includes(now().getDay()) ? { stop: `${card.id} does not run on weekends` } : undefined),
  after: (run) => console.log(run.agent, run.model, run.usd, run.outcome),
};
```

## Add-ons

| Import | What it is |
| --- | --- |
| `@agentos/conductor/claude` | Runs model cards on Claude: streamed replies, refusals handled, server-side fallbacks, and cost from token usage. Needs `@anthropic-ai/sdk`. |
| `@agentos/conductor/planner` | Routes requests and splits a team's work, preferring the simplest route. |
| `@agentos/conductor/switch` | A gate for a card's `switch:` block: on or off, who may use it, monthly runs and spend, a cheaper model past a spend line, and a budget per mission. |
| `@agentos/conductor/usage` | Spend, runs and models, by agent and by person, read from the records. |
| `@agentos/conductor/models` | `routeModels` (several providers by name prefix) and `scriptedModels` (canned answers, for tests and dry runs). |
| `conductor` command | check, run, status, output, list, usage, approve, reject, resolve, advance and cancel. It plugs in Claude, the planner and the switch by default. Exit codes: 0 done, 1 failed, 2 a mistake in the command, 3 waiting for a person. |

A block only an add-on reads, such as `switch:`, is accepted only when that add-on's gate is passed to `loadAgents`. Otherwise it is an error, so a typo is never silently ignored.

## Limits of v0.1

- It runs in one process. Missions survive on disk, and resume from any process that reads the same store, but nothing is hosted.
- Limits are checked before each call. When several calls run at once, a limit can be passed by the number of calls already running.
- Cards run models, your code, people and other teams. Agents behind MCP or A2A are not built yet.

## Development

```sh
npm test            # node --test, no network
npm run typecheck   # src, add-ons, tests and examples
npm run build       # dist/, with the conductor command
```

## Licence

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
