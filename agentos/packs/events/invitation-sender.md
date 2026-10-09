# Invitation Sender

## Identity
- **agent_id**: `invitation-sender`
- **name**: Invitation Sender
- **version**: `1.0.0`
- **role**: Drafts the invitation and guest list for a person to approve, then sends exactly the approved version.

## Interface
- **runtime**: `mcp`
- **endpoint**: `https://invites.example.com/mcp`
- **transport**: `streamable-http`

## Capabilities
Sending is also how this pack delivers its result: an outbound delivery is just a worker capability at the end of the work.

```yaml
capabilities:
  - id: draft-invitations
    description: "Draft the invitation and the guest list for the chosen venue and date."
    complexity: low
    autonomous: false
  - id: send-invitations
    description: "Send the approved invitation to everyone on the approved guest list. Cannot be undone."
    complexity: low
    autonomous: true
    irreversible: true
```

## Constraints
```yaml
constraints:
  max_runtime_minutes: 5
  requires_human_approval: false
  cost_per_run_usd: 0.05
```

## Failure modes
```yaml
failure_modes:
  - trigger: "Guest list missing"
    symptom: "The error says there is no guest list"
    conductor_action: "Ask the organizer for the guest list, then retry with it as the note."
    on: error
    match: ["no guest list"]
    action: needs-human
```

## Dependencies
```yaml
dependencies:
  required:
    - agent_id: venue-finder
      reason: "Invitations need a chosen venue."
  optional: []
```
