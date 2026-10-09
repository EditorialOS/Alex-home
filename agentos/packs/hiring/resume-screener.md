# Resume Screener

## Identity
- **agent_id**: `resume-screener`
- **name**: Resume Screener
- **version**: `1.0.0`
- **role**: Reads every application for one role and returns a ranked shortlist with reasons.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://screening.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
```yaml
capabilities:
  - id: screen-resumes
    description: "Score every applicant against the role's must-haves. Return a ranked shortlist of up to eight, with one line of reasons for each."
    complexity: medium
    autonomous: true
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
  - trigger: "Role description missing"
    symptom: "The error says there is no role description"
    conductor_action: "Ask the hiring manager for the role description, then retry with it as the note."
    on: error
    match: ["no role description"]
    action: needs-human
```
