// Northlight Audio, a made-up four-person podcast network: one simulated
// month on the show team in examples/media.
//
// The conductor, the cards, their rules and their switches are the real ones,
// and every route, check, sign-off, block and retry comes out of the engine.
// What is simulated: the model replies (written below, in advance), their
// token counts and timing, and so their cost, which is estimated at Claude's
// list prices. Nothing here calls Claude.
//
//   node examples/case-study/simulate.ts     writes examples/case-study/run-log.md

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Conductor, costOf, formatMission, formatUsage, loadAgents, MemoryStore, ModelPlanner, scriptedModels } from '../../src/index.ts';
import type { Caller, Mission, MissionNode, ModelRequest, ModelResponse, UsageReport } from '../../src/index.ts';
import { plugs } from '../media/setup.ts';

// ---------------------------------------------------------------- the people

const maya: Caller = { id: 'maya', groups: ['producers'] };
const sam: Caller = { id: 'sam', groups: ['producers'] };
const priya: Caller = { id: 'priya', groups: ['producers'] };
const lee: Caller = { id: 'lee', groups: ['guests'] };

// ---------------------------------------------------------------- the month

interface Episode {
  key: string;
  show: string;
  number: number;
  title: string;
  host: Caller;
  day: string;
  /** Maya starts hers with the `/episode` signal; the others are routed by the model. */
  signal?: boolean;
  open: string;
  facts: [string, string, string];
  takeaway: string;
  /** The editor's score for each draft it reads, 1 to 5, and its note when it is under 4. */
  scores: number[];
  notes?: string[];
  /** The host sends the first script back with this note. */
  reject?: string;
  /** The scriptwriter uses a music cue the show holds no licence for. */
  badCue?: string;
  /** Opus is overloaded when the first draft is asked for. */
  overloaded?: boolean;
  /** What the promo team's planner picks for this episode. */
  pieces: ('thumbnail' | 'clips' | 'blurb')[];
}

const SR = 'Small Rooms';
const MG = 'Margins';
const NS = 'Night Shift';

const EPISODES: Episode[] = [
  {
    key: 'sr41', show: SR, number: 41, title: 'mixing vocals on cheap headphones', host: maya, day: '2026-11-02', signal: true,
    open: 'You are wearing the headphones that came free with your phone. Good. So is most of your audience.',
    facts: ['Cheap earbuds roll off hard below about 80 Hz, so bass feels thin and you over-boost it', 'Maya checks every vocal on a phone speaker, last thing at night', 'Listener poll on the show\'s Discord: 312 votes, 58% mix mostly on headphones'],
    takeaway: 'Mix on what you have, then check on the worst speaker you own.',
    scores: [3, 4], notes: ['Beat 2 says "most bedroom producers mix on earbuds". The research has no such number; use the Discord poll and say it is a poll.'],
    pieces: ['thumbnail', 'clips', 'blurb'],
  },
  {
    key: 'mg18', show: MG, number: 18, title: 'the bakery that closes at noon', host: priya, day: '2026-11-03',
    open: 'At 5:40 a.m. there is already a queue outside a bakery that will be shut by lunchtime.',
    facts: ['The owner bakes 60 loaves a day and stops when they are gone', 'Closing at noon cut her waste from about a fifth of the bake to almost nothing', 'She raised the price of a loaf from $5 to $6 last spring and lost no regulars'],
    takeaway: 'Selling out is a choice you can design for.',
    scores: [4, 4], reject: 'Open with the 6 a.m. queue, not the history of the shop.',
    pieces: ['thumbnail', 'blurb'],
  },
  {
    key: 'ns9', show: NS, number: 9, title: 'the bridge operator', host: lee, day: '2026-11-04',
    open: 'Twice a night, a city of a million people waits for one man to lift a road into the air.',
    facts: ['He works alone in a cabin above the river from 10 p.m. to 6 a.m.', 'Most lifts are for sailboats heading to the winter yard', 'He keeps a logbook of every boat name since 2009'],
    takeaway: 'Some jobs are mostly waiting, and the waiting is the job.',
    scores: [4],
    pieces: ['clips', 'blurb'],
  },
  {
    key: 'sr42', show: SR, number: 42, title: 'why your room matters more than your mic', host: maya, day: '2026-11-09', signal: true,
    open: 'A $1,000 microphone in an untreated bedroom sounds like a $1,000 microphone in an untreated bedroom.',
    facts: ['Parallel bare walls cause flutter echo you hear as a metallic ring', 'A duvet behind the singer tames more reflections than a new mic', 'Corner bass traps help most in small rooms, where low end builds up'],
    takeaway: 'Treat the room before you buy the next piece of gear.',
    scores: [3, 3, 4],
    notes: ['The cold open runs about 40 seconds before we reach the room. Get there in two sentences.', 'Better. Beat 3 now claims a "10 dB" drop; the research says "noticeably", not a number. Cut the figure.'],
    pieces: ['thumbnail', 'clips', 'blurb'],
  },
  {
    key: 'mg19', show: MG, number: 19, title: 'pricing a side hustle', host: priya, day: '2026-11-10',
    open: 'She was charging $40 for a cake that cost her $38 to make. She just had not counted her Saturdays.',
    facts: ['She now prices from her hourly rate, not from what the shop down the road charges', 'Orders dropped by a third and her income went up', 'She turns down weddings because one wedding takes a whole week'],
    takeaway: 'Count your hours before you count your customers.',
    scores: [5],
    pieces: ['thumbnail', 'blurb'],
  },
  {
    key: 'ns10', show: NS, number: 10, title: 'the 3 a.m. radiologist', host: lee, day: '2026-11-11',
    open: 'When a scan arrives at 3 a.m., the person reading it is often in another time zone, just starting her morning.',
    facts: ['She reads overnight scans for three hospitals from a home office', 'A typical night is 70 to 90 scans', 'She keeps the lights on a sunrise timer so her body clock stays put'],
    takeaway: 'The night shift can be someone else\'s morning.',
    scores: [4], badCue: 'Late Night Diner (stock)',
    pieces: ['clips', 'blurb'],
  },
  {
    key: 'sr43', show: SR, number: 43, title: 'gain staging without the jargon', host: maya, day: '2026-11-16', signal: true,
    open: 'If your mix sounds worse every time you add a plugin, the problem may be happening before the first one.',
    facts: ['Recording around minus 18 dB average leaves room for peaks', 'Most plugins are modelled on gear that liked that level', 'Turning a fader down is not the same as turning the input down'],
    takeaway: 'Set your levels once, at the start, and the rest gets easier.',
    scores: [4], overloaded: true,
    pieces: ['thumbnail', 'clips', 'blurb'],
  },
  {
    key: 'mg20', show: MG, number: 20, title: 'the bike shop that rents, not sells', host: priya, day: '2026-11-17',
    open: 'The best-selling bike at this shop has never been sold.',
    facts: ['The shop rents 40 commuter bikes by the month', 'Repairs are included, so riders bring bikes in early', 'Rental pays back a bike in about seven months'],
    takeaway: 'Sometimes the product is the service around it.',
    scores: [3, 4], notes: ['Beat 3: 40 bikes at $60 a month is $2,400, not $3,000. Fix the sum or say where $3,000 comes from.'],
    pieces: ['thumbnail', 'blurb'],
  },
  {
    key: 'ns11', show: NS, number: 11, title: 'the overnight dispatcher', host: lee, day: '2026-11-18',
    open: 'She has never seen most of the people whose worst nights she has talked them through.',
    facts: ['She works a 12-hour overnight shift at the county dispatch centre', 'Calls peak between 1 and 3 a.m. on weekends', 'She sits in her car for ten minutes at dawn before driving home'],
    takeaway: 'Someone is always awake for you.',
    scores: [4, 4], reject: 'Too much about the dispatch centre, not enough about her. Use the bit about sitting in the car at dawn.',
    pieces: ['clips', 'blurb'],
  },
  {
    key: 'sr44', show: SR, number: 44, title: 'finishing songs: the 80 percent rule', host: maya, day: '2026-11-23', signal: true,
    open: 'You have 200 loops on your laptop and no finished songs. That is normal. It is also fixable.',
    facts: ['Maya stops tweaking a mix when it is 80 percent there and sends it to one listener', 'She gives each song a deadline on the calendar, not a feeling', 'Most of her released songs started as loops she had given up on'],
    takeaway: 'Finished beats perfect, because finished can be heard.',
    scores: [4],
    pieces: ['thumbnail', 'clips', 'blurb'],
  },
  {
    key: 'mg21', show: MG, number: 21, title: 'a florist\'s busiest week', host: priya, day: '2026-11-24',
    open: 'For one week in February, a florist does a month of work, and she plans it from November.',
    facts: ['She pre-sells 300 bouquets before ordering a single stem', 'Pre-orders close ten days out, so she buys exactly what is sold', 'The week after is her quietest of the year, and she closes the shop'],
    takeaway: 'Plan the peak months ahead, and rest after it.',
    scores: [3, 4], notes: ['Beat 1 says "thousands of bouquets". The research says 300. Use 300.'],
    pieces: ['thumbnail', 'blurb'],
  },
  {
    key: 'ns12', show: NS, number: 12, title: 'night bakers', host: lee, day: '2026-11-25',
    open: 'The bread on your table this morning was shaped by hand at two o\'clock.',
    facts: ['The crew of four starts at 11 p.m. and is gone by 7 a.m.', 'The ovens are on for six straight hours', 'They eat breakfast at what everyone else calls midnight'],
    takeaway: 'Every morning starts the night before.',
    scores: [4],
    pieces: ['clips', 'blurb'],
  },
  {
    key: 'mg22', show: MG, number: 22, title: 'when a regular becomes a partner', host: priya, day: '2026-11-30',
    open: 'He came in for coffee every day for six years. Now he owns a third of the café.',
    facts: ['He offered to invest when the café nearly closed in 2024', 'They agreed he would never work a shift', 'The menu has not changed, but the roof has'],
    takeaway: 'Your best investor might already be a customer.',
    scores: [4],
    pieces: ['thumbnail', 'blurb'],
  },
];

/** Requests that are not a new episode. */
const OTHERS = [
  { key: 'promo-sr40', who: sam, day: '2026-11-05T14:00:00Z', request: '/promo Small Rooms 40: the loudness war, explained' },
  { key: 'guest-dec', who: maya, day: '2026-11-12T10:00:00Z', request: 'Find and book a guest for the December Small Rooms episode' },
];

const requestOf = (ep: Episode) => `${ep.signal ? '/episode ' : ''}${ep.show} ${ep.number}: ${ep.title}`;

// ---------------------------------------------------------------- the clock

let clock = Date.parse('2026-11-02T09:00:00Z');
const now = () => new Date(clock);
const jumpTo = (iso: string) => {
  clock = Math.max(clock, Date.parse(iso));
};
const wait = (minutes: number) => {
  clock += minutes * 60_000;
};

// ---------------------------------------------------------------- the models (simulated)

/**
 * Simulated sizes, so cost and time look like full-length work rather than the
 * short stand-in text below: tokens in (the card's prompt and the outputs it
 * receives), tokens out (thinking plus a full-length piece: a 1,100-word
 * script, 400 words of research), and output tokens per second.
 */
type Kind = 'route' | 'plan' | 'research' | 'outline' | 'script' | 'edit' | 'promo';
const TOKENS_IN: Record<Kind, number> = { route: 600, plan: 900, research: 500, outline: 1200, script: 2200, edit: 2400, promo: 2400 };
const TOKENS_OUT: Record<Kind, number> = { route: 160, plan: 500, research: 1950, outline: 630, script: 5100, edit: 820, promo: 300 };
const SPEED: Record<string, number> = { 'claude-opus-5-5': 55, 'claude-sonnet-5-5': 75, 'claude-haiku-5-5': 180 };

const episodes = new Map<string, Episode>();
for (const ep of EPISODES) episodes.set(requestOf(ep), ep);
const drafts = new Map<string, number>();
const edits = new Map<string, number>();
const overloadedOnce = new Set<string>();

function reply(request: ModelRequest, text: string, kind: Kind): ModelResponse {
  const input = Math.max(TOKENS_IN[kind], Math.round((request.system.length + request.prompt.length) / 4));
  const output = TOKENS_OUT[kind];
  wait((1500 + (output / (SPEED[request.model] ?? 60)) * 1000) / 60_000);
  return { text, model: request.model, cost_usd: costOf(request.model, { input_tokens: input, output_tokens: output }) };
}

function answer(request: ModelRequest): ModelResponse {
  const asked = request.prompt.match(/(?:## Request\n|Request: )(.+)/)?.[1] ?? '';
  const ep = episodes.get(asked);
  const system = request.system;

  if (system.startsWith('You route requests')) {
    const fits = ep !== undefined;
    const choice = fits
      ? { capability: 'make-episode', reason: 'The request names a show and an episode to make.' }
      : { capability: 'none', reason: 'Booking a guest is not one of the show team\'s jobs.' };
    return reply(request, JSON.stringify(choice), 'route');
  }
  if (system.startsWith('You are the conductor of Promo')) {
    const pieces = ep?.pieces ?? ['thumbnail', 'clips', 'blurb'];
    const steps = pieces.map((piece) => ({
      id: piece,
      assigned_agent: piece === 'thumbnail' ? 'thumbnail-brief' : piece === 'clips' ? 'clip-picker' : 'newsletter-blurb',
      capability_match: piece === 'thumbnail' ? 'write-thumbnail-brief' : piece === 'clips' ? 'pick-clips' : 'write-blurb',
      depends_on: [],
      description: piece === 'thumbnail' ? 'Thumbnail brief' : piece === 'clips' ? 'Two short clips' : 'Newsletter blurb and subject line',
    }));
    return reply(request, JSON.stringify({ steps }), 'plan');
  }
  const title = ep ? `${ep.show} ${ep.number}` : asked.replace(/^\/promo /, '');
  if (system.startsWith('Researcher')) {
    const lines = ep ? ep.facts.map((fact) => `- ${fact} (from the host's interview notes)`) : ['- (no notes for this episode)'];
    return reply(request, `[simulated] Research notes, ${title}\n${lines.join('\n')}\nStill unsure: nothing the host has not checked.`, 'research');
  }
  if (system.startsWith('Shapes an episode')) {
    const beats = ep ? ep.facts.map((fact, index) => `${index + 1}. ${fact}`) : [];
    return reply(request, `[simulated] Outline, ${title}\nCold open: ${ep?.open ?? ''}\n${beats.join('\n')}\nTakeaway: ${ep?.takeaway ?? ''}`, 'outline');
  }
  if (system.startsWith('Writes scripts')) {
    if (!ep) throw new Error('no episode');
    if (ep.overloaded && request.model === 'claude-opus-5-5' && !overloadedOnce.has(ep.key)) {
      overloadedOnce.add(ep.key);
      wait(0.5);
      throw new Error('529 overloaded_error: Overloaded');
    }
    const draft = (drafts.get(ep.key) ?? 0) + 1;
    drafts.set(ep.key, draft);
    const feedback = request.prompt.split('## Feedback on your last attempt\n')[1]?.trim();
    const script = [
      `[simulated script · ${title} · draft ${draft}${feedback ? ` · revised for: ${feedback}` : ''}]`,
      '[MUSIC: Night Bus (house theme)]',
      ep.open,
      ...ep.facts.map((fact) => `${fact}.`),
      ep.badCue ? `[MUSIC: ${ep.badCue}]` : '[MUSIC: Tape Hiss Sting]',
      ep.takeaway,
    ];
    return reply(request, script.join('\n'), 'script');
  }
  if (system.startsWith('Checker. Scores a draft')) {
    if (!ep) throw new Error('no episode');
    const index = edits.get(ep.key) ?? 0;
    edits.set(ep.key, index + 1);
    const score = ep.scores.at(index) ?? 4;
    const revisesBefore = ep.scores.slice(0, index).filter((s) => s < 4).length;
    const notes = score >= 4 ? (score === 5 ? 'Record it as is.' : 'Small fixes only; ready for the host.') : (ep.notes?.at(revisesBefore) ?? 'Tighten it.');
    return reply(request, JSON.stringify({ verdict: score >= 4 ? 'pass' : 'revise', score, notes }), 'edit');
  }
  if (system.startsWith('Writes the brief a designer')) {
    return reply(request, `[simulated] Thumbnail brief, ${title}\nImage: one object from the episode, close up, on a dark desk.\nText: at most four words.\nAvoid: waveforms, headphones clip art.`, 'promo');
  }
  if (system.startsWith('Picks the moments')) {
    return reply(request, `[simulated] Clips, ${title}\n1. From "${ep?.open ?? 'the cold open'}" to the end of that thought. Caption: ${ep?.takeaway ?? 'Listen to the end.'}\n2. The last line of beat 2 through the takeaway.`, 'promo');
  }
  if (system.startsWith('Writes the short paragraph')) {
    return reply(request, `[simulated] Subject: ${title}, out now\n${ep?.open ?? ''} This week on ${ep?.show ?? 'the show'}: ${ep?.takeaway ?? ''}`, 'promo');
  }
  return reply(request, `[simulated] no reply written for: ${system.split('\n')[0]}`, 'promo');
}

// ---------------------------------------------------------------- the run

export interface Simulation {
  missions: Mission[];
  usage: UsageReport;
  conductor: Conductor;
}

export async function simulate(): Promise<Simulation> {
  const registry = await loadAgents(fileURLToPath(new URL('../media/agents', import.meta.url)));
  // Northlight's own settings on top of the example cards. Maya set the
  // script line low on purpose, to see the downgrade work in the first month.
  registry.get('scriptwriter')!.switch = { downgrade_after_usd: 1.5, max_usd_per_month: 3 };

  const models = scriptedModels(answer);
  const conductor = new Conductor({ registry, store: new MemoryStore(), plugs, models, planner: new ModelPlanner({ models }), now });

  const waitingOn = (mission: Mission): MissionNode | undefined => Object.values(mission.nodes).find((node) => node.status === 'needs-human');

  const queue = [
    ...EPISODES.map((ep) => ({ day: `${ep.day}T09:00:00Z`, run: () => runEpisode(ep) })),
    ...OTHERS.map((other) => ({ day: other.day, run: () => runOther(other) })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  async function runEpisode(ep: Episode): Promise<void> {
    let mission = await conductor.start('show', requestOf(ep), {
      id: `nl-${ep.key}`,
      user: ep.host,
      inputs: { show: ep.show, episode: String(ep.number) },
      budget_usd: 2,
    });
    let rejected = false;
    for (let node = waitingOn(mission); node; node = waitingOn(mission)) {
      if (node.waiting_for === 'approval') {
        wait(180); // the host reads the script
        if (ep.reject && !rejected) {
          rejected = true;
          mission = await conductor.reject(mission.id, node.id, { by: ep.host.id, note: ep.reject });
        } else {
          mission = await conductor.approve(mission.id, node.id, { output_hash: node.output_hash!, by: ep.host.id });
        }
      } else if (node.agent === 'rights-check') {
        wait(60); // Sam swaps the cue in the edit
        mission = await conductor.resolve(mission.id, node.id, {
          by: sam.id,
          decision: 'complete',
          output: `Rights report (Sam, by hand): swapped "${ep.badCue}" for "Night Bus (house theme)" in the edit. All cues cleared.`,
          note: 'swapped the unlicensed cue',
        });
      } else if (node.agent === 'publisher') {
        wait(30); // Sam schedules it himself
        mission = await conductor.resolve(mission.id, node.id, {
          by: sam.id,
          decision: 'complete',
          output: `Release plan (Sam, by hand): ${ep.show} ${ep.number} on the feed and YouTube at 06:00 on release day; newsletter at 09:00; clips over the next three days.`,
          note: `${ep.host.id} may not publish`,
        });
      } else {
        throw new Error(`${mission.id}: unexpected wait on ${node.id}: ${node.error ?? node.waiting_for}`);
      }
    }
  }

  async function runOther(other: (typeof OTHERS)[number]): Promise<void> {
    const mission = await conductor.start('show', other.request, { id: `nl-${other.key}`, user: other.who, budget_usd: 2 });
    const node = waitingOn(mission);
    if (node?.id === 'root' && node.waiting_for === 'fix') {
      wait(20);
      await conductor.resolve(mission.id, 'root', { by: other.who.id, decision: 'fail', note: 'not a job for the show team; booking it myself' });
    }
  }

  for (const item of queue) {
    jumpTo(item.day);
    await item.run();
  }
  jumpTo('2026-11-30T23:00:00Z');
  const missions = (await conductor.list()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { missions, usage: await conductor.usage(), conductor };
}

// ---------------------------------------------------------------- the record

export interface PersonStep {
  at: string;
  mission: string;
  node: string;
  who: string;
  what: string;
}

/** Every time a person stepped in, read from the missions' own event logs. */
export function personSteps(missions: Mission[]): PersonStep[] {
  const steps: PersonStep[] = [];
  for (const mission of missions) {
    for (const node of Object.values(mission.nodes)) {
      for (const event of node.events) {
        const match = event.match(/^(\S+) (approved|rejected|resolved) by (\w+)(.*)$/);
        if (match) steps.push({ at: match[1]!, mission: mission.id, node: node.id, who: match[3]!, what: `${match[2]}${match[4]}` });
      }
    }
  }
  return steps.sort((a, b) => a.at.localeCompare(b.at));
}

const INTERESTING = /routed|asked for a revision|rejected by|approved by|resolved by|may not use|not licensed|failed \(|trying the next model|is past \$|No capability fits|planned \d+ tasks from the planner/;

function runLog({ missions, usage, conductor }: Simulation): string {
  const steps = personSteps(missions);
  const episodesDone = missions.filter((mission) => mission.status === 'complete' && mission.nodes.root!.capability === 'make-episode');
  const runs = missions.flatMap((mission) => Object.values(mission.nodes).flatMap((node) => node.runs));
  const lines = [
    '# Northlight Audio: one simulated month',
    '',
    'Made up, and simulated: the conductor, cards, rules and switches are real (`examples/media/agents`, with the scriptwriter limits in `simulate.ts`), and every route, check, sign-off, block and retry below came out of the engine. The model replies were written in advance; their token counts, timing and cost are simulated, at Claude list prices. Regenerate with `node examples/case-study/simulate.ts`.',
    '',
    '## Summary',
    '',
    `- Requests: ${missions.length}. Episodes shipped: ${episodesDone.length} of ${EPISODES.length}.`,
    `- Agent calls: ${runs.length}, ${runs.filter((run) => run.outcome !== 'ok').length} failed. Estimated cost: $${usage.usd.toFixed(2)}.`,
    `- People stepped in ${steps.length} times: ${['maya', 'priya', 'lee', 'sam'].map((who) => `${who} ${steps.filter((step) => step.who === who).length}`).join(', ')}.`,
    '',
    '## Every time a person stepped in',
    '',
    '| When (UTC) | Who | Request | Task | What |',
    '| --- | --- | --- | --- | --- |',
    ...steps.map((step) => `| ${step.at.slice(0, 16).replace('T', ' ')} | ${step.who} | ${step.mission} | ${step.node} | ${step.what.replace(/\|/g, '/')} |`),
    '',
    '## Usage, as `agentos usage` prints it',
    '',
    '```text',
    formatUsage(usage, conductor.registry),
    '```',
    '',
    '## Every request',
  ];
  for (const mission of missions) {
    const events = Object.values(mission.nodes).flatMap((node) =>
      node.events.filter((event) => INTERESTING.test(event)).map((event) => ({ at: event.slice(0, 24), text: `${node.id}: ${event.slice(25)}` })),
    );
    events.sort((a, b) => a.at.localeCompare(b.at));
    lines.push('', `### ${mission.id} · ${mission.user?.id ?? ''} · ${mission.status}`, '', '```text', formatMission(mission), '```', '');
    lines.push(...events.map((event) => `- ${event.at.slice(5, 16).replace('T', ' ')} ${event.text}`));
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await simulate();
  const path = fileURLToPath(new URL('./run-log.md', import.meta.url));
  await writeFile(path, runLog(result));
  const shipped = result.missions.filter((mission) => mission.status === 'complete').length;
  console.log(`${result.missions.length} requests, ${shipped} complete, estimated $${result.usage.usd.toFixed(2)}. Wrote ${path}`);
}
