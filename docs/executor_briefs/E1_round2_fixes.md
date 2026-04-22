# Executor Brief E1 — Round 2 Fixes

**Context:** Round 1 shipped a working scaffold on branch `feat/report-generator`
(commit 38e4717). Orchestrator reviewed the output at
`dist/reports/EBSF_Zone_C_B_and_B_and_C_June_2025_Monthly_Report.html` and identified
5 defects to fix before Peter demos. Diff against source
`EBSF Zone B C June Report.docx` to validate each.

This brief targets the **same branch** — keep committing to `feat/report-generator`.
Expected effort: ~2 hours.

---

## Fix 1 — Zones normalization (title, filename, footer, grouping)

**Current (wrong):** `"EBSF (Elderslie Banksia Scrub Forest) Zones C, B and B and C June 2025 Monthly Report"`

**Target (matches source):** `"Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report"`

**Root cause:** EBSF has 4 site rows in `sites` — `EBSF Zone B`, `EBSF Zone C`,
`EBSF Zone B and C`, `EBSF Zone D`. The generator concatenates raw site names which
gives "C, B and B and C". It should extract the zone letters, dedupe, sort, and format
as a proper range: `["B","C"]` → `"Zone B and C"`; `["A","B","C"]` → `"Zones A, B and C"`.

**Build a helper** in `src/report/aggregate.ts` or a new `src/report/zones.ts`:

```ts
/**
 * From a list of raw site names with inspections in period, extract the unique
 * zone letters and produce a canonical report label.
 *
 * "EBSF Zone B", "EBSF Zone C", "EBSF Zone B and C"
 *   → { label: "Zone B and C", letters: ["B", "C"] }
 *
 * "EBSF Zone A", "EBSF Zone B", "EBSF Zone C"
 *   → { label: "Zones A, B and C", letters: ["A","B","C"] }
 */
export function resolveReportZones(siteNames: string[]): {
  label: string;       // e.g. "Zone B and C"
  letters: string[];   // e.g. ["B","C"] — sorted, deduped
};
```

Regex for zone extraction from site names: `/Zone\s+([A-Z])(?:\s+and\s+([A-Z]))?/g`.
A name like `"EBSF Zone B and C"` yields two letters: `["B","C"]`. Dedupe + sort.

**Format rules:**
- 1 letter: `"Zone X"`
- 2 letters: `"Zone X and Y"`
- 3+ letters: `"Zones X, Y and Z"` (Oxford comma optional — match the source DOCX style which does NOT use Oxford: `"Zone B and C"`)

**Use this helper in:**
- Report title (`src/report/aggregate.ts` or wherever title is composed)
- Filename (replace the current naive join)
- Footer "zones Zones C, B and B and C" → "Zone B and C"
- Store `letters` into `client_reports.zones_included` (text[])

**Site long name:** Drop the parenthetical. Title should read
`"Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report"` NOT
`"EBSF (Elderslie Banksia Scrub Forest) ..."`. Use `clients.name` as the long name
source; if it equals or starts with the short code, prefer a separate `clients.long_name`
column — add that column if needed and seed it to `"Elderslie Banksia Scrub Forest"`
for the EBSF client.

**Test target:** after fix, filename is
`Elderslie_Banksia_Scrub_Forest_Zone_B_and_C_June_2025_Monthly_Report.html`.

---

## Fix 2 — Fold "Zone B and C" inspections into B and C (§2, §3, §4.1)

**Current:** §2 has `2.1 EBSF Zone C`, `2.2 EBSF Zone B`, `2.3 EBSF Zone B and C`. §3 likewise has three zone subsections. The third is redundant — the source DOCX has only two (Zone B and Zone C).

**Rule:** When an inspection's site is an "umbrella" site (`EBSF Zone B and C`),
include its data in BOTH of the component zones' sections. Use the `resolveReportZones`
helper to detect umbrella sites (letters.length > 1 for a single site name).

**Implementation:**
- In aggregation (`src/report/aggregate.ts`): when grouping inspections by zone, expand
  umbrella sites into their letters. An inspection on `EBSF Zone B and C` contributes
  to BOTH the Zone B and Zone C groupings.
- Staff hours from umbrella sites: attribute in FULL to each component zone (not 50/50).
  The inspection genuinely covered both zones on the same day; splitting hours would
  distort the picture. Add a small footnote in the §3 table caption: "Hours from
  combined-zone field days are attributed to each zone worked."
- Weed works (§4.1): umbrella site inspections become one row per (weed × zone worked).
  Same rule — one inspection can contribute to multiple zone rows.

**Test target:** §2 has exactly two subsections: `2.1 Zone C`, `2.2 Zone B`. §3 same.

---

## Fix 3 — §6 Herbicide CAR matching

**Current:** All 3 subsections show "No Chemical Application Record found for this period". Data table has 1 CAR in June 2025 (Spring Farm EBSF, 2025-06-30). The generator's CAR query is probably joining strictly on the EBSF site IDs which don't include the "Spring Farm EBSF" site.

**Fix:**
- Broaden CAR lookup to find records whose site matches the report's site set by name pattern, not just by `site_id`. For EBSF, include any site whose name matches `/EBSF|Elderslie/i` or is explicitly listed in the client's site mapping.
- Add a `clients.site_id_pattern` column (text, nullable) — a regex string that identifies all sites belonging to this client. For EBSF, seed with `EBSF|Elderslie`. The generator uses this pattern for both DWR and CAR queries, replacing hardcoded site ID lists.
- Fallback: if the column is empty, use ILIKE match on `clients.name` against `sites.name`.

**After fix:** §6.1 Glyphosate should display real total sprayed L + concentrate ml from
the Spring Farm EBSF CAR record (`chemical_application_items` + parent
`chemical_application_records.total_amount_sprayed_litres`). Remove the
"No CAR found — review required" banner for matched subsections.

**If the 1 CAR we have doesn't target any of the §6 subsections' weed/zone combos**
(check after the broader match), keep the banner and emit a note for orchestrator.

---

## Fix 4 — Cover block organization details

**Current cover has:** `Address: Harrington Park, NSW`

**Source DOCX has:**
```
Written By: Constance Conservation - Ryan Arford
Date: 30/06/2025
Addressed to: Steven Robertson, Camden Council
6/9 Samantha Place, Smeaton Grange NSW 2567
02 4666 2006
info@constanceconservation.com.au
```

**Action:**
- Verify `organizations` table schema has `address`, `phone`, `email`. If missing, add them (migration 005) and update the seed (`src/seed/onboarding.ts`) to populate them with:
  - address: `6/9 Samantha Place, Smeaton Grange NSW 2567`
  - phone: `02 4666 2006`
  - email: `info@constanceconservation.com.au`
- If the columns already exist, update the seed / insert values directly via `exec_sql` if the org row is already live. Then wire them into the cover template.
- `clients.contact_name` exists — use it for "Addressed to" ("Steven Robertson, Camden Council"). If not seeded, seed it.
- "Date" on cover should be `report_period_end` formatted DD/MM/YYYY, not `generated_at`. The source DOCX shows the end-of-period date, not the generation date.

---

## Fix 5 — LLM narrative validation

**Run:** `npm run report -- --client EBSF --month 2025-06` (no `--skip-llm`).

**Prerequisite:** `ANTHROPIC_API_KEY` is set in `.env`. Peter will add this before
running; do not commit it.

**Check:**
- §2 bullets replace the stub "Detailed narrative pending LLM synthesis" text with real
  3-6 sentence narratives per (zone × weed × method) combo, matching the style of the
  example bullets in `docs/report_data_mapping.md` §7.
- §5/§7/§8 remain as the fallback strings (no observations data, so LLM has nothing to
  summarise — expected).
- `client_reports.narrative_sections` JSONB is populated with the actual narratives, not stubs.

**If LLM output is weird** (hallucinated facts, wrong style, formatting issues):
- Capture the raw LLM response in a log file under `/tmp/`
- Note the specific issue and leave the stubs in place for orchestrator to iterate on
  prompt tuning

**Model:** Use `claude-sonnet-4-6` for quality; if cost matters, `claude-haiku-4-5` is fine for v1.
Enable prompt caching on the system message (see Anthropic SDK docs).

---

## Fix 6 — Inline vs block "review-required" styling

**Current bug:** the `.review-required` CSS class is used for both:
- **Block alerts** (e.g. full-width "No Chemical Application Record found" banners) → these need border-left + padding + background
- **Inline pills** (e.g. `<span class="review-required">TBD</span>` inside table cells and narrative bullets) → these inherit the block styling and render as broken mini-boxes with a visible left-border bar and mismatched padding

**Screenshot (visual evidence):** see `Screenshot 2026-04-23 at 9.17.51 am.png` in repo root — §6.x subsections show the broken inline pill rendering where "TBD." trails off each bullet with clipped borders.

**Fix in `src/report/templates/styles.ts`:**
- Keep `.review-required` as the **block** alert class (border-left + block padding — existing style).
- Introduce a new inline class, e.g. `.tbd` or `.inline-placeholder`:
  ```css
  .tbd { display: inline; background: #fdecea; color: #7a2d2d; padding: 0 6px; border-radius: 3px; font-size: 11.5px; font-weight: 500; letter-spacing: 0.02em; }
  ```
  No border, no block padding, sits inline with surrounding text.
- Update `src/report/templates/bush_regen.html.ts` and `render_docx.ts` to use the inline class for inline placeholder spans (TBD in table cells, TBD in bullet values, "needs CAR review" inline notes).
- The block alerts (like "No Chemical Application Record found for this period") keep `.review-required`.

**Visual check:** after fix, re-open the generated HTML. §6.x bullet lines should read cleanly like
"Total amount Sprayed: [TBD]." with the TBD looking like a small coloured tag, not a broken box.

---

## Acceptance Gate

Before reporting done:

```bash
npm run build && npm test && \
  npm run report -- --client EBSF --month 2025-06
```

Must succeed with no errors. Generated files must exist at
`dist/reports/Elderslie_Banksia_Scrub_Forest_Zone_B_and_C_June_2025_Monthly_Report.{html,docx}`.

Open the HTML in a browser and visually confirm:
- Title reads "Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report"
- §2 has two subsections (2.1 Zone C, 2.2 Zone B)
- §3 has two tables
- §6 has real numbers (not TBD) for at least one subsection
- Cover shows full org address, phone, email

Commit to `feat/report-generator`. Report back with a short summary: what landed,
any issues with the LLM output, anything still blocked.
