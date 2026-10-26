# Show

## Identity
- **agent_id**: `show`
- **name**: Show
- **version**: `0.1.0`
- **role**: Top conductor for Northlight's three weekly shows. Turns an episode idea into a researched, approved script, a promo kit and a scheduled release. Hands every piece to its team and does no work itself.
- **runtime**: `conductor`

## Capabilities
`writers` and `promo` are teams. To this card each is one step like any other. A request that starts with `/episode` or `/promo` is routed with no model call; anything else, the conductor's model picks the capability.

```yaml
capabilities:
  - id: make-episode
    description: "An episode from idea to scheduled release: research, an approved script, cleared rights, a promo kit, a release plan."
    complexity: high
    signals: ["/episode"]
    steps:
      - id: research
        assigned_agent: researcher
        capability_match: research-topic
        depends_on: []
      - id: script
        assigned_agent: writers
        capability_match: write-script
        depends_on: [research]
      - id: rights
        assigned_agent: rights-check
        capability_match: clear-rights
        depends_on: [script]
      - id: promo
        assigned_agent: promo
        capability_match: promote
        depends_on: [script]
      - id: release
        assigned_agent: publisher
        capability_match: schedule-release
        depends_on: [rights, promo]
  - id: promote-episode
    description: "A promo kit for an episode that is already made: thumbnail brief, clips, newsletter blurb."
    complexity: medium
    signals: ["/promo"]
    steps:
      - id: promo
        assigned_agent: promo
        capability_match: promote
```

## Rules
These cover everything under a show node, including cards added to the folder later.

```yaml
rules:
  - id: host-signs-off
    kind: approval
    applies_to: {agent_id: writers, capability: write-script}
    reason: "The host reads the script before anything is made from it."
  - id: rights-before-release
    kind: before
    first: {agent_id: rights-check}
    then: {agent_id: publisher}
    reason: "Nothing is scheduled until its music and clips are cleared."
```

## Failure modes
```yaml
failure_modes:
  - trigger: "A step failed"
    symptom: "A child ended failed or blocked"
    conductor_action: "Stop. The host decides whether to retry the step or drop the episode."
    when: error
    match: ["children failed"]
    action: needs-human
```
