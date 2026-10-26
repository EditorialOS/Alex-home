# Northlight Audio: one simulated month

Made up, and simulated: the conductor, cards, rules and switches are real (`examples/case-study/agents`), and every route, check, sign-off, block and retry below came out of the engine. The model replies were written in advance; their token counts, timing and cost are simulated, at Claude list prices. Regenerate with `node examples/case-study/simulate.ts`.

## Summary

- Requests: 15. Episodes shipped: 13 of 13.
- Agent calls: 146, 2 failed. Estimated cost: $2.69.
- People stepped in 21 times: maya 5, priya 6, lee 5, sam 5.

## Every time a person stepped in

| When (UTC) | Who | Request | Task | What |
| --- | --- | --- | --- | --- |
| 2026-11-02 12:04 | maya | nl-sr41 | task-2 | approved |
| 2026-11-03 12:02 | priya | nl-mg18 | task-2 | rejected: Open with the 6 a.m. queue, not the history of the shop. |
| 2026-11-03 15:04 | priya | nl-mg18 | task-2 | approved |
| 2026-11-04 12:02 | lee | nl-ns9 | task-2 | approved |
| 2026-11-04 12:32 | sam | nl-ns9 | task-5 | resolved: complete (lee may not publish) |
| 2026-11-09 12:05 | maya | nl-sr42 | task-2 | approved |
| 2026-11-10 12:02 | priya | nl-mg19 | task-2 | approved |
| 2026-11-11 12:02 | lee | nl-ns10 | task-2 | approved |
| 2026-11-11 13:02 | sam | nl-ns10 | task-3 | resolved: complete (swapped the unlicensed cue) |
| 2026-11-11 13:32 | sam | nl-ns10 | task-5 | resolved: complete (lee may not publish) |
| 2026-11-12 10:20 | maya | nl-guest-dec | root | resolved: fail (not a job for the show team; booking it myself) |
| 2026-11-16 12:02 | maya | nl-sr43 | task-2 | approved |
| 2026-11-17 12:04 | priya | nl-mg20 | task-2 | approved |
| 2026-11-18 12:02 | lee | nl-ns11 | task-2 | rejected: Too much about the dispatch centre, not enough about her. Use the bit about sitting in the car at dawn. |
| 2026-11-18 15:04 | lee | nl-ns11 | task-2 | approved |
| 2026-11-18 15:34 | sam | nl-ns11 | task-5 | resolved: complete (lee may not publish) |
| 2026-11-23 12:01 | maya | nl-sr44 | task-2 | approved |
| 2026-11-24 12:03 | priya | nl-mg21 | task-2 | approved |
| 2026-11-25 12:02 | lee | nl-ns12 | task-2 | approved |
| 2026-11-25 12:32 | sam | nl-ns12 | task-5 | resolved: complete (lee may not publish) |
| 2026-11-30 12:02 | priya | nl-mg22 | task-2 | approved |

## Usage, as `agentos usage` prints it

```text
Usage from 2026-11-01 to 2026-12-01: $2.6873

agent              runs  failed        usd     avg  limits
scriptwriter         20       1    $1.8836   84.1s  $1.88 of $3 · cheaper model past $1.5
                  claude-opus-5-5 ×15, claude-sonnet-5-5 (fallback) ×1, claude-sonnet-5-5 (downgrade) ×5
researcher           13       0    $0.2665   27.5s  $0.27 of $20
                  claude-sonnet-5-5 ×13
script-editor        20       0    $0.2600   12.4s  
                  claude-sonnet-5-5 ×20
outliner             13       0    $0.1131    9.9s  
                  claude-sonnet-5-5 ×13
promo                14       0    $0.0952    8.2s  
                  claude-sonnet-5-5 ×14
show                 10       0    $0.0560    4.4s  
                  claude-opus-5-5 ×10
newsletter-blurb     14       0    $0.0055    3.2s  
                  claude-haiku-5-5 ×14
thumbnail-brief      10       0    $0.0039    3.2s  
                  claude-haiku-5-5 ×10
clip-picker           9       0    $0.0035    3.2s  
                  claude-haiku-5-5 ×9
rights-check         12       1    $0.0000    0.0s  
publisher             9       0    $0.0000    0.0s  9 of 30 runs · used by producers

By caller:
  priya: 56 runs, $1.0361
  maya: 47 runs, $0.9101
  lee: 37 runs, $0.7331
  sam: 4 runs, $0.0080
```

## Every request

### nl-sr41 · maya · complete

```text
nl-sr41 · complete · $0.2848 of $2.00
request: /episode Small Rooms 41: mixing vocals on cheap headphones

root  show/make-episode  [complete]
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  attempt 2 · $0.2476 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  ├─ task-4.2  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.3  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-02 09:00 root: routed to make-episode by the signal /episode
- 11-02 09:02 task-2.2: check writers/editor-scores-draft asked for a revision (score 50): revision 1 of 2
- 11-02 12:04 task-2: approved by maya
- 11-02 12:04 task-4: planned 3 tasks from the planner

### nl-mg18 · priya · complete

```text
nl-mg18 · complete · $0.2900 of $2.00
request: Margins 18: the bakery that closes at noon

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  attempt 2 · $0.2476 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-03 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-03 12:02 task-2: rejected by priya: Open with the 6 a.m. queue, not the history of the shop.
- 11-03 15:04 task-2: approved by priya
- 11-03 15:04 task-4: planned 2 tasks from the planner

### nl-ns9 · lee · complete

```text
nl-ns9 · complete · $0.1662 of $2.00
request: Night Shift 9: the bridge operator

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.1238 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-04 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-04 12:02 task-2: approved by lee
- 11-04 12:02 task-4: planned 2 tasks from the planner
- 11-04 12:02 task-5: `lee` may not use `publisher` (used by: producers)
- 11-04 12:32 task-5: resolved by sam: complete (lee may not publish)

### nl-promo-sr40 · sam · complete

```text
nl-promo-sr40 · complete · $0.0080 of $2.00
request: /promo Small Rooms 40: the loudness war, explained

root  show/promote-episode  [complete]
└─ task-1  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
   ├─ task-1.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
   ├─ task-1.2  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
   └─ task-1.3  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
```

- 11-05 14:00 root: routed to promote-episode by the signal /promo
- 11-05 14:00 task-1: planned 3 tasks from the planner

### nl-sr42 · maya · complete

```text
nl-sr42 · complete · $0.4086 of $2.00
request: /episode Small Rooms 42: why your room matters more than your mic

root  show/make-episode  [complete]
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  attempt 3 · $0.3714 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  ├─ task-4.2  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.3  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-09 09:00 root: routed to make-episode by the signal /episode
- 11-09 09:02 task-2.2: check writers/editor-scores-draft asked for a revision (score 50): revision 1 of 2
- 11-09 09:04 task-2.2: check writers/editor-scores-draft asked for a revision (score 50): revision 2 of 2
- 11-09 12:05 task-2: approved by maya
- 11-09 12:06 task-4: planned 3 tasks from the planner

### nl-mg19 · priya · complete

```text
nl-mg19 · complete · $0.1662 of $2.00
request: Margins 19: pricing a side hustle

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.1238 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-10 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-10 12:02 task-2: approved by priya
- 11-10 12:02 task-4: planned 2 tasks from the planner

### nl-ns10 · lee · complete

```text
nl-ns10 · complete · $0.1662 of $2.00
request: Night Shift 10: the 3 a.m. radiologist

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.1238 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-11 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-11 12:02 task-2: approved by lee
- 11-11 12:02 task-3: error: not licensed: Late Night Diner (stock)
- 11-11 12:02 task-3: not licensed: Late Night Diner (stock). The host swaps the cue or buys a licence, then retries.
- 11-11 12:02 task-4: planned 2 tasks from the planner
- 11-11 13:02 task-3: resolved by sam: complete (swapped the unlicensed cue)
- 11-11 13:02 task-5: `lee` may not use `publisher` (used by: producers)
- 11-11 13:32 task-5: resolved by sam: complete (lee may not publish)

### nl-guest-dec · maya · failed

```text
nl-guest-dec · failed · $0.0056 of $2.00
request: Find and book a guest for the December Small Rooms episode

root  show/(not routed)  [failed]  $0.0056 · claude-opus-5-5
   not a job for the show team; booking it myself
```

- 11-12 10:00 root: No capability fits this request (Booking a guest is not one of the show team's jobs). Retry with a note, retry naming a capability (make-episode, promote-episode), or fail it.
- 11-12 10:20 root: resolved by maya: fail (not a job for the show team; booking it myself)

### nl-sr43 · maya · complete

```text
nl-sr43 · complete · $0.1056 of $2.00
request: /episode Small Rooms 43: gain staging without the jargon

root  show/make-episode  [complete]
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.0684 · claude-sonnet-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  ├─ task-4.2  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.3  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-16 09:00 root: routed to make-episode by the signal /episode
- 11-16 09:01 task-2.2: claude-opus-5-5 failed (529 overloaded_error: Overloaded); trying the next model
- 11-16 12:02 task-2: approved by maya
- 11-16 12:02 task-4: planned 3 tasks from the planner

### nl-mg20 · priya · complete

```text
nl-mg20 · complete · $0.2900 of $2.00
request: Margins 20: the bike shop that rents, not sells

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  attempt 2 · $0.2476 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-17 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-17 09:02 task-2.2: check writers/editor-scores-draft asked for a revision (score 50): revision 1 of 2
- 11-17 12:04 task-2: approved by priya
- 11-17 12:04 task-4: planned 2 tasks from the planner

### nl-ns11 · lee · complete

```text
nl-ns11 · complete · $0.2900 of $2.00
request: Night Shift 11: the overnight dispatcher

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  attempt 2 · $0.2476 · claude-opus-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-18 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-18 12:02 task-2: rejected by lee: Too much about the dispatch centre, not enough about her. Use the bit about sitting in the car at dawn.
- 11-18 15:04 task-2: approved by lee
- 11-18 15:04 task-4: planned 2 tasks from the planner
- 11-18 15:04 task-5: `lee` may not use `publisher` (used by: producers)
- 11-18 15:34 task-5: resolved by sam: complete (lee may not publish)

### nl-sr44 · maya · complete

```text
nl-sr44 · complete · $0.1056 of $2.00
request: /episode Small Rooms 44: finishing songs: the 80 percent rule

root  show/make-episode  [complete]
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.0684 · claude-sonnet-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  ├─ task-4.2  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.3  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-23 09:00 root: routed to make-episode by the signal /episode
- 11-23 09:00 task-2.2: `scriptwriter` is past $1.5 this month ($1.61 spent): using claude-sonnet-5-5
- 11-23 12:01 task-2: approved by maya
- 11-23 12:02 task-4: planned 3 tasks from the planner

### nl-mg21 · priya · complete

```text
nl-mg21 · complete · $0.1792 of $2.00
request: Margins 21: a florist's busiest week

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  attempt 2 · $0.1368 · claude-sonnet-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-24 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-24 09:00 task-2.2: `scriptwriter` is past $1.5 this month ($1.66 spent): using claude-sonnet-5-5
- 11-24 09:02 task-2.2: check writers/editor-scores-draft asked for a revision (score 50): revision 1 of 2
- 11-24 09:02 task-2.2: `scriptwriter` is past $1.5 this month ($1.72 spent): using claude-sonnet-5-5
- 11-24 12:03 task-2: approved by priya
- 11-24 12:03 task-4: planned 2 tasks from the planner

### nl-ns12 · lee · complete

```text
nl-ns12 · complete · $0.1108 of $2.00
request: Night Shift 12: night bakers

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.0684 · claude-sonnet-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  clip-picker/pick-clips  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-25 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-25 09:00 task-2.2: `scriptwriter` is past $1.5 this month ($1.77 spent): using claude-sonnet-5-5
- 11-25 12:02 task-2: approved by lee
- 11-25 12:02 task-4: planned 2 tasks from the planner
- 11-25 12:02 task-5: `lee` may not use `publisher` (used by: producers)
- 11-25 12:32 task-5: resolved by sam: complete (lee may not publish)

### nl-mg22 · priya · complete

```text
nl-mg22 · complete · $0.1108 of $2.00
request: Margins 22: when a regular becomes a partner

root  show/make-episode  [complete]  $0.0056 · claude-opus-5-5
├─ task-1  researcher/research-topic  [complete]  $0.0205 · claude-sonnet-5-5
├─ task-2  writers/write-script  [complete]
│  ├─ task-2.1  outliner/outline-episode  [complete]  $0.0087 · claude-sonnet-5-5
│  └─ task-2.2  scriptwriter/draft-script  [complete]  $0.0684 · claude-sonnet-5-5
├─ task-3  rights-check/clear-rights  [complete]
├─ task-4  promo/promote  [complete]  $0.0068 · claude-sonnet-5-5
│  ├─ task-4.1  thumbnail-brief/write-thumbnail-brief  [complete]  $0.0004 · claude-haiku-5-5
│  └─ task-4.2  newsletter-blurb/write-blurb  [complete]  $0.0004 · claude-haiku-5-5
└─ task-5  publisher/schedule-release  [complete]
```

- 11-30 09:00 root: routed to make-episode (The request names a show and an episode to make)
- 11-30 09:00 task-2.2: `scriptwriter` is past $1.5 this month ($1.83 spent): using claude-sonnet-5-5
- 11-30 12:02 task-2: approved by priya
- 11-30 12:02 task-4: planned 2 tasks from the planner
