# Constance Conservation — Data Streams Specification

## Overview

The platform captures six data streams. Stream 1 is the foundation (M00-M05 scope). Streams 2-6 are future builds that derive from or extend Stream 1 data. All streams are documented here so schema decisions in the current build don't create migration pain later.

---

## Stream 1: Automated Extraction (ACTIVE — In Build)

**Status:** M00-M05 scope
**Source:** Safety Culture Daily Work Reports + Chemical Application Records via API
**Human input required:** None — runs on data field staff already enter

### Data Captured
- Site, date, crew, hours, tasks performed
- Chemicals used: name, rate, volume, application method
- Species targeted
- Weed removal percentage
- Before/after photos with GPS coordinates
- Site area maps
- Erosion works
- Fauna/flora observations
- Areas of concern
- Future works notes

### Schema Impact
This is the core schema (v2): `organizations`, `clients`, `sites`, `staff`, `site_scope_baselines`, `inspections`, `inspection_personnel`, `inspection_tasks`, `inspection_weeds`, `inspection_chemicals`, `inspection_media`, `inspection_observations`, `inspection_metadata`, `chemical_application_records`, `chemical_application_items`, `chemical_application_operators`, `chemical_application_additives`, `client_reports`, `report_weed_works`, `report_herbicide_summary`, `report_staff_summary`, `species_lookup`, `chemical_lookup`, `site_name_lookup`. All designed in M00.

---

## Stream 2: Treatment Effectiveness Tracking

**Status:** Future — Post M03 (needs 3-6 months of Stream 1 data accumulation)
**Dependency:** Stream 1 data + minor Safety Culture template change
**Earliest start:** Post Milestone 3

### Purpose
Build a dataset of what actually works — which treatments on which species in which conditions produce the best results.

### Data Points
- Chemical x species x method combinations and observed effectiveness
- Retreatment frequency per site/species (how often crews return to same area for same species)
- Before/after photo comparison scores over time (AI-derived from Stream 1 photos)
- Seasonal effectiveness variation (same treatment, different season, different result)
- Soil type / site type impact on treatment success

### Collection Method
Primarily derived from Stream 1 data over time. When the same site is visited repeatedly, the system compares current weed presence against previous treatment records.

Supplemented by a "treatment outcome" field added to Safety Culture template — supervisor rates previous treatment effectiveness on return visit: effective / partial / ineffective.

### Safety Culture Template Change Required
Add a "return visit assessment" section that asks supervisors to rate effectiveness of previous treatments when they revisit a site.

### Schema Impact (M06)
- `treatment_outcomes` table — links current visit to previous treatment records with effectiveness rating
- `treatment_analysis` materialised view — aggregates chemical x species x method x season effectiveness scores
- Queries against existing `inspection_chemicals`, `inspection_weeds`, `inspection_tasks` tables by site + species + date range

### Key Design Consideration
The existing `inspection_tasks` and `inspection_chemicals` tables must support querying historical treatments by `site_id` + species + chemical + date range without restructuring. This is handled by the foreign key anchors in the v2 schema (site_id on inspections, species in inspection_weeds, chemicals in inspection_chemicals).

---

## Stream 3: Crew & Equipment Intelligence

**Status:** Future — Post M01
**Dependency:** Stream 1 data + minor Safety Culture template changes
**Earliest start:** Post Milestone 1

### Purpose
Build staff capability profiles and equipment optimisation data without requiring subjective assessments.

### Data Points
- Staff productivity by task type — hours per m2 for each work category, per person (derived from Stream 1)
- Staff task frequency — who gets assigned to what most often (proxy for skill/preference)
- Equipment-to-task mapping — which tools used for which jobs, most efficient combinations
- Equipment availability per vehicle — what's loaded on each truck, what's flagged as missing/unavailable
- Incident correlation — do certain equipment/staff/condition combinations produce more incidents

### Collection Method
Mostly derived from Stream 1 crew hours and task data. Equipment tracking requires either a new Safety Culture checklist (truck loadout check) or a simple pre-start logging enhancement.

Staff preferences and sensitive site suitability require a lightweight HR/capability layer — staff profile table with tags that supervisors or Ryan maintain.

### Safety Culture Template Change Required
Add equipment inventory tracking per vehicle (daily pre-start checklist or separate simple app).

### Schema Impact (M06)
- `staff_profiles` table — capability tags, certifications, site-type suitability ratings
- `equipment_inventory` table — per-vehicle equipment tracking
- `equipment_usage` table — links equipment to tasks/reports
- Productivity metrics derived from existing `inspection_personnel` + `inspection_tasks` tables

---

## Stream 4: Ecological Knowledge Base

**Status:** Future — Post M03
**Dependency:** Stream 1 + Stream 2 + planting section live in Safety Culture
**Earliest start:** Post Milestone 3

### Purpose
Capture institutional knowledge about species, seasons, and site ecology that currently lives in experienced staff heads.

### Data Points
- Species identification database — photos + confirmed IDs, building a training set for vision AI
- Seasonal species calendar — when specific weeds germinate, flower, seed (derived from observation frequency across seasons)
- Planting success tracking — what was planted, survival rate at 30/60/90 days, conditions correlating with success/failure
- Chemical interaction effects — which chemicals impact seeding success, synergistic or antagonistic combinations
- Site-specific ecology notes — riparian vs bushland vs scrub forest treatment differences, indicator species

### Collection Method
- Seasonal calendar and species frequency: derived from Stream 1 — aggregate weed sightings by month across all sites
- Planting success: requires follow-up data capture (return visit assessment, as in Stream 2)
- Chemical interaction data: derived by correlating Stream 1 chemical records with Stream 2 effectiveness
- Site ecology notes: knowledge capture interface — structured notes field in Safety Culture or separate knowledge base

### Safety Culture Template Change Required
When Planting section goes live, capture: species planted, quantity, location, and conditions. Follow-up assessment mechanism for planting survival checks at defined intervals.

### Schema Impact (M06)
- `species_knowledge` table — confirmed IDs, photos, taxonomy, seasonal behaviour
- `planting_records` table — species planted, quantity, location, conditions, linked to site
- `planting_assessments` table — follow-up survival checks at 30/60/90 days
- `seasonal_calendar` materialised view — aggregated species observation frequency by month
- `chemical_interactions` table — known synergistic/antagonistic combinations

---

## Stream 5: Stakeholder & Contract Intelligence

**Status:** Future — Independent CRM build
**Dependency:** Independent (no Stream 1 dependency)
**Earliest start:** Post Milestone 5

### Purpose
Track client relationships, funding body requirements, committee dynamics, and contract compliance.

### Data Points
- BPA committee membership and roles — funding providers, committee members, concerns
- Meeting notes aggregation — site meetings, committee meetings, client check-ins
- Contract requirements per client — reporting frequency, specific KPIs, compliance requirements
- Funding milestone tracking — deliverables that trigger payment, evidence required
- Client communication history — queries, complaints, requests, response times

### Collection Method
CRM/project management layer, not a field data layer. Structured input from Cameron and Ryan — meeting notes (voice-to-text transcribed and parsed), contract details entered once and maintained, committee member profiles.

This is the furthest from Safety Culture workflow — likely a separate interface in the dashboard.

### Schema Impact (M06)
- `stakeholders` table — committee members, roles, organisations, concerns
- `meetings` table — meeting notes, attendees, action items, transcription
- `contracts` table — per-client contract terms, KPIs, reporting requirements, funding milestones
- `communications` table — client interaction log
- Extends existing `clients` table with contract and stakeholder references

---

## Stream 6: Environmental & Predictive Data

**Status:** Future — External API integrations
**Dependency:** Stream 1 + external API integrations
**Earliest start:** Post Milestone 5

### Purpose
Overlay external data sources to enable predictive recommendations.

### Data Points
- Weather data per site per day (historical + forecast) — correlate with treatment effectiveness
- Rainfall patterns — predict weed growth windows, optimal spray timing
- Temperature and humidity trends — correlate with chemical effectiveness and crew productivity
- Satellite/aerial imagery — site-level vegetation change detection (future drone integration)
- Regulatory updates — chemical approvals/bans, environmental compliance changes

### Collection Method
External API integrations — entirely automated, no human input required:
- Bureau of Meteorology (BOM) for weather
- Satellite imagery providers for vegetation monitoring
- Regulatory databases for compliance updates

### Schema Impact (M06)
- `weather_data` table — daily weather per site (temperature, rainfall, humidity, wind)
- `satellite_imagery` table — vegetation index snapshots per site over time
- `regulatory_updates` table — chemical and environmental compliance changes
- `predictive_models` table — model outputs, recommendations, confidence scores

---

## Stream Priority & Dependencies Summary

| Stream | Dependency | Earliest Start | Value |
|--------|-----------|----------------|-------|
| Stream 1 | None — in build | Now | Foundation for everything |
| Stream 2 | Stream 1 data accumulation (3-6 months) | Post M03 | Treatment optimisation, predictive maintenance |
| Stream 3 | Stream 1 data + minor SC template changes | Post M01 | Crew optimisation, equipment logistics |
| Stream 4 | Stream 1 + Stream 2 + planting section live | Post M03 | Ecological database, species AI training |
| Stream 5 | Independent — CRM build | Post M05 | Client retention, contract compliance |
| Stream 6 | Stream 1 + external API integrations | Post M05 | Predictive services, drone integration |

---

## Safety Culture Template Changes Summary

These are changes Cameron/Ryan need to action in Safety Culture when the relevant stream is ready to build:

| Stream | Template Change | When Needed |
|--------|----------------|-------------|
| Stream 2 | Add "return visit assessment" section — rate previous treatment effectiveness | Before M06 Stream 2 build |
| Stream 3 | Add equipment inventory tracking per vehicle (pre-start checklist) | Before M06 Stream 3 build |
| Stream 4 | Add planting section: species, quantity, location, conditions | Before M06 Stream 4 build |
| Stream 5 | None — separate interface | N/A |
| Stream 6 | None — external APIs | N/A |
