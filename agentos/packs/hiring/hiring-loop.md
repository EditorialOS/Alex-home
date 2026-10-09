# Hiring Loop

## Identity
- **agent_id**: `hiring-loop`
- **name**: Hiring Loop
- **version**: `1.0.0`
- **role**: Top conductor of the hiring pack. Runs one hiring loop for one role, from applicants to a drafted offer. Does no work itself and never sends an offer.

## Interface
- **runtime**: `conductor`

## Routing
```yaml
routes_to:
  - background-check
  - interview-panel
  - offer-drafter
  - resume-screener
```

## Capabilities
```yaml
capabilities:
  - id: run-hiring-loop
    description: "Run one hiring loop for one role: screen applicants, interview the shortlist, check the chosen candidate, draft the offer."
    complexity: high
    autonomous: true
    steps:
      - id: screen
        assigned_agent: resume-screener
        capability_match: screen-resumes
        depends_on: []
      - id: interview
        assigned_agent: interview-panel
        capability_match: run-interviews
        depends_on: [screen]
      - id: check
        assigned_agent: background-check
        capability_match: run-check
        depends_on: [interview]
      - id: offer
        assigned_agent: offer-drafter
        capability_match: draft-offer
        depends_on: [interview, check]
```

## Rules
```yaml
rules:
  - id: approve-shortlist
    kind: approval
    applies_to: {capability: screen-resumes}
    reason: "A person approves the shortlist before anyone is invited to interview."
  - id: check-before-offer
    kind: before
    first: {agent_id: background-check}
    then: {agent_id: offer-drafter}
    reason: "No offer is drafted before the background check is back."
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 3
  requires_human_approval: false
  cost_per_run_usd: 0.10
```

## Failure modes
```yaml
failure_modes:
  - trigger: "A hiring step failed"
    symptom: "A child ended failed or blocked"
    conductor_action: "Tell the hiring manager which step stopped and why."
    on: error
    match: ["children failed"]
    action: needs-human
```
