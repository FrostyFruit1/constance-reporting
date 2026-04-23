# Executor Brief E6 — Client Data Model Cleanup

**Run on `feat/report-generator`. Sequential — no parallel dependencies.**

---

## 1. Context

E1-E5 shipped the report generator and UI. Before Peter hands the Clients/Sites/Zones
management off to ops (Ryan/Cameron) to populate real roster data, we need to fix
several data-model muddles that are cosmetic but confusing, plus one real parser bug.

This is a hygiene sweep — no new features, no new schema beyond what's strictly needed
to reconcile existing rows.

**Read first:**
- `MEMORY.md` — orchestration handoff (top of file)
- `docs/executor_briefs/E2_hierarchy_schema.md` — hierarchy convention
- Orchestrator's flagged issues in prior session (listed below)

---

## 2. Scope (5 fixes, bundled)

### Fix 1 — Merge EBSF client into Camden Council

**Current state:** two client rows exist:
- `EBSF (Elderslie Banksia Scrub Forest)` — has `contact_name = 'Steven Robertson'`, used by the report generator
- `Camden Council` — empty, no contact

**Per the source DOCX:** "Addressed to: Steven Robertson, Camden Council". Camden Council
is the paying entity (client); EBSF is a **site/project** under Camden. The model has
this backwards.

**Fix:**
1. Copy all non-null fields from the EBSF client row into the Camden Council row
   (contact_name, contact_email, contact_phone, long_name, schedule_config, site_id_pattern).
2. Update the EBSF top-level `sites` row (`parent_site_id IS NULL AND name = 'EBSF'`)
   to set `client_id` = Camden Council's id.
3. Delete the EBSF client row. Check no foreign keys reference it first (should be none
   after step 2).
4. Update the existing `client_reports` rows (the EBSF June 2025 drafts) to reference
   the Camden Council client_id. The generator keys on `(client_id, site_id, period)`
   for upsert, so re-running wouldn't clobber these — but re-pointing is cleaner.
5. Regenerate the EBSF June 2025 report via `npm run report -- --client-id <camden_uuid>
   --month 2025-06 --skip-llm` (skip LLM to avoid API cost for a smoke test). Confirm
   title still reads `"Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report"`.

**Test target:** dashboard Clients tab shows exactly ONE client (Camden Council) with
EBSF as a site under it, zones nested under EBSF.

### Fix 2 — Re-parent orphan EBSF variants

These 4 rows exist with `parent_site_id = NULL` and should be children of EBSF:

- `Spring farm EBSF Zone B` (lowercase "farm")
- `EBSF Zone C(Planting)` (no space before paren)
- `EBSF Zone C (Planting)` (with space — duplicate of above)
- `EBSF Watering`

**Fix:**
- Set `parent_site_id` = EBSF top-level site id on all four.
- Merge the two `EBSF Zone C (Planting)` variants: keep the one with more inspections,
  add the other name to `site_aliases`, re-point any inspections from the deleted row
  to the kept one, then delete the redundant row.

### Fix 3 — De-dup other site-name duplicates

Three more pairs spotted with duplicate names:

- `George Caley Reserve, Mount Annen.` — 2 rows
- `Northern road, Narellan.` — 2 rows
- `Ulmarra Avenue, Camden South` — 2 rows (+ 1 similar `Ulmarra Avenue` — 3 variants total)

**Fix:**
- For each pair: pick the row with more inspections (or the earlier-created one if
  tied). Keep it. Re-point the other(s)' inspections to it. Add alternate names to
  `site_aliases`. Delete duplicates.
- These are NOT EBSF so `client_id` stays null for now (ops will assign clients later
  via the Clients UI).

### Fix 4 — Parser template-detection fallback bug

**Current bug in `src/parser/index.ts:103`** (`errorResult` function):

```ts
templateType: 'daily_work_report',   // ← wrong fallback for unknown templates
```

This causes unknown templates (toolbox talks, OSHA, Incident Reports) to be stored
as `inspections.sc_template_type = 'daily_work_report'`. Currently 440 rows are
mis-classified this way.

**Fix:**
1. Add a `'unknown'` variant to the `sc_template_type` column type (it's currently
   a text column — check schema). If it's a custom enum, extend it.
2. Change `errorResult` to set `templateType: 'unknown'` when the template isn't
   recognized.
3. Write a re-tagging script (`src/bin/retag_templates.ts`) that:
   - Reads every inspection
   - Looks at `sc_raw_json.template_id`
   - Runs `detectTemplateType()` to determine the true type
   - Updates `inspections.sc_template_type` if it differs
   - Reports a count of updates
4. Run it once.

**Test target:** after retag, `SELECT sc_template_type, COUNT(*) FROM inspections GROUP
BY sc_template_type` shows: `daily_work_report` ~365, `chemical_application_record` ~170,
`unknown` ~450+ (the mix of toolbox talks, OSHA, etc.). Totals match the previous count.

### Fix 5 — Seed `sites.long_name` for EBSF + known sites

E3 flagged that `sites.long_name` is unseeded. The title-composition fallback chain
works but seeding tightens it up.

**Fix:**
- EBSF top-level site: set `long_name = 'Elderslie Banksia Scrub Forest'`
- Other top-level sites where the long name is obvious from the short name:
  - (leave blank unless clearly inferrable — don't guess)

---

## 3. Bonus — Bulk-assign UI (if time permits)

In the existing Clients page, add a "Unassigned Sites" section that shows all top-level
sites with `client_id IS NULL`. Each row has a dropdown to pick a client. On select,
`patchRow('sites', id, { client_id: picked })`. This lets Ryan work through the 30-ish
unassigned sites quickly.

If bandwidth-constrained, skip this. It's a nice-to-have for the ops handoff.

---

## 4. Acceptance Gate

```bash
npm run build && npm test
```

- All tests pass (259+ currently).
- DB state:
  - Exactly ONE client row (Camden Council) with EBSF contact info
  - `sites WHERE name = 'EBSF'` has client_id = Camden Council's id
  - All 9 EBSF-related rows have `parent_site_id` = EBSF top-level id
  - Zero duplicate site names across `sites.name`
  - `SELECT sc_template_type, COUNT(*) FROM inspections GROUP BY 1` has an `unknown` bucket
- Dashboard Clients tab shows ONE client card (Camden Council) with EBSF nested correctly.
- EBSF June 2025 report still generates cleanly.
- `src/parser/index.ts:103` no longer says `'daily_work_report'` — now says `'unknown'`.

Commit to `feat/report-generator`. Short summary to orchestrator including: row counts
before/after each fix, any SQL that needed manual touching in Supabase Studio (if
`exec_sql` couldn't handle it), and anything you chose to skip with justification.
