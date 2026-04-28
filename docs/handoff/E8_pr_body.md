## Summary
- Replace `app/(dashboard)/reporting/page.tsx` placeholder with a Server Component rendering the live Pipeline Dashboard via SSR (`@supabase/ssr` + cc-dashboard's existing `lib/supabase/server.ts`).
- Add `lib/reporting/{types,queries}.ts` — typed query layer (six parallel Supabase reads mirroring the subset the landing page consumes on `constance-reporting.vercel.app`).
- Add chart primitives in `components/reporting/`: `KpiTile`, `Donut` (CSS conic-gradient), `BarList`, `BackfillAlert`, `ComingSoon`.
- Scaffold six sibling routes (`/reporting/{inspections,reports,pipeline,clients,clients/[id],clients/[id]/sites/[siteId]}`) as `ComingSoon` stubs to reserve URL space for E9–E11.
- `app/globals.css`: append reporting-specific primitives (`kpi-sub`, `alert-bar`, `bar-*` with clay/amber/caramel/sage/steel/stone/terracotta modifiers, `donut`/`legend-*` set). Tokens `--ok`/`--accent`/`--danger`/`--ink-3` re-used — colors intentionally mapped to design system, not pixel-identical to standalone.

## Notes
- `APPS` card href in `app/(dashboard)/page.tsx` **not changed** — standalone Vercel deploy at `constance-reporting.vercel.app` remains the live entry point until brief E12. This PR only introduces the new `/reporting/*` content.
- Class vocabulary aligned to cc-dashboard idioms: `.kpi` (not `.kpi-card`), `.kpi-row` (not `.kpi-grid`), `.panel`/`.panel-head`/`.panel-title` (not `.section`/`.section-header`/`.section-body`).
- `next lint` is broken in main (Next 16 + ESLint 9 config migration, pre-existing — not E8). `tsc --noEmit` passes clean on the diff.

## Test plan
- [ ] Vercel preview URL builds clean
- [ ] Sign in, visit `/reporting` on the preview — KPIs (Total / Completed / Needs Review / Sites / Photos) match https://constance-reporting.vercel.app/ exactly
- [ ] Donut segment counts match (colors intentionally design-system mapped, not identical)
- [ ] Tasks / Weeds / Staff Hours bar charts match top-N
- [ ] All six `/reporting/<sub>` stubs render `ComingSoon` with working back link to `/reporting`
- [ ] No `console.error` in browser devtools or Vercel build log
