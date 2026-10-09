# Builder

## Identity
- **agent_id**: `builder`
- **name**: Builder
- **version**: `1.0.0`
- **role**: Builds one release from a branch. When feedback names failing tests, fixes the code and builds again.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://builder.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
The build server's tool is called `start_build` and takes named arguments, so this capability maps onto it with `call:`.

```yaml
capabilities:
  - id: build-release
    description: "Build the update from the release branch. Return the build id, its artifact hash and a short build log. If feedback lists failing tests, fix them first."
    complexity: high
    autonomous: true
    call:
      tool: start_build
      arguments:
        branch: "{inputs.branch}"
        version: "{inputs.version}"
        instructions: "{message}"
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 20
  requires_human_approval: false
  cost_per_run_usd: 0.40
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Build farm busy"
    symptom: "The call times out while the build queue is full"
    conductor_action: "Retry once after 60 seconds."
    when: timeout
    action: retry
    retries: 1
    delay_seconds: 60
  - trigger: "Branch not found"
    symptom: "The error says the branch does not exist"
    conductor_action: "Ask a person for the right branch name."
    when: error
    match: ["branch not found"]
    action: needs-human
```
