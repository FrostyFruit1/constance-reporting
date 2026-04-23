# Next Session Scope — Constance Conservation

*Entry point for a fresh orchestrator chat. Last updated: 2026-04-23 end of day.*

**Read this first. For the full back-story, see
`docs/handoff/project_state_2026-04-23.md`.**

---

## 0. The 60-second state check

```bash
cd ~/Documents/constance-conservation
git remote -v                              # origin → git@github.com-cc:FrostyFruit1/constance-reporting.git
git config user.email                      # peter.f@constanceconservation.com.au
git log --oneline -3                       # HEAD should be 31f6f47 or newer
ssh -T git@github.com-cc 2>&1 | head -1    # "Hi FrostyFruit1! ..."
npm test 2>&1 | tail -4                    # 259/259 pass
```

If any of those are wrong, STOP and diagnose before acting. Everything else in
this doc assumes the above is clean.

---

## 1. What shipped on 2026-04-23

**Full day of integration + infra work. Everything's live and connected.**

| Workstream | Status | Details |
|---|---|---|
| Report generator (M03) | ✅ | EBSF pilot end-to-end (ingest → aggregate → LLM narratives → HTML + DOCX → preview → edit → save). 259 tests, commit `38e4717`+. |
| Supabase project migration | ✅ | Moved `yrkclyeklwjlfblxvdbc` → `ymcyunspmljaruodjpkd`. 16,018 rows across 28 tables migrated via REST. Storage bucket recreated. Commit `9ffae5c`. |
| Design refresh | ✅ | Ported cc-dashboard's OKLCH design system (Inter + JetBrains Mono, mono-label typography, ink-on-cream palette) into both `dashboard-preview.html` and `src/report/templates/styles.ts`. Commit `3f10d77`. |
| Second GitHub account (FrostyFruit1) | ✅ | SSH key `~/.ssh/id_ed25519_cc` generated + uploaded. `~/.ssh/config` has `github.com-cc` host alias. Per-repo git identity set to `peter.f@constanceconservation.com.au`. |
| Repo migration | ✅ | Code moved from `FrostyFruit/constance-conservation` → `FrostyFruit1/constance-reporting`. Full history preserved. `FrostyFruit/constance-conservation` is now a stale copy — can be archived/deleted at leisure. |
| Vercel deploy | ✅ | **Live at https://constance-reporting.vercel.app/**. Static-only; `vercel.json` copies `dashboard-preview.html` → `index.html` during build. Deployed under Constance Vercel team. |
| cc-dashboard link | ✅ | `cc-dashboard/app/(dashboard)/page.tsx` APPS array updated — "Staff Reporting" card href = the Vercel URL, opens in new tab (`target='_blank'`). Commit `5f22990` on `constance-conservation/cc-dashboard`. |

**Demo loop verified:** master dashboard → click "Staff Reporting" card → new tab with our app.

---

## 2. Access / infra — what the new orchestrator has

```
Code repo (this project) :  github.com/FrostyFruit1/constance-reporting
                            Local clone at ~/Documents/constance-conservation/
                            Remote: git@github.com-cc:FrostyFruit1/constance-reporting.git (SSH via CC key)

Master dashboard repo    :  github.com/constance-conservation/cc-dashboard
                            Local clone at ~/Documents/cc-dashboard/
                            Remote: git@github.com-cc:constance-conservation/cc-dashboard.git (SSH via CC key)

Supabase project         :  ymcyunspmljaruodjpkd (URL in .env)
                            exec_sql RPC live, report_assets Storage bucket live.

Vercel                   :  Constance Vercel team
                            constance-reporting  → our app     → constance-reporting.vercel.app
                            cc-dashboard         → master app  → (URL TBD — check Vercel dashboard)

Git identities           :  This repo + cc-dashboard repo: Peter Frost <peter.f@constanceconservation.com.au>
                            Global (all other projects):   FrostyFruit <peter@continuumx.io>

SSH keys                 :  ~/.ssh/id_ed25519    → FrostyFruit (personal, github.com)
                            ~/.ssh/id_ed25519_cc → FrostyFruit1 (CC, github.com-cc)

Env vars in .env         :  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
                            SAFETY_CULTURE_API_TOKEN, SAFETY_CULTURE_ORG_ID, ANTHROPIC_API_KEY
                            .env is gitignored. Hardcoded duplicates of SUPABASE_URL + SERVICE_ROLE_KEY
                            live in dashboard-preview.html lines ~503-504 (also deployed via Vercel).
```

---

## 3. Immediate next workstream — NATIVE INTEGRATION into cc-dashboard

**Peter's stated priority for next session:** port our dashboard from the standalone
Vercel deploy *into* cc-dashboard as native Next.js routes under
`app/(dashboard)/reporting/*`. End state: one unified app, our code lives inside
cc-dashboard, same URL, same auth, same nav chrome.

This is a 1-2 week sized workstream. **Not a single orchestrator chat task** —
should be scoped into 3-5 executor briefs executed in sequence or parallel.

### Rough shape of the port

1. **Page routes** — convert `dashboard-preview.html`'s 10 pages into React
   server/client components under `app/(dashboard)/reporting/`:
   - `/reporting/` — landing (our current "Dashboard" page + Reports tab)
   - `/reporting/clients/` — clients list
   - `/reporting/clients/[id]/` — client detail (sites nested)
   - `/reporting/clients/[id]/sites/[siteId]/` — site detail (zones)
   - `/reporting/inspections/` — inspections table
   - `/reporting/reports/` — reports list with preview modal
   - `/reporting/pipeline/` — pipeline health
   - etc.
2. **Data loading** — replace vanilla `fetch()` + hardcoded creds with cc-dashboard's
   existing `lib/supabase/client.ts` + `lib/supabase/server.ts` (SSR-aware).
   Use `useCCState` context where sensible.
3. **Components** — port our custom components (schedule widget, edit-mode
   contenteditable modal, drop-zone, etc.) to React. Many will reuse cc-dashboard's
   existing `TopBar`, `Drawer`, `Icon` components.
4. **Styling** — already compatible: we ported cc-dashboard's design system into
   our vanilla CSS, so class names and tokens are already aligned. Move from
   `<style>` block to using their `app/globals.css` + Tailwind utilities.
5. **Server-side code** — `src/report/`, `src/parser/`, `src/sync/` become
   Next.js API routes or Server Actions:
   - `src/report/index.ts:generateReport()` → Server Action triggered by "Generate"
     button
   - `src/sync/scheduled_sync.ts` → Vercel Cron + API route
   - `src/webhook/server.ts` → Next.js API route
6. **Build + deploy** — dropping our separate Vercel deploy once cc-dashboard hosts
   everything natively. Update cc-dashboard's APPS array `href` back to internal
   `/reporting` route.

### Suggested brief breakdown

| Brief | Scope | Depends on |
|---|---|---|
| E8 | Scaffold `/reporting/*` route structure + port dashboard landing page | — |
| E9 | Port Clients / Sites / Zones hierarchy pages | E8 |
| E10 | Port Reports page — list + preview modal + inline edit + Save | E8 |
| E11 | Port Inspections + Pipeline pages | E8 |
| E12 | Server Actions + Cron — generate_report, scheduled_sync | E8 |

**Recommend:** fresh orchestrator chat brainstorms with Peter, decides brief
boundaries, writes E8 first, fires executor. Sequential.

---

## 4. Other queued work (lower priority, do after native port scoped)

### Cameron/Ryan roster onboarding (ops work, not code)
- `docs/handoff/client_onboarding.md` + `docs/handoff/roster_template.csv` ready to share.
- Peter has the handoff conversation when Cameron/Ryan have time.
- Two possible outcomes:
  - They return a CSV → fire **E7 CSV bulk-import** (task #13)
  - They hand-enter in dashboard UI → no code needed

### M04 — Approve / Send workflow (task #14)
- Resend integration, approve button, real server-side PDF (puppeteer or similar), cron trigger reading `schedule_config`.
- Naturally rolls into the Next.js port since both need Server Actions.
- Consider bundling with native-integration work.

### M05 — Agentic interface
- Scope doc already written at `docs/scope/agentic_interface.md`.
- Deferred until M04 done + real roster ingested.

### Hygiene
- #10 Reparse sweep — 58 rows benefit from parser fix re-run. Low priority.
- #6 M02 Data Enrichment scope — after 3-6 months production data.
- Archive or delete old `FrostyFruit/constance-conservation` repo (stale copy).
- Rotate Supabase service-role key (old `yrkclyeklwjlfblxvdbc` key is still in .env history / chat transcripts).

---

## 5. Paste prompt for the next orchestrator

```
Read /Users/peterfrost/Documents/constance-conservation/docs/handoff/next_session_scope.md
and orient yourself. Confirm the 60-second state check in §0.

Then help me scope the native integration of the reporting app into cc-dashboard
(the workstream in §3). I want to understand the effort breakdown, write the
first executor brief (E8 — scaffold /reporting/* routes + port landing page),
and fire an executor to start the port. The standalone Vercel deploy stays as
a fallback until the native integration ships.

Everything done today (Supabase migration, design refresh, Vercel deploy,
cc-dashboard link) is live — that's your starting baseline.
```

---

## 6. Known gotchas (quick reference — full list in project_state_2026-04-23.md)

- Direct Postgres connection unreachable from this Mac (IPv6). Use `exec_sql` RPC for DDL.
- `exec_sql` RPC cannot modify `storage.objects` — use Storage API directly.
- Dashboard has hardcoded `SUPABASE_URL` + `SUPABASE_KEY` in `dashboard-preview.html`
  lines ~503-504. Also deployed via Vercel. When porting to Next.js, swap to
  SSR-aware Supabase client + env vars.
- 440 historical inspections were mis-tagged as `daily_work_report` pre-E6 — fixed by retag script. Don't regress.
- 15% of real DWR rows have null `site_id` — 2022 legacy data with blank SC Site Name. No parser fix possible.
- ~58 rows would benefit from reparse (task #10) — retroactive parser re-run on existing `sc_raw_json`.
- cc-dashboard is Next.js 16 + React 19 + Tailwind 3.4. `app/(dashboard)/` is a route group (the parens are Next.js syntax, not a folder literal). Design tokens in `app/globals.css`.
- Inline vs block `.review-required` CSS class distinction — keep through any port (inline = small pill; block = full-width alert).

---

## 7. Task list

**Completed today (2026-04-23):**
- #16 Design refresh
- #15 Supabase project migration
- #17 Parent dashboard integration (interim link approach)
- #18 Push design refresh + Vercel deploy

**Still pending:**
- #14 M04 — Review/approve/send workflow (priority after native port)
- #13 E7 — CSV bulk-import for sites/zones (when roster arrives)
- #10 Reparse sweep — hygiene
- #6 Scope M02 — after 3-6mo data
- **NEW** — native integration (§3 above), briefs E8-E12

---

## 8. One-line status

> *"2026-04-23 shipped: Supabase migration + design refresh + repo migration to FrostyFruit1/constance-reporting + Vercel deploy at constance-reporting.vercel.app + cc-dashboard linked. Demo loop works. Next up: native Next.js port into cc-dashboard at /reporting."*
