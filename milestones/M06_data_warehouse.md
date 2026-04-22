# M06: Data Warehouse & Future Streams Schema

## Objective
Deploy the data warehouse tables and materialised views that enable Streams 2-6. This milestone builds the storage and query layer — not the ingestion pipelines for each stream. Each stream's ingestion/processing gets its own sub-milestone once the warehouse schema is live.

This milestone should be started when Stream 1 has accumulated 3-6 months of data (enough for treatment effectiveness analysis to be meaningful).

## Prerequisites
- M03 (Report Generation) complete — confirms Stream 1 data is flowing reliably
- At least 3 months of inspection data in Supabase
- Safety Culture template changes actioned for Streams 2-4 (see data_streams_spec.md)

## Deliverables

### Stream 2: Treatment Effectiveness
- [ ] `treatment_outcomes` table — links return visits to previous treatments with effectiveness rating
- [ ] `treatment_analysis` materialised view — aggregates chemical x species x method x season effectiveness
- [ ] Indexes on `report_entries` for site + species + chemical + date range queries
- [ ] Backfill script: identify overlapping site visits in existing data and flag for supervisor review

### Stream 3: Crew & Equipment Intelligence
- [ ] `staff_profiles` table — capability tags, certifications, site-type suitability
- [ ] `equipment_inventory` table — per-vehicle equipment tracking
- [ ] `equipment_usage` table — links equipment to tasks/reports
- [ ] Productivity metrics view: hours per m2 by staff member by task type (derived from `crew_hours` + `report_entries`)

### Stream 4: Ecological Knowledge Base
- [ ] `species_knowledge` table — confirmed IDs, photos, taxonomy, seasonal behaviour
- [ ] `planting_records` table — species planted, quantity, location, conditions
- [ ] `planting_assessments` table — follow-up survival checks at 30/60/90 days
- [ ] `seasonal_calendar` materialised view — species observation frequency by month
- [ ] `chemical_interactions` table — known synergistic/antagonistic combinations

### Stream 5: Stakeholder & Contract Intelligence
- [ ] `stakeholders` table — committee members, roles, organisations
- [ ] `meetings` table — notes, attendees, action items, transcription support
- [ ] `contracts` table — per-client terms, KPIs, reporting requirements, funding milestones
- [ ] `communications` table — client interaction log
- [ ] Extend `clients` table with contract and stakeholder references

### Stream 6: Environmental & Predictive Data
- [ ] `weather_data` table — daily weather per site
- [ ] `satellite_imagery` table — vegetation index snapshots per site
- [ ] `regulatory_updates` table — chemical and environmental compliance changes
- [ ] `predictive_models` table — model outputs, recommendations, confidence scores

## Acceptance Criteria
- [ ] All tables deployed to Supabase with appropriate indexes and constraints
- [ ] Materialised views refresh on schedule (daily or weekly depending on data volume)
- [ ] RLS policies configured for all new tables
- [ ] Test queries confirm Stream 2 treatment effectiveness analysis works against existing Stream 1 data
- [ ] Migration is non-destructive — zero impact on M00-M05 tables and pipelines

## Dependencies
- M03 complete (Stream 1 pipeline proven reliable)
- 3-6 months of accumulated inspection data
- Safety Culture template changes for Streams 2, 3, 4 actioned by Cameron/Ryan

## Build Order
1. Stream 2 tables (highest value — treatment effectiveness is the data moat)
2. Stream 3 tables (crew/equipment — quick win from existing data)
3. Stream 4 tables (ecological knowledge — builds on Stream 2)
4. Stream 5 tables (CRM layer — independent, can be built in parallel)
5. Stream 6 tables (external APIs — longest lead time for integrations)

## Files to Create
- `supabase/migrations/XXX_data_warehouse_stream2.sql`
- `supabase/migrations/XXX_data_warehouse_stream3.sql`
- `supabase/migrations/XXX_data_warehouse_stream4.sql`
- `supabase/migrations/XXX_data_warehouse_stream5.sql`
- `supabase/migrations/XXX_data_warehouse_stream6.sql`
- `docs/warehouse_schema_erd.md` — entity relationship diagram for warehouse tables

## Notes
- Each stream's migration is a separate file so they can be deployed independently
- Stream ingestion pipelines (the actual data processing for each stream) are scoped as separate milestones (M07+) once the warehouse schema is live
- The warehouse schema is designed to query against existing M00-M05 tables — it extends, never modifies, the core schema
