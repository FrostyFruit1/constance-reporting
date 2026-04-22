# M00: Foundation & API Testing

## Objective
Validate the Safety Culture API, understand the actual data shape of inspection JSONs, create the field mapping from Safety Culture → canonical schema, and deploy the initial Supabase schema. This milestone produces no automation — it produces *knowledge* that every subsequent milestone depends on.

## Status: COMPLETE

## Deliverables

- [x] Safety Culture API access configured and authenticated
- [x] 5 sample inspection JSONs retrieved (4 Daily Work Reports + 1 Chemical Application Record)
- [x] Field mapping document: Safety Culture fields → canonical schema (`docs/field_mapping.md`)
- [x] Sample inspection JSON diff analysis — consistent vs. variable fields documented
- [x] Data quality issues catalogued (`docs/data_quality_notes.md`)
- [x] Initial Supabase schema designed from actual data (`supabase/migrations/001_initial_schema.sql`)
- [x] Schema v2 redesigned after report template analysis — multi-tenant, separated inspections from reports, report generation tables
- [x] Client report template analysed and output format spec created (`docs/report_template_spec.md`)
- [x] Gap analysis: report sections → SC data → schema (`docs/gap_analysis.md`)
- [x] Supabase project created and schema deployed (27 tables, 24 species, 7 chemicals seeded)
- [x] Development environment set up (npm, pg, @supabase/supabase-js, Supabase CLI)

## Acceptance Criteria

- [x] Can authenticate and make GET requests to Safety Culture API
- [x] Have at least 3 real inspection JSONs saved locally for reference (have 5)
- [x] Field mapping covers all fields needed for all inspection and report generation tables
- [x] Schema handles nullable fields and known data quality issues (inconsistent spelling, missing fields)
- [x] Client report template sections mapped to SC data sources with automation readiness assessed
- [x] Gap analysis identifies all manual inputs required (polygon maps, zone hours, chemical-species linking)
- [ ] Schema deployed to Supabase and verified with test inserts

## Critical Findings (from API testing)

### 1. No per-job-type templates
The project brief assumed separate inspection templates for spray, clearing, planting, maintenance. **Reality: ONE "Daily Work Report" template** (template_f0eb0c0c58d24ce6bd21ab671f200a69) covers all work types via a multi-select "Tasks Undertaken" field.

**Impact:** Schema uses a single `reports` table with a `report_entries` junction table (one row per task), not per-type tables.

### 2. Template has evolved over time
Same template_id, but structure changed between early 2025 and late 2025+:

| Change | Early 2025 | Late 2025+ |
|--------|-----------|------------|
| Site Name | `list` (dropdown) | `text` (free text) |
| Prepared by/Supervisor | `question` | `list` |
| Address field | Not present | Added |
| Planting section | "Coming Soon" placeholder | Removed |
| Erosion Works field | Present | Removed |
| Area of Concerns | Minimal | Expanded with address, location |
| Team performance | Not present | Slider + MVP of the day |
| Label spelling | "Discription" | "Description" |

**Impact:** Pipeline must branch on field type, tolerate missing fields, and detect template version.

### 3. Chemical data is unstructured
Herbicide rates/volumes are free text with no consistent format across reports:
- `"Starane 6ml/L: 60ml - 10L sprayed."`
- `"8, 10L packs sprayed.\n\nGrazon rate: 6ml per 1L"`

**Impact:** Chemical rates stored as raw text. Structured extraction deferred to LLM enrichment (M02).

### 4. Separate Chemical Application Record
A second template (only 3 records in 2025) captures detailed chemical application data with positional line-matching across parallel free-text fields. Low volume but regulatory compliance value.

### 5. New staff and role accounts
2026 data shows new authors: "Regen Manager" (role account), "Reece Morgan", "Suzie Kiloh", "Josh Collins", "Madeline Sharpe". Staff list is growing.

## API Discovery

```
Org ID:         role_775367e3fb5f4686b1cd1160ed8d818e
Total records:  ~1,680 inspections
Primary author: Ryan Arford (owner_id: user_3ff0fb77a5cf4c758136bd1663fa3e06)
```

### Templates in use (2025):
| Count | Template | Template ID |
|-------|----------|-------------|
| 50 | Daily Work Report | template_f0eb0c0c58d24ce6bd21ab671f200a69 |
| 45 | Record of toolbox | template_cab3db5d249648e4be1dee30cd28c806 |
| 3 | Chemical Application Record | (separate template_id) |
| 2 | OSHA Toolbox Talk: Chemical Safety | (separate template_id) |

### Key API endpoints confirmed working:
```
GET /feed/inspections?limit=N&modified_after=DATE  — paginated inspection list
GET /audits/{audit_id}                              — full inspection JSON
```

## Schema Summary (24 tables + 3 future)

### Core Tables
| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant top level |
| `clients` | Client profiles with scope and reporting config |
| `sites` | Work locations with zone support |
| `staff` | Crew members |
| `site_scope_baselines` | Initial scope assessments per site/zone |

### Lookup / Normalization Tables
| Table | Purpose |
|-------|---------|
| `species_lookup` | Canonical species names (24 seeded) |
| `chemical_lookup` | Canonical chemical names (7 seeded) |
| `site_name_lookup` | Maps SC labels to canonical sites |

### Inspection Tables (Raw Ingestion)
| Table | Purpose | Rows per inspection |
|-------|---------|-------------------|
| `inspections` | One row per SC submission (sc_audit_id dedup) | 1 |
| `inspection_personnel` | Staff assigned with hours | 1-8 |
| `inspection_tasks` | Selected tasks from multi-select | 1-5 |
| `inspection_weeds` | Species targeted | 0-11 |
| `inspection_chemicals` | Chemicals from Daily Work Report | 0-7 |
| `inspection_media` | Photos and maps | 0-12+ |
| `inspection_observations` | Fauna/flora sightings (conditional) | 0-2 |
| `inspection_metadata` | Remaining fields | 1 |

### Chemical Application Record Tables
| Table | Purpose |
|-------|---------|
| `chemical_application_records` | Detailed compliance records |
| `chemical_application_items` | Individual chemicals per record |
| `chemical_application_operators` | Staff who applied |
| `chemical_application_additives` | Wetters and dyes |

### Report Generation Tables
| Table | Purpose |
|-------|---------|
| `client_reports` | Generated monthly reports with review workflow |
| `report_weed_works` | Weed works table rows (partially auto-populated) |
| `report_herbicide_summary` | Aggregated chemical data |
| `report_staff_summary` | Aggregated staff hours |

## Report Template Analysis Summary

Two report variants identified:
- **bush_regen_weed_management** — zone-based, weed works table, bird sightings, herbicide detail
- **restoration_planting** — activity-based (brush matting, watering), planting works table, future works, site photos

**Automation readiness: ~75%.** The remaining 25% is:
- Polygon maps (biggest recurring manual effort per report)
- Polygon area density (m2) — requires GIS/Google Earth
- Per-weed-area hour allocation — SC captures total only
- Chemical → target species linking — LLM inference or manual
- Zone-level hour splits — SC doesn't capture zone breakdown

**Schema v2 covers all requirements.** No additional tables needed.

## Files Created

| File | Description |
|------|-------------|
| `samples/daily_work_report_2025_jan_hinchinbrook.json` | Early 2025 sample (list-type Site Name) |
| `samples/daily_work_report_2025_erosion_control.json` | Mid-2025 sample (erosion control site) |
| `samples/daily_work_report_2026_regen_manager.json` | 2026 sample (Regen Manager author) |
| `samples/daily_work_report_2026_reece_morgan.json` | 2026 sample (new staff, expanded template) |
| `samples/chemical_application_2025.json` | Chemical Application Record sample |
| `docs/field_mapping.md` | SC field → Supabase schema mapping with data shape summary |
| `docs/data_quality_notes.md` | 9 data quality issues with severity ratings |
| `docs/ingestion_architecture.md` | Dual-path ingestion architecture (webhook + sync) |
| `docs/client_report_template.md` | Client report template structure (fixed + variable sections) |
| `docs/density_polygon_model.md` | Density tracking and polygon automation path (4 phases) |
| `docs/report_generation_pipeline.md` | Report generation pipeline and review workflow |
| `docs/report_template_spec.md` | Client report output format spec (2 variants) |
| `docs/gap_analysis.md` | Report section → SC data → schema gap analysis |
| `supabase/migrations/001_initial_schema.sql` | Schema v2 — 24 tables, multi-tenant, report generation |

## Remaining Work

1. **Supabase project creation** — can proceed independently
2. **Schema deployment + test inserts** — depends on Supabase project
3. **Repo scaffolding** — git init, package.json, project structure
