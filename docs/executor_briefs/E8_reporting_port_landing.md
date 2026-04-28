# E8 — Native port: scaffold `/reporting/*` + landing page

**Status:** Ready to execute
**Repo:** `~/Documents/cc-dashboard/` (NOT this repo — this brief lives in
`constance-conservation/` for orchestrator continuity, but all code lands
in `cc-dashboard`)
**Branch:** `feature/reporting-port-e8` off `main`
**Git identity:** `peter.f@constanceconservation.com.au` (already configured per-repo)

---

## Goal

Replace the placeholder `app/(dashboard)/reporting/page.tsx` in cc-dashboard
with a native React Server Component that renders the Pipeline Dashboard
(the "page-dashboard" view from `dashboard-preview.html` in
`constance-conservation`). Scaffold six sibling routes as "Coming soon"
stubs so URL space is reserved for E9-E11.

**Success = visiting `/reporting` on a local cc-dashboard dev server
shows the same KPIs, donut, and three bar charts as the live standalone
deploy at https://constance-reporting.vercel.app/, sourced from Supabase
via SSR with no hardcoded credentials.**

The standalone Vercel deploy stays live. The APPS card href in
`app/(dashboard)/page.tsx` is **not** changed in E8 — that flip happens
in E12 once the whole port ships.

---

## Architecture

- **Server Component** for the landing page. Uses
  `lib/supabase/server.ts` (already exists, SSR-aware via `@supabase/ssr`).
  No client-side data waterfalls. Refresh on navigation.
- **Aggregation in `lib/reporting/queries.ts`** — one async function
  `getLandingDashboardData()` returns a typed object. Six parallel
  Supabase queries (subset of what `dashboard-preview.html`'s `loadData()`
  fetches — only what the landing page consumes).
- **Chart primitives** as small client components (CSS conic-gradient
  donut, div-bar charts). Vanilla — no chart library.
- **Sibling stubs** all use a shared `<ComingSoon />` component.

Tech stack: Next.js 16 / React 19 / `@supabase/ssr` 0.6 / TypeScript /
Tailwind 3.4 / OKLCH design tokens already in `app/globals.css`.

---

## Reference: source material in `constance-conservation/`

The executor should read these to understand what's being ported:

- `dashboard-preview.html` lines **527-543** — the markup of `page-dashboard`
- `dashboard-preview.html` lines **758-820** — `loadData()` (the data fetch)
- `dashboard-preview.html` lines **879-911** — `loadDashboard(d)` (rendering logic)
- `dashboard-preview.html` lines **789-799** — `donut()` helper
- `dashboard-preview.html` lines **786-788** — `bars()` helper
- `dashboard-preview.html` lines **782-784** — `kpiHTML()` helper
- `cc-dashboard/app/(dashboard)/employees/page.tsx` — example of an existing
  cc-dashboard page for component/style patterns
- `cc-dashboard/app/globals.css` — design tokens (`--accent`, `--bg-elev`,
  `--ink`, `--ink-2`, `--ink-3`, `--line`, `--bg-sunken`, `--font-mono`,
  `--font-display`, `--ok`, `--warn`, `--danger`, etc.)

---

## File structure

```
cc-dashboard/
├── .env.local                                          [CREATE]
├── lib/reporting/
│   ├── types.ts                                        [CREATE]
│   └── queries.ts                                      [CREATE]
├── components/reporting/
│   ├── KpiTile.tsx                                     [CREATE]
│   ├── Donut.tsx                                       [CREATE]
│   ├── BarList.tsx                                     [CREATE]
│   ├── BackfillAlert.tsx                               [CREATE]
│   └── ComingSoon.tsx                                  [CREATE]
└── app/(dashboard)/reporting/
    ├── page.tsx                                        [REPLACE STUB]
    ├── inspections/page.tsx                            [CREATE STUB]
    ├── reports/page.tsx                                [CREATE STUB]
    ├── pipeline/page.tsx                               [CREATE STUB]
    ├── clients/page.tsx                                [CREATE STUB]
    ├── clients/[id]/page.tsx                           [CREATE STUB]
    └── clients/[id]/sites/[siteId]/page.tsx            [CREATE STUB]
```

---

## Tasks

### Task 1 — Branch + env

- [ ] **Step 1.1** — `cd ~/Documents/cc-dashboard` and verify clean tree:
  ```bash
  git status      # expect: "nothing to commit, working tree clean"
  git branch --show-current   # expect: main
  ```

- [ ] **Step 1.2** — Pull latest main, create branch:
  ```bash
  git pull --ff-only origin main
  git checkout -b feature/reporting-port-e8
  ```

- [ ] **Step 1.3** — Create `cc-dashboard/.env.local` with the values from
  `~/Documents/constance-conservation/.env`. The keys cc-dashboard needs
  (per `.env.local.example`):
  ```
  NEXT_PUBLIC_SUPABASE_URL=<value of SUPABASE_URL from constance-conservation/.env>
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<value of SUPABASE_ANON_KEY from constance-conservation/.env>
  SUPABASE_SERVICE_ROLE_KEY=<value of SUPABASE_SERVICE_ROLE_KEY from constance-conservation/.env>
  ```
  Verify it's gitignored — `.gitignore` already excludes `.env*.local`.

- [ ] **Step 1.4** — Smoke-test the dev server boots before any changes:
  ```bash
  npm install        # in case anything's stale
  npm run dev
  ```
  Open http://localhost:3000, sign in, click "Staff Reporting" — you should
  hit the existing placeholder reporting page (the fake REPORTS list).
  Stop the dev server. This confirms baseline before we touch anything.

---

### Task 2 — Types

**File:** `lib/reporting/types.ts` [CREATE]

- [ ] **Step 2.1** — Create the file with the exact data contract the
  landing Server Component will consume:

```typescript
// Subset of what loadData() in dashboard-preview.html fetches —
// only what the landing Pipeline Dashboard needs. Other pages
// (Inspections, Clients, Reports, Pipeline) extend this in E9-E11.

export type ProcessingStatus =
  | 'completed'
  | 'needs_review'
  | 'failed'
  | 'processing'
  | 'pending'
  | 'unknown'

export type StatusCounts = Partial<Record<ProcessingStatus, number>>

export type LabelValue = { label: string; value: number }

export type LandingDashboardData = {
  totalInspections: number
  statusCounts: StatusCounts          // all processing_status values, raw counts
  sitesTracked: number
  photosCount: number
  topTasks: LabelValue[]              // top 8 task_type by count
  topWeeds: LabelValue[]              // top 8 species_name_raw by count
  topStaffHours: LabelValue[]         // top 8 staff by sum(hours_worked)
  generatedAt: string                  // ISO timestamp
}

// Backfill threshold copied from dashboard-preview.html line 893
export const BACKFILL_TARGET = 1683
```

---

### Task 3 — Queries

**File:** `lib/reporting/queries.ts` [CREATE]

- [ ] **Step 3.1** — Create the query module. This mirrors the relevant
  subset of `loadData()` from `dashboard-preview.html` lines 758-790.

```typescript
import { createClient } from '@/lib/supabase/server'
import type { LandingDashboardData, StatusCounts, LabelValue } from './types'

const TOP_N = 8

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = (r[key] as string | null) ?? 'unknown'
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function topN(counts: Record<string, number>, n = TOP_N): LabelValue[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }))
}

export async function getLandingDashboardData(): Promise<LandingDashboardData> {
  const supabase = await createClient()

  // Six parallel queries — match the columns/limits in
  // dashboard-preview.html loadData() exactly.
  const [
    inspectionsRes,
    sitesRes,
    mediaRes,
    tasksRes,
    weedsRes,
    personnelRes,
  ] = await Promise.all([
    supabase
      .from('inspections')
      .select('processing_status')
      .order('date', { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase
      .from('sites')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('inspection_media')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('inspection_tasks')
      .select('task_type')
      .limit(5000),
    supabase
      .from('inspection_weeds')
      .select('species_name_raw')
      .limit(5000),
    supabase
      .from('inspection_personnel')
      .select('hours_worked, staff(name)')
      .limit(5000),
  ])

  // Surface query errors loudly — Server Component will throw, Next.js
  // shows the error UI.
  for (const r of [inspectionsRes, tasksRes, weedsRes, personnelRes]) {
    if (r.error) throw new Error(`Supabase query failed: ${r.error.message}`)
  }
  if (sitesRes.error) throw new Error(`sites count failed: ${sitesRes.error.message}`)
  if (mediaRes.error) throw new Error(`media count failed: ${mediaRes.error.message}`)

  const inspections = inspectionsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const weeds = weedsRes.data ?? []
  const personnel = personnelRes.data ?? []

  const statusCounts = countBy(inspections, 'processing_status') as StatusCounts

  const topTasks = topN(countBy(tasks, 'task_type'))
  const topWeeds = topN(countBy(weeds, 'species_name_raw'))

  // Hours per staff name — staff is a relation, may be array or object
  // depending on how supabase-js resolves the join.
  const hoursByStaff: Record<string, number> = {}
  for (const p of personnel as { hours_worked: number | string | null; staff: { name?: string } | { name?: string }[] | null }[]) {
    const staffRow = Array.isArray(p.staff) ? p.staff[0] : p.staff
    const name = staffRow?.name ?? 'Unknown'
    const h = typeof p.hours_worked === 'number'
      ? p.hours_worked
      : parseFloat(p.hours_worked ?? '') || 0
    hoursByStaff[name] = (hoursByStaff[name] ?? 0) + h
  }
  const topStaffHours: LabelValue[] = Object.entries(hoursByStaff)
    .filter(([_, h]) => h > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([label, value]) => ({ label, value: Math.round(value) }))

  return {
    totalInspections: inspections.length,
    statusCounts,
    sitesTracked: sitesRes.count ?? 0,
    photosCount: mediaRes.count ?? 0,
    topTasks,
    topWeeds,
    topStaffHours,
    generatedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 3.2** — Sanity-check by typechecking:
  ```bash
  npx tsc --noEmit
  ```
  Expected: clean, or at most pre-existing errors unrelated to our files.
  If our new files report errors, fix before proceeding.

---

### Task 4 — Chart primitives

**Files:** `components/reporting/{KpiTile,Donut,BarList,BackfillAlert}.tsx` [CREATE]

These are small. Server Components by default (no `'use client'`) — they're
pure presentational and have no state.

- [ ] **Step 4.1** — `components/reporting/KpiTile.tsx`:

```typescript
type Props = {
  label: string
  value: string | number
  sub?: string
  accent?: string  // CSS color, optional override
}

export function KpiTile({ label, value, sub, accent }: Props) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
```

- [ ] **Step 4.2** — `components/reporting/Donut.tsx`. Note: the original
  builds a CSS conic-gradient — replicate that. Pure SSR-safe.

```typescript
type Segment = { value: number; color: string; label: string }

export function Donut({ segments }: { segments: Segment[] }) {
  const visible = segments.filter(s => s.value > 0)
  const total = visible.reduce((s, x) => s + x.value, 0)

  if (total === 0) {
    return <div className="donut-empty" style={{ color: 'var(--ink-3)', fontSize: 13 }}>No data yet</div>
  }

  let offset = 0
  const stops = visible.map(s => {
    const pct = (s.value / total) * 100
    const stop = `${s.color} ${offset}% ${offset + pct}%`
    offset += pct
    return stop
  }).join(', ')

  return (
    <div className="donut-container">
      <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
        <div className="donut-center">
          <div className="value">{total}</div>
          <div className="label">total</div>
        </div>
      </div>
      <div className="donut-legend">
        {visible.map(s => (
          <div key={s.label} className="legend-item">
            <span className="legend-dot" style={{ background: s.color }} />
            {s.label}
            <span className="legend-count">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4.3** — `components/reporting/BarList.tsx`. Original used color
  cycling like `['clay','clay','amber','amber',...]` — accept a colors prop.

```typescript
type Bar = { label: string; value: number }

export function BarList({ data, colors }: { data: Bar[]; colors: string[] }) {
  if (!data.length) {
    return <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No data yet</div>
  }
  const max = data[0]?.value || 1
  return (
    <div>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        return (
          <div key={d.label + i} className="bar-row">
            <div className="bar-label" title={d.label}>{d.label}</div>
            <div className="bar-track">
              <div
                className={`bar-fill ${colors[i % colors.length]}`}
                style={{ width: `${pct.toFixed(1)}%` }}
              />
            </div>
            <div className="bar-count">{d.value}</div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4.4** — `components/reporting/BackfillAlert.tsx`:

```typescript
import { BACKFILL_TARGET } from '@/lib/reporting/types'

export function BackfillAlert({ total }: { total: number }) {
  if (total >= BACKFILL_TARGET) return null
  return (
    <div className="alert-bar">
      <span>⚠</span> Backfill in progress —{' '}
      <strong>{total.toLocaleString()}</strong> of ~{BACKFILL_TARGET.toLocaleString()} inspections processed
    </div>
  )
}
```

- [ ] **Step 4.5** — `components/reporting/ComingSoon.tsx`:

```typescript
import Link from 'next/link'
import { Icon } from '@/components/icons/Icon'

export function ComingSoon({ title, crumb }: { title: string; crumb: string }) {
  return (
    <div className="subpage">
      <div className="subpage-top">
        <Link href="/reporting" className="back-btn">
          <Icon name="back" size={16} /> Reporting
        </Link>
        <div style={{ width: 1, height: 20, background: 'var(--line)' }} />
        <span className="sp-crumb">{crumb}</span>
        <div style={{ flex: 1 }} />
        <h2 className="sp-title">{title}</h2>
      </div>
      <div className="subpage-body">
        <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>Coming soon</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
            This route will be ported in a follow-up brief (E9–E11).
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.6** — Typecheck after creating all five components:
  ```bash
  npx tsc --noEmit
  ```

---

### Task 5 — Sibling route stubs

Six stubs, each three lines. Use the same `Icon` import path as the
existing `reporting/page.tsx`.

- [ ] **Step 5.1** — `app/(dashboard)/reporting/inspections/page.tsx`:

```typescript
import { ComingSoon } from '@/components/reporting/ComingSoon'
export default function Page() {
  return <ComingSoon title="Inspections" crumb="Daily work reports & audits" />
}
```

- [ ] **Step 5.2** — `app/(dashboard)/reporting/reports/page.tsx`:

```typescript
import { ComingSoon } from '@/components/reporting/ComingSoon'
export default function Page() {
  return <ComingSoon title="Reports" crumb="Generated client reports" />
}
```

- [ ] **Step 5.3** — `app/(dashboard)/reporting/pipeline/page.tsx`:

```typescript
import { ComingSoon } from '@/components/reporting/ComingSoon'
export default function Page() {
  return <ComingSoon title="Pipeline" crumb="Sync health & data quality" />
}
```

- [ ] **Step 5.4** — `app/(dashboard)/reporting/clients/page.tsx`:

```typescript
import { ComingSoon } from '@/components/reporting/ComingSoon'
export default function Page() {
  return <ComingSoon title="Clients" crumb="All clients & contracts" />
}
```

- [ ] **Step 5.5** — `app/(dashboard)/reporting/clients/[id]/page.tsx`:

```typescript
import { ComingSoon } from '@/components/reporting/ComingSoon'
export default function Page() {
  return <ComingSoon title="Client detail" crumb="Sites & schedule" />
}
```

- [ ] **Step 5.6** — `app/(dashboard)/reporting/clients/[id]/sites/[siteId]/page.tsx`:

```typescript
import { ComingSoon } from '@/components/reporting/ComingSoon'
export default function Page() {
  return <ComingSoon title="Site detail" crumb="Zones & inspections" />
}
```

- [ ] **Step 5.7** — `npx tsc --noEmit` again, expect clean.

---

### Task 6 — Replace landing page

**File:** `app/(dashboard)/reporting/page.tsx` [REPLACE]

This is the meat. Convert from `'use client'` placeholder → Server
Component pulling real data. Remove the fake `REPORTS` and `SITE_COUNTS`.

- [ ] **Step 6.1** — Replace the entire file contents with:

```typescript
import Link from 'next/link'
import { Icon } from '@/components/icons/Icon'
import { getLandingDashboardData } from '@/lib/reporting/queries'
import { KpiTile } from '@/components/reporting/KpiTile'
import { Donut } from '@/components/reporting/Donut'
import { BarList } from '@/components/reporting/BarList'
import { BackfillAlert } from '@/components/reporting/BackfillAlert'

// Force dynamic — KPIs should reflect latest Supabase state on every load.
export const dynamic = 'force-dynamic'

export default async function ReportingPage() {
  const d = await getLandingDashboardData()
  const completed = d.statusCounts.completed ?? 0
  const review = d.statusCounts.needs_review ?? 0
  const failed = d.statusCounts.failed ?? 0
  const processing = (d.statusCounts.processing ?? 0) + (d.statusCounts.pending ?? 0)
  const pctCompleted = d.totalInspections > 0
    ? Math.round((completed / d.totalInspections) * 100)
    : 0
  const statusTypeCount = Object.keys(d.statusCounts).length
  const lastUpdated = new Date(d.generatedAt).toLocaleTimeString()

  return (
    <div className="subpage">
      <div className="subpage-top">
        <Link href="/" className="back-btn">
          <Icon name="back" size={16} /> Dashboard
        </Link>
        <div style={{ width: 1, height: 20, background: 'var(--line)' }} />
        <span className="sp-crumb">Live data from Safety Culture ingestion · {lastUpdated}</span>
        <div style={{ flex: 1 }} />
        <h2 className="sp-title">Pipeline Dashboard</h2>
      </div>

      <div className="subpage-body">
        <BackfillAlert total={d.totalInspections} />

        <div className="kpi-grid">
          <KpiTile label="Total Inspections" value={d.totalInspections} sub={`${statusTypeCount} status types`} />
          <KpiTile label="Completed" value={completed} sub={`${pctCompleted}% of total`} accent="var(--ok)" />
          <KpiTile label="Needs Review" value={review} sub="non-DWR templates" accent="var(--warn)" />
          <KpiTile label="Sites Tracked" value={d.sitesTracked} sub="across all clients" />
          <KpiTile label="Photos" value={d.photosCount} sub="from field inspections" />
        </div>

        <div className="two-col">
          <div className="section">
            <div className="section-header"><div className="section-title">Processing Status</div></div>
            <div className="section-body">
              <Donut segments={[
                { value: completed,  color: 'var(--ok)',     label: 'Completed' },
                { value: review,     color: 'var(--accent)', label: 'Needs Review' },
                { value: failed,     color: 'var(--danger)', label: 'Failed' },
                { value: processing, color: 'var(--ink-3)',  label: 'Processing' },
              ]} />
            </div>
          </div>
          <div className="section">
            <div className="section-header"><div className="section-title">Tasks Undertaken</div></div>
            <div className="section-body">
              <BarList data={d.topTasks} colors={['clay','clay','amber','amber','caramel','caramel','stone','stone']} />
            </div>
          </div>
        </div>

        <div className="two-col">
          <div className="section">
            <div className="section-header"><div className="section-title">Top Weed Species</div></div>
            <div className="section-body">
              <BarList data={d.topWeeds} colors={['sage','sage','sage','sage','steel','steel','steel','steel']} />
            </div>
          </div>
          <div className="section">
            <div className="section-header"><div className="section-title">Staff Hours</div></div>
            <div className="section-body">
              <BarList data={d.topStaffHours} colors={['amber','amber','caramel','caramel','clay','clay','stone','stone']} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2** — CSS check. The classes `kpi-card`, `kpi-label`, `kpi-value`,
  `kpi-sub`, `kpi-grid`, `donut-container`, `donut`, `donut-center`,
  `donut-legend`, `legend-item`, `legend-dot`, `legend-count`, `bar-row`,
  `bar-label`, `bar-track`, `bar-fill`, `bar-count`, `alert-bar`, `section`,
  `section-header`, `section-title`, `section-body`, `two-col`, `subpage`,
  `subpage-top`, `subpage-body`, `back-btn`, `sp-crumb`, `sp-title`, plus
  bar-fill color modifiers (`clay`, `amber`, `caramel`, `stone`, `sage`,
  `steel`) need to exist in `app/globals.css`.

  Open `app/globals.css` and grep for each. If any are missing, port the
  needed rules from `~/Documents/constance-conservation/dashboard-preview.html`
  `<style>` block. Most should already exist (the design refresh in commit
  `3f10d77` aligned the two stylesheets), but the bar-fill color modifiers
  may need to be added. Add only what's missing — do not duplicate existing
  rules.

- [ ] **Step 6.3** — Typecheck:
  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 6.4** — Lint:
  ```bash
  npm run lint
  ```

---

### Task 7 — Manual regression testing

This is the verification gate. Do not skip.

- [ ] **Step 7.1** — Start dev server:
  ```bash
  npm run dev
  ```

- [ ] **Step 7.2** — Open two browser tabs side by side:
  - **Tab A (reference):** https://constance-reporting.vercel.app/
  - **Tab B (under test):** http://localhost:3000/reporting (sign in
    through cc-dashboard if prompted)

- [ ] **Step 7.3** — Compare the five KPI tiles. Each value in Tab B must
  match Tab A exactly:

  | KPI | Match? |
  |---|---|
  | Total Inspections | ☐ |
  | Completed (count + %) | ☐ |
  | Needs Review | ☐ |
  | Sites Tracked | ☐ |
  | Photos | ☐ |

  If any number is off, **stop and diagnose** — likely a query column or
  filter mismatch in `lib/reporting/queries.ts`. Fix before continuing.

- [ ] **Step 7.4** — Compare the donut chart. Same four segments in same
  order, same counts in legend. The colors will look slightly different
  (we mapped to design-system tokens `--ok`/`--accent`/`--danger`/`--ink-3`
  vs. the standalone's hardcoded `--color-sage`/`--color-cooling`/etc.) —
  that's intentional, **don't try to match colors exactly**. Counts and
  segment order must match.

- [ ] **Step 7.5** — Compare the three bar charts. Same labels, same counts,
  same top-N order. ☐ Tasks ☐ Weeds ☐ Staff Hours

- [ ] **Step 7.6** — Click each "Coming soon" stub via direct URL nav:
  - http://localhost:3000/reporting/inspections
  - http://localhost:3000/reporting/reports
  - http://localhost:3000/reporting/pipeline
  - http://localhost:3000/reporting/clients
  - http://localhost:3000/reporting/clients/abc123
  - http://localhost:3000/reporting/clients/abc123/sites/xyz789

  Each should render a "Coming soon" panel with a working back link to
  `/reporting`. ☐ All six render.

- [ ] **Step 7.7** — Confirm `/reporting` itself loads in <2s on a warm
  Supabase connection. If it's notably slower than the standalone deploy,
  flag in your handoff but don't block.

- [ ] **Step 7.8** — Stop dev server. Verify no `console.error` in the
  terminal output during the session.

---

### Task 8 — Commit + push + PR

- [ ] **Step 8.1** — Stage and commit (use specific paths, not `git add .`):

  ```bash
  git add lib/reporting/types.ts lib/reporting/queries.ts \
          components/reporting/KpiTile.tsx \
          components/reporting/Donut.tsx \
          components/reporting/BarList.tsx \
          components/reporting/BackfillAlert.tsx \
          components/reporting/ComingSoon.tsx \
          'app/(dashboard)/reporting/page.tsx' \
          'app/(dashboard)/reporting/inspections/page.tsx' \
          'app/(dashboard)/reporting/reports/page.tsx' \
          'app/(dashboard)/reporting/pipeline/page.tsx' \
          'app/(dashboard)/reporting/clients/page.tsx' \
          'app/(dashboard)/reporting/clients/[id]/page.tsx' \
          'app/(dashboard)/reporting/clients/[id]/sites/[siteId]/page.tsx'

  # Only if globals.css needed modifier rules added:
  git add app/globals.css
  ```

  Do **not** stage `.env.local` (gitignored).

- [ ] **Step 8.2** — Commit with HEREDOC:
  ```bash
  git commit -m "$(cat <<'EOF'
  feat(reporting): native /reporting/* scaffold + Pipeline Dashboard landing (E8)

  Replaces placeholder reporting/page.tsx stub with a Server Component
  rendering the live Pipeline Dashboard from Supabase via SSR. Adds typed
  query layer in lib/reporting/, vanilla SVG/CSS chart primitives in
  components/reporting/, and six "Coming soon" sibling stubs to reserve
  URL space for E9-E11. APPS card href unchanged — standalone Vercel
  deploy at constance-reporting.vercel.app remains the live entry point
  until E12 flips it.

  Verified manually against the standalone deploy: KPIs and chart counts
  match.
  EOF
  )"
  ```

- [ ] **Step 8.3** — Push:
  ```bash
  git push -u origin feature/reporting-port-e8
  ```

- [ ] **Step 8.4** — Open PR (Vercel will auto-build a preview URL):
  ```bash
  gh pr create --title "feat(reporting): native /reporting/* scaffold + Pipeline Dashboard landing (E8)" \
    --body "$(cat <<'EOF'
  ## Summary
  - Replace `app/(dashboard)/reporting/page.tsx` placeholder with a
    Server Component rendering the live Pipeline Dashboard via SSR.
  - Add `lib/reporting/{types,queries}.ts` — typed query layer (six
    parallel Supabase reads, mirroring the relevant subset of the
    standalone deploy's data fetch).
  - Add chart primitives in `components/reporting/`: `KpiTile`, `Donut`
    (CSS conic-gradient), `BarList`, `BackfillAlert`, `ComingSoon`.
  - Scaffold six sibling routes (`/reporting/{inspections,reports,pipeline,clients,clients/[id],clients/[id]/sites/[siteId]}`)
    as `ComingSoon` stubs to reserve URL space for E9–E11.
  - `APPS` card href in `app/(dashboard)/page.tsx` left pointing at
    `https://constance-reporting.vercel.app/` — flipped to `/reporting`
    in E12 once full port ships.

  ## Test plan
  - [ ] Vercel preview URL builds clean
  - [ ] Visit `/reporting` on the preview — KPIs (Total / Completed /
        Needs Review / Sites / Photos) match
        https://constance-reporting.vercel.app/ exactly
  - [ ] Donut segment counts match (colors are intentionally
        design-system mapped, not pixel-identical)
  - [ ] Tasks / Weeds / Staff Hours bar charts match top-N
  - [ ] All six `/reporting/<sub>` stubs render `ComingSoon` with
        working back link
  - [ ] No `console.error` in browser devtools or Vercel build log
  EOF
  )"
  ```

- [ ] **Step 8.5** — Note the PR URL and the Vercel preview URL in your
  return message to the orchestrator. Do **not** merge — orchestrator
  will eyeball the preview against standalone and decide.

---

## Out of scope (DO NOT touch in E8)

- `app/(dashboard)/page.tsx` APPS array (E12 flips the href)
- The standalone `dashboard-preview.html` repo (`constance-conservation`)
- Inspections / Reports / Pipeline / Clients real content (E9–E11)
- Server Actions, cron, generate (E12)
- Edit-mode contenteditable, drop-zone, schedule widget
- Test harness — cc-dashboard has no Vitest setup; E8 verifies manually
- Rotating the old Supabase service-role key from the migrated project

---

## What to return to the orchestrator

1. PR URL
2. Vercel preview URL (visible after first push, in PR checks)
3. Regression checklist results (Steps 7.3–7.6) — pass/fail per item
4. Any new `app/globals.css` rules added in Step 6.2 (flag for review)
5. Anything that surprised you or required deviation from this brief
