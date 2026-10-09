# AgentOS

AgentOS is a small operating system for agents: each agent is described by a plain-text card, and a tiny kernel turns every request into a tree of tasks, hands each task to the right card, enforces the rules written on the cards, and keeps a full record. It grows out of the v1 Conductor, which becomes the kernel, and adds sub-conductors: cards that do their job by handing pieces to other cards, so teams can nest without their parents knowing.

**Status: draft.** This folder holds a specification and example cards only. No code exists yet, and everything here is open to review.

## What's in this folder

| Path | What it is |
|---|---|
| `SPEC.md` | The specification: design rules, card format, runtimes, rules, API, and one mission walked end to end (§17). |
| `packs/root.md` | The root conductor: the front door that sends each request to a pack. |
| `packs/events/` | Event planning: `event-planner` (conductor, planned by Claude), `venue-finder` (A2A agent), `budget-checker` (checker), `invitation-sender`. |
| `packs/release/` | Shipping a software update: `release` (conductor), `build-and-test` (sub-conductor), `builder`, `test-runner` (checker), `changelog-writer`, `security-scan` (nightly queue, with on-demand modes), `deployer`. |
| `packs/hiring/` | A hiring loop: `hiring-loop` (conductor), `resume-screener`, `interview-panel` (people), `background-check` (queue), `offer-drafter`. |

Every endpoint in the cards is an `example.com` placeholder, not a real service.

To read it quickly: §1 and §2 of the spec for the ideas, §6 for the card format, §17 for the worked example.
