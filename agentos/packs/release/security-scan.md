# Security Scan

## Identity
- **agent_id**: `security-scan`
- **name**: Security Scan
- **version**: `1.0.0`
- **role**: Scans one build for known vulnerabilities and leaked secrets. The full scan runs in the nightly batch. The quick scan and the database update run on demand.

## Interface
The card's runtime is `queue`: the nightly scanner picks up job files. Two capabilities override it with `mcp`, which is why this card has an endpoint.

- **runtime**: `queue`
- **endpoint**: `https://scanner.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
```yaml
capabilities:
  - id: full-scan
    description: "Full security scan of one build: dependencies, container image and leaked secrets. Runs in the nightly batch."
    complexity: high
    autonomous: true
  - id: quick-scan
    description: "Fast scan of one build: dependencies and leaked secrets only. Runs on demand in a few minutes."
    complexity: low
    autonomous: true
    runtime: mcp
  - id: update-database
    description: "Download the latest vulnerability database so that scans see new advisories."
    complexity: low
    autonomous: true
    runtime: mcp
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 10
  requires_human_approval: false
  cost_per_run_usd: 0.30
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Vulnerability database out of date"
    symptom: "The scan stops with 'database out of date'"
    conductor_action: "Update the vulnerability database, then scan again."
    when: error
    match: ["database out of date"]
    action: run_first
    run_first: {agent_id: security-scan, capability: update-database}
```
