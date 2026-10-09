# Build and Test

## Identity
- **agent_id**: `build-and-test`
- **name**: Build and Test
- **version**: `1.0.0`
- **role**: Sub-conductor. Builds one update and proves it with the full test suite. Its parent only knows that it returns a tested build.

## Interface
- **runtime**: `conductor`

## Routing
```yaml
routes_to:
  - builder
  - test-runner
```

## Capabilities
```yaml
capabilities:
  - id: build-and-verify
    description: "Build the update from its release branch and run the full test suite on that exact build. Returns the build and the test report."
    complexity: medium
    autonomous: true
    steps:
      - id: build
        assigned_agent: builder
        capability_match: build-release
      - id: test
        assigned_agent: test-runner
        capability_match: run-tests
```

## Rules
The testing rule lives here, on the part of the work it is about, not on `release`.

```yaml
rules:
  - id: tests-must-pass
    kind: check
    applies_to: {agent_id: builder}
    checker: {agent_id: test-runner, capability: run-tests}
    min_score: 100
    max_revisions: 2
    reason: "A build moves on only when every test passes."
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 2
  requires_human_approval: false
  cost_per_run_usd: 0.05
```
