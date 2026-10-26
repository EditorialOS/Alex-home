# Northlight Audio (a made-up case study)

A four-person podcast network running three weekly shows on one team of cards.

| Path | What it is |
| --- | --- |
| `agents/show/` | Northlight's cards: the media example's show team, with its own script limits (`writers/scriptwriter.md`). |
| `simulate.ts` | One simulated month: 15 requests from four people through the real conductor. The model replies are written in advance. |
| `run-log.md` | What `simulate.ts` writes: every request's tree, every time a person stepped in, and the usage report. |

```sh
cd agentos/sdk
node src/cli.ts check --dir examples/case-study/agents
node examples/case-study/simulate.ts
```

Northlight's rights check and publisher are the stand-ins in `examples/media/setup.ts`. Run on Claude, an episode request looks like this:

```sh
export AGENTOS_DIR=examples/case-study/agents AGENTOS_SETUP=examples/media/setup.ts
node src/cli.ts run show "Margins 23: the tailor who only mends" --user priya --group producers
```
