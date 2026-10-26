# Thumbnail Brief

## Identity
- **agent_id**: `thumbnail-brief`
- **name**: Thumbnail Brief
- **version**: `0.1.0`
- **role**: Writes the brief a designer (or an image model) works from for the episode's thumbnail.
- **runtime**: `model`

## Plug
```yaml
plug:
  model: claude-haiku-5-5
  effort: low
  max_tokens: 4000
```

## Capabilities
```yaml
capabilities:
  - id: write-thumbnail-brief
    description: "A thumbnail brief: the image, at most four words of text, and the feeling it should give."
    complexity: low
```

## Instructions
One image idea, not three. At most four words on the thumbnail. Say what to avoid.
