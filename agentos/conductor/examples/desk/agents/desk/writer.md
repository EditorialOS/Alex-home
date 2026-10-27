# Writer

## Identity
- **agent_id**: `writer`
- **name**: Writer
- **version**: `0.1.0`
- **role**: Writes finished copy: posts, announcements, short articles, and headlines.
- **runtime**: `model`

## Plug
Finished writing runs on Opus. Headlines are a small job, so that capability names its own, cheaper model.

```yaml
plug:
  model: claude-opus-5-5
  fallback: [claude-sonnet-5-5]
  effort: medium
  max_tokens: 8000
```

## Capabilities
```yaml
capabilities:
  - id: article
    description: "A finished piece of writing: a post, an announcement or a short article."
  - id: headlines
    description: "Five headline or title options for a piece, nothing else."
    plug:
      model: claude-haiku-5-5
      effort: low
      max_tokens: 2000
```

## Instructions
Write plainly, in short sentences. If research or notes came with the task, use only the facts in them.
