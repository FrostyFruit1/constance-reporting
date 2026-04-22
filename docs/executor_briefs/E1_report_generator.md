# Executor Brief E1 — Weekly Report Generator (EBSF Pilot)

**You are an executor agent.** The orchestrator has already done the discovery, spec,
and schema work. Your job is to build the report generator end-to-end and produce a
working first draft for EBSF Zone B+C, June 2025.

---

## 1. Project Context (5 minutes of reading)

Constance Conservation is an ecological land-management business. They do daily site
inspections using Safety Culture, which we ingest into Supabase. The target outcome
this milestone is **automating the client monthly/weekly report** that currently takes
ops-manager Ryan 6-8 hours to write by hand.

**Read these files in order before touching code:**
1. `SOUL.md` — mission + values (2 min)
2. `MEMORY.md` — latest session notes, including the 2026-04-22 entry which is your starting context
3. `docs/report_data_mapping.md` — **this is your spec**. Every output element has a mapping to SC source data. Read all of it.
4. `EBSF Zone B C June Report.docx` — the target output. Unzip and read `word/document.xml` if needed; structure is already documented in the mapping doc
5. `Daily Report WSPT Central.pdf` — input-side example (what a raw daily inspection looks like)

**Do not re-investigate the schema or data sources.** Ask the orchestrator if anything
in the spec is unclear; don't guess.

---

## 2. Scope — what you are building

A Node/TypeScript module at `src/report/` plus an npm script that, given a client and
period, generates a client report in HTML (canonical), DOCX, and (nice-to-have) PDF.

**Success criteria:**
- `npm run report -- --client EBSF --month 2025-06` produces:
  - `dist/reports/EBSF_Zone_B_and_C_June_2025_Monthly_Report.html`
  - `dist/reports/EBSF_Zone_B_and_C_June_2025_Monthly_Report.docx`
- The HTML renders in a browser and visually resembles `EBSF Zone B C June Report.docx`
- The DOCX opens in Word/Pages without errors
- Structural sections match row-for-row against the source DOCX where we have data (staff table, weed works table, herbicide section)
- Narrative sections (§2, §5, §7, §8) are LLM-generated and reasonable
- Placeholders are marked clearly where data is missing (location maps, polygon area m², per-report polygon overlay maps)
- **Row in `client_reports` table is written with `html_content`, `narrative_sections`, `zones_included`, `generated_at`, and `status='draft'`**

**Out of scope for v1:**
- PDF rendering (nice-to-have; do last if time permits via `puppeteer`)
- Polygon area m² computation (leave as manual-edit placeholder)
- Location map generation (static per client; leave blank if `clients.location_maps` is empty)
- Email delivery (Resend integration is M04)
- UI surface for reviewing drafts (M04)
- Webhook triggering on period close (cron job; M04)

---

## 3. File Structure to Create

```
src/report/
├── index.ts              # public entry: generateReport(opts): Promise<GeneratedReport>
├── types.ts              # ReportOptions, ReportData, RenderedReport, NarrativeSections
├── period.ts             # week/month/quarter date range helpers
├── aggregate.ts          # SQL aggregations → ReportData (one query per section)
├── narratives.ts         # LLM calls → NarrativeSections
├── render_html.ts        # ReportData + NarrativeSections → HTML string
├── render_docx.ts        # Same inputs → Buffer (via `docx` npm pkg)
├── templates/
│   ├── bush_regen.html.ts  # template as tagged template literal or mustache
│   └── styles.ts           # CSS (inline, scoped)
└── __tests__/
    └── aggregate.test.ts   # vitest tests against known EBSF June 2025 data

src/bin/
└── generate_report.ts    # CLI wrapper — parses argv, calls generateReport(), writes files

package.json
└── scripts.report: "node -r dotenv/config dist/bin/generate_report.js"
```

---

## 4. Deps to Install

```bash
npm install docx @anthropic-ai/sdk
npm install -D @types/node  # should already be installed
```

**Optional (v2):**
```bash
npm install puppeteer  # only if implementing PDF
```

**Anthropic API key**: add `ANTHROPIC_API_KEY` to `.env`. Ask the user for it if not
present. Use Claude Sonnet 4.6 (`claude-sonnet-4-6`) for narratives — good balance of
quality and cost. Enable prompt caching on the system prompt (see
`skills/claude-api` if available).

---

## 5. Function Signatures (contracts)

### `src/report/types.ts`

```ts
export interface ReportOptions {
  clientId: string;          // UUID
  periodStart: string;       // YYYY-MM-DD inclusive
  periodEnd: string;         // YYYY-MM-DD inclusive
  cadence: 'weekly' | 'monthly' | 'quarterly';
  outputDir?: string;        // defaults to dist/reports/
  skipLLM?: boolean;         // for faster dev iteration — use placeholder narratives
}

export interface ReportData {
  client: ClientRow;           // including location_maps, active_roster_staff_ids
  organization: OrgRow;
  sites: SiteRow[];            // zones with any inspection in period
  supervisor: StaffRow;        // primary author (most inspections in period)
  inspections: InspectionRow[]; // all DWR + CAR in period, with children eager-loaded
  staffHoursByZone: StaffHoursRow[];  // for §3
  weedWorks: WeedWorkRow[];    // for §4.1
  herbicideTotals: HerbicideRow[]; // for §6
  observations: ObservationRow[];  // for §5, §7, §8 LLM input
  detailsOfTasksByZone: Record<string, Array<{date: string; text: string}>>; // for §2 LLM
}

export interface NarrativeSections {
  outlineOfWorks: Record<string, Array<{label: string; body: string}>>; // zone → bullets
  birdSightings: string;
  incidents: string;
  faunaSightings: string;
}

export interface GeneratedReport {
  clientReportId: string;      // uuid of row in client_reports
  html: string;
  docxBuffer: Buffer;
  pdfBuffer?: Buffer;
  outputPaths: { html: string; docx: string; pdf?: string };
}
```

### `src/report/index.ts`

```ts
export async function generateReport(opts: ReportOptions): Promise<GeneratedReport>;
```

Flow: aggregate → narratives → render → write files → upsert `client_reports` row → return.

---

## 6. Aggregation SQL (§-by-§)

The orchestrator has provided exact source mappings in `docs/report_data_mapping.md`.
Here are the concrete queries to write. All use the Supabase JS client. Remember:
**zones are already separate `sites` rows** (`EBSF Zone B`, `EBSF Zone C`, `EBSF Zone D`,
`EBSF Zone B and C` — yes all four exist; the generator should select all sites matching
`ilike 'EBSF%'` or use `clients.site_ids` if that column exists; if not, add it).

### Pre-step: determine zones for the client

```ts
// Pull all sites whose name starts with "EBSF" (for pilot — generalize later)
const { data: sites } = await supabase.from('sites').select('*').ilike('name', 'EBSF%');
```

### §3 Staff hours by zone

```sql
-- Pseudo; write as supabase.rpc or JS-side join
SELECT sites.name AS zone, staff.name AS staff_name, SUM(inspection_personnel.hours_worked) AS hours
FROM inspection_personnel
JOIN inspections ON inspection_personnel.inspection_id = inspections.id
JOIN sites ON inspections.site_id = sites.id
LEFT JOIN staff ON inspection_personnel.staff_id = staff.id
WHERE inspections.site_id = ANY($site_ids)
  AND inspections.date BETWEEN $start AND $end
GROUP BY sites.name, staff.name
ORDER BY sites.name, hours DESC;
```

Include roster staff with 0 hours (from `clients.active_roster_staff_ids`) as extra rows.

### §4.1 Weed works

Group `inspection_weeds` joined with `inspections` by zone + species_name_canonical +
method (from `inspection_tasks.task_type`). Parse polygon colour from
`inspections.sc_raw_json` → `details_of_mapped_areas` free-text field (regex:
`^(\w+(?:\s+\w+)?)\s+-\s+(.+?)\s+-\s+(.+)$` → colour / method / weed). GIS location
from `inspection_polygons` table if it exists; otherwise null (leave for manual edit).

### §6 Herbicide totals

Aggregate `chemical_application_items` joined via `chemical_application_records` to
`sites` and `inspection_weeds` for target. Group by (chemical_name_canonical, rate_raw,
target weed, zone). Sum amounts.

**Daily report fallback**: if no CAR exists for period, fall back to `inspection_chemicals`
rows — one heading per chemical without rate/target, flag `needs_review`.

### §2, §5, §7, §8 LLM inputs

Just collect the raw narrative fields and observations. LLM does the summarisation.

---

## 7. LLM Prompt for §2 Narratives

Use this prompt shape (in `narratives.ts`). System prompt gets cached.

**System:**
```
You are a specialist ecologist writing "Works Carried Out" narrative bullets for a
monthly client report on bush regeneration and weed management. You synthesise daily
field-report narratives into concise, professional bullets organised by (weed species
× treatment method).

Style rules (match exactly):
- Each bullet starts with a bold label in the form: "**{Species Common Name} ({Scientific Name}) {Action}**" or "**{Treatment Type} of {Target}**"
- Body is 3-6 sentences describing: what was done, where specifically in the zone, any care or constraint observed, the outcome or significance
- Tone: measured, professional, third-person past tense
- Use ecological terminology correctly (cut-and-paint, selective herbicide, hand weeding, brush-cutting, flagging tape, off-target damage, etc.)
- Do not invent facts. If a detail isn't in the source, omit it.

Example bullets (reference style only — do not copy content):
[paste 2-3 bullets verbatim from EBSF Zone B C June Report.docx §2.1.1]

Output format: strict JSON — array of objects {"label": "...", "body": "..."}. No preamble, no code fences.
```

**User message (per zone):**
```
Zone: {zone_name}
Period: {period_label}

Daily field entries ({n} days):
{date}: {details_of_tasks}
{date}: {details_of_tasks}
...

Distinct weeds recorded: {species_list}
Distinct chemicals used: {chemical_list}
Distinct treatment methods: {task_list}

Produce 4-8 bullets grouping the work by (weed species × treatment method). Cover the
high-volume work primarily; minor incidental work can be omitted or combined.
```

For §5, §7, §8 — single-call cheaper prompts. Return plain string. Default to the
fallback strings in `docs/report_data_mapping.md` §3 if observations are empty.

---

## 8. HTML Template

Build once in `templates/bush_regen.html.ts` as a tagged template literal. Match the
DOCX structure (cover → TOC → §1–§8). Use semantic HTML: `<section>`, `<h1>–<h3>`,
`<table>`, `<figure>`, `<figcaption>`. Inline CSS (critical for Gmail compatibility).

Placeholder markup for manual-edit fields:
```html
<figure class="placeholder" data-placeholder="location_map_0" data-editable="true">
  <div class="placeholder-box">📍 Location Map 1.0 — upload via review UI</div>
  <figcaption>Map 1.0: Area of work site...</figcaption>
</figure>
```

CSS should be Gmail-safe: avoid `position`, limit grid/flex, use tables for complex
layouts. See https://www.caniemail.com/ if unsure.

---

## 9. DOCX Rendering

Use `docx` npm package. Build `Document` with sections matching the HTML structure.
Tables via `Table/TableRow/TableCell`. Headings via `HeadingLevel.HEADING_1` etc.

Image placeholders in DOCX: insert a placeholder paragraph with background colour —
leave actual image swap as a TODO for M04 review UI.

---

## 10. CLI

```
npm run report -- --client EBSF --month 2025-06
npm run report -- --client EBSF --week 2025-W26
npm run report -- --client EBSF --from 2025-06-01 --to 2025-06-07 --cadence weekly
npm run report -- --client EBSF --month 2025-06 --skip-llm   # fast dev iteration
```

Resolve `--client EBSF` → `clients` row via `name ILIKE 'EBSF%'`. Add a `--list-clients`
flag for discovery.

---

## 11. Validation Procedure

1. Run the generator for EBSF June 2025 after build: `npm run build && npm run report -- --client EBSF --month 2025-06`
2. Open the generated HTML in a browser. Compare side-by-side with the source DOCX.
3. For each section, note: structural match? content close enough? placeholders clear?
4. Open the generated DOCX in Word/Pages. Confirm it opens cleanly and the structure matches the HTML.
5. Write a brief report back to the orchestrator: what matches, what doesn't, what's blocked on missing data.

---

## 12. Data Quality Caveats You Must Know

- `inspections.site_id` is null on ~60% of rows (parser bug, being fixed in parallel). For EBSF specifically, check the site linking is reasonable — if you see inspections you'd expect but they're unlinked, flag it.
- `inspections.date` is null on ~45% of rows (same bug). Filter inspections with `date IS NOT NULL AND date BETWEEN ...`
- Some "EBSF" data is split across 4 site rows (`Zone B`, `Zone C`, `Zone D`, `Zone B and C`). The June DOCX covers B and C — so include Zone B, Zone C, and Zone B and C in the query.
- `inspection_polygons` table does not exist. Parse polygon data inline from `details_of_mapped_areas` free text if needed.
- Chemical rate info often lives in `chemical_application_items`, not in daily DWR rows. Some periods may have no CAR — handle gracefully.

---

## 13. Acceptance + Handoff

Your output back to the orchestrator is:
- Files committed to a branch (`feat/report-generator` or similar)
- One generated sample report pair (`.html` + `.docx`) in `dist/reports/`
- A ~200-word summary: what works, what's stubbed, what's blocked, what needs tuning
- Any schema questions surfaced during the build

**Do not mark as done until `npm run build && npm test && npm run report -- --client EBSF --month 2025-06` all succeed with no errors.**

Report back when blocked, before rabbit-holing. The orchestrator has wide context on
this project and can unblock you quickly on spec or data questions.

Good hunting.
