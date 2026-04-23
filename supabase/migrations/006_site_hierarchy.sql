-- Constance Conservation — Client → Site → Zone hierarchy (E2)
-- Spec: docs/executor_briefs/E2_hierarchy_schema.md
-- 2026-04-23
--
-- Introduces a self-referential parent_site_id on sites so that a single
-- `sites` table can represent both top-level sites and their zones:
--   site  := row with parent_site_id IS NULL, client_id set
--   zone  := row with parent_site_id pointing at a site row, client_id unset
--
-- Existing data:
--   - `EBSF Zone B`, `EBSF Zone C`, `EBSF Zone D`, `EBSF Zone B and C`,
--     `Spring Farm EBSF` are promoted to zones under a new top-level `EBSF` site.
--   - All other existing sites become top-level with client_id NULL (organization
--     level only). Future briefs will attach them to clients.

-- ── Schema ────────────────────────────────────────────────────────────
ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS parent_site_id uuid
        REFERENCES sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sites_parent_site_id ON sites(parent_site_id);

-- ── Data migration ────────────────────────────────────────────────────

-- 1. Unlink every site from clients so we can set only the top-level EBSF row
--    below. This is intentional: zones inherit client via parent_site_id.
UPDATE sites SET client_id = NULL, parent_site_id = NULL WHERE id IS NOT NULL;

-- 2. Create the top-level EBSF site (idempotent by canonical_name).
INSERT INTO sites (organization_id, client_id, name, canonical_name, sc_label)
SELECT c.organization_id,
       c.id,
       'EBSF',
       'ebsf',
       'EBSF'
FROM clients c
WHERE c.name ILIKE 'EBSF%'
  AND NOT EXISTS (
      SELECT 1 FROM sites s
      WHERE s.organization_id = c.organization_id
        AND s.canonical_name = 'ebsf'
        AND s.parent_site_id IS NULL
  );

-- Make sure the top-level EBSF row has the EBSF client attached (covers the
-- case where the row already existed from a previous run).
UPDATE sites s
SET client_id = c.id
FROM clients c
WHERE s.organization_id = c.organization_id
  AND s.canonical_name = 'ebsf'
  AND s.parent_site_id IS NULL
  AND c.name ILIKE 'EBSF%';

-- 3. Promote the 5 EBSF-prefixed rows to zones under the new top-level row.
UPDATE sites z
SET parent_site_id = p.id
FROM sites p, clients c
WHERE p.canonical_name = 'ebsf'
  AND p.parent_site_id IS NULL
  AND p.client_id = c.id
  AND c.name ILIKE 'EBSF%'
  AND z.organization_id = p.organization_id
  AND z.id <> p.id
  AND z.name IN (
      'EBSF Zone B',
      'EBSF Zone C',
      'EBSF Zone D',
      'EBSF Zone B and C',
      'Spring Farm EBSF'
  );
