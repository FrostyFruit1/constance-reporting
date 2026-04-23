# CONSTANCE CONSERVATION — PROJECT MEMORY

## Current Phase
**Phase:** M03 — Report Generation **COMPLETE for EBSF pilot**. Next: ops handoff for real client roster, then M04 (review/send).
**Status:** Generator + hierarchy + cleanup all shipped. Dashboard supports Clients/Sites/Zones nav + draft review + inline edit + DOCX/PDF export + image uploads (Supabase Storage).
**Last Updated:** 2026-04-23
**Pilot:** EBSF validated end-to-end vs `EBSF Zone B C June Report.docx` ground-truth. LLM narratives real (Claude Sonnet 4.6).
**Distribution (future):** Resend (M04)

## M03 Landed Workstreams (2026-04-23)

| Brief | Commit | Summary |
|---|---|---|
| E1 round 1 | 38e4717 | Initial generator scaffold — HTML + DOCX + aggregation pipeline |
| E1 round 2 | bbf791f + 7838335 | Zones normalization, umbrella folding, CAR matching, cover block, LLM narrative validation, inline pill styling |
| E2 | 762084f | `sites.parent_site_id` hierarchy — client → site → zone |
| E4 | 46a8c48 | Clients/Sites/Zones management UI in dashboard-preview.html |
| E3 | 2122a47 | CLI scope flags (--client-id/--site-id/--zone-id), Download DOCX + Print-to-PDF, docx_url persistence |
| E5 | 2eed341 | Supabase Storage bucket + drag-drop image upload for §1.0 and §4.0 map slots |
| E6 | 0dd9a09 | Client data model cleanup — Camden/EBSF merge, orphan re-parenting, dupe dedup, parser bug fix, template retag |

Current DB state: 1 client (Camden Council), 1 EBSF top-level site, 8 nested zones, ~1,600 inspections ingested (2025-01 through 2026-04 + partial 2022-2024 legacy).

## Orchestration Handoff (2026-04-23 — end of session)

**If you are a fresh orchestrator picking this up, start here:**
**→ `docs/handoff/project_state_2026-04-23.md`**

That single doc covers: current state, shipped features, data counts, upcoming changes (Supabase migration, design refresh, parent-dashboard integration), the Supabase migration runbook (§6), file index, and task list.

Do NOT re-investigate the codebase before reading that snapshot. Everything you need to orient is in there. Only then fall back to other docs.

---

## Legacy handoff notes (pre-snapshot, kept for history)

**If you are a fresh orchestrator picking this up:**

- Peter is running a separate executor chat against `docs/executor_briefs/E1_report_generator.md`. Updated mid-stream to build in two milestones: (A) daily report template — one DWR → HTML+DOCX+PDF; (B) weekly/monthly aggregated report against EBSF June 2025.
- Executor will come back with a working generator or a specific unblock request. Expected questions they may ask:
  - `ANTHROPIC_API_KEY` — Peter will need to add to `.env`. Not yet present.
  - How to handle polygon `area_m2` (answer: leave as manual-edit placeholder, M03 does not compute).
  - Visual fidelity threshold for DOCX vs source (answer: structural match for v1; pixel match is M04+).
- Your job as orchestrator: wait for executor return, review output, reconcile against `docs/report_data_mapping.md`, write follow-up briefs as needed. Do NOT re-investigate the codebase — context has already been compacted into the mapping doc + executor brief.
- **Do not redo my work.** Every major decision is already documented — check MEMORY, `docs/report_data_mapping.md`, `docs/executor_briefs/E1_report_generator.md`, and `milestones/M01_ingestion_pipeline.md` before starting any new investigation.

**Critical path from Peter:** "Automate client report generation. Reverse-engineer the two example reports (`Daily Report WSPT Central.pdf` = daily input, `EBSF Zone B C June Report.docx` = monthly output target) into HTML-with-pills templates. Export to DOCX + PDF. Keep it simple. Move fast."

**Out of scope for now:** email delivery (Resend is M04), review UI (M04), polygon auto-compute (M02/M03 later), dashboard work (M05+).

**Current EBSF June 2025 data available in DB:**
- 4 Daily Work Reports (Zone B ×2, Zone C ×2, one "Zone B and C")
- 1 Chemical Application Record (Spring Farm EBSF)
- All `processing_status='completed'` — parser successfully extracted fields

**Open tasks you can own** (in priority order if executor is still running):
- #5 M01 closeout — DONE (this update)
- #10 Reparse sweep — not urgent; post-executor
- #11 Backfill retry + toolbox misclassification — not urgent; post-executor
- #3 Failed inspection investigation — 1 row; chase when quiet
- #4 Data integrity spot-check across child tables — good pre-review task
- #6 Scope M02 — wait until M03 pilot is validated

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
| M01 | Ingestion Pipeline | **COMPLETE** | M00 | Closed 2026-04-23. WP1-6 built. Backfill 2025-01 through 2026-04 ingested (1544 rows). Parser fixes applied. Deferred hygiene items tracked as tasks #10, #11. |
| M02 | Data Enrichment | NOT STARTED | M01 | AI vision, normalisation, confidence scoring. Gemini/Claude LLM narrative synthesis moved into M03. |
| M03 | Report Generation | **STARTING** | M01 | Auto-generate HTML (canonical) + DOCX + PDF matching client template. Pilot: EBSF weekly. Spec: `docs/report_data_mapping.md`. |
| M04 | Platform — Review & Send | NOT STARTED | M03 | In-platform draft review UI, image swapping, Resend send. Subsumes old "Client Dashboard" scope — reports are the primary UI surface. |
| M05 | Internal Dashboard | NOT STARTED | M01 | Business intelligence for Cameron/Ryan. Separate from report-review surface. |
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

### 2026-04-23 Session 2 (orchestrator — M01 closeout + M03 executor launched)
- **M01 CLOSED.** `milestones/M01_ingestion_pipeline.md` updated with closeout summary.
- **Parser fix applied** (task #7 complete). LABEL_VARIANTS extended for 'site name' (client / site, site conducted, prepared by, etc.). Extractor now uses `findItems` (plural) and iterates over matches preferring populated ones. Date falls back to `audit_data.date_completed`. Real DWR site-fill rate now 85% (was 69%); date-fill 100%. Tests pass 227/227.
- **Schema migration 004 applied** (task #8 complete). Added: `clients.location_maps`, `clients.active_roster_staff_ids`, `client_reports.{cadence, cover_hero_photo_url, period_map_images, narrative_sections, html_content, generated_at, zones_included}`. Via `exec_sql` RPC (param name is `query`).
- **Executor brief written**: `docs/executor_briefs/E1_report_generator.md`. Self-contained; references spec + sample files. Updated mid-flight: build Milestone A (single daily-report template) first, then Milestone B (monthly aggregation + LLM narratives).
- **Peter launched executor** in a separate chat. This orchestrator holds for return. Do not do parallel work that burns context.
- **Critical path confirmed with Peter**: reverse-engineer the two example reports → HTML with pills → DOCX + PDF export. Keep simple, move fast.
- **Scope trimmed**: 2025 full coverage is NOT required. EBSF June 2025 (5 inspections) is sufficient ground truth. Pre-2025 data retained as background context only.
- **Known data oddity**: 440 rows mis-tagged `sc_template_type='daily_work_report'` — they're actually "Record of toolbox" templates. `parseInspection` error-fallback returns 'daily_work_report' for unknown templates (src/parser/index.ts:103). Downstream filters can use `sc_raw_json.template_id` for now. Tracked in task #11.
- **Backfill reliability note**: scheduled_sync dies on transient `fetch failed` errors. A dozen rows failed at end. Retry = task #11.

### 2026-04-22 Session 1 (orchestrator — port to Peter's Mac + M03 kickoff)
- Project ported from previous machine. `.env` re-populated locally. `npm run build && npm test` green (227 tests pass).
- **Old backfill was stuck**: inserted zero new rows across 33 min of runtime. Cause suspected: dedup false-positives on the 683 rows it had already ingested; `sync_state.total_synced` never advanced past 0. Killed (PID 69203).
- **Relaunched targeted backfill**: `npm run sync:backfill -- --backfill-from 2025-01-01` (PID 8440, log `/tmp/sync-2025.log`). Ignored pre-2025 data — backfill had been oldest-first and was burning time on 2022-2023 rows we don't need for pilot.
- **Real cause of high needs_review rate exposed**: parser fails to link `site_id` on 65% of rows and `date` on 45%. NOT non-DWR template noise as earlier memory assumed. Item `type='site'` branch not handled in `daily_work_report.ts:101-120`. Tracked in task #7.
- **Parsing warnings not persisted** — `needs_review` is flagged but warnings only live in write-result logs. Triage requires either storing warnings or re-parsing. Schema addition tracked in task #8.
- **Reverse-engineered output report**: extracted full structure + content from `EBSF Zone B C June Report.docx` (5.2MB, 292 paragraphs). Confirmed `Daily Report WSPT Central.pdf` is INPUT-side (SC native export), not a client report.
- **Vision update — platform-native review & send**: Reports live in-platform. Ryan reviews/edits drafts, swaps images, tweaks narratives. Sends natively via Resend (replaces SMTP/Graph API). Dashboard gets a "Reports" tab as the main UI surface. Defers the standalone M04/M05 dashboard scope.
- **New canonical mapping doc**: `docs/report_data_mapping.md` — section-by-section field mapping (cover, §1-§8, TOC), naming conventions (weekly/monthly), LLM prompt shape for §2 narrative synthesis, data-availability gap list, validation procedure against June 2025 EBSF DOCX.
- **Zones already modelled as separate sites** in schema: `EBSF Zone B` (id `dcd9b90a...`), `EBSF Zone D` (id `c8080033...`). No schema change needed for zone split.
- **Schema additions needed** for report generation: `clients.location_maps`, `clients.active_roster_staff_ids`, `client_reports.period_map_images`, verify/add `inspection_polygons` and `chemical_application_record_details.rate_ml_per_l`. Task #8.
- **Current backfill coverage (2025-04-22 20:38 local)**: 875 total rows, 50 from 2025+, 4 EBSF (Zone B ×2, Zone D ×2, Jan-Apr 2025). Backfill at ~2025-05, ETA June 2025 window in ~10 min at current rate.
- **Next build target**: report generator scaffold per `docs/report_data_mapping.md`. Blocked on tasks #7 (parser fix) + #8 (schema additions). Tracked as task #9.
- **Orchestrator/executor split**: Peter orchestrates through this chat; executor chats will pick up tasks #7, #8, #9 once briefs are finalized.

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
