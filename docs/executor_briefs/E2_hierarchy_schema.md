# Executor Brief E2 — Client → Site → Zone Hierarchy

**Run this FIRST. E3, E4, E5 depend on it. Keep committing to `feat/report-generator`.**

---

## 1. Context

Orchestrator and user have agreed on a canonical three-level hierarchy:

```
organization (Constance Conservation)
└── client (Camden Council, etc.) — paying entity
    └── site (EBSF, Cloverhill Riparian, etc.) — named project area
        └── zone (Zone B, Zone C, etc.) — billing/work unit
```

Currently our `sites` table is flat and mixes both levels:
- `EBSF Zone B`, `EBSF Zone C` → these are zones
- `Cloverhill Riparian`, `Harrington Forest` → these are sites (no explicit zones)

**Read first:**
- `docs/report_data_mapping.md` — spec
- `MEMORY.md` orchestration handoff — current state
- `src/report/aggregate.ts` — current generator uses `clients.site_id_pattern` regex as a workaround. Drop this.

---

## 2. Scope

Add a hierarchy to `sites` without renaming the table. Migrate EBSF data. Update
the generator to use the hierarchy. No UI work in this brief — that's E3/E4.

**Schema change (migration 006):**
- Add `sites.parent_site_id uuid` — self-reference FK, nullable. `ON DELETE SET NULL`.
- A row is either a **top-level site** (`parent_site_id IS NULL`) OR a **zone** (`parent_site_id` set to some other site row).
- Index `idx_sites_parent_site_id`.
- Ensure `sites.client_id uuid REFERENCES clients(id)` exists. Populate it for top-level sites only; zones inherit via parent.

**Data migration (same 006 migration file):**
- Insert one new top-level site: `EBSF` (long_name `Elderslie Banksia Scrub Forest`, `client_id` = EBSF client row).
- Update existing 5 EBSF-prefixed zone rows (`EBSF Zone B`, `EBSF Zone C`, `EBSF Zone D`, `EBSF Zone B and C`, `Spring Farm EBSF`) to set `parent_site_id` = the new EBSF top-level row. Leave their name fields alone (they're what SC sends).
- For all OTHER existing sites (non-EBSF), set `parent_site_id = NULL` and `client_id = NULL`. Future migrations will organize them as more clients come on.

**Code updates:**
- `src/report/aggregate.ts`: replace `site_id_pattern` regex lookup with hierarchy traversal. Given a `client_id`, fetch all sites where `client_id = $1 OR parent_site_id IN (SELECT id FROM sites WHERE client_id = $1)`. Include both top-level and zones in the aggregate.
- Remove `clients.site_id_pattern` usage in favour of the hierarchy. **Do not drop the column yet** — E4 may still want it as a failsafe. Just stop reading it.
- `src/seed/onboarding.ts`: when seeding new sites in future, use parent_site_id as appropriate. For now just ensure EBSF's hierarchy is re-applied if the seed runs.

**Helper functions** (create in `src/report/hierarchy.ts`):
```ts
/** Resolve all leaf sites (zones + childless top-level sites) for a client. */
export async function getClientLeafSites(clientId: string): Promise<SiteRow[]>;

/** Resolve all zones under a site (returns [] if the site has no zones). */
export async function getZonesForSite(siteId: string): Promise<SiteRow[]>;

/** Walk from any site up to its top-level parent site row. */
export async function getTopLevelSite(siteId: string): Promise<SiteRow>;
```

---

## 3. Acceptance Gate

```bash
npm run build && npm test && \
  npm run report -- --client EBSF --month 2025-06
```

- All 242+ tests pass. Add new tests for `hierarchy.ts` helpers (mock client required; use existing test fixtures).
- Generator still produces the same June 2025 EBSF report file (zones resolved through hierarchy now, but content identical to previous run).
- Supabase state:
  - `sites` has a new row `EBSF` with `client_id` = EBSF client id, `parent_site_id` NULL
  - 5 EBSF-prefixed rows have `parent_site_id` pointing at the new `EBSF` row
  - Query `SELECT name FROM sites WHERE parent_site_id IS NOT NULL` returns the 5 zones

Commit to `feat/report-generator`. Report back with:
- Migration applied (confirm via `client_reports` row for June 2025 still works)
- Generator output identical to prior run (diff it)
- Whether `clients.site_id_pattern` is still being read anywhere (grep result)

Nothing blocked if you can run migrations via the existing `exec_sql` RPC (`param is 'query'`).
