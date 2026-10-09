# Budget Checker

## Identity
- **agent_id**: `budget-checker`
- **name**: Budget Checker
- **version**: `1.0.0`
- **role**: Checker. Compares venue quotes with the event budget and says whether the venue may move forward.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://budget.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
This checker scores on a 1 to 5 scale. `score_scale` tells the kernel how to turn that into 0 to 100, so the rule's `min_score: 75` means "at least 4 out of 5".

```yaml
capabilities:
  - id: check-budget
    description: "Compare venue quotes with the event budget, including catering and fees. Return JSON: verdict (pass, revise or reject), score from 1 (far over budget) to 5 (well under), notes. Use reject when no option can fit."
    complexity: low
    autonomous: true
    score_scale: "1-5"
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 2
  requires_human_approval: false
  cost_per_run_usd: 0.03
```
