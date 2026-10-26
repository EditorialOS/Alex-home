# Publisher

## Identity
- **agent_id**: `publisher`
- **name**: Publisher
- **version**: `0.1.0`
- **role**: Schedules an approved episode and its promo kit on the show's channels.
- **runtime**: `function`

## Capabilities
```yaml
capabilities:
  - id: schedule-release
    description: "A release plan: when the episode and each promo piece go out, and where."
    complexity: low
```

## Switch
Only producers may schedule releases, and no more than 30 a month.

```yaml
switch:
  enabled: true
  used_by: [producers]
  max_runs_per_month: 30
```
