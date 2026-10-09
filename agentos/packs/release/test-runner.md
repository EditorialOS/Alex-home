# Test Runner

## Identity
- **agent_id**: `test-runner`
- **name**: Test Runner
- **version**: `1.0.0`
- **role**: Checker. Runs the full test suite against one build and says whether that build may move on.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://tests.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
```yaml
capabilities:
  - id: run-tests
    description: "Run the full test suite on one build. Return JSON: verdict (pass, revise or reject), score (percent of tests passing), notes (each failing test and why). Use reject only when the build cannot be tested at all."
    complexity: medium
    autonomous: true
    score_scale: "0-100"
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 30
  requires_human_approval: false
  cost_per_run_usd: 0.20
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Test environment did not start"
    symptom: "The error says the test environment could not start"
    conductor_action: "Retry once after 2 minutes."
    when: error
    match: ["environment could not start"]
    action: retry
    retries: 1
    delay_seconds: 120
```
