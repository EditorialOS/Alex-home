# Deployer

## Identity
- **agent_id**: `deployer`
- **name**: Deployer
- **version**: `1.0.0`
- **role**: Puts a tested build into production. First writes a deploy plan for a person to approve, then runs exactly that plan.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://deploy.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
`plan-deploy` stops for a person (v1's `autonomous: false`). `deploy` cannot be taken back, so the kernel records its intent before calling it.

```yaml
capabilities:
  - id: plan-deploy
    description: "Write the deploy plan for one build: build id, target, rollout steps, health checks and rollback steps."
    complexity: medium
    autonomous: false
  - id: deploy
    description: "Run an approved deploy plan in production. Cannot be undone."
    complexity: high
    autonomous: true
    irreversible: true
```

## Constraints
Only one deploy may run at a time, across all missions.

```yaml
constraints:
  max_runtime_minutes: 45
  requires_human_approval: false
  cost_per_run_usd: 0.15
  max_concurrent: 1
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Deploy plan sent back"
    symptom: "The approver rejects the plan with a note"
    conductor_action: "Write the plan again using the approver's note."
    when: rejected
    action: revise
    retries: 1
  - trigger: "Health check failed after rollout"
    symptom: "The deploy returns an error that mentions a health check"
    conductor_action: "Stop. A person checks production and decides whether to roll back."
    when: error
    match: ["health check"]
    action: needs-human
```

## Dependencies
```yaml
dependencies:
  required: []
  optional:
    - agent_id: build-and-test
      reason: "Only a built and tested update can be deployed."
```
