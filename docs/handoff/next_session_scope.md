# Next Session Scope — Constance Conservation

*Entry point for a fresh orchestrator chat. 2026-04-23.*

**Read this first. Then read `docs/handoff/project_state_2026-04-23.md` for the full
snapshot if you need the back-story.**

---

## 0. State check — do this in the first 60 seconds

```bash
cd ~/Documents/constance-conservation
git log --oneline -3
git status --short
npm test 2>&1 | tail -4
```

Expected:
- Latest commit on `main`: `68f8273` (docs snapshot) or newer if Peter has
  pushed/pulled since.
- Working tree clean (one untracked `Screenshot …png` is fine).
- 259/259 tests pass, build clean.

If any of those are wrong, STOP and diagnose before taking any action.

---

## 1. Where the work stands

**Done (M03 complete):** Report generator pipeline works end-to-end for the EBSF
pilot. Dashboard has preview + inline edit + DOCX download + image upload. 1 real
client (Camden Council) with 1 site (EBSF) and 8 zones, ~1,600 inspections. `main`
carries all of it.

**Next code milestones:** queued but not urgent. See §4 for the priority order.

**Immediate Peter-flagged work:** Supabase migration (imminent), design refresh
(when HTML arrives), ops roster onboarding (Cameron/Ryan's timeline).

---

## 2. Queued work — in priority order

### Priority 1 — Supabase project migration (Peter says imminent)

**Status:** runbook ready, waiting to execute.
**Brief:** not needed — the runbook is already written at
`docs/handoff/project_state_2026-04-23.md` §6 (9 steps).
**Who does it:** orchestrator can execute directly (small, well-defined, reversible
if things break).
**Key details Peter needs to provide:**
- The new Supabase project URL + service-role key
- Confirmation that he's OK with the orchestrator running the export/import (or
  he'll do some steps himself in Supabase Studio)

**Watch-outs:**
- `exec_sql` RPC must be manually created in the new project (SQL in runbook step 4)
- Storage bucket `report_assets` must be created via `supabase.storage.createBucket()`
  after updating `.env` (not via SQL migration — RPC doesn't own storage.objects)
- `dashboard-preview.html` has hardcoded creds on lines ~356-357 that must update

**Success criteria:**
- `npm run build && npm test && npm run report -- --client Camden --month 2025-06
  --skip-llm` all green against new DB
- Dashboard loads, Clients tab shows Camden Council, Reports tab shows drafts

### Priority 2 — Design refresh (waiting on Peter's HTML)

**Status:** blocked on Peter providing the HTML with new CSS.
**Scope:** CSS-only — fonts, colors, spacing, tokens. **Layout does not change.**
**Files to touch:**
- `dashboard-preview.html` — inline `<style>` block at top of file (~line 9-163)
- `src/report/templates/styles.ts` — report output CSS (the REPORT_CSS tagged template)
**Do NOT touch:**
- HTML structure, classnames, responsive breakpoints
- JS behavior
- The report's section ordering or content mapping

**Estimated effort:** 1-2 hours when the HTML arrives. Orchestrator can do this
directly OR hand off as a small executor brief, depending on scope of change.

**Smoke test after:** Open the dashboard, visually verify all pages look correct.
Re-generate EBSF June 2025 report (`npm run report -- --client Camden --month
2025-06 --skip-llm`) — diff structure against source DOCX to confirm nothing broke.

### Priority 3 — Real client roster onboarding (Cameron/Ryan's timeline)

**Status:** doc sent to them (hopefully). Waiting for filled roster.
**Docs they have:**
- `docs/handoff/client_onboarding.md` — the 5-min read + naming conventions
- `docs/handoff/roster_template.csv` — CSV-shaped template

**Two outcomes possible:**
- They return a filled spreadsheet → fire **E7 CSV import** (task #13 — brief not
  yet written, quick to draft)
- They hand-enter in the dashboard UI → no code work needed; orchestrator just
  watches dashboard for new clients/sites and confirms the flow feels right

**Parallel ops ask:** Cameron should update the SC "Daily Work Report" template so
"Client / Site" is a dropdown. ~20 min in SC admin UI. Improves ingest quality from
85% → ~100% auto-link. Not blocking.

### Priority 4 — M04: Review/Approve/Send workflow *(next code milestone)*

**Status:** task #14. Brief not yet written.
**Prerequisites:** Priority 1 done. Priority 2 nice-to-have first.
**Scope (5 pieces):**
1. Approve button in preview modal → flips `client_reports.status` draft → approved
2. Resend integration — HTML body + DOCX attachment + PDF attachment
3. Real server-side PDF via headless Chrome (puppeteer or similar)
4. Cron trigger reading `sites.schedule_config` / `clients.schedule_config` — auto-generates drafts on schedule
5. Review-queue UI showing drafts needing attention (needs_review, overdue, etc.)

**Effort:** ~1 day (4-6 executor hours), split across 2-3 briefs.

### Priority 5 — M05: Agentic Interface *(future milestone)*

**Status:** scoped, 5 open questions. See `docs/scope/agentic_interface.md`.
**Prerequisites:** M04 done + real client data ingested (so agent responses aren't
against one-pilot dataset).
**Effort:** ~8-12 executor hours split across 5 sub-briefs (M05a-e).

**Decisions to make before starting:**
1. Hosting for the MCP server — local, Railway, or Supabase Edge Functions?
2. LLM for `/ask` — Claude Sonnet (what we use) or cheaper Haiku?
3. Embedding model — OpenAI ada-2 or local nomic-embed?
4. First non-human consumer of the agent interface — Ryan's phone bot? Nightly
   review bot? Internal analyst bot?
5. Sync vs async tool-call latency handling — `generate_report` takes 30-60s with
   LLM; do we block or poll?

### Priority 6 — Parent dashboard integration *(much later)*

**Status:** flagged, not scoped in detail yet. Task #17.
**Scope:** this product becomes a sub-product of a larger Constance master dashboard
(rostering + more). User clicks "Report Generation" in master → this product opens.
**Decisions needed when the time comes:**
- Shared auth (SSO token? Supabase Auth cross-app?)
- Navigation pattern (iframe? subdomain? route within master?)
- Shared design language
- Possibly expose read API from this product for master's KPI widgets

---

## 3. Tasks list at a glance

**Pending (ordered):**
- #15 Supabase project migration — priority 1
- #16 Design refresh — priority 2, blocked on Peter's HTML
- #13 E7 CSV bulk-import — priority 3, blocked on roster return
- #14 M04 Review/approve/send — priority 4
- #17 Parent dashboard integration — priority 6, later
- #6 Scope M02 Data Enrichment — future, needs 3-6mo data
- #10 Reparse sweep — hygiene, do opportunistically

**Completed this session:** #1, #2, #5, #7, #8, #9, #11, #12.

---

## 4. How to work through this

Default pattern when you pick this up:

1. Read this file + project_state_2026-04-23.md (5 min total).
2. Ask Peter: "What's the status on [Priority 1 / 2 / 3]? Anything new?"
3. Based on answer, either:
   - Execute a queued task directly (Supabase migration is small, design refresh is
     medium — both reasonable for the orchestrator chat).
   - Write an executor brief and hand off (M04 pieces, E7 CSV import, M05 sub-briefs).
4. Keep MEMORY.md + this doc updated as state changes. When the session ends, update
   this doc's §1 "Where the work stands" and commit.

**Executor handoff pattern (works well for this project):**
- Write brief at `docs/executor_briefs/E<n>_<subject>.md`
- Give Peter the paste prompt: *"Read /Users/peterfrost/Documents/constance-conservation/docs/executor_briefs/E<n>_<subject>.md and execute it. Report back when done or blocked."*
- Peter spins up a new chat, pastes, they work, they commit to branch, they report
  summary back. Orchestrator reviews + reconciles.

---

## 5. Known gotchas (quick reference — full list in project_state_2026-04-23.md)

- Direct Postgres connection unreachable (IPv6). Use `exec_sql` RPC for DDL.
- `exec_sql` RPC cannot modify `storage.objects` — use Storage API directly.
- 440 historical rows' `sc_template_type` was wrong pre-E6 — now retagged, but don't
  let this bug reappear if reparsing.
- 15% of real DWR rows have null `site_id` — 2022 legacy data with blank SC Site
  Name. No parser fix possible; manual mapping would be needed if we ever care.
- Dashboard has hardcoded `SUPABASE_URL` + `SUPABASE_KEY` (lines ~356-357 of
  dashboard-preview.html) — remember this on migration.
- Inline vs block `.review-required` CSS class distinction — preserve it through
  any design refresh (inline = small pill in table cells; block = full-width alert).

---

## 6. One-liner status to open a new session with

> *"Snapshot: M03 complete on main. Next work in priority: Supabase migration
> (imminent, runbook in docs), design refresh (waiting on new HTML), roster
> onboarding (Cameron/Ryan). Pending code milestones M04 and M05. 259/259 tests
> pass. Pick up from docs/handoff/next_session_scope.md."*
