# Promo

## Identity
- **agent_id**: `promo`
- **name**: Promo
- **version**: `0.1.0`
- **role**: Sub-conductor that makes the promo kit for an episode. Has no recipe: it picks the pieces each episode needs.
- **runtime**: `conductor`

## Plug
The model that plans this team's work.

```yaml
plug:
  model: claude-sonnet-5-5
  effort: low
```

## Capabilities
```yaml
capabilities:
  - id: promote
    description: "A promo kit for one episode: whichever of a thumbnail brief, short clips and a newsletter blurb it needs."
    complexity: medium
```
