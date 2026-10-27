# Writing cards

A card is a short text file that describes one agent: what it does, which model it runs on, and the rules its work follows. A folder of cards is a team. This page has the whole format, and a prompt for having Claude write the cards for you from a plain description of your team.

## Have Claude write them

Paste this into Claude, with your team described at the end. Then put the files it gives you in a folder and run `conductor check --dir <folder>`. If `check` lists mistakes, paste them back to Claude and ask it to fix them.

````text
Write agent cards for the AgentOS Conductor, one file per agent, from the team I describe at the end.

The format:
- A team is a folder. Its conductor is the folder's agent.md (runtime: conductor). The other .md files in the folder are its members. Teams can sit inside teams.
- Each card starts with "# <Name>", then "## Identity" with five bold bullets:
  - **agent_id**: `<id>`, the same as the file name (or the folder name, for agent.md)
  - **name**: <Name>
  - **version**: `0.1.0`
  - **role**: one or two sentences: what this agent does
  - **runtime**: `model` (an AI model), `function` (code), `human` (a person), or `conductor` (a team)
- Settings go in ```yaml blocks, each named by its top-level key:
  - capabilities: a list of {id, description}. On a team, `steps` is a fixed recipe:
    [{id, assigned_agent, capability_match, depends_on}]. Without steps, the team's
    model decides who does what. A team with several capabilities can give each
    `signals`, words such as "/promo" that pick it with no model call. Any capability
    can have its own `plug`. `autonomous: false` means a person approves its output.
  - plug (model cards and teams): {model, fallback: [models], effort: low|medium|high, max_tokens}
  - rules (usually on a team): a list of
    - {id, kind: approval, applies_to: {agent_id, capability}, reason}: a person signs off
    - {id, kind: check, applies_to: {...}, checker: {agent_id, capability}, min_score: 0-100, max_revisions, reason}: another agent scores the work
    - {id, kind: before, first: {agent_id}, then: {agent_id}, reason}: one step must come first
  - failure_modes: a list of {trigger, when: error|timeout|refusal|rejected, match: [words], action: retry|revise|needs-human|fail, retries}
  - routes_to: ids of agents outside the folder that a team may also use
- A model card ends with "## Instructions": its prompt, in plain words.

Rules for you:
- Use claude-sonnet-5-5 by default, claude-opus-5-5 for long or hard writing, and claude-haiku-5-5 for short, simple jobs.
- Give each agent one clear job. Put the sign-offs and checks my description asks for as rules on the team.
- Use only what I describe. Where something is unclear, ask me instead of guessing.
- Reply with each file's path and its full contents.

My team:
<describe your team here: what work comes in, who does each part, who signs off, what must never happen>
````

## The format, in full

### Identity

| Bullet | What it is |
| --- | --- |
| `agent_id` | Must match the file name, or the folder name for a team's `agent.md`. |
| `name` | A readable name. |
| `version` | Any version string. |
| `role` | What the agent does. Model cards use it as the start of their prompt. |
| `runtime` | `model`, `function`, `human` or `conductor`. A folder's `agent.md` is always `conductor`. |

### Blocks

| Block | Fields |
| --- | --- |
| `capabilities` | `id`, `description`; `complexity` (low, medium, high); `autonomous` (false: a person approves the output); `steps` (teams: a recipe); `signals` (teams: words that pick this capability); `irreversible` (workers: never retried automatically); `score_scale` (checkers: `0-100`, `1-5` or `0-1`); `plug` (this capability's own model). |
| `plug` | `model`; `fallback` (models tried in order if it fails); `effort` (low, medium, high, xhigh, max); `max_tokens`. |
| `rules` | `approval`, `check` and `before`, each with an `id` and a `reason` (see the prompt above). A rule on a team covers everything under it. |
| `constraints` | `max_runtime_minutes`; `requires_human_approval`; `cost_per_run_usd` (a price for a card that reports none). |
| `dependencies` | `required` and `optional` lists of `{agent_id, reason}`. A required one must run first. |
| `failure_modes` | `trigger`, `symptom`, `conductor_action`, `when`, `match`, `action`, `retries`, `delay_seconds`. Without one, a refusal goes to a person and any other failure fails the task. |
| `routes_to` | Agents outside the team's folder that it may also use. |

A block only an add-on reads is accepted when that add-on is loaded. The switch add-on reads:

```yaml
switch:
  enabled: true
  used_by: [producers]        # people or groups who may use this agent
  max_runs_per_month: 30
  max_usd_per_month: 40
  downgrade_after_usd: 20     # past this, a model card runs on downgrade_to
  downgrade_to: claude-sonnet-5-5
```

### Instructions

A model card's `## Instructions` section is its prompt, after its role. Write it as you would brief a person: what good looks like, what to avoid, how long.

### What each agent receives

Each task gets its description, the request, any inputs, and the output of every task upstream of it, plus notes from a checker or a person if it is being redone. A checker gets everything the task it checks was given, then that task's output.
