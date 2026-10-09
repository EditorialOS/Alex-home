# Release

## Identity
- **agent_id**: `release`
- **name**: Release
- **version**: `1.0.0`
- **role**: Top conductor of the release pack. Ships one software update from a release branch to production. Hands every piece to the cards below and does no work itself.

## Interface
- **runtime**: `conductor`

## Routing
```yaml
routes_to:
  - build-and-test
  - changelog-writer
  - deployer
  - security-scan
```

## Capabilities
Both capabilities are recipes. `build-and-test` is a sub-conductor; to this card it is one step like any other.

```yaml
capabilities:
  - id: ship-update
    description: "Ship a planned update: build and test, full security scan, changelog, approved deploy plan, deploy."
    complexity: high
    autonomous: true
    steps:
      - id: build
        assigned_agent: build-and-test
        capability_match: build-and-verify
        depends_on: []
      - id: scan
        assigned_agent: security-scan
        capability_match: full-scan
        depends_on: [build]
      - id: notes
        assigned_agent: changelog-writer
        capability_match: write-changelog
        depends_on: [build]
      - id: plan
        assigned_agent: deployer
        capability_match: plan-deploy
        depends_on: [build, scan, notes]
      - id: deploy
        assigned_agent: deployer
        capability_match: deploy
        depends_on: [plan]
  - id: hotfix
    description: "Ship an urgent fix: build and test, quick security scan, approved deploy plan, deploy. No changelog."
    complexity: high
    autonomous: true
    steps:
      - id: build
        assigned_agent: build-and-test
        capability_match: build-and-verify
        depends_on: []
      - id: scan
        assigned_agent: security-scan
        capability_match: quick-scan
        depends_on: [build]
      - id: plan
        assigned_agent: deployer
        capability_match: plan-deploy
        depends_on: [build, scan]
      - id: deploy
        assigned_agent: deployer
        capability_match: deploy
        depends_on: [plan]
```

## Rules
This rule covers everything beneath a release node, including any card added to this pack later.

```yaml
rules:
  - id: scan-before-deploy
    kind: before
    first: {agent_id: security-scan}
    then: {agent_id: deployer}
    reason: "Nothing is planned for production or deployed until the same build has been scanned."
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
  - trigger: "A release step failed"
    symptom: "A child ended failed or blocked"
    conductor_action: "Stop. A person decides whether to retry the failed step or abandon this release."
    on: error
    match: ["children failed"]
    action: needs-human
```
