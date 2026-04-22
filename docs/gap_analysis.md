# Gap Analysis: Report Template → Safety Culture Data → Schema

> Maps every section of the client report to: what SC provides, what the schema stores, and what's missing.
>
> Last updated: 2026-04-15

---

## How to read this document

For each report section:
- **SC Source** — where the raw data comes from in Safety Culture
- **Schema Table** — where it lands in Supabase
- **Auto-fill %** — how much can be populated without human input
- **Gap** — what's missing or needs manual input
- **Resolution** — how/when the gap gets closed

---

## Cover Page

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Title | `sites.name` + report period | `client_reports.title` | 100% | None | Generated: "[Site Name] [Month] Monthly Report" |
| Hero photo | `inspection_media` (any photo from period) | `inspection_media` → pick | 80% | Selection logic: which photo is "best"? | Phase 1: default to last photo of period. Phase 2: AI picks most representative. |
| Written By | Supervisor from inspections | `client_reports.author_name` | 90% | Need to derive primary supervisor for period from `inspection_personnel` | Aggregate: most frequent supervisor across period's inspections |
| Date | Report period end | `client_reports.report_period_end` | 100% | None | |
| Addressed to | Client contact | `clients.contact_name` + `clients.council_or_body` | 100% | None — **but requires manual seed** | Clients table must be populated during onboarding. Not from SC. |
| Company info | Static | `organizations.address/phone/email` | 100% | None — **requires manual seed** | One-time org setup |
| Logo | Static | `organizations.logo_url` | 100% | None — requires upload | One-time |

**Schema coverage: Complete.** `organizations`, `clients`, `client_reports` tables cover all elements.

---

## 1.0 Project Location

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Site map images | NOT from SC | `sites.location_map_url` | 0% first time, 100% reuse | Maps must be created manually (Google Earth) and uploaded once per site | Manual onboarding task. Stored in `sites.location_map_url`. Reused across all reports for that site. |
| Map captions | Generated | — | 100% | None | Template: "Map 1.0: Area of work site: [site.name] found at [site address]" |

**Gap: Site maps are a one-time manual upload per site during onboarding.** Not a recurring cost.

---

## 2.0 Outline of Works

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Zone sub-sections | NOT from SC | `sites.zone_info_json` | 100% after setup | Zone definitions not in SC — manual per-site config | Populate `zone_info_json` during site onboarding |
| Works narrative | SC: `items[label="Details Of Tasks"].responses.text` across period | `inspection_tasks.details_text` aggregated → LLM | 70% | **LLM generation required.** Raw task details are informal field notes, not professional report prose. Need ecological language, scientific names in italics, site-specific context. | M02 (AI Enrichment) handles this. LLM takes aggregated `details_text` + species + methods → generates professional narrative. Human review loop required. |
| Task categories | SC: `items[label="Tasks Undertaken"].responses.selected[].label` | `inspection_tasks.task_type` | 100% | None | Direct from multi-select |

**This is the highest-risk section for automation.** The narrative quality determines report credibility. Raw SC data ("Annuals and woody weeds that were growing amongst native vegetation was removed by hand") must be transformed into professional ecological report language.

**What SC gives us (real example):**
> "Annuals and woody weeds that were growing amongst native vegetation was removed by hand and piled neatly on site. Dead kikuyu that was sprayed in previous visits was completely dead and was brushcut to ground level."

**What the report needs:**
> "**Eragrostis curvula (African Lovegrass) and Guinea Grass Management**: The stands of African Lovegrass were targeted via herbicide application using Fusilade, selectively sprayed to minimise soil disturbance and protect existing native regeneration. Post-treatment monitoring indicates effective knockdown of approximately 90% of targeted stands."

**Gap: The transformation from field notes to report prose is M02 scope (LLM enrichment). The data to feed the LLM is fully captured in the schema.**

---

## 3.0 Staff on Site

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Staff names | SC: `items[label="Staff/Contractors"].responses.selected[].label` | `inspection_personnel.staff_id` → `staff.name` | 100% | None | |
| Hours per staff | SC: `items[label="Staff worked hours (individual)"].responses.text` | `inspection_personnel.hours_worked` | 95% | Parsing "N/A" or empty values. Also: **hours per zone not captured in SC** — single total per inspection. | Phase 1: aggregate total hours per staff per period (no zone breakdown). Zone-level hours require either SC template change or manual allocation. |
| Hours by zone | NOT from SC | `report_staff_summary.zone` | 0% | **SC does not capture zone-level hour splits.** Reports show hours broken by zone (Zone B: 40hrs, Zone C: 30hrs). | Phase 1: Manual zone allocation in `report_staff_summary`. Phase 2: If inspections are tagged to zones (site name includes zone), can derive automatically. |
| Total hours | Calculated | `report_staff_summary` SUM | 100% | None | Simple aggregation |

**Gap: Zone-level hour allocation.** SC captures total hours per inspection, not per zone. Multi-zone sites need manual hour splitting unless inspections can be tagged to specific zones.

**Possible resolution:** If supervisors start naming zones in the Site Name field (e.g., "EBSF Zone B" vs "EBSF Zone C"), the pipeline can auto-allocate. Worth flagging to Cameron/Ryan as a SC template tweak.

---

## 4.0 Map of Areas Worked

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Annotated area maps | SC: `items[label="Site Area Work Map"].media[]` (supervisor hand-annotated) | `inspection_media` WHERE `media_type='area_work_map'` | 30% | SC maps are rough hand-annotations. Report needs clean polygon maps with colour-coded areas matching the weed works table. | Phase 1: Manual Google Earth polygon map. Phase 2: GPS-based polygon draft. Phase 3: AI-generated overlay from SC annotations. |

**Gap: Professional polygon maps.** This is the biggest manual effort per report. SC provides hand-drawn annotations but the report needs clean GIS-style polygon overlays on aerial imagery.

---

## 4.1 Weed Works Table

| Column | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|--------|----------|-------------|-----------|-----|------------|
| Weed Type | SC: `items[label="Weeds Targeted"].responses.selected[].label` | `report_weed_works.weed_type` via `inspection_weeds` | 100% | None | |
| Density (m2) | NOT from SC | `report_weed_works.polygon_area_m2` | 0% | **Not captured in SC.** Requires Google Earth polygon area calculation. | Phase 1: Manual. Phase 2: GPS polygon tool. Phase 3: Satellite imagery analysis. |
| Method Used | SC: `items[label="Tasks Undertaken"].responses.selected[].label` | `report_weed_works.method_used` via `inspection_tasks` | 80% | Method is known per inspection but **linking specific methods to specific weed areas** requires logic or manual mapping | Phase 1: Auto-suggest from inspection data, manual confirm. |
| GIS Location | SC: photo GPS metadata (if available) | `report_weed_works.gis_lat/gis_lon` | 50% | GPS is on photos, not on weed work areas directly. Need polygon centroid. | Phase 1: Use photo GPS as approximation. Phase 2: Polygon centroid from GIS. |
| Area/Zone | NOT from SC (or derived from site name) | `report_weed_works` via `sites.zone_info_json` | 80% | Same zone attribution issue as staff hours | Derive from site naming or manual |
| Hours Worked | SC: inspection totals | `report_weed_works.hours_worked` | 30% | **Per-weed-area hour allocation not in SC.** Total hours known, but how much time was spent on each weed type/area is not captured. | Phase 1: Manual allocation. Future: derive from task/species correlation patterns. |
| Map Polygon Colour | NOT from SC | `report_weed_works.map_polygon_colour` | 0% | **Purely visual — manually assigned** to match the polygon map | Manual — auto-assign from a colour palette |

**Gap summary: Density (m2), precise GIS locations, per-area hours, and polygon colours are all outside SC's data capture.** These are the manual inputs that represent the "25% not automatable" from the template analysis.

**Schema coverage: Complete.** `report_weed_works` table has all necessary columns including `polygon_area_m2`, `polygon_geojson`, `gis_lat/gis_lon`, `map_polygon_colour`, `hours_worked`, and `auto_populated` flag.

---

## 5.0 Bird Sightings / 8.0 Fauna Sightings

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Fauna observations | SC: `items[label="New observed fauna?"]` → child "What was it?" | `inspection_observations` WHERE `observation_type='fauna'` | 100% | None | If no records: auto-generate boilerplate "No birds were sighted this month." |

**Schema coverage: Complete.** No gaps.

---

## 6.0 Herbicide Information

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Chemical name | SC: `items[label="Herbicide"].responses.selected[].label` | `report_herbicide_summary.chemical_name` via `inspection_chemicals` | 100% | None | |
| Rate | SC: `items[label="Herbicide"].responses.text` (free text) | `inspection_chemicals.rate_raw` → `report_herbicide_summary.rate` | 70% | Rate parsing from free text is unreliable. Chemical Application Record has better data. | Prefer `chemical_application_items.rate_raw` when available. Fall back to `inspection_chemicals.rate_raw` with best-effort parsing. |
| Target species | NOT directly linked in SC | `report_herbicide_summary.target_species` | 30% | **SC doesn't link chemicals to target species.** The report says "Grazon 5ml/L for Madeira Vine" but SC only has separate chemicals and species lists. | Phase 1: Manual or LLM-inferred from `inspection_tasks.details_text`. Phase 2: NLP extraction from task narratives. |
| Zone | NOT from SC | `report_herbicide_summary.zone` | See zone issue above | Same zone attribution gap | |
| Total amount sprayed | SC: Daily Work Report free text + Chemical Application Record | `report_herbicide_summary.total_amount_sprayed` | 80% | Aggregation across inspections. Chemical Application Record has precise totals; Daily Work Report is approximate. | Prefer CAR data, aggregate across period. |
| Total concentrate | Calculated: rate × volume | `report_herbicide_summary.total_concentrate` | 80% | Depends on rate parsing accuracy | Calculate where possible, flag for review |

**Key gap: Chemical-to-species linking.** The report attributes chemicals to specific target species, but SC captures them as separate multi-selects. This relationship must be inferred (from task narratives) or manually specified.

---

## 7.0 Incidents

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Incident report | Not currently captured in Daily Work Report or Chemical Application Record templates | — | 100% (boilerplate) | No SC data source for incidents. Reports always show "No incidents occurred on site this month." | Default to boilerplate. If SC adds an incident field or a separate incident template is identified, link it. |

**Schema coverage: No incidents table needed for M00-M05.** Boilerplate generation handles this.

---

## 7.0/8.0 Future Works

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Future works bullets | SC: `items[label="Other Comments/Future Works"].responses.text` | `inspection_metadata.future_works_comments` | 85% | Multiple inspections per period → need consolidation into coherent bullet list | LLM consolidation or simple concatenation with dedup |

**Schema coverage: Complete.**

---

## 8.0 Site Photos

| Element | SC Source | Schema Table | Auto-fill | Gap | Resolution |
|---------|----------|-------------|-----------|-----|------------|
| Photo grid | SC: `items[*].media[]` across all inspections in period | `inspection_media` | 80% | **Selection logic:** Not all inspection photos go into the monthly report. Need to select ~8-10 representative photos from potentially 50+. | Phase 1: Include all photos, let reviewer curate. Phase 2: AI selects most representative set (diversity of locations, tasks, species). |

**Schema coverage: Complete.** `inspection_media` captures all photos; selection happens at report generation time.

---

## Summary: Data Not Captured by Safety Culture

These elements are required by the report but do NOT exist in SC data and cannot be derived from it:

| Data Required | Report Section | When Needed | Resolution |
|---------------|---------------|-------------|------------|
| **Client contact details** | Cover Page | Per-client | Manual seed in `clients` table during onboarding |
| **Organization branding** | Cover Page, headers | Global | Manual seed in `organizations` table — one time |
| **Site location maps** | 1.0 Project Location | Per-site | Manual upload (Google Earth) during site onboarding → `sites.location_map_url` |
| **Zone definitions** | 2.0, 3.0, 4.1, 6.0 | Per-site | Manual config in `sites.zone_info_json` during site onboarding |
| **Professional narrative** | 2.0 Outline of Works | Per-report | LLM generation from SC data (M02). Human review required. |
| **Zone-level hour splits** | 3.0 Staff on Site | Per-report (multi-zone sites) | Manual allocation OR SC template change (zone in site name) |
| **Polygon area maps** | 4.0 Maps | Per-report | Manual creation (Google Earth) — biggest recurring manual effort |
| **Polygon area (m2)** | 4.1 Weed Works Table | Per-report | Manual from Google Earth polygons |
| **Per-weed-area hours** | 4.1 Weed Works Table | Per-report | Manual allocation |
| **Map polygon colours** | 4.1 Weed Works Table | Per-report | Manual or auto-assigned palette |
| **GIS polygon centroids** | 4.1 Weed Works Table | Per-report | Manual from Google Earth or photo GPS approximation |
| **Chemical → species link** | 6.0 Herbicide Info | Per-report | LLM inference from task narratives or manual |

---

## Summary: Schema Gaps Identified

The updated v2 schema covers all identified report requirements. No additional tables needed.

| Schema Element | Status | Notes |
|----------------|--------|-------|
| `organizations` table | Present | Covers company branding, contact info |
| `clients.contact_name/council_or_body` | Present | Covers report addressing |
| `clients.report_template_variant` | Present | Controls which sections appear |
| `sites.zone_info_json` | Present | Supports multi-zone sites |
| `sites.location_map_url` | Present | Static site map storage |
| `inspection_observations` | Present | Fauna/flora sightings |
| `report_weed_works` | Present | Full weed works table structure |
| `report_herbicide_summary` | Present | Aggregated chemical data |
| `report_staff_summary` with zone | Present | Zone-level hour allocation |
| `client_reports` with status workflow | Present | Draft → review → approved → sent |
| Future stream tables | Commented out | Ready to uncomment when needed |

---

## Onboarding Checklist (Per New Client/Site)

Manual data entry required before first report generation:

- [ ] Create `organizations` row (one-time per business)
- [ ] Create `clients` row with contact details and `report_template_variant`
- [ ] Create `sites` row with `zone_info_json` (if multi-zone)
- [ ] Upload site location map → `sites.location_map_url`
- [ ] Create `site_name_lookup` entries mapping SC labels to canonical site
- [ ] Seed `site_scope_baselines` if density tracking is needed

---

## Automation Roadmap

| Phase | What Gets Automated | Manual Effort Eliminated | Milestone |
|-------|--------------------|--------------------------| ----------|
| **M01** (Ingestion) | SC data → Supabase (inspections, personnel, tasks, weeds, chemicals, media, observations, metadata) | Zero — this is the plumbing | M01 |
| **M02** (Enrichment) | LLM narrative generation, species scientific name lookup, photo analysis, chemical rate parsing | 2.0 Outline of Works (70→90%), 6.0 Herbicide (80→95%) | M02 |
| **M03** (Report Gen) | DOCX/PDF assembly from schema data, auto-fill all non-manual sections, review workflow | Cover, TOC, 1.0, 3.0, 5.0, 6.0, 7.0 go to ~100% auto | M03 |
| **Future** | Polygon map generation, GPS-based area calc, AI photo selection | 4.0 Maps, 4.1 density/GIS, 8.0 photo curation | M04+ |

**Bottom line: M01-M03 gets the report to ~75% auto-generated. The remaining 25% (polygon maps, area density, per-weed hours) is a GIS/manual problem that no amount of SC data can solve — it requires spatial data that SC doesn't capture.**
