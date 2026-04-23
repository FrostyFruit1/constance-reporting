-- Constance Conservation — E6 client / site data cleanup
-- Spec: docs/executor_briefs/E6_client_data_cleanup.md
-- 2026-04-23
--
-- Hygiene sweep before ops (Ryan/Cameron) populate real roster data:
--   1. Merge the EBSF client into Camden Council (EBSF is a site, not a client).
--   2. Re-parent orphan EBSF site variants under the EBSF top-level site and
--      collapse the EBSF Zone C (Planting) duplicate.
--   3. De-dup three non-EBSF duplicate site names.
--   4. (done in code — parser fallback + retag script) — no SQL here.
--   5. Seed sites.long_name for the EBSF top-level.
--
-- All existing site_id / client_id FKs are re-pointed before any deletes.

-- ── Schema: site_aliases for recording merged/duplicate variants ─────
ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS site_aliases text[];

-- ── Helpers: stable UUIDs captured via SELECTs below ─────────────────
-- The migration hard-codes nothing — every row is located by its natural key
-- (client.name, site.name, parent_site_id) so re-running the file is safe
-- even if other data has drifted.

-- ── Fix 1. Merge EBSF client into Camden Council ─────────────────────
--
-- EBSF client row donates contact + config to Camden Council. Then every
-- foreign key that points at the EBSF client is re-pointed to Camden.

DO $$
DECLARE
    ebsf_client_id   uuid;
    camden_client_id uuid;
BEGIN
    SELECT id INTO ebsf_client_id
    FROM clients
    WHERE name ILIKE 'EBSF%' AND name ILIKE '%Elderslie Banksia Scrub Forest%'
    LIMIT 1;

    SELECT id INTO camden_client_id
    FROM clients
    WHERE name = 'Camden Council'
    LIMIT 1;

    IF ebsf_client_id IS NULL THEN
        RAISE NOTICE 'EBSF client already merged — skipping fix 1';
        RETURN;
    END IF;

    IF camden_client_id IS NULL THEN
        RAISE EXCEPTION 'Camden Council client row missing — cannot merge EBSF into it';
    END IF;

    -- 1a. Copy EBSF non-null fields onto Camden (without clobbering existing).
    -- Intentionally skip long_name: the EBSF row's value is the *site* long
    -- name and belongs on the EBSF site row (seeded in Fix 5 below).
    UPDATE clients c
    SET contact_name     = COALESCE(c.contact_name,     e.contact_name),
        contact_email    = COALESCE(c.contact_email,    e.contact_email),
        contact_phone    = COALESCE(c.contact_phone,    e.contact_phone),
        council_or_body  = COALESCE(c.council_or_body,  e.council_or_body),
        report_frequency = COALESCE(c.report_frequency, e.report_frequency),
        delivery_channel = COALESCE(c.delivery_channel, e.delivery_channel),
        report_template_variant
                         = COALESCE(c.report_template_variant, e.report_template_variant),
        schedule_config  = COALESCE(c.schedule_config,  e.schedule_config),
        site_id_pattern  = COALESCE(c.site_id_pattern,  e.site_id_pattern),
        updated_at       = now()
    FROM clients e
    WHERE c.id = camden_client_id AND e.id = ebsf_client_id;

    -- 1b. Re-point every FK that references the old EBSF client.
    UPDATE sites               SET client_id = camden_client_id WHERE client_id = ebsf_client_id;
    UPDATE client_reports      SET client_id = camden_client_id WHERE client_id = ebsf_client_id;
    UPDATE client_contracts    SET client_id = camden_client_id WHERE client_id = ebsf_client_id;
    UPDATE client_stakeholders SET client_id = camden_client_id WHERE client_id = ebsf_client_id;
    UPDATE client_notes        SET client_id = camden_client_id WHERE client_id = ebsf_client_id;

    -- 1c. Delete the defunct EBSF client row.
    DELETE FROM clients WHERE id = ebsf_client_id;
END $$;

-- ── Fix 2. Re-parent orphan EBSF variants ────────────────────────────
--
-- Four rows sit at parent_site_id = NULL but are clearly children of the
-- EBSF top-level site. Attach them. Then collapse the two spelling variants
-- of "EBSF Zone C (Planting)" into the row with the most inspections.

DO $$
DECLARE
    ebsf_site_id uuid;
BEGIN
    SELECT id INTO ebsf_site_id
    FROM sites
    WHERE canonical_name = 'ebsf' AND parent_site_id IS NULL
    LIMIT 1;

    IF ebsf_site_id IS NULL THEN
        RAISE EXCEPTION 'EBSF top-level site missing — E2 migration not applied?';
    END IF;

    UPDATE sites
    SET parent_site_id = ebsf_site_id,
        updated_at = now()
    WHERE name IN (
            'Spring farm EBSF Zone B',
            'EBSF Zone C(Planting)',
            'EBSF Zone C (Planting)',
            'EBSF Watering'
        )
      AND parent_site_id IS NULL;
END $$;

-- 2b. Collapse the two EBSF Zone C (Planting) variants. Keep the row with
-- more inspections (or the earliest-created one on tie); re-point inspections,
-- CAR records, and lookups to the survivor; record the deleted variant's
-- name as an alias.
DO $$
DECLARE
    keep_id   uuid;
    kill_id   uuid;
    kill_name text;
BEGIN
    WITH candidates AS (
        SELECT s.id, s.name, s.created_at,
               (SELECT COUNT(*) FROM inspections i WHERE i.site_id = s.id) AS n_insp
        FROM sites s
        WHERE s.name IN ('EBSF Zone C(Planting)', 'EBSF Zone C (Planting)')
    ),
    ranked AS (
        SELECT id, name, ROW_NUMBER() OVER (ORDER BY n_insp DESC, created_at ASC) AS r
        FROM candidates
    )
    SELECT id INTO keep_id FROM ranked WHERE r = 1;

    SELECT id, name INTO kill_id, kill_name
    FROM sites
    WHERE name IN ('EBSF Zone C(Planting)', 'EBSF Zone C (Planting)')
      AND id <> keep_id
    LIMIT 1;

    IF keep_id IS NULL OR kill_id IS NULL THEN
        RAISE NOTICE 'EBSF Zone C (Planting) duplicate already collapsed — skipping';
        RETURN;
    END IF;

    -- Re-point every FK before delete.
    UPDATE inspections                  SET site_id = keep_id WHERE site_id = kill_id;
    UPDATE chemical_application_records SET site_id = keep_id WHERE site_id = kill_id;
    UPDATE client_reports               SET site_id = keep_id WHERE site_id = kill_id;
    UPDATE client_contracts             SET site_id = keep_id WHERE site_id = kill_id;
    UPDATE client_notes                 SET site_id = keep_id WHERE site_id = kill_id;
    UPDATE site_name_lookup             SET site_id = keep_id WHERE site_id = kill_id;

    -- Record the dropped spelling as an alias, de-duplicated.
    UPDATE sites
    SET site_aliases = COALESCE((
            SELECT array_agg(DISTINCT a)
            FROM unnest(COALESCE(site_aliases, '{}'::text[]) || ARRAY[kill_name]) AS a
            WHERE a IS NOT NULL
        ), '{}'::text[]),
        updated_at = now()
    WHERE id = keep_id;

    DELETE FROM sites WHERE id = kill_id;
END $$;

-- ── Fix 3. De-dup the three non-EBSF duplicate site names ────────────
--
-- For each (group of rows sharing the same `name`): keep the row with the
-- most inspections, re-point child FKs onto it, and record the surviving
-- row's alternate names.
--
-- The Ulmarra Avenue group has three variants — one canonical
-- ("Ulmarra Avenue, Camden South") twice, plus a shorter "Ulmarra Avenue".
-- Keep the fullest name with the most inspections and absorb the others.

DO $$
DECLARE
    rec      RECORD;
    keep_id  uuid;
    keep_name text;
    kill_names text[];
    target_names text[];
BEGIN
    FOR rec IN
        SELECT * FROM (VALUES
            (ARRAY['George Caley Reserve, Mount Annen.']),
            (ARRAY['Northern road, Narellan.']),
            (ARRAY['Ulmarra Avenue, Camden South', 'Ulmarra Avenue'])
        ) AS g(names)
    LOOP
        target_names := rec.names;

        -- Pick the surviving row: most inspections, tie-breaker = earlier created_at,
        -- and tie-break further on the longest name (prefers full "… Camden South").
        WITH candidates AS (
            SELECT s.id, s.name, s.created_at, s.site_aliases,
                   (SELECT COUNT(*) FROM inspections i WHERE i.site_id = s.id) AS n_insp,
                   length(s.name) AS name_len
            FROM sites s
            WHERE s.name = ANY(target_names)
        ),
        ranked AS (
            SELECT id, name,
                   ROW_NUMBER() OVER (ORDER BY n_insp DESC, name_len DESC, created_at ASC) AS r
            FROM candidates
        )
        SELECT id, name INTO keep_id, keep_name FROM ranked WHERE r = 1;

        IF keep_id IS NULL THEN
            CONTINUE;  -- already cleaned
        END IF;

        -- Gather the names we are about to drop (distinct from the keeper's name).
        SELECT COALESCE(array_agg(DISTINCT s.name), '{}')
          INTO kill_names
        FROM sites s
        WHERE s.name = ANY(target_names) AND s.id <> keep_id;

        IF array_length(kill_names, 1) IS NULL THEN
            CONTINUE;
        END IF;

        -- Re-point every FK that points at the soon-to-be-deleted rows.
        UPDATE inspections                  SET site_id = keep_id
            WHERE site_id IN (SELECT id FROM sites WHERE name = ANY(target_names) AND id <> keep_id);
        UPDATE chemical_application_records SET site_id = keep_id
            WHERE site_id IN (SELECT id FROM sites WHERE name = ANY(target_names) AND id <> keep_id);
        UPDATE client_reports               SET site_id = keep_id
            WHERE site_id IN (SELECT id FROM sites WHERE name = ANY(target_names) AND id <> keep_id);
        UPDATE client_contracts             SET site_id = keep_id
            WHERE site_id IN (SELECT id FROM sites WHERE name = ANY(target_names) AND id <> keep_id);
        UPDATE client_notes                 SET site_id = keep_id
            WHERE site_id IN (SELECT id FROM sites WHERE name = ANY(target_names) AND id <> keep_id);
        UPDATE site_name_lookup             SET site_id = keep_id
            WHERE site_id IN (SELECT id FROM sites WHERE name = ANY(target_names) AND id <> keep_id);

        -- Fold dropped names (other than the survivor's own name) into
        -- site_aliases. If nothing differs from the keeper's name we just
        -- leave site_aliases unchanged.
        UPDATE sites
        SET site_aliases = COALESCE((
                SELECT array_agg(DISTINCT a)
                FROM unnest(COALESCE(site_aliases, '{}'::text[]) || kill_names) AS a
                WHERE a IS NOT NULL AND a <> keep_name
            ), COALESCE(site_aliases, '{}'::text[])),
            updated_at = now()
        WHERE id = keep_id;

        -- Drop the duplicates.
        DELETE FROM sites WHERE name = ANY(target_names) AND id <> keep_id;
    END LOOP;
END $$;


-- ── Fix 5. Seed sites.long_name for EBSF top-level ───────────────────
UPDATE sites
SET long_name = 'Elderslie Banksia Scrub Forest',
    updated_at = now()
WHERE canonical_name = 'ebsf'
  AND parent_site_id IS NULL
  AND (long_name IS NULL OR long_name = '');
