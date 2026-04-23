# Constance Conservation — Project State Snapshot
*2026-04-23 — end of M03 (Report Generation) milestone.*

**Purpose:** single-doc snapshot for a fresh orchestrator OR for Peter to share with
clients / collaborators. Describes what's shipped, where the data lives, what's
coming next, and how to execute the immediate-next infrastructure change (Supabase
migration).

---

## 1. TL;DR — what this platform does, today

Constance Conservation runs ecological land-management contracts for councils. Teams
file daily reports in Safety Culture (SC). Ops manager Ryan then spends 6-8 hours
every month consolidating those dailies into client-facing reports.

This platform automates that loop:

1. **Ingests** daily SC inspections via scheduled sync + webhooks (live pipeline, ~1,600 rows).
2. **Aggregates** inspections by (client × site × zone × period).
3. **Generates** a drafted monthly/weekly client report — HTML canonical, DOCX export,
   browser-Print-to-PDF. Narrative sections are LLM-synthesised via Claude Sonnet 4.6.
4. **Presents** drafts in a dashboard for review. Ops opens, edits inline, uploads
   maps, saves.
5. **(Future, M04)** Approves → sends via Resend. Cron triggers per schedule.

Pilot client: **Camden Council**, pilot site: **EBSF (Elderslie Banksia Scrub
Forest)**, validated against the real June 2025 monthly report (5MB DOCX in repo root)
as ground truth.

---

## 2. Current state — what exists right now

### Code

- Repo: `/Users/peterfrost/Documents/constance-conservation`
- Branch: `main` (merged M03 at commit `e3612a8`). HEAD: `94f5399`.
- Stack: TypeScript + Node 22 + Supabase (Postgres + Storage). Vitest for tests.
- Tests: **259/259 pass**. Build clean.
- Untracked: `Screenshot 2026-04-23 at 9.17.51 am.png` (formatting-issue reference)

### Database

- **Supabase project** (current, about to be migrated): `yrkclyeklwjlfblxvdbc`
- **Schema**: Migrations 001-009 applied (see `supabase/migrations/`)
  - 001 initial schema (27 tables)
  - 002 client profile tables
  - 003 sync_state
  - 004 report generation additions (location_maps, schedule_config, etc.)
  - 005 report round 2 additions (long_name, site_id_pattern)
  - 006 site hierarchy (parent_site_id)
  - 007 schedule_config + site_long_name
  - 008 storage bucket (policies skipped — see "Known gotcha" below)
  - 009 E6 data cleanup (site_aliases, EBSF merge, template retag)
- **RPC**: `exec_sql(query text)` — custom function created manually to bridge DDL
  via HTTPS (direct DB connection is IPv6-only and unreachable from this Mac).
  **Must be recreated in the new Supabase project.**
- **Storage bucket**: `report_assets` (public read, service-role write). Image
  uploads for §1.0 location maps + §4.0 period maps.

### Live data (as of this snapshot)

| Entity | Count | Notes |
|---|---:|---|
| organizations | 1 | Constance Conservation |
| clients | 1 | Camden Council |
| sites (top-level) | ~35 | Only EBSF has client_id set. Rest are unassigned orphans. |
| sites (zones, `parent_site_id` set) | 8 | All under EBSF: Zone B, C, D, Zone B and C, Spring Farm EBSF, Spring farm (lc), Zone C(Planting), Watering |
| staff | ~25 | Seeded from inspections |
| inspections | ~1,600 | 2025-01 → 2026-04 + partial 2022-2024 legacy |
| inspections (daily_work_report) | 599 | Post-retag |
| inspections (chemical_application_record) | ~197 | |
| inspections (unknown) | ~450 | Toolbox talks, OSHA, incidents — not used by generator |
| client_reports | 2 | EBSF June 2025 — one zone-scope, one client-scope |

### Dashboard

- Single-file SPA: `dashboard-preview.html` at repo root. Open with `open` command.
- **Pages**: Dashboard, Inspections, Clients (with client detail → site detail → zone
  list), legacy All Sites, Staff, Chemicals, Species, Reports, Pipeline Health.
- **Reports tab features**: draft list, preview modal with inline contenteditable,
  Download DOCX, Print-to-PDF, edit-mode drag-drop image upload.
- **Supabase creds**: currently hardcoded in `dashboard-preview.html` lines 356-357.
  Must update after migration.

### CLI

```bash
npm run build                       # tsc
npm test                            # vitest (259 tests)
npm run sync                        # scheduled SC sync (incremental)
npm run sync:backfill -- --backfill-from 2025-01-01
npm run report -- --client EBSF --month 2025-06           # name-lookup shortcut
npm run report -- --client-id <uuid> --month 2025-06       # whole-client scope
npm run report -- --site-id <uuid>   --month 2025-06       # site scope
npm run report -- --zone-id <uuid>   --week 2025-W27       # zone scope
npm run report -- --client EBSF --month 2025-06 --skip-llm # fast dev path (no LLM)
npm run webhook                      # SC webhook server
npm run seed                         # onboarding seed
```

---

## 3. What's shipped — feature-level

### Ingestion (M01)
- SC API client with pagination + rate limiting
- Parser for Daily Work Report + Chemical Application Record templates
- Writer with lookups (sites, staff, species, chemicals) + child-record cascades
- Scheduled sync with high-water-mark
- Webhook handler (built but not exposed publicly yet)
- Parser handles template evolution: list/text/question/site/address field-type
  variants, multiple label spellings, missing data fallbacks

### Report generation (M03)
- Aggregation across 8 sections per spec (`docs/report_data_mapping.md`)
- LLM narrative synthesis (§2 Outline of Works) via Claude Sonnet 4.6
- Fallback text for §5/§7/§8 (observations with no data)
- HTML template (inline CSS, Gmail-safe) + DOCX via `docx` npm package
- Scope-aware: client / site / zone reports, all via same pipeline
- Zones normalization ("Zone B and C" umbrella folding + letter-range formatting)
- CAR matching for §6 Herbicide Information
- Site-name fuzzy-regex via `clients.site_id_pattern` + hierarchy traversal

### Data model
- Organizations → clients → sites (top-level) → sites (zones, `parent_site_id`)
- Inspections tagged to zones; aggregation walks up through parent_site_id
- `site_aliases` for typo/variant reconciliation
- `schedule_config jsonb` on both clients and sites for auto-generation schedules
  (not wired to cron yet)

### Dashboard
- Full CRUD-ish nav: Clients → Client detail → Site detail → Zones
- Schedule widgets (Off / Weekly / Monthly / Quarterly)
- Reports tab with preview/edit/save/export
- Inline contenteditable with dirty-state + save to DB
- Drag-drop image upload into placeholder figures (edit mode)

---

## 4. Upcoming changes — what Peter has queued

### A — Supabase project migration *(imminent)*

Export current DB, import into new Supabase project, re-point the app. See §6 below
for the runbook.

### B — Design refresh *(next)*

Peter will provide an HTML file with new CSS (fonts, colors, spacing, style tokens).
**Layout does not change.** Just styling.

Scope when it arrives:
1. Extract CSS variables / token palette from Peter's file
2. Map tokens into:
   - `dashboard-preview.html` (inline `<style>` block at top)
   - `src/report/templates/styles.ts` (report-output CSS)
3. Keep all classnames, HTML structure, responsive breakpoints
4. Smoke-test: dashboard renders, generated report still passes structural diff
5. Not a big task — probably 1-2 hours — but touches two files with careful CSS.

### C — Parent dashboard integration *(later)*

Constance Conservation runs a **master dashboard** elsewhere with rostering etc.
This report-generation product becomes a sub-product: user clicks "Report Generation"
button in the master dashboard → this product opens (iframe, route, or subdomain).

Implications to think through when the time comes:
- Shared auth (SSO or cross-domain token)
- Navigation: when user closes report tab, go back to master dashboard
- Design language must match master
- Possibly expose read API to master dashboard for KPI widgets

Not urgent. Flagged only so it's on radar.

### D — Real client roster onboarding *(Cameron/Ryan work)*

Handoff doc: `docs/handoff/client_onboarding.md`
Roster template: `docs/handoff/roster_template.csv`

Once filled, run E7 CSV import (task #13) or populate via the Clients UI.

### E — M04: review/approve/send workflow *(next code milestone)*

Task #14. Approve button, Resend integration, real server-side PDF, cron trigger
reading schedule_config.

### F — M05: agentic interface *(after M04)*

Scope doc: `docs/scope/agentic_interface.md` — 3 pillars (Read / Act / Subscribe),
MCP server, scoped API keys, pgvector semantic search, `/ask` natural-language
endpoint. 5 open questions flagged at the end.

---

## 5. Known gotchas / things not to rediscover

- **Direct Postgres connection is unreachable** from this Mac (Supabase IPv6-only).
  All DDL goes through the `exec_sql(query text)` RPC. Transaction pooler also broken
  ("tenant not found").
- **exec_sql RPC cannot modify `storage.objects`** — it's not owned by the RPC role.
  Storage bucket was created via `supabase.storage.createBucket()` directly. Policies
  in migration 008 were skipped; not strictly needed since bucket-level public flag +
  service-role writes cover our use case.
- **~15% of real DWR rows have null site_id** — these are 2022 rows where the SC
  field worker genuinely didn't fill the Site Name field. No parser fix can recover
  them without manual mapping.
- **440 historical rows had wrong sc_template_type** before E6 — they were toolbox
  talks mis-tagged as `daily_work_report`. E6's retag script fixed this; they're now
  `sc_template_type = 'unknown'` and filtered out of the generator.
- **`sites.long_name` only seeded for EBSF.** Other sites fall back to `name` in
  report titles — works today, tighter once populated.
- **dashboard-preview.html has hardcoded SUPABASE_URL + SUPABASE_KEY** (lines ~356-357).
  These need updating after migration.
- **`ANTHROPIC_API_KEY`** lives in `.env`. Used only by the report generator for §2
  narrative synthesis. Skip with `--skip-llm` for cost-free dev runs.
- **CSS bug** in the report's inline `.review-required` class was patched in
  `src/report/templates/styles.ts` post-E1 round 2. Keep the split between inline
  `.review-required` (pill) and block `.review-banner` (full-width alert).

---

## 6. Supabase migration runbook

*Execute in this order. ~30 min total.*

### Step 1 — Export current project

In Supabase Studio for the current project (`yrkclyeklwjlfblxvdbc`):

- **Database dump** via Supabase Studio → Project → Settings → Database → "Database
  backups" OR use `pg_dump` if you have a connection. Get a `.sql` file.
- **Export storage objects** from `report_assets` bucket (if any exist). For the
  current pilot, only a test ping was uploaded then deleted — likely empty. Confirm
  in Supabase Studio → Storage.
- Note down current project's `SUPABASE_URL` and service-role key for reference.

### Step 2 — Create new Supabase project

- Supabase dashboard → New Project
- Pick region (prefer the same as before for latency consistency)
- Note the new **project ref**, **URL**, **anon key**, **service-role key**

### Step 3 — Import schema + data

- Supabase Studio → SQL Editor → paste the dump and run. OR via psql if you have
  access.
- Watch for errors — some extensions (pgvector, etc.) may need enabling first.
- Verify key tables populated: `SELECT COUNT(*) FROM inspections, clients, sites,
  client_reports`

### Step 4 — Recreate `exec_sql` RPC

This function is NOT in the migrations — it was created manually in the original
project. Run in the new project's SQL Editor:

```sql
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    EXECUTE query;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to service_role and authenticated
GRANT EXECUTE ON FUNCTION public.exec_sql TO service_role;
```

### Step 5 — Recreate Storage bucket

```bash
cd ~/Documents/constance-conservation && node -r dotenv/config -e "
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
c.storage.createBucket('report_assets', {
  public: true,
  fileSizeLimit: 10485760,
  allowedMimeTypes: ['image/png','image/jpeg','image/webp']
}).then(r => console.log(r));
"
```

Do this *after* Step 6 (updating `.env`).

### Step 6 — Update `.env`

```env
SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<new service role key>
# (and SUPABASE_ANON_KEY if anything uses it — search: grep -rn "SUPABASE_ANON_KEY" src/)
# keep ANTHROPIC_API_KEY and SC_API_TOKEN unchanged
```

### Step 7 — Update hardcoded creds in dashboard

Edit `dashboard-preview.html` lines ~356-357:

```js
const SUPABASE_URL = 'https://<NEW_PROJECT_REF>.supabase.co';
const SUPABASE_KEY = '<new service role or anon key as appropriate>';
```

(Dashboard currently uses service-role for PATCH on `client_reports.html_content` and
inline edits. Either keep using service-role — acceptable for internal dashboard — or
migrate to an authenticated user-scoped key when M04 lands.)

### Step 8 — Verify

```bash
cd ~/Documents/constance-conservation && \
  npm run build && npm test && \
  npm run report -- --client Camden --month 2025-06 --skip-llm
```

- Build green, tests 259/259
- Generator writes a new row in `client_reports` against the new DB
- Open `dashboard-preview.html`, navigate to Reports, preview the new row

### Step 9 — Commit the creds update

```bash
git add dashboard-preview.html
git commit -m "chore: point dashboard to new Supabase project"
```

(`.env` is gitignored; don't commit it.)

---

## 7. File index for new orchestrator

**Read in order:**
1. `SOUL.md` — values + mission
2. `PRINCIPLES.md` / `POLICIES.md`
3. `MEMORY.md` — current state + orchestration handoff
4. **This file** — comprehensive snapshot (you're here)
5. `docs/report_data_mapping.md` — the canonical spec for report generation
6. `docs/handoff/client_onboarding.md` — what Cameron/Ryan see
7. `docs/scope/agentic_interface.md` — M05 forward-looking

**Executor briefs (historical record, for context):**
- `docs/executor_briefs/E1_report_generator.md` + `E1_round2_fixes.md`
- `docs/executor_briefs/E2_hierarchy_schema.md`
- `docs/executor_briefs/E3_export_and_scope_flags.md`
- `docs/executor_briefs/E4_clients_zones_ui.md`
- `docs/executor_briefs/E5_image_uploads.md`
- `docs/executor_briefs/E6_client_data_cleanup.md`

**Reference material:**
- `samples/*.json` — 5 raw SC audit JSONs (3 DWR 2025, 1 DWR 2026, 1 CAR)
- `EBSF Zone B C June Report.docx` — ground-truth client report
- `Daily Report WSPT Central.pdf` — sample SC daily export
- `milestones/M00_foundation_api_testing.md`, `M01_ingestion_pipeline.md`,
  `M06_data_warehouse.md`, `M07_historical_backfill.md`

---

## 8. Task list hygiene

**Done this session:** #1, #2, #5, #7, #8, #9, #11, #12 (completed)
**Deferred / open:**
- **#10 Reparse sweep** — ~58 rows would benefit from parser fix re-run. Low priority.
- **#13 E7 CSV bulk-import** — build when Cameron/Ryan return the filled roster.
- **#14 M04 review/approve/send** — next code milestone after roster onboarding.
- **#6 Scope M02 Data Enrichment** — only after 3-6 months production data.

---

## 9. One-line status

> *M03 complete. End-to-end pipeline works for EBSF pilot. Next infrastructure
> change: migrate DB to a new Supabase project (runbook in §6). Next code work:
> either E7 CSV import (if roster comes in) or M04 review/send (if roster takes a
> while). Design refresh pending Peter's HTML.*
