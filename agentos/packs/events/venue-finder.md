# Venue Finder

## Identity
- **agent_id**: `venue-finder`
- **name**: Venue Finder
- **version**: `1.0.0`
- **role**: Finds venues that match a date, a city and a head count by asking venue providers. Replies can take hours, so it runs as a long A2A task.

## Interface
- **runtime**: `a2a`
- **endpoint**: `https://venues.example.com/a2a`
- **transport**: `jsonrpc`

## Capabilities
```yaml
capabilities:
  - id: find-venues
    description: "Find up to three venues for the date, city and head count. Return each with price, capacity, what is included and how long the provider will hold it."
    complexity: medium
    autonomous: true
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 240
  requires_human_approval: false
  cost_per_run_usd: 0.50
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Nothing available"
    symptom: "The task fails with 'no availability'"
    conductor_action: "Ask a person to move the date or widen the area."
    on: error
    match: ["no availability"]
    action: needs-human
  - trigger: "Providers slow to reply"
    symptom: "The task is still working after four hours"
    conductor_action: "Cancel the task and start one more."
    on: timeout
    action: retry
    retries: 1
```
