# M03b: Native Integration into cc-dashboard

**Sub-milestone of M03 (Report Generation).** Turns the standalone reporting
app at `constance-reporting.vercel.app` into a native set of routes inside
`constance-conservation/cc-dashboard` at `app/(dashboard)/reporting/*`.

## Objective

Replace the interim "click out to standalone app" integration (commit
`5f22990` on cc-dashboard) with native Next.js pages so the reporting tool
shares the master dashboard's auth, navigation chrome, design system, and
deployment lifecycle.

## Status: IN PROGRESS (E8 shipped, E9-E12 remaining)

---

## Briefs

| Brief | Scope | Status | Reference |
|---|---|---|---|
| E8  | Scaffold `/reporting/*` route structure + port landing page (Server Component, query layer, chart primitives, 6 sibling stubs) | ✅ Pushed, **PR open** on cc-dashboard branch `feature/reporting-port-e8` (commit `93d2fe3`, 15 files +370/-85). Typecheck clean. Awaiting human verification + merge. | `docs/executor_briefs/E8_reporting_port_landing.md` · PR body in `docs/handoff/E8_pr_body.md` |
| E9  | Port Clients / Sites / Zones hierarchy pages | ⏸ Not yet written. Expect ~half day. Same pattern as E8: Server Components for read-heavy, query functions in `lib/reporting/`, chart/card primitives in `components/reporting/`. | next session — see `docs/handoff/next_session_scope.md` §3 |
| E10 | Port Reports page — list + preview modal + inline edit + Save (most complex UI) | ⏸ Depends on E8 merged. Full-day. | next session |
| E11 | Port Inspections + Pipeline pages | ⏸ Depends on E8 merged. ~half day. | next session |
| E12 | Server Actions + Cron — `generateReport`, `scheduled_sync`, webhook + flip APPS card href to `/reporting` and retire standalone deploy | ⏸ Depends on E9 + E10 + E11. Full-day. | next session |

---

## What landed today (2026-04-28)

**E8 (Reporting landing page port) — pushed, PR open**

- Branch `feature/reporting-port-e8` on cc-dashboard, commit `93d2fe3`
- 15 files, +370/-85 lines
- Real Server Component pulling live Supabase data
- 6 sibling routes scaffolded as `ComingSoon` stubs:
  `/reporting/{inspections,reports,pipeline,clients,clients/[id],clients/[id]/sites/[siteId]}`
- Query layer at `lib/reporting/`
- Chart primitives at `components/reporting/`
- Main was merged back into the feature branch as `3449c4c` so the preview
  carries the auth fix (below)
- APPS card href on cc-dashboard is **NOT yet flipped** — still points at the
  standalone Vercel deploy. Flip happens in E12 after all routes are native.

**Auth PKCE hotfix on cc-dashboard — merged**

- Branch `fix/auth-pkce-code-exchange`, merged into main as `0898484` (merge
  commit base `ba3591d`)
- Fixed: `middleware.ts` + `/api/auth/confirm` now handle `?code=` exchange
  alongside legacy `?token_hash=`
- Required for the new Supabase project's auth flow (the migrated project
  uses PKCE)
- Full anatomy: symptoms, four-step diagnostic trail, both code fixes,
  five-item prevention list — all in `docs/handoff/auth_pkce_postmortem.md`

**Supabase URL configuration — populated**

- New project `ymcyunspmljaruodjpkd` Site URL + Redirect URLs allowlist
  populated:
  - `https://cc-dashboard-rouge.vercel.app/**`
  - `https://cc-dashboard-*.vercel.app/**`
  - `http://localhost:3000/**`

**Admin user created in new Supabase**

- `peter.f@constanceconservation.com.au` — id
  `d13a1ae4-c7e1-488c-860a-5a6bd25505a8`, email pre-confirmed.

**Vercel cc-dashboard env vars updated**

- Was still pointing at the OLD Supabase project (`yrkclyeklwjlfblxvdbc`)
  after the data migration. Updated to the new project, redeployed.

---

## Handoff documentation index

Three docs in `docs/handoff/`, one in `docs/executor_briefs/`, all on `main`
of `FrostyFruit1/constance-reporting`:

- **`docs/handoff/next_session_scope.md`** — entry point for a fresh
  orchestrator chat. §0 state-check commands · §1 today's wins · §2 access
  cheat-sheet · §3 next workstream (E9 first) · §4 known gotchas · §6 paste
  prompt · §7 task list · §8 one-line status.
- **`docs/handoff/auth_pkce_postmortem.md`** — failure diagnosis reference.
  Symptoms, four-step trail, both code fixes, five-item prevention list
  including the Supabase migration runbook addition.
- **`docs/handoff/E8_pr_body.md`** — record of the E8 PR description.
- **`docs/executor_briefs/E8_reporting_port_landing.md`** — the brief that
  drove E8.

---

## What's still in flight (Peter's side)

1. **Verify** `/reporting` on the E8 Vercel preview matches
   `constance-reporting.vercel.app` KPIs (eyeball comparison after sign-in).
2. **Merge** the E8 PR if numbers match.
3. **Separately, when convenient:** `gh auth login` → add the FrostyFruit1
   account so future orchestrators can `gh pr create` directly on
   cc-dashboard. Currently the gh CLI is authed only as FrostyFruit
   personal — pushes work via SSH but PR creation against the
   constance-conservation org needs the second account.

---

## Known gotchas (carried forward to next session)

1. **Subagents cannot write to `~/Documents/cc-dashboard/`** even with
   `permissions.additionalDirectories` + broad `permissions.allow` grants in
   `.claude/settings.local.json`. Tried four retries. Orchestrator session
   has full access. **Execute E9-E12 inline in the orchestrator until this
   is understood**, not via subagents.
2. **`gh` CLI authed only as FrostyFruit (personal).** Can SSH-push to both
   repos but can't `gh pr create` against the constance-conservation org —
   user needs to add FrostyFruit1 via `gh auth login`.
3. **`next lint` broken on cc-dashboard main** — pre-existing, surfaces
   during the build but doesn't block. Investigate when convenient.
4. **`package-lock.json` churn** between npm install runs on different
   machines/versions. Consider committing a `.npmrc` with
   `package-lock=true` and pinning Node version via Vercel project
   settings.
5. **Supabase PKCE auth flow** — preserved by the hotfix above. Any future
   re-implementation of auth callbacks must support both `?code=` (PKCE)
   and `?token_hash=` (legacy magic-link / signup confirm). See postmortem.

---

## Next session procedure

1. Fresh orchestrator opens this doc + `docs/handoff/next_session_scope.md`.
2. Run the §0 state check.
3. Confirm E8 PR merged (Peter's side).
4. Write the E9 brief (Clients hierarchy) inline.
5. Execute E9 in the orchestrator session (not via subagent — see gotcha #1).
6. PR + verify + merge.
7. Repeat for E10, E11.
8. E12 retires the standalone deploy and flips the APPS card href to
   internal `/reporting`.

When E12 ships, M03b is COMPLETE and the standalone Vercel deploy at
`constance-reporting.vercel.app` can be retired (project deleted in Vercel,
old repo `FrostyFruit1/constance-reporting` archived).
