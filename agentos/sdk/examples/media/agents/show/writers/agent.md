# Writers

## Identity
- **agent_id**: `writers`
- **name**: Writers' Room
- **version**: `0.1.0`
- **role**: Sub-conductor that turns research notes into a recordable script: an outline first, then the draft.
- **runtime**: `conductor`

## Capabilities
```yaml
capabilities:
  - id: write-script
    description: "A script for one episode: an outline and a draft the host can record."
    complexity: high
    steps:
      - id: outline
        assigned_agent: outliner
        capability_match: outline-episode
      - id: draft
        assigned_agent: scriptwriter
        capability_match: draft-script
```

## Rules
```yaml
rules:
  - id: editor-scores-draft
    kind: check
    applies_to: {agent_id: scriptwriter}
    checker: {agent_id: script-editor, capability: score-script}
    min_score: 75
    max_revisions: 2
    reason: "A draft goes to the host only once the editor scores it 4 out of 5 or better."
```

## Failure modes
When the host sends the script back, the last step (the draft) is redone with the host's note. The outline stays.

```yaml
failure_modes:
  - trigger: "The host sent the script back"
    symptom: "Rejected at sign-off"
    conductor_action: "The scriptwriter redrafts with the host's note."
    when: rejected
    action: revise
    retries: 2
```
