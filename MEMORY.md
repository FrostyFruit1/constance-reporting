# CONSTANCE CONSERVATION — PROJECT MEMORY

## Current Phase
**Phase:** M00 — Foundation & API Testing
**Status:** COMPLETE
**Last Updated:** 2026-04-15

## Project Overview
Data automation platform for ecological land management business. Ingests Safety Culture inspection data, enriches with AI, generates automated client reports, delivers dashboards.

## Key Stakeholders
- **Cameron** — Owner/Director (sales, strategy, tenders)
- **Ryan** — Operations Manager (quotes, rosters, reporting — primary beneficiary of automation)
- **Frosty** — Development lead (Resonance Labs)

## Tech Stack
- **Ingestion:** Safety Culture API (webhooks + scheduled sync)
- **Storage:** Supabase (PostgreSQL + Storage for media)
- **AI Enrichment:** Gemini (vision analysis — species ID, before/after scoring)
- **Report Generation:** Templated PDF + DOCX
- **Distribution:** Microsoft Graph API / SMTP
- **Dashboards:** React + Supabase real-time
- **Backend hosting:** TBD after API testing (Railway vs Supabase Edge Functions vs n8n)

## Milestones
| # | Milestone | Status | Dependencies | Notes |
|---|-----------|--------|--------------|-------|
| M00 | Foundation & API Testing | **COMPLETE** | - | API validated, schema v2 deployed (27 tables), report template analysed, gap analysis done |
| M01 | Ingestion Pipeline | **IN PROGRESS** | M00 | WP1-6 complete. Backfill partially done (~196/1,683). Resume with `npm run sync:backfill`. |
| M02 | Data Enrichment | NOT STARTED | M01 | AI vision, normalisation, confidence scoring |
| M03 | Report Generation | NOT STARTED | M02 | Auto-generate PDF/DOCX matching client template |
| M04 | Client Dashboard | NOT STARTED | M01 | React frontend, per-client views |
| M05 | Internal Dashboard | NOT STARTED | M01 | Business intelligence for Cameron/Ryan |
| M06 | Data Warehouse & Future Streams | NOT STARTED | M03 + 3-6mo data | Streams 2-6 schema, materialised views, warehouse tables |

## Locked Features
| Feature | Files | Locked Date | Notes |
|---------|-------|-------------|-------|
| (none yet) | | | |

## Current Tasks (M00)
- [x] Configure Safety Culture API access and authentication
- [x] Pull 3-5 sample inspection JSONs across job types
- [x] Diff and analyse sample JSONs: map consistent vs. variable fields
- [x] Create field mapping document (docs/field_mapping.md)
- [x] Create data quality notes document (docs/data_quality_notes.md)
- [x] Design initial schema based on actual API data (supabase/migrations/001_initial_schema.sql)
- [x] Schema v2 redesigned — multi-tenant, separated inspections/reports, report generation tables
- [x] Client report template analysed — 2 variants identified (docs/client_report_template.md)
- [x] Gap analysis complete — report sections mapped to SC data + schema (docs/gap_analysis.md)
- [x] Density/polygon workflow documented (docs/density_polygon_model.md)
- [x] Ingestion architecture documented (docs/ingestion_architecture.md)
- [x] Report generation pipeline documented (docs/report_generation_pipeline.md)
- [x] Data shape summary tables added to field mapping
- [x] Additional data quality findings appended (9f cross-template chemical normalization, etc.)
- [ ] Finalise field mapping (transformation rules for each field)
- [ ] Create Supabase project and deploy schema
- [ ] Set up development environment and project repository

## Open Decisions
| Decision Needed | Options | Status |
|-----------------|---------|--------|
| Backend hosting | Railway / Supabase Edge Functions / n8n | Deferred to after API testing |
| Schema shape for report_entries | Single flexible table vs. per-work-type tables | **RESOLVED: Single table.** SC uses ONE template with multi-select tasks, not per-type inspections. |
| Chemical rate parsing | Raw text vs structured extraction | **RESOLVED: Store raw text.** Format too inconsistent for structured parsing without LLM. |
| Site name dedup | Normalise in-place vs alias table | **RESOLVED: Both.** Normalise + site_aliases table for known typos. |

## Session Notes
### 2026-04-15 Session 1
- Project brief reviewed and foundation docs created (SOUL, PRINCIPLES, POLICIES, MEMORY)
- Milestone scope docs created for M00
- Safety Culture API ping confirmed working
- 6 data streams reviewed and documented (docs/data_streams_spec.md)
- DECISION: M00-M05 schema stays lean (Stream 1 only). Streams 2-6 warehouse tables scoped as M06.
- M06 milestone scope created with per-stream deliverables and build order
- Foundation docs ready to drop into Claude Code repo for execution

### 2026-04-15 Session 2 (Claude Code)
- API authenticated, org ID discovered: role_775367e3fb5f4686b1cd1160ed8d818e
- 1,680 inspections in the account (4 templates: Daily Work Report x50, Record of toolbox x45, Chemical Application Record x3, OSHA Toolbox Talk x2 — in 2025 alone)
- **CRITICAL FINDING: No per-job-type templates.** ONE "Daily Work Report" template covers all work types via multi-select "Tasks Undertaken" field
- **CRITICAL FINDING: Template has evolved** — same template_id but structure changed (Site Name: list→text, new fields added, Planting section removed, labels corrected)
- 5 sample JSONs pulled and saved to samples/
- Field mapping document created (docs/field_mapping.md — 426 lines, 11 tables mapped)
- Data quality notes created (docs/data_quality_notes.md — 8 issues catalogued with severity)
- Initial schema SQL designed and written (supabase/migrations/001_initial_schema.sql)
- Schema seeded with known chemicals (7) and weed species (24) from SC template
- Client report template analysed: 2 variants (bush_regen_weed_management + restoration_planting)
- Gap analysis complete: ~75% automatable, 25% is polygon maps + zone hour splits + chemical-species linking
- Schema v2 deployed covering all report generation requirements (24 tables total)
- DECISION: No additional schema tables needed. All report gaps are data-entry or LLM problems, not schema problems.
- Next: Create Supabase project, deploy schema, test inserts, scaffold repo → close M00

### 2026-04-15 Session 4 (Claude Code — M01 Execution)
- M01 WP1-WP4 completed in prior agent sessions (parser, DB writer, scheduled sync, webhook handler)
- WP5 (media pipeline) and WP6 (seed data) completed by parallel agents
- Test data cleaned up, onboarding seed run: 1 org, 12 staff, 22 sites, 23 site_name_lookups, 1 client
- Bug fix: SC API feed returns `id` not `audit_id` — FeedInspectionEntry interface updated
- exec_sql RPC function created for permanent HTTPS-based DDL access (bypasses IPv6 issue)
- sync_state table created
- Historical backfill started: ~1,683 inspections processing at ~3s each (~85min)
- Early results: 2021 toolbox talks coming in as needs_review (expected for non-DWR templates)
- INFRASTRUCTURE NOTE: Direct DB connection is IPv6-only and unreachable. All SQL via exec_sql RPC or Supabase REST API. Pooler shows "tenant not found" despite being enabled.
- exec_sql RPC function created — permanent HTTPS-based DDL bridge. Can create/alter tables from Claude Code.
- Dashboard preview built: single-file HTML (dashboard-preview.html) with 8 pages pulling live Supabase data
- Design system documented (docs/DESIGN_SYSTEM.md) — adapted from wellness platform, earthy tokens, Tailwind v4
- Backfill was running when session ended (~196 of 1,683 processed). Status: 47 completed, 148 needs_review, 1 processing.
- **RESUME BACKFILL**: The backfill agent may have stopped. Check inspections count and run `npm run build && npm run sync:backfill` to continue. The sync uses high-water mark so it picks up where it left off.
- Next: Complete backfill, verify data, then scope M04/M05 dashboard build using the design system and dashboard-preview as the prototype reference.

### 2026-04-15 Session 3 (Claude Code — Brief v1.1)
- Applied project brief update v1.1 (8 updates consolidated from API analysis + client report analysis + density/polygon discovery)
- Schema rewritten: 001_initial_schema.sql now has 24 tables + 3 future (commented), multi-tenant with organization_id
- New tables: organizations, site_scope_baselines, inspection_*, chemical_application_*, client_reports, report_weed_works, report_herbicide_summary, report_staff_summary, species_lookup, chemical_lookup, site_name_lookup
- Enum types added: density_band, report_status, processing_status, media_type, observation_type, species_category, chemical_type
- 4 new architecture docs created: ingestion_architecture.md, client_report_template.md, density_polygon_model.md, report_generation_pipeline.md
- Field mapping updated with data shape summary tables (Daily Work Report + Chemical Application Record field inventories)
- Data quality notes updated with 6 additional findings (hours parsing, weed % ranges, chemical rate parsing, time parsing, site name mismatches, cross-template chemical normalization)
- M00 milestone updated (unblocked report template task, new deliverables added)
- Key architecture decisions documented: client profiles as config layer, inspection processing separated from report assembly, 4-phase polygon automation path, review/approval workflow (draft→review→approved→sent)
- Next: Finalise field mapping transformation rules, create Supabase project, deploy schema → close M00
