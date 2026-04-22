-- Constance Conservation — Schema v2 (M00)
-- Redesigned from project brief v1.1 after API data shape analysis + client report template analysis
-- Multi-tenant design with organization_id on all tables for future scaling
-- 2026-04-15
--
-- Key design decisions:
--   1. Multi-tenant via organization_id (future-proofs for other conservation businesses)
--   2. Inspections (raw SC data) separated from client_reports (generated output)
--   3. Chemical Application Records get dedicated tables (regulatory compliance)
--   4. Lookup/normalization tables for species, chemicals, and site names
--   5. Density tracking via site_scope_baselines + report_weed_works
--   6. All SC identifiers prefixed with sc_ to distinguish from internal IDs
--   7. Nullable by default — Safety Culture data is sparse and evolving
--   8. UPSERT-friendly via sc_audit_id unique constraints
--   9. Report generation tables support review/approval workflow

-- ============================================================================
-- Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Enum types
-- ============================================================================
CREATE TYPE density_band AS ENUM ('0-25', '26-50', '51-75', '76-100');
CREATE TYPE report_status AS ENUM ('draft', 'review', 'approved', 'sent');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'needs_review');
CREATE TYPE media_type AS ENUM ('photo', 'site_map', 'area_work_map');
CREATE TYPE observation_type AS ENUM ('fauna', 'flora');
CREATE TYPE species_category AS ENUM ('grass', 'vine', 'woody', 'herb', 'fern', 'tree');
CREATE TYPE chemical_type AS ENUM ('herbicide', 'additive', 'wetter', 'dye');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- organizations
-- Multi-tenant top level. One row per conservation business.
-- ============================================================================
CREATE TABLE organizations (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        text NOT NULL,
    address     text,
    phone       text,
    email       text,
    logo_url    text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- clients
-- Client profiles with scope and reporting configuration.
-- ============================================================================
CREATE TABLE clients (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id         uuid NOT NULL REFERENCES organizations(id),
    name                    text NOT NULL,
    contact_name            text,
    contact_email           text,
    council_or_body         text,
    contract_info           text,
    report_frequency        text,           -- e.g., 'monthly', 'quarterly'
    delivery_channel        text,           -- e.g., 'email', 'dashboard'
    report_template_variant text,           -- controls which sections appear in reports
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_organization_id ON clients(organization_id);

-- sites
-- Work locations with zone support.
-- ============================================================================
CREATE TABLE sites (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    client_id       uuid REFERENCES clients(id),
    name            text NOT NULL,
    canonical_name  text,               -- normalised name for matching
    sc_label        text,               -- Safety Culture dropdown label (may differ from name)
    gps_lat         float8,
    gps_lon         float8,
    gps_bounds_json jsonb,              -- GeoJSON boundary polygon
    site_type       text,               -- e.g., 'riparian', 'bushland', 'scrub_forest'
    zone_info_json  jsonb,              -- zone definitions per site (e.g., {"B": "Zone B desc", "C": "Zone C desc"})
    location_map_url text,              -- aerial/satellite reference map
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sites_organization_id ON sites(organization_id);
CREATE INDEX idx_sites_client_id ON sites(client_id);
CREATE INDEX idx_sites_canonical_name ON sites(canonical_name);

-- staff
-- Crew members.
-- ============================================================================
CREATE TABLE staff (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name            text NOT NULL,
    role            text,               -- e.g., 'supervisor', 'field_worker', 'contractor'
    supervisor_id   uuid REFERENCES staff(id),
    vehicle_id      text,
    capability_tags jsonb,              -- e.g., ["spraying", "brushcutting", "chainsaw"]
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_organization_id ON staff(organization_id);

-- site_scope_baselines
-- Initial scope assessments per site/zone. Tracks density over time.
-- ============================================================================
CREATE TABLE site_scope_baselines (
    id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id                     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    zone                        text,               -- e.g., 'B', 'C', or NULL for whole site
    scope_date                  date NOT NULL,
    area_total_m2               numeric,
    initial_density_band        density_band,
    contract_target_density_band density_band,
    estimated_completion_months integer,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_scope_baselines_site_id ON site_scope_baselines(site_id);

-- ============================================================================
-- LOOKUP / NORMALIZATION TABLES
-- ============================================================================

-- species_lookup
-- Canonical species names with aliases for matching free-text input.
-- ============================================================================
CREATE TABLE species_lookup (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_name  text NOT NULL UNIQUE,
    scientific_name text,
    common_aliases  jsonb,              -- e.g., ["Purple top", "purple top grass"]
    species_type    text NOT NULL DEFAULT 'weed',  -- weed, native, fauna
    category        species_category,   -- grass, vine, woody, herb, fern, tree
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed known weed species from SC template
INSERT INTO species_lookup (canonical_name, species_type) VALUES
    ('Purple Top', 'weed'),
    ('Fleabane', 'weed'),
    ('Thistle', 'weed'),
    ('Prickly Lettuce', 'weed'),
    ('Paddy''s Lucerne', 'weed'),
    ('Bidens Pilosa', 'weed'),
    ('Paspalum', 'weed'),
    ('Bromus', 'weed'),
    ('Pigeon Grass', 'weed'),
    ('Kikuyu', 'weed'),
    ('African Olive', 'weed'),
    ('Moth Vine', 'weed'),
    ('Sticky nightshade', 'weed'),
    ('Cats claw creeper', 'weed'),
    ('Japanese honeysuckle', 'weed'),
    ('Balloon Vine', 'weed'),
    ('Privett sp.', 'weed'),
    ('African Love Grass', 'weed'),
    ('Lantana', 'weed'),
    ('Prickly Pear', 'weed'),
    ('Blackberry', 'weed'),
    ('Asparagus Fern', 'weed'),
    ('Bridal Creeper', 'weed'),
    ('Crofton', 'weed');

-- chemical_lookup
-- Canonical chemical names with aliases for matching free-text input.
-- ============================================================================
CREATE TABLE chemical_lookup (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_name      text NOT NULL UNIQUE,
    common_aliases      jsonb,          -- e.g., ["glyphosate", "Roundup"]
    type                chemical_type,
    active_ingredient   text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Seed known chemicals from SC template
INSERT INTO chemical_lookup (canonical_name, type) VALUES
    ('Starane', 'herbicide'),
    ('Glyphosate', 'herbicide'),
    ('Dicamba', 'herbicide'),
    ('Fusilade', 'herbicide'),
    ('Grazon Extra', 'herbicide'),
    ('Metsulfuron', 'herbicide'),
    ('Brushwet', 'wetter');

-- site_name_lookup
-- Maps Safety Culture labels/text variants to canonical site records.
-- ============================================================================
CREATE TABLE site_name_lookup (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    sc_label        text NOT NULL,      -- the label as it appears in SC
    sc_text_variant text,               -- free-text variant (may differ from label)
    site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_site_name_lookup_label ON site_name_lookup(sc_label);

-- ============================================================================
-- INSPECTION TABLES (Raw Ingestion from Safety Culture)
-- ============================================================================

-- inspections
-- One row per Safety Culture submission. sc_audit_id is the idempotency key.
-- ============================================================================
CREATE TABLE inspections (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    sc_audit_id         text NOT NULL UNIQUE,    -- idempotency key
    sc_template_type    text NOT NULL,           -- 'daily_work_report' or 'chemical_application_record'
    site_id             uuid REFERENCES sites(id),
    date                date,                    -- conducted_on date
    supervisor_id       uuid REFERENCES staff(id),
    sc_modified_at      timestamptz,
    sc_raw_json         jsonb,                   -- full SC audit JSON for reprocessing
    processing_status   processing_status NOT NULL DEFAULT 'pending',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspections_organization_id ON inspections(organization_id);
CREATE INDEX idx_inspections_site_id ON inspections(site_id);
CREATE INDEX idx_inspections_date ON inspections(date);
CREATE INDEX idx_inspections_sc_template_type ON inspections(sc_template_type);
CREATE INDEX idx_inspections_processing_status ON inspections(processing_status);

-- inspection_personnel
-- Staff assigned with hours worked per inspection.
-- ============================================================================
CREATE TABLE inspection_personnel (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id   uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    staff_id        uuid REFERENCES staff(id),
    hours_worked    numeric,            -- parsed from free text
    raw_hours_text  text,               -- original free text value
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_personnel_inspection_id ON inspection_personnel(inspection_id);
CREATE INDEX idx_inspection_personnel_staff_id ON inspection_personnel(staff_id);

-- inspection_tasks
-- Selected tasks from the "Tasks Undertaken" multi-select.
-- ============================================================================
CREATE TABLE inspection_tasks (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id   uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    task_type       text NOT NULL,      -- e.g., 'Spraying', 'Cut & Painting', 'Handweeding', 'Brushcutting'
    details_text    text,               -- free text narrative for this task
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_tasks_inspection_id ON inspection_tasks(inspection_id);
CREATE INDEX idx_inspection_tasks_task_type ON inspection_tasks(task_type);

-- inspection_weeds
-- Species targeted per inspection.
-- ============================================================================
CREATE TABLE inspection_weeds (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id           uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    species_name_raw        text NOT NULL,          -- as entered in SC
    species_name_canonical  text,                   -- resolved via species_lookup
    scientific_name         text,                   -- resolved via species_lookup
    species_type            text,                   -- weed, native, etc.
    source                  text,                   -- 'multi_select' or 'free_text'
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_weeds_inspection_id ON inspection_weeds(inspection_id);

-- inspection_chemicals
-- Chemicals referenced in Daily Work Report (Herbicide multi-select + free text).
-- ============================================================================
CREATE TABLE inspection_chemicals (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id           uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    chemical_name_raw       text NOT NULL,          -- as entered in SC
    chemical_name_canonical text,                   -- resolved via chemical_lookup
    rate_raw                text,                   -- raw rate text (e.g., "6ml/L")
    rate_value              numeric,                -- parsed numeric rate
    rate_unit               text,                   -- parsed unit (e.g., "ml/L")
    source_template         text,                   -- 'daily_work_report' or 'chemical_application_record'
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_chemicals_inspection_id ON inspection_chemicals(inspection_id);

-- inspection_media
-- Photos and maps attached to inspection items.
-- ============================================================================
CREATE TABLE inspection_media (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id       uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    media_type          media_type,                 -- photo, site_map, area_work_map
    sc_media_href       text NOT NULL,              -- SC download URL
    storage_url         text,                       -- Supabase Storage URL after download
    gps_lat             float8,
    gps_lon             float8,
    before_after        text,                       -- 'before' or 'after' if classified
    ai_analysis_json    jsonb,                      -- Gemini vision analysis results
    ai_confidence       float8,                     -- confidence score from AI analysis
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_media_inspection_id ON inspection_media(inspection_id);
CREATE INDEX idx_inspection_media_media_type ON inspection_media(media_type);

-- inspection_observations
-- Fauna/flora sightings (conditional fields — only present when parent Yes/No is "Yes").
-- ============================================================================
CREATE TABLE inspection_observations (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id       uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    observation_type    observation_type NOT NULL,   -- fauna or flora
    species_name        text,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_observations_inspection_id ON inspection_observations(inspection_id);

-- inspection_metadata
-- Remaining fields from Daily Work Report that don't fit other tables.
-- ============================================================================
CREATE TABLE inspection_metadata (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id           uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    total_worked_hours      text,                   -- free text (e.g., "24")
    remaining_hours         text,                   -- free text (e.g., "440")
    weed_removal_pct_min    numeric,                -- parsed from range (e.g., 30 from "30-40%")
    weed_removal_pct_max    numeric,                -- parsed from range (e.g., 40 from "30-40%")
    erosion_works           text,
    concerns_text           text,
    future_works_comments   text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_metadata_inspection_id ON inspection_metadata(inspection_id);

-- ============================================================================
-- CHEMICAL APPLICATION RECORD TABLES
-- ============================================================================

-- chemical_application_records
-- Detailed compliance records from the Chemical Application Record template.
-- ============================================================================
CREATE TABLE chemical_application_records (
    id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id               uuid REFERENCES inspections(id),  -- nullable link to daily report
    sc_audit_id                 text NOT NULL UNIQUE,
    site_id                     uuid REFERENCES sites(id),
    date                        date,
    application_method          text,           -- e.g., 'Backpack'
    time_start                  text,           -- parsed from "7:30/3:20"
    time_finish                 text,
    total_amount_sprayed_litres numeric,        -- parsed from "40L"
    -- Weather fields
    weather_general             text,
    wind_direction              text,
    wind_speed                  text,
    wind_variability            text,
    rainfall                    text,
    temperature                 text,
    humidity                    text,
    public_notification         text,           -- e.g., 'Signage'
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chemical_application_records_site_id ON chemical_application_records(site_id);
CREATE INDEX idx_chemical_application_records_date ON chemical_application_records(date);

-- chemical_application_items
-- Individual chemicals per application record (positional matching from parallel free-text fields).
-- ============================================================================
CREATE TABLE chemical_application_items (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_record_id   uuid NOT NULL REFERENCES chemical_application_records(id) ON DELETE CASCADE,
    chemical_name_raw       text NOT NULL,
    chemical_name_canonical text,
    rate_raw                text,               -- e.g., "7ml/L"
    rate_value              numeric,
    rate_unit               text,               -- e.g., "ml/L"
    concentrate_raw         text,               -- e.g., "70ml/10L"
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chemical_application_items_record_id ON chemical_application_items(application_record_id);

-- chemical_application_operators
-- Staff who performed the application.
-- ============================================================================
CREATE TABLE chemical_application_operators (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_record_id   uuid NOT NULL REFERENCES chemical_application_records(id) ON DELETE CASCADE,
    staff_id                uuid REFERENCES staff(id),
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chemical_application_operators_record_id ON chemical_application_operators(application_record_id);

-- chemical_application_additives
-- Wetters and dyes used in applications.
-- ============================================================================
CREATE TABLE chemical_application_additives (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_record_id   uuid NOT NULL REFERENCES chemical_application_records(id) ON DELETE CASCADE,
    additive_name           text NOT NULL,      -- e.g., 'Brushwet 2ml/L', 'Blue Dye 5ml/L'
    rate_raw                text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chemical_application_additives_record_id ON chemical_application_additives(application_record_id);

-- ============================================================================
-- REPORT GENERATION TABLES
-- ============================================================================

-- client_reports
-- Generated monthly/quarterly reports for clients.
-- ============================================================================
CREATE TABLE client_reports (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    client_id           uuid NOT NULL REFERENCES clients(id),
    site_id             uuid REFERENCES sites(id),
    report_period_start date NOT NULL,
    report_period_end   date NOT NULL,
    title               text,
    author_name         text,
    addressed_to        text,
    status              report_status NOT NULL DEFAULT 'draft',
    pdf_url             text,
    docx_url            text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_reports_organization_id ON client_reports(organization_id);
CREATE INDEX idx_client_reports_client_id ON client_reports(client_id);
CREATE INDEX idx_client_reports_site_id ON client_reports(site_id);
CREATE INDEX idx_client_reports_status ON client_reports(status);

-- report_weed_works
-- Weed works table rows for Section 4.1 of client reports.
-- Partially auto-populated from inspection data, partially manual (polygon/density).
-- ============================================================================
CREATE TABLE report_weed_works (
    id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_report_id            uuid NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
    inspection_id               uuid REFERENCES inspections(id),
    weed_type                   text,
    species_list                jsonb,          -- list of species names
    polygon_area_m2             numeric,        -- from Google Earth polygon (manual Phase 1)
    density_band                density_band,
    baseline_density_band       density_band,
    density_change_from_baseline text,          -- e.g., "improved", "stable", "degraded"
    method_used                 text,           -- e.g., 'Spraying', 'Cut & Painting'
    gis_lat                     float8,
    gis_lon                     float8,
    polygon_geojson             jsonb,          -- future: actual polygon boundary
    hours_worked                numeric,
    map_polygon_colour          text,           -- colour code for map visualisation
    auto_populated              boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_weed_works_client_report_id ON report_weed_works(client_report_id);

-- report_herbicide_summary
-- Aggregated chemical data for Section 6.0 of client reports.
-- ============================================================================
CREATE TABLE report_herbicide_summary (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_report_id        uuid NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
    chemical_name           text NOT NULL,
    rate                    text,
    target_species          text,
    zone                    text,
    total_amount_sprayed    text,
    total_concentrate       text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_herbicide_summary_client_report_id ON report_herbicide_summary(client_report_id);

-- report_staff_summary
-- Aggregated staff hours for Section 3.0 of client reports.
-- ============================================================================
CREATE TABLE report_staff_summary (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_report_id    uuid NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
    staff_id            uuid REFERENCES staff(id),
    zone                text,
    hours_worked        numeric,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_staff_summary_client_report_id ON report_staff_summary(client_report_id);

-- ============================================================================
-- FUTURE TABLES (Designed, not deployed — uncomment when ready)
-- ============================================================================

-- Stream 2: Treatment Effectiveness (Post M03, needs 3-6 months data)
-- CREATE TABLE treatment_outcomes (
--     id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
--     site_id                 uuid NOT NULL REFERENCES sites(id),
--     inspection_id           uuid NOT NULL REFERENCES inspections(id),
--     followup_inspection_id  uuid REFERENCES inspections(id),
--     species_treated         text,
--     chemical_used           text,
--     outcome                 text,       -- 'effective', 'partial', 'ineffective'
--     days_between_visits     integer,
--     created_at              timestamptz NOT NULL DEFAULT now()
-- );

-- Stream 3: Crew Intelligence (Post M01)
-- CREATE TABLE staff_profiles (
--     id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
--     staff_id                uuid NOT NULL REFERENCES staff(id),
--     preferred_tasks         jsonb,
--     site_type_suitability   jsonb,
--     certifications          jsonb,
--     created_at              timestamptz NOT NULL DEFAULT now(),
--     updated_at              timestamptz NOT NULL DEFAULT now()
-- );

-- Stream 6: External Weather Data (Post M05)
-- CREATE TABLE weather_records (
--     id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
--     site_id     uuid NOT NULL REFERENCES sites(id),
--     date        date NOT NULL,
--     source      text,           -- 'bom' or 'manual'
--     temperature numeric,
--     rainfall_mm numeric,
--     humidity    numeric,
--     wind        text,
--     created_at  timestamptz NOT NULL DEFAULT now()
-- );

-- ============================================================================
-- updated_at trigger
-- Auto-update updated_at on row modification for tables that have it.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sites_updated_at
    BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_staff_updated_at
    BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inspections_updated_at
    BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chemical_application_records_updated_at
    BEFORE UPDATE ON chemical_application_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_reports_updated_at
    BEFORE UPDATE ON client_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
