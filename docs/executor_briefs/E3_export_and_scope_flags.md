# Executor Brief E3 — Export Buttons + Scope Flags

**Depends on: E2 committed.** Run in parallel with E4, E5. Commit to `feat/report-generator`.

---

## 1. Context

The generator currently produces HTML + DOCX files for one (client × period). Users want:
- **Export** the generated report from the dashboard (DOCX download + PDF via browser print).
- **Scope** the generator to one zone, one site, or a whole client — not always everything.

E2 just landed the hierarchy (`sites.parent_site_id`, `hierarchy.ts` helpers). You leverage that.

**Read first:**
- `src/bin/generate_report.ts` — CLI entry
- `src/report/index.ts` — `generateReport(opts)` flow
- `src/report/hierarchy.ts` — (from E2) helpers for resolving client/site/zones
- `dashboard-preview.html` — Reports preview modal (`#report-modal`)

---

## 2. Scope

### A — CLI scope flags

Extend `src/bin/generate_report.ts` and `ReportOptions` in `src/report/types.ts`:

```ts
interface ReportOptions {
  clientId?: string;         // whole-client aggregate (all leaf sites under this client)
  siteId?: string;           // one site (roll up its zones; if no zones, the site itself)
  zoneId?: string;           // one zone only — leaf-level report
  // existing period fields (periodStart, periodEnd, cadence)
}
```

Exactly one of `clientId | siteId | zoneId` must be provided. Resolution in `src/report/aggregate.ts`:

- `zoneId` → inspections WHERE `site_id = zoneId`
- `siteId` → inspections WHERE `site_id = siteId OR site_id IN (SELECT id FROM sites WHERE parent_site_id = siteId)`
- `clientId` → use `getClientLeafSites(clientId)` from hierarchy helpers, filter inspections on that set

Title + filename composition should reflect the scope:
- zone scope: `"{site.long_name} {zone.name} {period_label}"` → e.g. `"Elderslie Banksia Scrub Forest Zone B June 2025 Monthly Report"`
- site scope: `"{site.long_name} {zones_rollup_label} {period_label}"` → e.g. `"Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report"` (current behaviour — all zones rolled up)
- client scope: `"{client.name} — All Sites — {period_label}"` if multiple sites, else fall back to site scope. E.g. `"Camden Council — All Sites — June 2025 Monthly Report"`

CLI usage:
```
npm run report -- --zone-id <uuid> --month 2025-06
npm run report -- --site-id <uuid> --week 2025-W27
npm run report -- --client-id <uuid> --month 2025-06
# shortcut: --client EBSF still works (resolves to client-id)
```

Error if zero or multiple scope flags provided.

### B — Download DOCX + Print-to-PDF in dashboard modal

Edit `dashboard-preview.html` `#report-modal` footer area. Add two buttons:

- **Download DOCX** — fetches the DOCX from the generator's output location OR from Supabase Storage once it's there. For now: the `client_reports` row has `docx_url` column (already in schema). If populated, use that as the href. If not, expose a `/dist/reports/...` relative path in a `docx_local_path` column — fall back to `window.alert('DOCX not yet available — re-run the generator')`.
  - **Update the generator** (`src/report/index.ts`) to write the DOCX file path into `client_reports.docx_url` as a relative path (e.g. `dist/reports/EBSF_...docx`). Resend/upload-to-Storage integration later.
- **Print to PDF** — calls `document.getElementById('modal-iframe').contentWindow.print()`. Zero infra; browser handles it.

Button styles: use existing `.btn .btn-secondary` and `.btn .btn-ghost` classes.

### C — Generate Report button wiring (stub)

In the Reports page toolbar, the current `+ Generate Report` button is disabled. Keep it **disabled for demo** but add a tooltip pointing at the CLI command pattern:
```
Run: npm run report -- --zone-id <id> --month YYYY-MM
(In-UI trigger lands in M04 with a backend endpoint.)
```

In E4 the individual Clients/Sites/Zones pages will have per-row "Generate" buttons — same stubbing pattern, tooltip tells the user which CLI command to run. Do NOT build backend trigger here.

---

## 3. Acceptance Gate

```bash
npm run build && npm test && \
  npm run report -- --client EBSF --month 2025-06 && \
  npm run report -- --zone-id <EBSF_Zone_B_uuid> --month 2025-06
```

- Both commands succeed. Zone-scoped report title reads `"Elderslie Banksia Scrub Forest Zone B June 2025 Monthly Report"`.
- Two files in `dist/reports/` after both runs.
- `client_reports.docx_url` is populated on the inserted rows (relative path is OK).
- Dashboard Reports → Preview modal has working **Download DOCX** (downloads the file) and **Print to PDF** (opens browser print dialog preview).
- Tests pass (232+ existing + any you add for scope resolution).

Commit to `feat/report-generator`. Short summary back to orchestrator: what landed, which scope flag combos are tested, any ambiguity resolved.
