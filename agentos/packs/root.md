# Root

The front door. Every mission starts here.

## Identity
- **agent_id**: `root`
- **name**: Root
- **version**: `1.0.0`
- **role**: The front door. Sends each request to the pack that fits it and hands over the whole request. Does no work itself.

## Interface
- **runtime**: `conductor`

## Routing
```yaml
routes_to:
  - event-planner
  - hiring-loop
  - release
```

## Capabilities
A request whose first word matches a signal is routed with no Claude call. Anything else is classified by Claude into one of these capabilities. If none fits, a person is asked.

```yaml
capabilities:
  - id: plan-event
    description: "Plan an event: venue, budget check, invitations."
    complexity: high
    autonomous: true
    signals: ["/event"]
    steps:
      - id: event
        assigned_agent: event-planner
        capability_match: plan-event
  - id: ship-release
    description: "Ship a software update: build, test, scan, changelog, deploy."
    complexity: high
    autonomous: true
    signals: ["/release"]
    steps:
      - id: release
        assigned_agent: release
        capability_match: ship-update
  - id: ship-hotfix
    description: "Ship an urgent fix: build, test, quick scan, deploy."
    complexity: high
    autonomous: true
    signals: ["/hotfix"]
    steps:
      - id: hotfix
        assigned_agent: release
        capability_match: hotfix
  - id: hire
    description: "Run a hiring loop for one role: screen, interview, check, offer."
    complexity: high
    autonomous: true
    signals: ["/hire"]
    steps:
      - id: hiring
        assigned_agent: hiring-loop
        capability_match: run-hiring-loop
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 2
  requires_human_approval: false
  cost_per_run_usd: 0.05
```

