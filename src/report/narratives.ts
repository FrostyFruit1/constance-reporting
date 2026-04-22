import Anthropic from '@anthropic-ai/sdk';
import type { ReportData, NarrativeSections, OutlineBullet } from './types';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_OUTLINE = `You are a specialist ecologist writing "Works Carried Out" narrative bullets for a
monthly/weekly client report on bush regeneration and weed management. You synthesise daily
field-report narratives into concise, professional bullets organised by (weed species × treatment method).

Style rules (match exactly):
- Each bullet starts with a bold label of the form: "**{Species Common Name} ({Scientific Name}) {Action}**" or "**{Treatment Type} of {Target}**"
- Body is 3-6 sentences describing: what was done, where specifically in the zone, any care or constraint observed, the outcome or significance
- Tone: measured, professional, third-person past tense
- Use ecological terminology correctly (cut-and-paint, selective herbicide, hand weeding, brush-cutting, flagging tape, off-target damage, etc.)
- Do not invent facts. If a detail isn't in the source, omit it.

Example bullets (reference style only — do not copy content):

**African Love Grass (Eragrostis curvula) Management**
Field teams focused on the suppression of African Love Grass across sections of the zone where prior brushcutting had stimulated regrowth. Selective herbicide was applied to regrowing tufts using knapsack sprayers, with care taken to minimise off-target damage to adjacent native vegetation. Where lovegrass was found further from revegetated patches, seed heads were tied up to limit dispersal. These follow-up treatments are essential to maintain the gains made in earlier control operations.

**Brushcutting of Dense Grass Stands**
Sections of zone B were brushcut where dense grass stands had developed. The works focused on opening up the canopy to allow subsequent selective herbicide application on regrowth. Care was taken around any existing native seedlings; where uncertainty existed, hand weeding was preferred. The cut material was left on site to break down and contribute to soil organic matter.

Output format: strict JSON — an array of objects with keys "label" and "body". No preamble, no code fences, no trailing commentary.`;

const SYSTEM_OBS = `You are a specialist ecologist writing a short prose paragraph for a client monthly/weekly report. The paragraph summarises observations of a single category (birds, incidents, or fauna sightings) across the period. Tone: measured, professional, third-person past tense. No headings, no bullets. 2-5 sentences. If the input is empty or irrelevant, return the provided fallback verbatim.`;

export async function generateNarratives(
  data: ReportData,
  opts: { skipLLM?: boolean } = {}
): Promise<NarrativeSections> {
  if (opts.skipLLM || !process.env.ANTHROPIC_API_KEY) {
    return placeholderNarratives(data);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const outlineOfWorks: Record<string, OutlineBullet[]> = {};
  for (const zone of data.zonesIncluded) {
    const entries = data.detailsOfTasksByZone[zone] || [];
    if (entries.length === 0) {
      outlineOfWorks[zone] = [];
      continue;
    }
    const speciesList = [...new Set(
      data.inspections.filter(i => i.zone === zone).flatMap(i => i.weeds.map(w => w.species_name_canonical || w.species_name_raw))
    )];
    const chemicalList = [...new Set(
      data.inspections.filter(i => i.zone === zone).flatMap(i => i.chemicals.map(c => `${c.chemical_name_canonical || c.chemical_name_raw}${c.rate_raw ? ` (${c.rate_raw})` : ''}`))
    )];
    const taskList = [...new Set(
      data.inspections.filter(i => i.zone === zone).flatMap(i => i.tasks.map(t => t.task_type))
    )];

    const userMessage = [
      `Zone: ${zone}`,
      `Period: ${data.periodLabel}`,
      '',
      `Daily field entries (${entries.length} days):`,
      ...entries.map(e => `${e.date}: ${e.text}`),
      '',
      `Distinct weeds recorded: ${speciesList.join(', ') || '(none)'}`,
      `Distinct chemicals used: ${chemicalList.join(', ') || '(none)'}`,
      `Distinct treatment methods: ${taskList.join(', ') || '(none)'}`,
      '',
      `Produce 4-8 bullets grouping the work by (weed species × treatment method). Cover the high-volume work primarily; minor incidental work can be omitted or combined.`,
    ].join('\n');

    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM_OUTLINE, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
      });
      const raw = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
      const json = extractJson(raw);
      outlineOfWorks[zone] = Array.isArray(json) ? json.filter(isBullet) : [];
    } catch (err) {
      console.warn(`LLM failed for zone ${zone}:`, err instanceof Error ? err.message : err);
      outlineOfWorks[zone] = [];
    }
  }

  // §5 / §7 / §8 — short narratives
  const birdFallback = `No birds were sighted this ${data.cadence === 'monthly' ? 'month' : 'week'}.`;
  const incidentsFallback = `No incidents occurred on site this ${data.cadence === 'monthly' ? 'month' : 'week'}. Should any incidents occur in the future, they will be promptly recorded and reported to the council.`;
  const faunaFallback = `No New sightings were found this ${data.cadence === 'monthly' ? 'month' : 'week'}.`;

  const [birdSightings, incidents, faunaSightings] = await Promise.all([
    shortNarrative(client, data.observations.filter(o => o.observation_type === 'fauna' && isBird(o.species_name)), 'bird sightings', birdFallback),
    shortNarrative(client, [], 'incidents on site', incidentsFallback),
    shortNarrative(client, data.observations.filter(o => o.observation_type === 'fauna' && !isBird(o.species_name)), 'fauna sightings (non-bird)', faunaFallback),
  ]);

  return { outlineOfWorks, birdSightings, incidents, faunaSightings };
}

function placeholderNarratives(data: ReportData): NarrativeSections {
  const periodWord = data.cadence === 'monthly' ? 'month' : data.cadence === 'weekly' ? 'week' : 'period';
  const outlineOfWorks: Record<string, OutlineBullet[]> = {};
  for (const zone of data.zonesIncluded) {
    const speciesSet = new Set<string>();
    const methodSet = new Set<string>();
    const entries = data.detailsOfTasksByZone[zone] || [];
    for (const ins of data.inspections.filter(i => i.zone === zone)) {
      ins.weeds.forEach(w => speciesSet.add(w.species_name_canonical || w.species_name_raw));
      ins.tasks.forEach(t => methodSet.add(t.task_type));
    }
    const bullets: OutlineBullet[] = [];
    for (const sp of speciesSet) {
      const methods = [...methodSet].join(', ') || 'treatment';
      bullets.push({
        label: `${sp} — ${methods}`,
        body: `Across ${entries.length} field day(s) in ${zone} during ${data.periodLabel}, the team undertook ${methods.toLowerCase()} on ${sp}. Detailed narrative pending LLM synthesis (—skip-llm used or ANTHROPIC_API_KEY not set).`,
      });
    }
    outlineOfWorks[zone] = bullets;
  }
  return {
    outlineOfWorks,
    birdSightings: `No birds were sighted this ${periodWord}.`,
    incidents: `No incidents occurred on site this ${periodWord}. Should any incidents occur in the future, they will be promptly recorded and reported to the council.`,
    faunaSightings: `No New sightings were found this ${periodWord}.`,
  };
}

function isBird(name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return /\b(bird|cockatoo|magpie|parrot|kookaburra|wren|robin|finch|eagle|hawk|owl|pigeon|currawong|galah|rosella|honeyeater)\b/.test(n);
}

async function shortNarrative(
  client: Anthropic,
  obs: Array<{ species_name: string | null; notes: string | null; inspection_date: string | null }>,
  topic: string,
  fallback: string,
): Promise<string> {
  if (obs.length === 0) return fallback;
  const userMessage = [
    `Topic: ${topic}`,
    `Fallback (use verbatim if observations are empty or off-topic): ${fallback}`,
    '',
    'Observations:',
    ...obs.map(o => `- ${o.inspection_date || 'unknown date'}: ${o.species_name || 'unnamed'}${o.notes ? ` — ${o.notes}` : ''}`),
    '',
    'Write 2-5 sentences summarising these observations in client-report tone.',
  ].join('\n');
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [{ type: 'text', text: SYSTEM_OBS, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    return text || fallback;
  } catch (err) {
    console.warn(`LLM narrative failed for ${topic}:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // Try to find the first JSON array/object
  const match = /[\[{][\s\S]*[\]}]/.exec(trimmed);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* ignore */ }
  }
  return null;
}

function isBullet(x: unknown): x is OutlineBullet {
  return !!x && typeof x === 'object'
    && typeof (x as any).label === 'string'
    && typeof (x as any).body === 'string';
}
