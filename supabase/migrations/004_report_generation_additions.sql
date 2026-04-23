-- Constance Conservation — Report Generation Column Additions (M03)
-- Spec: docs/report_data_mapping.md
-- 2026-04-22

-- ── clients: per-client static config for report generation ───────────
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS location_maps          jsonb,        -- array of image URLs for §1.0 static site maps
    ADD COLUMN IF NOT EXISTS active_roster_staff_ids uuid[];      -- for §3 zero-hours staff inclusion rule

-- ── client_reports: per-report generated artefacts + cadence ───────────
ALTER TABLE client_reports
    ADD COLUMN IF NOT EXISTS cadence                text,          -- 'weekly' | 'monthly' | 'quarterly'
    ADD COLUMN IF NOT EXISTS cover_hero_photo_url   text,          -- optional cover photo (manual or auto-selected)
    ADD COLUMN IF NOT EXISTS period_map_images      jsonb,         -- manual-upload polygon overlay maps (§4.0)
    ADD COLUMN IF NOT EXISTS narrative_sections     jsonb,         -- LLM output: {outline_of_works: [...], bird_sightings: "...", incidents: "...", fauna_sightings: "..."}
    ADD COLUMN IF NOT EXISTS html_content           text,          -- rendered HTML — canonical stored form
    ADD COLUMN IF NOT EXISTS generated_at           timestamptz,   -- when generator last ran
    ADD COLUMN IF NOT EXISTS zones_included         text[];        -- e.g. ARRAY['Zone B','Zone C'] — for naming convention
