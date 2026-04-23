# Executor Brief E4 — Clients & Zones Management UI

**Depends on: E2 committed.** Runs in parallel with E3, E5. Commit to `feat/report-generator`.

---

## 1. Context

User wants a navigable hierarchy in the dashboard:
- **Clients** page → list all clients, click one
- **Client detail** → shows client metadata + list of sites, click a site
- **Site detail** → shows zones under the site + "Add Zone" form
- Each row (client, site, zone) has a "Generate Report" button (stubbed — shows CLI command in tooltip, per E3's pattern)
- Per-row **scheduling widget**: "Auto-generate weekly" / "Monthly on 1st" — stores config, no cron yet.

All UI in `dashboard-preview.html` (single-file SPA-ish).

**Read first:**
- `dashboard-preview.html` — existing dashboard. Note nav structure, `loadPage()`, `loadData()` pattern. Existing pages: Dashboard, Inspections, Sites, Staff, Chemicals, Species, Reports, Pipeline.
- `src/report/hierarchy.ts` (from E2)
- Spec / mapping: `docs/report_data_mapping.md`

---

## 2. Scope

### A — Navigation

Sidebar section "Overview" currently has: Dashboard, Inspections, Sites. Replace **Sites** nav item with a new parent nav: **Clients** (takes you to the clients list). Keep old Sites page accessible via Clients → pick one → Sites list inside.

Update `LOAD_PAGE_MAP` and add:
- `page-clients` — list page
- `page-client-detail` — dynamic, shows one client (URL hash or JS state param)
- `page-site-detail` — dynamic, shows one site's zones

### B — Clients list page

Pull all `clients` rows in `loadData()`. Render as card grid:
- Client name (large)
- Contact name + council/body
- Active sites count, active zones count (join through hierarchy)
- Report frequency (weekly/monthly/quarterly — from `clients.report_frequency`)
- **Generate Report** button (stubbed with tooltip pointing to `--client-id <uuid> --month YYYY-MM`)
- Click card body → navigates to client-detail page

### C — Client detail page

Shows:
- Client metadata editable inline (contact name, council, email, phone) — save via `patchRow('clients', id, body)` pattern (already in `dashboard-preview.html`)
- **Sites** section — list sites where `client_id = this client`. Each site row shows:
  - Site name + long_name
  - Zone count (`SELECT count(*) FROM sites WHERE parent_site_id = this_site.id`)
  - **Generate Report** (stub tooltip: `--site-id <uuid>`)
  - Click row → site detail
- **"Add Site"** form (just name + long_name; wire to Supabase insert with `client_id` set)

### D — Site detail page

Shows:
- Site metadata editable inline
- **Zones** section — list `sites` rows where `parent_site_id = this site.id`. Each zone row shows:
  - Zone name
  - Inspections count (join from `inspections.site_id`)
  - Last inspection date
  - **Generate Report** (stub tooltip: `--zone-id <uuid>`)
- **"Add Zone"** form — inserts new `sites` row with `parent_site_id` = this site.id, prompts name only. `client_id` inherited from parent.
- **Location Maps section** — drag-drop upload box for `clients.location_maps[]` (E5 handles the actual upload plumbing; you just add the visual zone and wire the click handler — show tooltip "image upload lands in E5" if E5 hasn't merged yet)

### E — Scheduling widget

Add a reusable component used on client cards, site rows, and zone rows:

```
[○ Off]  [○ Weekly — Monday]  [● Monthly — 1st]  [○ Quarterly]   [Next: 2026-05-01]
```

- Radio-style pills (reuse `.pill` styling). Click to toggle.
- Persist to a new column `clients.schedule_config jsonb` (if at client level) OR per-site via new column `sites.schedule_config jsonb`. Migration 007 if needed.
- Format: `{ cadence: 'weekly'|'monthly'|'quarterly'|'off', weekday?: 1, day_of_month?: 1 }`
- No cron yet — just store the config. E6 (future) will read this and trigger generation.

### F — Reports page tweak

Keep existing Reports page. Add scope filter chips at top: "All / This Client / This Site / This Zone". Not required — if time is short, skip this and leave Reports page as-is.

---

## 3. Acceptance Gate

```bash
npm run build && npm test
```
Then open dashboard, verify:
- Clients nav works → see at least 1 client card (EBSF)
- Click EBSF → see the EBSF site → see its zones (B, C, D, "Zone B and C", Spring Farm EBSF)
- Add a test zone via "Add Zone" form — appears in list; then delete it manually via SQL or a button
- Edit client email inline → save → reload page → change persisted
- Schedule widget toggles on a zone → reload → state persists
- Existing Reports / Dashboard / Inspections pages still work

Commit to `feat/report-generator`. Summary to orchestrator: pages built, known UX issues, anything the hierarchy helper didn't cover.
