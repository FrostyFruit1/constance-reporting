# Constance Conservation — Active Scope

## Current Milestone: M00 — Foundation & API Testing
**Status:** IN PROGRESS (80% complete)
**Detailed scope:** [milestones/M00_foundation_api_testing.md](milestones/M00_foundation_api_testing.md)

## Milestone Index

| # | Milestone | Status | Scope Doc |
|---|-----------|--------|-----------|
| M00 | Foundation & API Testing | **IN PROGRESS** | [M00](milestones/M00_foundation_api_testing.md) |
| M01 | Ingestion Pipeline | NOT STARTED | — |
| M02 | Data Enrichment | NOT STARTED | — |
| M03 | Report Generation | NOT STARTED | — |
| M04 | Client Dashboard | NOT STARTED | — |
| M05 | Internal Dashboard | NOT STARTED | �� |
| M06 | Data Warehouse & Future Streams | NOT STARTED | [M06](milestones/M06_data_warehouse.md) |

## Reference Docs
- [Data Streams Spec](data_streams_spec.md) — All 6 data streams documented
- [Ingestion Architecture](docs/ingestion_architecture.md) — Dual-path ingestion (webhook + sync)
- [Field Mapping](docs/field_mapping.md) — Safety Culture → Supabase schema mapping with data shape summary
- [Data Quality Notes](docs/data_quality_notes.md) — Known data quality issues (9 catalogued)
- [Client Report Template](docs/client_report_template.md) — Report sections, data sources, template variants
- [Density & Polygon Model](docs/density_polygon_model.md) — Density bands, polygon workflow, 4-phase automation
- [Report Generation Pipeline](docs/report_generation_pipeline.md) — Pipeline architecture, review workflow, automation maturity
- [Schema Migration](supabase/migrations/001_initial_schema.sql) — Schema v2 (24 tables, multi-tenant)
