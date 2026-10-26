// Code for the show's function cards, and an offline stand-in for Claude.
//
// With ANTHROPIC_API_KEY set (and AGENTOS_OFFLINE unset), model cards run on
// Claude. Without it, `models` answers from canned text so the whole team can
// be run, approved and resumed for free. The canned answers are clearly fake.

import { scriptedModels } from '../../src/index.ts';
import type { FunctionPlug, ModelProvider, ModelRequest } from '../../src/index.ts';

/** Music and clips the show holds licences for. */
const LICENSED = ['Night Bus (house theme)', 'Tape Hiss Sting', 'Interview: Mara, 2024'];

export const plugs: Record<string, FunctionPlug> = {
  // A real version would call a licence service. This one reads the cues out
  // of the approved script and checks them against a list.
  async 'rights-check'(task) {
    const cues = [...task.message.matchAll(/\[(MUSIC|CLIP): ([^\]]+)\]/g)].map((match) => ({ kind: match[1]!, name: match[2]!.trim() }));
    const unlicensed = cues.filter((cue) => !LICENSED.includes(cue.name));
    if (unlicensed.length) throw new Error(`not licensed: ${unlicensed.map((cue) => cue.name).join(', ')}`);
    const lines = cues.map((cue) => `- ${cue.kind.toLowerCase()} "${cue.name}": licensed`);
    return `Rights report: ${cues.length} cues, all cleared.\n${lines.join('\n')}`;
  },
  // A real version would call the hosting and social APIs. This one writes the plan.
  async publisher(task) {
    const start = new Date(Date.parse(task.mission.created_at) + 3 * 86_400_000);
    const day = (offset: number) => new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    return [
      `Release plan (not sent anywhere: this plug is a stand-in):`,
      `- ${day(0)} 06:00  episode on the podcast feed and YouTube`,
      `- ${day(0)} 09:00  newsletter, with the blurb`,
      `- ${day(1)} 12:00  clip 1 on short-form channels`,
      `- ${day(3)} 12:00  clip 2 on short-form channels`,
    ].join('\n');
  },
};

const offline = !process.env.ANTHROPIC_API_KEY || process.env.AGENTOS_OFFLINE === '1';

/** Only exported offline; otherwise the CLI's default (Claude) is used. */
export const models: ModelProvider | undefined = offline ? cannedModels() : undefined;

export function cannedModels(): ModelProvider {
  let checks = 0;
  return scriptedModels((request: ModelRequest) => {
    const properties = (request.schema?.properties ?? {}) as Record<string, unknown>;
    if ('steps' in properties) return JSON.stringify({ steps: PROMO_PLAN });
    if ('capability' in properties) return JSON.stringify({ capability: 'make-episode', reason: '[offline] The request is for a whole episode.' });
    if ('verdict' in properties) {
      checks += 1;
      return JSON.stringify(
        checks === 1
          ? { verdict: 'pass', score: 3, notes: 'Beat 3 says "most producers" with no source. Cut it or cite the survey in the notes.' }
          : { verdict: 'pass', score: 4, notes: 'Beat 3 is fixed. Ready for the host.' },
      );
    }
    const role = request.system.split('\n')[0] ?? '';
    for (const [needle, answer] of CANNED) {
      if (role.includes(needle)) return typeof answer === 'function' ? answer(request) : answer;
    }
    return `[offline] no canned answer for: ${role}`;
  });
}

const PROMO_PLAN = [
  { id: 'thumb', assigned_agent: 'thumbnail-brief', capability_match: 'write-thumbnail-brief', depends_on: [], description: 'Thumbnail brief for the episode' },
  { id: 'clips', assigned_agent: 'clip-picker', capability_match: 'pick-clips', depends_on: [], description: 'Two clips for short-form channels' },
  { id: 'blurb', assigned_agent: 'newsletter-blurb', capability_match: 'write-blurb', depends_on: [], description: 'Newsletter blurb and subject line' },
];

const DRAFT = (feedback: string | undefined) =>
  [
    feedback ? `[offline draft, revised for: ${feedback}]` : '[offline draft]',
    '[MUSIC: Night Bus (house theme)]',
    'You are wearing the headphones that came free with your phone. Good. So is half the internet.',
    feedback ? 'A 2025 survey of 1,200 home producers found 41% mix mostly on earbuds.' : 'Most producers mix on earbuds now.',
    '[CLIP: Interview: Mara, 2024]',
    'Mara\'s rule: check the vocal on the worst speaker you own, last thing at night.',
    '[MUSIC: Tape Hiss Sting]',
  ].join('\n');

const CANNED: [string, string | ((request: ModelRequest) => string)][] = [
  ['Researcher', '[offline research]\n- 41% of 1,200 home producers mix mostly on earbuds (a made-up figure for the offline demo).\n- Cheap headphones roll off below 80 Hz.\nStill unsure: the survey\'s sample.'],
  ['Shapes an episode', '[offline outline]\nCold open: the free headphones.\n1. Why earbuds lie about bass\n2. The survey number\n3. Mara\'s rule\nTakeaway: check on the worst speaker you own.'],
  ['Writes scripts', (request) => DRAFT(request.prompt.split('## Feedback on your last attempt\n')[1]?.trim())],
  ['thumbnail', '[offline thumbnail brief]\nA cracked pair of earbuds on a mixing desk. Text: "YOUR EARS LIE". Avoid: waveforms.'],
  ['short vertical clips', '[offline clips]\n1. "You are wearing the headphones..." to "...half the internet." Caption: Your mix is lying to you.\n2. "Mara\'s rule..." to "...last thing at night." Caption: The worst-speaker test.'],
  ['subscribers', '[offline blurb]\nSubject: Your earbuds are lying\nThis week: why the free headphones are the most honest test you own.'],
];
