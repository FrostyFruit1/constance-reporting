# Next Session Scope — Constance Conservation

*Entry point for a fresh orchestrator chat. Last updated: 2026-04-28.*

**Read this first. For the full back-story, see
`docs/handoff/project_state_2026-04-23.md` and
`docs/handoff/auth_pkce_postmortem.md`.**

---

## 0. The 60-second state check

```bash
cd ~/Documents/constance-conservation
git remote -v                              # origin → git@github.com-cc:FrostyFruit1/constance-reporting.git
git config user.email                      # peter.f@constanceconservation.com.au
git log --oneline -3                       # HEAD should be 68703c7 or newer
ssh -T git@github.com-cc 2>&1 | head -1    # "Hi FrostyFruit1! ..."
npm test 2>&1 | tail -4                    # 259/259 pass

# cc-dashboard state
git -C ~/Documents/cc-dashboard log --oneline -5
# Expect HEAD contains commits `0898484` (auth PKCE fix merged) and
# any newer E8 preview-merge commits on the feature branch.
```

If any of those are wrong, STOP and diagnose before acting.

---

## 1. What shipped on 2026-04-23

**Long day.** In rough order:

| Workstream | Status | Details |
|---|---|---|
| Report generator (M03) | ✅ earlier | EBSF pilot end-to-end. 259 tests. Commit `38e4717`+. |
| Supabase project migration | ✅ earlier | `yrkclyeklwjlfblxvdbc` → `ymcyunspmljaruodjpkd`. 16,018 rows across 28 tables migrated. Commit `9ffae5c`. |
| Design refresh | ✅ earlier | OKLCH + Inter + JetBrains Mono into standalone. Commit `3f10d77`. |
| FrostyFruit1 GitHub SSH + per-repo identity | ✅ earlier | `~/.ssh/id_ed25519_cc`, `github.com-cc` alias, per-repo identity `peter.f@constanceconservation.com.au`. |
| Repo migration | ✅ earlier | `FrostyFruit/constance-conservation` → `FrostyFruit1/constance-reporting`. |
| Vercel standalone deploy | ✅ earlier | **Live at https://constance-reporting.vercel.app/** (pure static). |
| cc-dashboard APPS card link | ✅ earlier | `constance-conservation/cc-dashboard@5f22990`. |
| **E8 brief written** | ✅ | `docs/executor_briefs/E8_reporting_port_landing.md`. |
| **E8 implementation** | ✅ pushed, **PR open** | Branch `feature/reporting-port-e8` on cc-dashboard. Commit `93d2fe3`. 15 files, +370/-85. Typecheck clean. Server Component + query layer + chart primitives + 6 sibling stubs. Merged main back in as `3449c4c` so preview has auth fix. |
| **Auth PKCE hotfix** | ✅ merged | `fix/auth-pkce-code-exchange` → main on cc-dashboard. Commit `ba3591d`, merged as `0898484`. middleware.ts + /api/auth/confirm now handle `?code=` exchange alongside legacy `?token_hash=`. |
| Supabase URL Configuration allowlist | ✅ | New project's Site URL + Redirect URLs populated (`https://cc-dashboard-rouge.vercel.app/**`, `https://cc-dashboard-*.vercel.app/**`, `http://localhost:3000/**`). |
| Admin-created user in new Supabase | ✅ | `peter.f@constanceconservation.com.au`, id `d13a1ae4-c7e1-488c-860a-5a6bd25505a8`, email pre-confirmed. |
| Vercel cc-dashboard env vars | ✅ | Updated to point at new Supabase project (was still pointing at the old one after migration). Redeployed. |

**E8 verification status:** Preview is rebuilding after the auth-fix merge.
User still needs to sign into the E8 preview URL, eyeball `/reporting` KPIs
against `constance-reporting.vercel.app`, and merge the E8 PR if they match.

---

## 2. Access / infra — what the new orchestrator has

```
Code repo (this project) :  github.com/FrostyFruit1/constance-reporting
                            Local: ~/Documents/constance-conservation/
                            Remote: git@github.com-cc:FrostyFruit1/constance-reporting.git

cc-dashboard repo        :  github.com/constance-conservation/cc-dashboard
                            Local: ~/Documents/cc-dashboard/ (node_modules installed, .env.local set)
                            Remote: git@github.com-cc:constance-conservation/cc-dashboard.git
                            Main:  https://cc-dashboard-rouge.vercel.app/
                            Current feature branch: feature/reporting-port-e8 (PR open)

Supabase                 :  ymcyunspmljaruodjpkd (URL in .env + cc-dashboard/.env.local)
                            exec_sql RPC live. report_assets Storage bucket live.
                            Auth URL Configuration populated (see §1).

Vercel                   :  Constance Vercel team.
                            constance-reporting → standalone app → constance-reporting.vercel.app
                            cc-dashboard        → master app    → cc-dashboard-rouge.vercel.app
                            Env vars on cc-dashboard project now point at new Supabase.

Git identities           :  cc-dashboard + this repo: peter.f@constanceconservation.com.au
                            Global:                    FrostyFruit <peter@continuumx.io>

SSH keys                 :  ~/.ssh/id_ed25519    → FrostyFruit (github.com)
                            ~/.ssh/id_ed25519_cc → FrostyFruit1 (github.com-cc)

gh CLI                   :  Currently authed as FrostyFruit only. For cc-dashboard
                            PRs, user needs to run `gh auth login` and add the
                            FrostyFruit1 account (see §4 known gotchas).

Env vars in .env         :  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
                            SAFETY_CULTURE_API_TOKEN, SAFETY_CULTURE_ORG_ID,
                            ANTHROPIC_API_KEY. .env is gitignored.
```

---

## 3. Immediate next workstream — continue NATIVE INTEGRATION (E9-E12)

### Where E8 leaves the native port

`/reporting` landing page is now a real Server Component pulling live
Supabase data. Six sibling routes (`/reporting/{inspections,reports,
pipeline,clients,clients/[id],clients/[id]/sites/[siteId]}`) are scaffolded
as `ComingSoon` stubs. Query layer in `lib/reporting/`. Chart primitives
in `components/reporting/`. **APPS card href NOT changed — still points
at the standalone Vercel deploy** per plan.

### Remaining briefs (write each fresh, dispatch inline — see §4 gotcha #1)

| Brief | Scope | Depends on | Rough size |
|---|---|---|---|
| E9 | Port Clients / Sites / Zones hierarchy pages | E8 merged | ~half day |
| E10 | Port Reports page — list + preview modal + inline edit + Save | E8 merged | full day (complex UI) |
| E11 | Port Inspections + Pipeline pages | E8 merged | ~half day |
| E12 | Server Actions + Cron — generateReport, scheduled_sync, webhook + flip APPS href to `/reporting` and retire standalone | E9 + E10 + E11 | full day |

**Write E9 first**, targeting the Clients hierarchy which is the most
foundational. Same pattern as E8: Server Components for read-heavy pages,
query functions in `lib/reporting/`, chart/card components in
`components/reporting/`, match cc-dashboard's existing class vocabulary
(`.panel` / `.panel-head` / `.panel-title` / `.kpi`, NOT `.section` /
`.section-body` / `.kpi-card`).

---

## 4. Known gotchas (carried forward + new)

### New as of today

1. **Subagents cannot write to `~/Documents/cc-dashboard/` even with settings
   grants.** We tried four retries with `permissions.additionalDirectories` +
   broad `permissions.allow` (Bash(git *), Bash(npm *), Bash(gh *), etc.) in
   `.claude/settings.local.json`. Write tool and `cp` remained denied for
   subagents. Orchestrator session (main chat) has full access — so **execute
   E9-E12 inline in the orchestrator**, not via subagents, until this is
   understood. Open question for someone with Claude Code harness knowledge.

2. **`gh` CLI is authed only as FrostyFruit (personal).** Can push to both
   repos via SSH but can't `gh pr create` against the `constance-conservation`
   org. To fix: user runs `gh auth login` → GitHub.com → SSH → key
   `~/.ssh/id_ed25519_cc` → web browser → sign in as FrostyFruit1. Then
   `gh auth switch` toggles between accounts, and PRs from cc-dashboard
   directory auto-pick the right one. Until done, user opens PRs via the
   GitHub web URL after each push.

3. **cc-dashboard `next lint` is broken on main.** Next 16 + ESLint 9
   expects `eslint.config.js` (flat config), repo still has legacy format.
   Pre-existing, not our bug. `tsc --noEmit` passes clean — that's the
   meaningful check. If E9-E12 executors run `npm run lint`, expect failure
   unrelated to their changes.

4. **`npm install` in cc-dashboard rewrites package-lock.json** (loses ~84
   lines). `next-env.d.ts` also regenerates on first `next dev`. Always
   `git checkout -- package-lock.json next-env.d.ts` before committing E*
   work so the diff stays clean.

5. **PKCE auth flow** (see `docs/handoff/auth_pkce_postmortem.md` for full
   postmortem). If a future bug looks like "magic link does nothing /
   redirects back to /login with no error," check:
   - Is the email link's token prefixed `pkce_`? → should work now via
     merged middleware fix.
   - Does `redirect_to` in the email link respect `/api/auth/confirm`? →
     if not, Supabase URL Configuration allowlist has been lost again.
   - Has `@supabase/ssr` been downgraded? → PKCE exchange method requires v2.

### Carried forward

- Direct Postgres connection unreachable from this Mac (IPv6). Use
  `exec_sql` RPC for DDL.
- `exec_sql` cannot modify `storage.objects` — use Storage API directly.
- Standalone `dashboard-preview.html` has hardcoded Supabase creds on
  lines ~503-504 (also on Vercel). Still the standalone deploy's auth
  model; untouched by E8. When E12 retires the standalone, the creds die
  with it.
- 440 historical inspections were mis-tagged `daily_work_report` pre-E6.
  Fixed. Don't regress.
- 15% of real DWR rows have null `site_id` — 2022 legacy data. No parser
  fix possible.
- ~58 rows would benefit from reparse (task #10).
- cc-dashboard is Next.js 16 + React 19 + Tailwind 3.4. `app/(dashboard)/`
  is a Next route group (parens = syntax, not folder literal). Design
  tokens in `app/globals.css`.
- Inline vs block `.review-required` CSS class distinction — keep through
  any port.

---

## 5. Other queued work (lower priority)

- **Cameron/Ryan roster onboarding** (ops, not code). `docs/handoff/client_onboarding.md` + `docs/handoff/roster_template.csv` ready. If they return a CSV → fire **E7 CSV bulk-import**. If hand-entered in dashboard UI → no code needed.
- **M04 Approve/Send workflow** (task #14). Resend, approve button, real server-side PDF (puppeteer), cron reading `schedule_config`. Bundle with E12 Server Actions work.
- **M05 Agentic interface**. Scope at `docs/scope/agentic_interface.md`. Deferred until M04 + real roster ingested.
- **Reparse sweep** (task #10). 58 rows. Low priority.
- **M02 Data Enrichment scope** (task #6). After 3-6 months production data.
- **Archive `FrostyFruit/constance-conservation`** stale repo (cosmetic).
- **Rotate Supabase service-role key** from old `yrkclyeklwjlfblxvdbc` project (still in .env history / chat transcripts).

---

## 6. Paste prompt for the next orchestrator

```
Read /Users/peterfrost/Documents/constance-conservation/docs/handoff/next_session_scope.md
and orient yourself. Confirm the 60-second state check in §0.

Current state: E8 (scaffold /reporting/* + landing page) is pushed to
feature/reporting-port-e8 on cc-dashboard with PR open. Auth hotfix is
merged to main. E8 branch has auth fix merged back in for its preview.

If E8 preview has been verified and merged by now, write E9 (port
Clients / Sites / Zones hierarchy pages) and execute inline — subagents
can't write to cc-dashboard yet (see §4 gotcha #1).

If E8 preview has NOT been verified yet, walk me through verification
against constance-reporting.vercel.app, then either fix diffs or merge.
```

---

## 7. Task list

**Completed today (2026-04-23):**
- #16 Design refresh
- #15 Supabase project migration
- #17 Parent dashboard integration (interim link approach)
- #18 Push design refresh + Vercel deploy
- **#19 E8 — scaffold /reporting/* routes + port landing page (PR open, awaiting verification & merge)**
- **#20 Auth PKCE hotfix (merged)**
- **#21 Supabase URL Configuration allowlist**

**Still pending:**
- Verify + merge E8 PR
- E9-E12 native integration briefs (§3)
- #14 M04 — Review/approve/send workflow (priority after native port)
- #13 E7 — CSV bulk-import for sites/zones (when roster arrives)
- #10 Reparse sweep
- #6 Scope M02

---

## 8. One-line status

> *"2026-04-23 shipped: Supabase migration + repo migration to FrostyFruit1/constance-reporting + Vercel standalone + cc-dashboard link + E8 native port (landing page + 6 sibling stubs, PR open) + Supabase PKCE auth hotfix merged + Supabase URL allowlist. Next: verify + merge E8, then write E9 (Clients hierarchy). Execute inline — subagents can't write to cc-dashboard yet."*
