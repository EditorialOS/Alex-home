# Interview Panel

## Identity
- **agent_id**: `interview-panel`
- **name**: Interview Panel
- **version**: `1.0.0`
- **role**: A human role. The people who interview the shortlist and pick a candidate.

## Interface
People work at their own pace, so this card has no endpoint. The kernel shows the task in the mission record, and the panel lead returns the result through the API.

- **runtime**: `human`

## Capabilities
```yaml
capabilities:
  - id: run-interviews
    description: "Interview the approved shortlist. Return one scorecard per candidate and the panel's pick, with reasons."
    complexity: high
    autonomous: true
```

## Constraints
```yaml
constraints:
  requires_human_approval: false
  cost_per_run_usd: 0
```

## Failure modes
```yaml
failure_modes:
  - trigger: "No one passed"
    symptom: "The panel reports an error saying 'no pick'"
    conductor_action: "Stop this loop. The hiring manager decides whether to reopen screening."
    on: error
    match: ["no pick"]
    action: fail
```
