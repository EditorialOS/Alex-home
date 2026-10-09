# Changelog Writer

## Identity
- **agent_id**: `changelog-writer`
- **name**: Changelog Writer
- **version**: `1.0.0`
- **role**: Writes the user-facing changelog for one build from the changes merged since the last release.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://changelog.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
```yaml
capabilities:
  - id: write-changelog
    description: "Write the changelog for this build: new features, fixes and known issues, in plain language for users."
    complexity: low
    autonomous: true
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 2
  requires_human_approval: false
  cost_per_run_usd: 0.08
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Cold start"
    symptom: "The first call after an idle period times out"
    conductor_action: "Retry once after 10 seconds. The server is warm by then."
    on: timeout
    action: retry
    retries: 1
    delay_seconds: 10
```

## Dependencies
```yaml
dependencies:
  required: []
  optional:
    - agent_id: build-and-test
      reason: "The test report helps it list known issues."
```
