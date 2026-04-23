-- ============================================================================
-- Constance Conservation — Fresh Install Schema (consolidated)
-- ============================================================================
-- Applies migrations 001-009 as a single idempotent script for bootstrapping
-- a new Supabase project. Paste into Supabase Studio SQL Editor and run.
--
-- After this runs, follow the data-only REST migration to copy rows from the
-- source project. The report_assets Storage bucket is created separately via
-- the Storage API (SQL can't modify storage.objects policies from this role).
-- ============================================================================

-- Bootstrap exec_sql RPC used by the orchestrator tooling
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
    EXECUTE query;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;



-- ============================================================================
-- From migration: 001_initial_schema.sql
-- ============================================================================
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


-- ============================================================================
-- From migration: 002_client_profile_tables.sql
-- ============================================================================
-- Constance Conservation — Schema Amendment: Client Profile & Site Naming
-- Adds contract tracking, stakeholder management, communication history, and project codes.
-- These tables feed report generation (remaining hours, target species, distribution list)
-- and client/internal dashboards (contract progress, KPI compliance, stakeholder visibility).
-- 2026-04-15
--
-- Schema count: 24 → 27 tables + 3 future (commented)
-- New: client_contracts, client_stakeholders, client_notes
-- Modified: sites (add project_code), site_name_lookup (add project_code)

-- ============================================================================
-- 1. Add project_code to sites table
-- Canonical site identifier shared with field team (e.g., "EBSF-B", "STR-01")
-- SC dropdown labels map to this via site_name_lookup
-- ============================================================================
ALTER TABLE sites ADD COLUMN project_code VARCHAR(20) UNIQUE;

COMMENT ON COLUMN sites.project_code IS 'Canonical project code (e.g. EBSF-B). Primary identifier shared with field team. SC labels resolve to this via site_name_lookup.';

-- ============================================================================
-- 2. client_contracts
-- Contract-level data per client/site. Feeds report generation (remaining hours,
-- target species), dashboard metrics (contract progress, payment status), and
-- scope baseline hydration.
-- ============================================================================
CREATE TABLE client_contracts (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id               uuid NOT NULL REFERENCES clients(id),
    site_id                 uuid REFERENCES sites(id),  -- nullable: some contracts cover multiple sites
    contract_name           varchar(255),
    contract_start_date     date,
    contract_end_date       date,
    total_contract_hours    decimal(10,2),  -- denominator for "remaining hours" tracking
    contract_value          decimal(12,2),
    payment_milestones      jsonb,          -- [{milestone: "Q1 report", amount: 5000, due_date: "2025-03-31", status: "paid"}]
    target_species          jsonb,          -- ["Madeira Vine", "African Lovegrass", "Lantana camara"]
    site_constraints        jsonb,          -- {buffer_zones: [{type: "waterway", distance_m: 10}], chemical_restrictions: ["no glyphosate near creek"]}
    required_kpis           jsonb,          -- [{kpi: "weed_density_reduction", target: "0-25%", timeframe: "12 months"}]
    scope_document_url      text,           -- link to original scope PDF/doc in Supabase Storage
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_contracts_client ON client_contracts(client_id);
CREATE INDEX idx_client_contracts_site ON client_contracts(site_id);

COMMENT ON TABLE client_contracts IS 'Contract-level data per client/site. Feeds report generation (remaining hours, target species), dashboard metrics (contract progress, payment status), and scope baseline hydration.';

-- ============================================================================
-- 3. client_stakeholders
-- Tracks committee members, funding body contacts, and other stakeholders
-- who receive or influence reports.
-- ============================================================================
CREATE TABLE client_stakeholders (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id               uuid NOT NULL REFERENCES clients(id),
    name                    varchar(255) NOT NULL,
    role                    varchar(255),           -- e.g., "BPA Committee Chair", "Council Project Manager"
    organization            varchar(255),           -- e.g., "Camden Council", "NSW Environmental Trust"
    contact_email           varchar(255),
    contact_phone           varchar(50),
    concerns_notes          text,                   -- key concerns or interests this stakeholder has
    receives_reports        boolean NOT NULL DEFAULT false,
    report_delivery_channel varchar(50),            -- email/dashboard/both (if receives_reports = true)
    is_primary_contact      boolean NOT NULL DEFAULT false,
    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_stakeholders_client ON client_stakeholders(client_id);

COMMENT ON TABLE client_stakeholders IS 'Stakeholder contacts per client. BPA committee members, council contacts, funding bodies. Drives report distribution (receives_reports) and stakeholder management notes.';

-- ============================================================================
-- 4. client_notes
-- Meeting notes, communication history, site visit observations.
-- Supports the CRM/stakeholder management layer (Stream 5 foundation).
-- ============================================================================
CREATE TABLE client_notes (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id               uuid NOT NULL REFERENCES clients(id),
    site_id                 uuid REFERENCES sites(id),  -- nullable: note may be client-level not site-level
    date                    date NOT NULL,
    note_type               varchar(50) NOT NULL,       -- meeting/call/email/site_visit/scope_change/general
    subject                 varchar(255),
    content                 text NOT NULL,
    author                  varchar(255),               -- who wrote the note (Cameron, Ryan, etc.)
    attachments             jsonb,                      -- [{filename: "meeting_notes.pdf", url: "..."}]
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_notes_client ON client_notes(client_id);
CREATE INDEX idx_client_notes_site ON client_notes(site_id);
CREATE INDEX idx_client_notes_date ON client_notes(date);

COMMENT ON TABLE client_notes IS 'Communication history and meeting notes per client/site. Supports stakeholder management and institutional knowledge capture (Stream 5).';

-- ============================================================================
-- 5. Add project_code to site_name_lookup for convenience
-- ============================================================================
ALTER TABLE site_name_lookup ADD COLUMN project_code VARCHAR(20);

COMMENT ON COLUMN site_name_lookup.project_code IS 'Denormalized project_code from sites table for quick lookup without join.';

-- ============================================================================
-- updated_at triggers for new tables
-- ============================================================================
CREATE TRIGGER trg_client_contracts_updated_at
    BEFORE UPDATE ON client_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_stakeholders_updated_at
    BEFORE UPDATE ON client_stakeholders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_notes_updated_at
    BEFORE UPDATE ON client_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- From migration: 003_sync_state.sql
-- ============================================================================
-- Constance Conservation — Sync State (WP3)
-- Tracks the high-water mark for scheduled sync polling.
-- One row per sync type (could extend to webhook state in future).
-- 2026-04-15

CREATE TABLE sync_state (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type       text NOT NULL UNIQUE,        -- 'scheduled_feed' or future types
    last_sync_at    timestamptz,                  -- last successful sync completion time
    last_modified_after timestamptz,              -- the modified_after value used in last run
    high_water_mark timestamptz,                  -- latest sc_modified_at seen across all inspections
    last_cursor     text,                         -- resume cursor if sync was interrupted
    total_synced    integer NOT NULL DEFAULT 0,   -- running total of inspections synced
    last_error      text,                         -- error from last run (null = clean)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed the initial row for scheduled feed sync
INSERT INTO sync_state (sync_type) VALUES ('scheduled_feed');

CREATE TRIGGER trg_sync_state_updated_at
    BEFORE UPDATE ON sync_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- From migration: 004_report_generation_additions.sql
-- ============================================================================
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


-- ============================================================================
-- From migration: 005_report_round2_additions.sql
-- ============================================================================
-- Constance Conservation — Report Generator Round 2 Fixes (E1)
-- Spec: docs/executor_briefs/E1_round2_fixes.md
-- 2026-04-23

-- clients: long display name + site pattern for broader CAR/DWR matching
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS long_name       text,
    ADD COLUMN IF NOT EXISTS site_id_pattern text;

-- Seed EBSF client
UPDATE clients
SET long_name       = 'Elderslie Banksia Scrub Forest',
    site_id_pattern = 'EBSF|Elderslie',
    contact_name    = COALESCE(NULLIF(contact_name, 'Camden Council'), contact_name),
    council_or_body = COALESCE(council_or_body, 'Camden Council')
WHERE name ILIKE 'EBSF%';

-- Fix the specific contact_name that was seeded wrong
UPDATE clients
SET contact_name = 'Steven Robertson'
WHERE name ILIKE 'EBSF%' AND (contact_name IS NULL OR contact_name = 'Camden Council');

-- Seed organization phone/email/address (address already exists but per spec use new one)
UPDATE organizations
SET address = '6/9 Samantha Place, Smeaton Grange NSW 2567',
    phone   = '02 4666 2006',
    email   = 'info@constanceconservation.com.au'
WHERE name = 'Constance Conservation';


-- ============================================================================
-- From migration: 006_site_hierarchy.sql
-- ============================================================================
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


-- ============================================================================
-- From migration: 007_schedule_and_site_long_name.sql
-- ============================================================================
-- Constance Conservation — Clients/Zones UI support (E4)
-- Spec: docs/executor_briefs/E4_clients_zones_ui.md
-- 2026-04-23
--
-- Adds per-row schedule configuration (no cron yet — stored only, read by a
-- future scheduler) and a display long_name on sites so the Site detail page
-- can separate the internal/SC label from the human-friendly name.
--
-- schedule_config shape: { cadence: 'off'|'weekly'|'monthly'|'quarterly',
--                           weekday?: 1..7, day_of_month?: 1..31 }

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS schedule_config jsonb,
    ADD COLUMN IF NOT EXISTS contact_phone   text;

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS schedule_config jsonb,
    ADD COLUMN IF NOT EXISTS long_name       text;


-- ============================================================================
-- From migration: 009_e6_client_data_cleanup.sql (schema-only portions)
-- Data-merge parts skipped — target is empty, source data already post-E6 clean
-- ============================================================================
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

