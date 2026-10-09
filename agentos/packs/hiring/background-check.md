# Background Check

## Identity
- **agent_id**: `background-check`
- **name**: Background Check
- **version**: `1.0.0`
- **role**: Checks employment history and references for one candidate through an outside provider.

## Interface
The provider works through a queue: the kernel drops a job file, and a small bridge script hands it to the provider, then calls `resolve` with the result, often days later. No endpoint is needed.

- **runtime**: `queue`

## Capabilities
```yaml
capabilities:
  - id: run-check
    description: "Check employment history and references for the chosen candidate. An outside provider works the queue; results take one to three days."
    complexity: medium
    autonomous: true
```

## Constraints
`requires_human_approval: true` is the v1 field. In AgentOS it becomes an approval rule on every capability of this card: a person reads the result before anything downstream uses it.

```yaml
constraints:
  requires_human_approval: true
  cost_per_run_usd: 4.00
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Consent missing"
    symptom: "The provider returns 'consent missing'"
    conductor_action: "Ask the recruiter to collect the candidate's consent, then retry."
    when: error
    match: ["consent missing"]
    action: needs-human
```
