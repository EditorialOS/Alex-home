# Rights Check

## Identity
- **agent_id**: `rights-check`
- **name**: Rights Check
- **version**: `0.1.0`
- **role**: Checks every music cue and clip in a script against the show's licences.
- **runtime**: `function`

## Capabilities
```yaml
capabilities:
  - id: clear-rights
    description: "A rights report: each cue in the script, and whether the show may use it."
    complexity: low
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Licence service did not answer"
    symptom: "The error says the licence service timed out"
    conductor_action: "Retry once after a second."
    when: error
    match: ["licence service"]
    action: retry
    retries: 1
    delay_seconds: 1
  - trigger: "A cue is not licensed"
    symptom: "The error names a cue with no licence"
    conductor_action: "The host swaps the cue or buys a licence, then retries."
    when: error
    match: ["not licensed"]
    action: needs-human
```
