# Conductor SDK: landing page brief for v0

Everything v0 needs to build the Conductor SDK landing page, and everything true about the product for you to check its work against.

- **Part 1** is the prompt to paste into v0.
- **Part 2** is the page, section by section, with the exact copy, code and terminal output.
- **Part 3** is the technical fact sheet: every feature, number and limit.
- **Part 4** is what the page must not say.

Attach this whole file to v0, or paste Part 1 and Part 2. Every number, output and code sample here comes from the real code, or from the live run on Claude on 27 October 2026. None of it is made up.

---

# Part 1. The prompt for v0

> Build a single-page marketing site for **Conductor SDK**, an open-source TypeScript library by **Signal&**. Tagline: **"Routes, tracks and costs agent work."** The audience is developers.
>
> **Layout:** follow the structure of a modern developer-SDK landing page, the way vercel.com/ai-sdk is laid out:
> - a centred hero with a large headline, a short subhead, a copyable install command and two buttons;
> - a strip of proof numbers;
> - then alternating feature sections, each pairing a short headline and two or three sentences with a code or terminal panel (some panels tabbed);
> - a grid of plug points;
> - a tabbed code-examples block;
> - a getting-started block;
> - an honest "what v0.1 is and isn't" block;
> - a final call to action and a footer.
>
> Do not use Vercel's name, logo, copy or illustrations.
>
> **Look:**
> - Monochrome and technical: near-black background (#0a0a0a) with white and grey text, plus a light theme.
> - A sans-serif for text (Geist or Inter) and a monospace font for all code and terminal output (Geist Mono or JetBrains Mono).
> - Thin 1px borders (#262626), generous spacing, and a faint grid or dot pattern behind the hero only.
> - One accent colour, used sparingly: a signal green (#3ddc84) for "ok" and "complete". Amber (#f5a524) means "waiting for a person"; red (#f04438) means "failed".
>
> **Code panels:**
> - dark, with a filename or tab label at the top, a copy button and line wrapping off;
> - YAML, TypeScript and shell syntax highlighting.
> - Terminal panels show the output exactly as given, monospace, with no highlighting except the status colours above.
>
> **Brand:** Signal& has no logo yet. Use a text wordmark: "Signal&" with the ampersand in the accent green. The product name is "Conductor SDK".
>
> **Content:** use the copy, code and terminal output in Part 2 exactly. Do not invent features, numbers, customers, testimonials, logos, GitHub stars or download counts. Part 4 lists what the page must not claim.
>
> **Placeholders to keep visible:**
> - the GitHub URL (`https://github.com/OWNER/conductor-sdk`);
> - the npm package name. The install command shows `npm i @agentos/conductor`, with a small "not on npm yet" tag.
>
> **Responsive:** the page works at phone width. Code panels scroll sideways inside themselves, never the page.
>
> **Build:** Next.js App Router, Tailwind and shadcn/ui. One page plus shared components (CodePanel with tabs and copy, TerminalPanel, Section, StatStrip, PlugGrid). Keep all copy in one `content.ts` file so it can be edited without touching components.

---

# Part 2. The page, section by section

## 0. Meta

- **Title:** Conductor SDK: routes, tracks and costs agent work · Signal&
- **Description:** Open-source TypeScript. Describe each agent in a plain-text file; Conductor SDK decides who does each piece of a request, on which model, records every call and prices it.
- **OG image text:** "Conductor SDK: Routes, tracks and costs agent work." with the Signal& wordmark.

## 1. Nav

- Left: **Signal&** wordmark, a thin divider, then **Conductor SDK**.
- Right links: Docs (the GitHub README), Writing agents (WRITING-CARDS.md), Examples (#examples), GitHub (placeholder URL).
- No sign-in, pricing or "contact sales". It is a free, open-source library.

## 2. Hero

- **Eyebrow** (small, mono, grey): `v0.1 · Apache 2.0 · TypeScript`
- **H1:** Routes, tracks and costs agent work.
- **Subhead:** Describe each agent in a plain-text file and put them in a folder. Conductor SDK decides who does each piece of a request, and on which model. It records every call, prices it, and stops for a person wherever you say.
- **Install pill** (copy button): `npm i @agentos/conductor`, with the tag `not on npm yet`.
- **Buttons:**
  - primary "Get started" → the README, `#try-it` for now;
  - secondary "View on GitHub" → the placeholder URL.
- **Below the buttons** (small, grey): By Signal&. Open source under Apache 2.0.

## 3. Proof strip

Four numbers in a row (two by two on phones), with a footnote under them.

| Number | Label |
| --- | --- |
| **6 / 6** | requests routed where a person would send them |
| **18 s** | for all six, run at once |
| **$0.09** | total, routing included |
| **4 · 3** | agents · models (Opus, Sonnet, Haiku) |

Footnote: *A live run on Claude, 27 October 2026: six different requests to one front desk with four agents. Costs are estimated from token usage at Anthropic's list prices.*

## 4. Route: "One request in. The right agent, on the right model."

**Copy:** Send any request to a team. Its conductor works out who should do it:
- one agent when one can do the whole job, several when it needs them;
- in the right order, with the parts that don't wait on each other running at the same time.

Every plan is checked before anything runs.

**Visual:** a table, styled as a terminal or a clean data table. It is the real result of the live run.

| Request | Went to | Model | Cost | Time |
| --- | --- | --- | --- | --- |
| Five headline options for a post about recording vocals in a small room. | writer · headlines | Claude Haiku 5.5 | $0.0032 | 3.3 s |
| Brief a designer on a cover image for a gardening newsletter's spring issue. | designer · brief | Claude Haiku 5.5 | $0.0038 | 7.4 s |
| Monthly signups were Jan 120, Feb 135, Mar 160, Apr 150. What is the trend? | analyst · analyze | Claude Sonnet 5.5 | $0.0118 | 9.4 s |
| Find what recent research says about four-day work weeks, with sources. | researcher · research | Claude Sonnet 5.5 | $0.0129 | 11.7 s |
| Write a 150-word launch announcement for a bike-repair booking app. | writer · article | Claude Opus 5.5 | $0.0285 | 15.2 s |
| Research the best time of day to post on LinkedIn, then write a short post sharing what you found. | researcher → writer | Sonnet 5.5 → Opus 5.5 | $0.0285 | 17.9 s |

Caption: *Each cost includes the desk's own routing call, on Sonnet at low effort. All six ran at once.*

**Code panel** (tab label `agents/desk/agent.md`):

````markdown
# Desk

## Identity
- **agent_id**: `desk`
- **name**: Desk
- **version**: `0.1.0`
- **role**: The front desk for a small team. Takes any request and hands it to whoever on the team does that kind of work. Does none of the work itself.
- **runtime**: `conductor`

## Plug
```yaml
plug:
  model: claude-sonnet-5-5
  effort: low
```

## Capabilities
```yaml
capabilities:
  - id: handle
    description: "Whatever the request needs, done by the right member of the team."
```
````

**Small "how it picks" row** (four steps, left to right, as small labelled boxes):
1. **Named:** the request names a capability.
2. **Signal word:** its first word matches one, such as `/promo`, with no model call.
3. **Router:** the team's model picks one.
4. **A person:** if nothing fits, a person is asked.

## 5. Model choice: "Change the model in one line."

**Copy:** Each agent names its model:
- Each kind of work can have its own, so headlines run on a small model and long articles on a large one.
- If a model fails, the next one on the fallback list answers.
- Nothing else in your code changes.

**Tabbed code panel**, tabs **Opus · Sonnet · Haiku · Your own**. Each tab shows the same `agents/desk/writer.md` plug block; only the model line (and effort) differs.

Opus:
```yaml
plug:
  model: claude-opus-5-5
  fallback: [claude-sonnet-5-5]
  effort: medium
```
Sonnet:
```yaml
plug:
  model: claude-sonnet-5-5
  effort: medium
```
Haiku:
```yaml
plug:
  model: claude-haiku-5-5
  effort: low
```
Your own (any provider you plug in):
```yaml
plug:
  model: local/my-model
  fallback: [claude-sonnet-5-5]
```

**Second small panel**, "One agent, two models" (tab `writer.md · capabilities`):
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
Caption: *In the live run, articles went to Opus and headlines to Haiku. Same agent, $0.0164 against a fraction of a cent.*

## 6. Track: "Every call, on the record."

**Copy:** Each request becomes a mission, a tree of tasks, saved after every step. Every call leaves a record, failed ones included:
- which agent and which model answered, and why;
- the cost, the time, and how it ended;
- who started the request.

Sign-offs and send-backs record who made them.

**Terminal panel 1** (label `conductor status m-20261027-005006-2972`):
```
m-20261027-005006-2972 · complete · $0.0285
request: Research the best time of day to post on LinkedIn, then write a short post sharing what you found.

root  desk/handle  [complete]  $0.0043 · claude-sonnet-5-5
├─ task-1  researcher/research  [complete]  $0.0078 · claude-sonnet-5-5
└─ task-2  writer/article  [complete]  $0.0164 · claude-opus-5-5
```
Colour `[complete]` green.

**Panel 2** (label `one run record`, JSON):
```json
{
  "agent": "writer",
  "capability": "article",
  "kind": "work",
  "at": "2026-10-27T00:50:24.217Z",
  "ms": 6704,
  "usd": 0.016404,
  "outcome": "ok",
  "model": "claude-opus-5-5",
  "user": "sam"
}
```

**Small command list** (mono):
```sh
conductor status <mission>          # the tree, and what is waiting for whom
conductor output <mission> <task>   # any task's full output
conductor list                      # every mission
```

## 7. Cost: "Know what every agent costs."

**Copy:** Every call is priced from its token usage, against a dated list of model prices that you can override. A call with no known price is marked **unpriced**, never counted as $0. The usage report shows spend by agent, model and person.

**Terminal panel** (label `conductor usage`). This is the exact report from the live run:
```
Usage from 2026-10-01 to 2026-11-01: $0.0886

agent        runs  failed        usd     avg  limits
writer          3       0    $0.0418    6.7s
            claude-haiku-5-5 ×1, claude-opus-5-5 ×2
desk            6       0    $0.0216    3.1s
            claude-sonnet-5-5 ×6
researcher      2       0    $0.0170    7.3s
            claude-sonnet-5-5 ×2
analyst         1       0    $0.0079    6.3s
            claude-sonnet-5-5 ×1
designer        1       0    $0.0004    4.9s
            claude-haiku-5-5 ×1

By caller:
  sam: 13 runs, $0.0886
```

**Side note card: "Limits are an add-on"**

Copy: The switch add-on reads a block on any agent:
- whether it is on, and who may use it;
- monthly runs and spend;
- a cheaper model past a spend line;
- a budget per mission.

```yaml
switch:
  used_by: [producers]
  max_runs_per_month: 30
  max_usd_per_month: 40
  downgrade_after_usd: 20     # past $20 this month, Sonnet writes them
  downgrade_to: claude-sonnet-5-5
```

## 8. People: "People sign off where it matters."

**Copy:** Put rules on a team, and work waits for a person as long as it takes, then picks up where it stopped. Sign-offs, checks and order rules are described below.

**Three small feature cards:**
- **Sign-off on the exact text.** An approval is tied to a hash of the output the person read. If the output changes, it needs approving again.
- **Checks.** Another agent scores the work. A low score sends it back with notes, up to a set number of times.
- **Must come first.** One step always runs before another, such as music rights cleared before release.

**Terminal panel** (label `node examples/hello/run.ts`). Real output from the hello example, offline:
```
m-20261028-165454-9f95 · needs-human · $0.0000
request: Episode 12: mixing vocals on cheap headphones

root  episode/make-script  [running]
├─ task-1  researcher/research  [complete]  claude-sonnet-5-5
└─ task-2  writer/draft  [needs-human: approval]  claude-opus-5-5
      waiting for approval (episode/host-signs-off)
      conductor approve m-20261028-165454-9f95 task-2 --hash sha256:7582a3c1e7a50065 --by <name>
```
Colour `[needs-human: approval]` amber.

**Code panel** (tab `a team's rules`; the sign-off is the hello example's own, the check is an example of the format):
```yaml
rules:
  - id: host-signs-off
    kind: approval
    applies_to: {agent_id: writer}
    reason: "The host reads every script before it is recorded."
  - id: editor-scores-it
    kind: check
    applies_to: {agent_id: writer}
    checker: {agent_id: editor, capability: score}
    min_score: 80
    max_revisions: 2
    reason: "The editor must score a draft 4 out of 5 before the host sees it."
```

Caption: *The approval can come from another process, days later: `conductor approve` reads the same saved mission.*

## 9. Plain text: "Your agents are plain text."

**Copy:** One file per agent:
- who it is, what it can do, which model it runs on, and its instructions;
- a folder is a team, and teams can sit inside teams;
- a file with a mistake is refused whole, with every reason, so a typo never half-runs.

You can have Claude write the files from a plain description of your team.

**Two panels side by side** (stacked on phones).

Left (tab `agents/desk/writer.md`):
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

Right (label `conductor check`, two stacked terminals). First the good folder:
```
5 cards in examples/desk/agents
  desk  conductor  claude-sonnet-5-5  handle
    analyst  model  claude-sonnet-5-5  analyze
    designer  model  claude-haiku-5-5  brief
    researcher  model  claude-sonnet-5-5  research
    writer  model  claude-opus-5-5  article, headlines
```
Then one with mistakes (the first line in red):
```
invalid: writer (agents/writer.md)
  - unknown block `swich`
  - agent_id `writter` must match its file name `writer`
  - `capabilities[0].description` must be text
  - `plug.effort` must be one of low, medium, high, xhigh, max
```

**Folder visual** (a small file tree):
```
agents/
  desk/                 a team: its agent.md is the conductor
    agent.md
    researcher.md       Sonnet
    writer.md           Opus, headlines on Haiku
    designer.md         Haiku
    analyst.md          Sonnet
```

## 10. Plugs: "Plugs into what you already run."

**Copy:** The conductor routes, tracks and costs. It does not do the work, host anything or set limits. Everything else plugs in.

**Grid of five tiles:**

| Tile | Copy |
| --- | --- |
| **Models** | Any provider with one method, `complete`. Claude is built in. Mix providers by name prefix. |
| **Your code** | A `function` agent runs your code, so anything you can call from TypeScript can be an agent, including agents built with other frameworks. |
| **Planner** | The model that routes requests and splits a team's work. It prefers the simplest route. |
| **Gates** | See every call before it is made, and its record after. Stop a call, choose another model, log, or enforce limits. |
| **Store** | Where missions are kept: in memory, on disk, or your own database. |

**Tabbed code panel**, tabs **Gate · Your code · Your model · Your store**.

Gate:
```ts
import type { Gate } from '@agentos/conductor';

const noWeekends: Gate = {
  name: 'no-weekends',
  before: ({ card }, { now }) =>
    [0, 6].includes(now().getDay()) ? { stop: `${card.id} does not run on weekends` } : undefined,
  after: (run) => console.log(run.agent, run.model, run.usd, run.outcome),
};
```
Your code:
```ts
const conductor = new Conductor({
  registry: await loadAgents('agents'),
  plugs: {
    // a `function` agent: any code, any framework
    'rights-check': async (task) => checkRights(task.message),
  },
});
```
Your model:
```ts
import type { ModelProvider } from '@agentos/conductor';
import { AnthropicModels } from '@agentos/conductor/claude';
import { routeModels } from '@agentos/conductor/models';

const local: ModelProvider = {
  async complete({ model, system, prompt }) {
    const text = await myServer.generate(model, system, prompt);
    return { text, model }; // no cost_usd: recorded as unpriced, not $0
  },
};

// `local/…` names go to your server, everything else to Claude
const models = routeModels({ local }, new AnthropicModels());
```
Your store:
```ts
import type { MissionStore } from '@agentos/conductor';

const store: MissionStore = {
  load: (id) => db.missions.get(id),
  save: (mission) => db.missions.put(mission.id, mission),
  list: () => db.missions.all(),
};
```

## 11. Code examples (id `#examples`): "Start with a few lines."

**Tabbed panel**, tabs **Run a team · Approve later · Write the agents · Read the costs**.

Run a team:
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

const mission = await conductor.start('desk', 'Give me five headline options for a post about small rooms', {
  user: { id: 'sam' },
});
console.log(mission.status, mission.cost_usd);
```
Approve later:
```ts
// Any process that reads the same store, days later.
const mission = await conductor.get('m-20261028-165454-9f95');
const { output_hash } = mission!.nodes['task-2']!;   // the exact text maya read
await conductor.approve(mission!.id, 'task-2', { output_hash: output_hash!, by: 'maya' });
```
Write the agents:
```text
Write agent cards for Conductor SDK, one file per agent, from the team I describe at the end.
…
My team:
A small podcast. A researcher finds facts, a writer drafts the script,
and the host signs off every script before it is recorded.
```
Caption for this tab: *The full prompt is in WRITING-CARDS.md. Paste it into Claude, then run `conductor check` on the files it writes.*

Read the costs:
```ts
import { usageReport, formatUsage } from '@agentos/conductor/usage';

const report = usageReport(await conductor.list(), new Date('2026-10-01'), new Date('2026-11-01'));
console.log(formatUsage(report, conductor.registry));
```

## 12. Try it (id `#try-it`): "Run it in a minute."

**Copy:** Node 22.18 or later runs the TypeScript directly. Both examples run offline with canned answers, or on Claude when `ANTHROPIC_API_KEY` is set.

```sh
git clone https://github.com/OWNER/conductor-sdk && cd conductor-sdk
npm install
node examples/desk/run.ts      # six requests, four agents: who did what, on which model, for how much
node examples/hello/run.ts     # a recipe and a host's sign-off
node addons/cli.ts check --dir examples/desk/agents
```

**Three example cards:**
- **Desk:** a front desk and four agents on three models. Six requests at once; prints the route, model, cost and time of each, and the usage report.
- **Hello:** a podcast team with a fixed recipe (research, then draft) and the host's sign-off.
- **Writing agents:** a prompt for having Claude write your team's files from a plain description.

## 13. Honest status: "What v0.1 is, and isn't."

Two columns.

**It is:**
- A TypeScript library and a `conductor` command.
- Routing, records and cost for agents written as plain text.
- 42 tests, all offline; a live run on Claude routed 6 of 6.
- Small: 2,050 lines of core, 679 lines of add-ons, one dependency.

**It isn't, yet:**
- On npm. The package name may change.
- Hosted. It runs in your process; missions are saved to disk and resume from any process that reads them.
- A dashboard or a no-code tool. It is for developers.
- Connected to agents behind MCP or A2A.
- Exact on limits under load: when several calls run at once, a limit can be passed by the number already running.

## 14. Final call to action

- **H2:** Put a conductor in front of your agents.
- **Sub:** Open source, Apache 2.0. Route, track and cost the work, and keep people in the loop.
- **Buttons:** "Get started" (#try-it) · "View on GitHub" (placeholder).
- **Install pill again:** `npm i @agentos/conductor` · `not on npm yet`

## 15. Footer

- **Left:** Signal& wordmark · "Conductor SDK" · "© 2026 Signal&. Licensed under Apache 2.0."
- **Right links:** GitHub · Docs · Writing agents · Licence.
- **Small print:** "Claude, Opus, Sonnet and Haiku are Anthropic's models. Costs shown are estimates from token usage at list prices."

---

# Part 3. Technical fact sheet

## What it is

- **Name:** Conductor SDK. **Company:** Signal&. **Licence:** Apache 2.0 (LICENSE and NOTICE in the repo). **Version:** 0.1.0.
- **One line:** routes, tracks and costs agent work.
- **Audience:** developers who run more than one agent and need to know who did what, on which model, and for how much.
- **Shape:** a TypeScript library (ESM) and a `conductor` command. Agents are described in plain-text markdown files ("cards"). Folders are teams.
- **Package:** currently `@agentos/conductor`, marked private and unpublished. The npm name and GitHub owner are not chosen yet; the suggested repo slug is `conductor-sdk`.
- **Runtime requirements:**
  - Node 20.19 or later for the built package; Node 22.18 or later runs the TypeScript source directly (type stripping).
  - One dependency: `yaml`.
  - The Claude add-on needs `@anthropic-ai/sdk` ^1.3.0, an optional peer dependency.
- **Code size (lines of code, not counting blank lines and comments):**
  - core: 2,050;
  - add-ons: 679;
  - tests: 795, in 6 files; 42 tests pass, all offline (the Claude add-on is tested against a local stand-in for the Claude API).
- **The core imports nothing from the add-ons or from any model vendor's SDK.**

## Imports

| Import | What it gives you |
| --- | --- |
| `@agentos/conductor` | `Conductor`, `loadAgents`, `createRegistry`, `FileStore`, `MemoryStore`, `parseCard`, `validateCard`, `plugFor`, `compiledRules`, `effectiveRules`, `taskMessage`, `agent`, `allowedFor`, errors (`ConflictError`, `GateStop`, `TimeoutError`, `RefusalError`), `RUNTIMES`, and all types. |
| `@agentos/conductor/claude` | `AnthropicModels` (runs model cards on Claude), `costOf`, `CLAUDE_PRICES`, type `Price`. |
| `@agentos/conductor/planner` | `ModelPlanner`: routes requests and plans teams that have no recipe. |
| `@agentos/conductor/switch` | `switchGate`, `switchOf`, `checkSwitch`, `usageThisMonth`: on/off, who may use, monthly runs and spend, downgrade, per-mission budget. |
| `@agentos/conductor/usage` | `usageReport`, `formatUsage`, `monthOf`: spend, runs, failures, average time and models, by agent and by person. |
| `@agentos/conductor/models` | `routeModels` (several providers by model-name prefix) and `scriptedModels` (canned answers, for tests and dry runs). |
| `@agentos/conductor/format` | `formatMission`: the text tree shown by `conductor status`. |
| `conductor` (bin) | The command line (below). |

## The Conductor

`new Conductor(options)`:

| Option | Default | What it is |
| --- | --- | --- |
| `registry` | required | The loaded agents: `await loadAgents('agents')`. |
| `store` | in memory | `MemoryStore`, `FileStore(dir)` (one JSON file per mission), or anything with `load`, `save`, `list`. |
| `models` | none | A `ModelProvider` for model agents. Without one, a model agent's task fails with "no model provider is configured". |
| `plugs` | none | Code for `function` agents, by agent id: `(task) => Promise<string \| {output, cost_usd?, model?}>`. |
| `planner` | none | Routes requests and plans teams with no recipe. Without one, those wait for a person. |
| `gates` | none | Asked before every call and told after it. |
| `maxDepth` | 4 | A task at this depth must be a worker, not a team. |
| `maxNodes` | 40 | Tasks per mission. |
| `maxParallel` | 4 | Tasks that run at the same time when none waits on another. |
| `maxWaitMs` | 30,000 | How long a retry delay is waited out in-process; longer waits resume with `advance`. |
| `now` | `() => new Date()` | The clock, for tests. |

Methods:
- `start(agentId, request, { capability?, inputs?, user?: {id, groups?}, id?, meta? })` → `Mission`. Any agent can be started directly, not only a team.
- `advance(id)`: resume (after a delay, or after a fix to an agent's file).
- `approve(id, task, { output_hash, by, note?, attempt? })`: a sign-off, bound to the output's hash.
- `reject(id, task, { by, note, attempt? })`: send the work back with a note.
- `resolve(id, task, { by, decision: 'complete' | 'error' | 'retry' | 'fail', output?, error?, note?, capability? })`. This does a person's task, or fixes a stuck one.
- `cancel(id)`, `get(id)`, `list()`.
- The mission is saved after every step, so every method works from any process that shares the store. A stale hash or attempt throws `ConflictError`.

## Agents ("cards")

A markdown file per agent.
- **Identity** is five bold bullets: `agent_id` (must match the file name, or the folder name for a team's `agent.md`), `name`, `version`, `role`, `runtime`.
- **Settings** go in ```yaml blocks, each named by its top-level key.
- A model agent's `## Instructions` section is its prompt, after its role.

**Runtimes:**
- `model`: an AI model;
- `function`: your code;
- `human`: a person does the task, via `resolve`;
- `conductor`: a team.

| Block | Fields |
| --- | --- |
| `capabilities` | `id`, `description`; `complexity` (low/medium/high); `autonomous: false` (a person approves the output); `steps` (teams: a fixed recipe of `{id, assigned_agent, capability_match, depends_on}`); `signals` (teams: words such as `/promo` that pick it with no model call); `irreversible` (never retried automatically); `score_scale` (checkers: `0-100`, `1-5`, `0-1`); `plug` (this capability's own model). |
| `plug` | `model`; `fallback` (models tried in order); `effort` (low, medium, high, xhigh, max); `max_tokens`. |
| `rules` | `approval` `{id, applies_to, reason}`; `check` `{id, applies_to, checker: {agent_id, capability}, min_score 0–100, max_revisions (default 2), reason}`; `before` `{id, first, then, reason}`. A rule on a team covers everything under it. |
| `failure_modes` | `trigger`, `when` (error, timeout, refusal, rejected), `match` (words in the error), `action` (retry, revise, needs-human, fail), `retries`, `delay_seconds`. |
| `constraints` | `max_runtime_minutes`, `requires_human_approval`, `cost_per_run_usd`. |
| `dependencies` | `required` / `optional` lists of `{agent_id, reason}`. A required one must run first. |
| `routes_to` | Agents outside the team's folder that the team may also use. |

Other loading rules:
- **Refused whole:** a file with any mistake is not loaded, and every reason is listed (`conductor check`).
- **Add-on blocks:** a block only an add-on reads, such as `switch:`, is accepted only when that add-on's gate is passed to `loadAgents`. Otherwise it is an error, so a typo is never silently ignored.
- **Older fields:** `autonomous: false` and `requires_human_approval` become approval rules; `dependencies.required` becomes a before rule.

**Folders are teams:**
- A folder with an `agent.md` is a team (runtime `conductor`), and its other `.md` files are its members. `README.md` is ignored.
- Teams nest.
- A team may hand work only to its members and to its `routes_to`.

## How a request runs

1. **Pick the capability.** In order:
   - the one the request names;
   - else a signal word (the request's first word);
   - else the router (the team's model, at low effort);
   - else a person is asked.
2. **Plan.** A capability with `steps` runs its recipe as written. One without steps is planned by the planner model, which:
   - sees single agents before teams, and sees no teams at the depth limit;
   - is told to prefer the simplest route.
3. **Check the plan.** Recipes and model plans pass the same checks:
   - the shape is valid;
   - every agent is allowed on this team, and its capability exists;
   - no task hands work to itself or a parent;
   - no loops, depth ≤ 4, at most 40 tasks;
   - every `before` rule holds.

   A bad model plan is sent back once with the reasons; if it fails again, a person is asked.
4. **Run.** Tasks run when the tasks they depend on finish, up to 4 at once.
   - **What a task receives:** its description, the request, its inputs, the output of every task upstream of it, and any notes from a checker or person. A team's output stands in for its children's, so nothing is sent twice.
   - **What a checker receives:** everything the checked task was given, then its output.
5. **Finish each task.** Checks run first, then approvals.
   - A check below `min_score` sends the work back with notes, up to `max_revisions` times.
   - An approval is bound to the output's sha256 hash.
6. **Failures.** These follow the agent's `failure_modes`.
   - Without any: a refusal goes to a person and any other failure fails the task.
   - Irreversible capabilities are never auto-retried.
   - Model agents fall through their `fallback` list first.

**Statuses:**
- task: pending, running, needs-human (waiting for approval, task or fix), complete, failed, blocked, cancelled;
- mission: running, needs-human, complete, failed, cancelled.

## Gates (where add-ons attach)

```ts
interface Gate {
  name: string;
  blocks?: Record<string, (value: unknown) => string[]>;  // agent-file blocks this gate reads, with a checker
  before?(call, context): { stop?: string; model?: string; via?: string; note?: string } | void;
  after?(run: RunRecord, call, context): void;
}
```

`before` can:
- stop a call: the task waits for a person, with the reason;
- swap the model, recorded as `via`.

`after` sees every run record. `context` gives `missions()` (for counting use over time) and `now()`. Limits, budgets, logging and model choice live in gates, not in the core.

## The record

One `RunRecord` is written per call, failed attempts included:

| Field | Meaning |
| --- | --- |
| `agent`, `capability` | Who was called, for what. |
| `kind` | `work`, `check`, `plan` or `route`. |
| `at`, `ms` | When, and how long. |
| `usd` | Cost; 0 with `unpriced: true` when the model reported no price. |
| `outcome` | `ok`, `error`, `timeout` or `refusal`. |
| `model` | The model that actually answered. |
| `via` | Why it was not the agent's own model: `fallback`, or a gate's word such as `downgrade`. |
| `user` | Who started the mission. |
| `by` | The person who did a human task. |

The mission also keeps:
- checks (verdict, score, notes, the output hash);
- approvals (by whom, the hash, a note);
- every task's output, attempts, retries, revisions and events;
- the cost per task and per mission.

## Cost

- The Claude add-on prices each call from the reply's token usage: input, output, cache write and cache read.
- **List prices as checked in October 2026** (USD per million tokens). Override or add with `new AnthropicModels({ prices })`.

| Model | Input | Output | Cache write | Cache read |
| --- | --- | --- | --- | --- |
| claude-fable-5-1 | 10 | 50 | 12.5 | 0.25 |
| claude-opus-5-5 | 4 | 20 | 5 | 0.2 |
| claude-sonnet-5-5 | 2 | 10 | 2.5 | 0.2 |
| claude-haiku-5-5 | 0.1 | 0.5 | 0.125 | 0.01 |

- A model with no price is recorded as **unpriced**, never as $0.
- A `function` agent can report its own cost, or use `constraints.cost_per_run_usd`.

## The Claude add-on (`AnthropicModels`)

- Options: `client`, `apiKey`, `baseURL`, `serverFallbacks` (default true), `maxTokens` (default 16,000), `prices`.
- Replies are streamed (no time limit on long replies) and only the final message is kept.
- Effort is passed through. The planner asks for JSON that matches a schema.
- Server-side fallback is on for the models that support it (Fable 5.1, Opus 5.5, Opus 5, Sonnet 5.5).
- A refusal is raised as `RefusalError`, which by default goes to a person. Running out of output tokens is an error that says to raise `max_tokens`.
- The system prompt is cached.
- A model name may carry an `anthropic/` prefix, for use with `routeModels`.

## The switch add-on (`switchGate`)

- **The `switch:` block** on any agent has these fields:
  - `enabled`;
  - `used_by` (people or groups);
  - `max_runs_per_month`, `max_usd_per_month`;
  - `downgrade_after_usd` with `downgrade_to`, which must be set together.
- **Per-mission budget:** `meta.budget_usd` on `start`, `--budget` on the command line, or `switchGate({ budgetUsd })`.
- **Failed calls** are recorded, but do not use up the run limit.
- **Tested behaviour:** with a $1 downgrade line and a $2 monthly cap, six calls went Opus, Opus, Sonnet (downgrade) three times, then stopped. The report showed 5 runs, $2.10, and `opus ×2, sonnet (downgrade) ×3`.

## The command line

```
conductor check                               load the agents and show the teams
conductor run <agent> "<request>"             start a mission
    [--capability <id>] [--input key=value]... [--user <id>] [--group <name>]... [--budget <usd>]
conductor status <mission> [--json]
conductor output <mission> [<task>]           print what a mission (or one task) produced
conductor list
conductor usage [--month YYYY-MM]             who used which agent, on which model, for how much
conductor approve <mission> <task> --hash <output hash> [--by <name>] [--note <text>]
conductor reject  <mission> <task> --note <why> [--by <name>]
conductor resolve <mission> <task> --decision complete|error|retry|fail [--output <text> | --output-file <file>] ...
conductor advance <mission>                   resume a mission
conductor cancel  <mission>
```

- **Every command takes:**
  - `--dir` (the agents; default `./agents` or `$AGENTOS_DIR`);
  - `--setup` (a module exporting `plugs`, and optionally `models`, `planner` or `gates`; or `$AGENTOS_SETUP`);
  - `--store` (default `./.agentos/missions`).
- **Defaults:** Claude via `$ANTHROPIC_API_KEY`, the planner, and the switch gate, unless the setup module exports its own.
- **Exit codes:** 0 done (or cancelled), 1 failed or an error, 2 a mistake in the command, 3 waiting for a person.

## Live evidence (Claude, 27 October 2026)

**Desk routing run** (`examples/desk`):
- Six requests ran at once, against one desk and four agents.
- All 6 went where a person would send them, in 17.9 s wall time, for $0.0886 total (13 calls, 0 failed).
- Per request: see the table in section 4.
- The first attempt that day routed 5 of 6. The planner had written the capability as "id: description", so one request stopped for a person. The fix:
  - the planner may only answer with real capability ids;
  - a test covers it.

  The rerun was 6 of 6.

**Hello example:** a recipe plus a host sign-off, on Claude. It completed for about $0.09 to $0.13 a run.

**Fuller SDK, same engine** (Signal&'s larger AgentOS SDK; not this package):
- A podcast episode team ran research, outline, draft, an editor's check, and the host's sign-off.
- The first live run found a real bug: the writer and editor were not given the research. The editor scored every draft 3/5, "unsupported".
- After the fix, every task gets all upstream output. Draft 1 scored 3.5/5 and was sent back with notes; draft 2 scored 4.5/5 and passed. Cost: $0.38, 190 s.
- Both packages carry the fix.

**Real output: the headlines request** (Haiku 5.5, $0.0032 with routing, 3.3 s):
```
1. Recording Vocals in a Small Room: What Actually Works
2. How to Get Clean Vocals in a Small Room
3. Small Room, Big Sound: Tips for Recording Vocals
4. Don't Let a Small Room Ruin Your Vocal Takes
5. Recording Vocals at Home: Taming the Small Room
```

**Real output: the LinkedIn post** (researcher on Sonnet, then writer on Opus). The writer's post:
```
I looked into the best time to post on LinkedIn.

The most common advice is weekday mornings, especially Tuesday to Thursday. Activity tends to peak around commute, morning, and lunch hours. LinkedIn is a workday platform, and it shows.

But there are some catches:

→ Most of this comes from scheduling-tool companies. They use their own customers' data, which leans toward brands and B2B marketers.
→ The studies don't agree on exact hours.
→ Your audience's time zone and job matter.
→ LinkedIn itself says little about timing. It focuses on relevant content and early engagement.

My takeaway: Start with weekday mornings. Then check your own analytics over a few weeks. Your audience beats any general benchmark.

When do you post? Have you noticed a difference?
```
The researcher had no web access and said so. Its notes began: "I can't browse, so everything below is from memory and needs checking against the original sources." If this output appears on the page, keep that caveat with it.

## Limits of v0.1

- It runs in one process. Missions survive on disk and resume from any process that reads the same store, but nothing is hosted: no server, HTTP API or dashboard.
- Limits are checked before each call. When several calls run at once, a limit can be passed by the number of calls already running.
- Agents run as models, your code, people and other teams. Agents behind MCP or A2A are not built yet.
- The researcher in the examples has no web access; anything it reports needs checking.

## Where it sits

- The conductor is the routing, record and cost layer. It is not an agent framework and not a workflow engine.
- An agent built with any framework can sit under it as a `function` agent.
- It does not replace a model provider. Claude is the built-in provider, and any other plugs in with one method.

---

# Part 4. What the page must not say

- No customers, testimonials, company logos, "trusted by", GitHub stars, download counts or community numbers. There are none yet.
- No benchmarks or speed claims beyond the live-run numbers in Part 2, each shown with its date and the note that costs are estimates from token usage at list prices.
- Not "production-ready", "enterprise-grade", "hosted", "cloud", "dashboard" or "no-code".
- Not "on npm": keep the "not on npm yet" tag until it is published. Keep the GitHub URL as a placeholder until the repo exists.
- Not "supports MCP" or "supports A2A".
- No Vercel name, logo, copy or artwork. No Anthropic logo; naming Claude and its models is fine.
- Don't say it "does the work". It routes, tracks and costs work that agents do.
- Use "agent" or "agent file" in headlines. Say "card" only after defining it: "each agent is a plain-text file (a card)".
