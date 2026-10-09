# Event Planner

## Identity
- **agent_id**: `event-planner`
- **name**: Event Planner
- **version**: `1.0.0`
- **role**: Top conductor of the events pack. Plans one event end to end by handing the venue search, the budget check and the invitations to the cards below. Does no work itself.

## Interface
- **runtime**: `conductor`

## Routing
```yaml
routes_to:
  - budget-checker
  - invitation-sender
  - venue-finder
```

## Capabilities
`plan-event` has no `steps`. Events differ too much for one fixed recipe, so Claude plans each one over `routes_to`, and the rules below check every plan before it runs.

```yaml
capabilities:
  - id: plan-event
    description: "Plan one event end to end: find a venue that fits the budget, draft the invitation for approval, then send it."
    complexity: high
    autonomous: true
```

## Rules
```yaml
rules:
  - id: venue-in-budget
    kind: check
    applies_to: {agent_id: venue-finder}
    checker: {agent_id: budget-checker, capability: check-budget}
    min_score: 75
    max_revisions: 2
    reason: "A venue moves forward only if it fits the budget."
  - id: draft-before-send
    kind: before
    first: {capability: draft-invitations}
    then: {capability: send-invitations}
    reason: "Invitations go out only from an approved draft."
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 3
  requires_human_approval: false
  cost_per_run_usd: 0.25
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Planner declined"
    symptom: "Claude refused to plan the event"
    conductor_action: "A person plans this event by hand."
    on: refusal
    action: needs-human
```
