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
