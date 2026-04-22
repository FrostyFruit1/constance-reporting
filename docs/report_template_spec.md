# Client Report Template Analysis — Output Format Spec

## Source Templates Analyzed
- EBSF Zone B & C June Monthly Report (bush regen / weed management)
- Soil Translocation December Monthly Report (planting / restoration)

Both are monthly reports addressed to Camden Council contacts. They share a common skeleton with variable sections based on work type.

---

## Report Structure — Section-by-Section Mapping

### Cover Page

**Layout:** Title (large, green), hero photo (full-width site photo), author line, date, addressee, CC company address/phone/email. Some reports include Constance Conservation logo in top-left.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Title | `sites.name` + report period | Format: "[Site Name] [Month] Monthly Report" |
| Hero photo | `inspection_media` WHERE media_type='photo' | Select first or most representative photo from period. Needs selection logic or manual pick. |
| Written By | `clients.report_template_vat` → author config, or `staff.name` of primary supervisor | Format: "Constance Conservation – [Name]" |
| Date | `client_reports.report_period_end` | Format: DD/MM/YYYY |
| Addressed to | `clients.contact_name` + `clients.council_or_body` | Format: "[Contact Name], [Council/Body]" |
| Company info | `organizations.address`, `.phone`, `.email` | Static per organization |
| Logo | `organizations.logo_url` | Optional — controlled by report_template_variant |

### Table of Contents

**Layout:** Auto-generated from heading styles. Section numbers with dot leaders and page numbers.

| Element | Source | Transformation |
|---------|--------|----------------|
| TOC entries | Generated from document headings | Programmatic — docx library generates from heading styles |

**Note:** Sections included/excluded are controlled by `clients.report_template_variant`. The TOC auto-adjusts based on which sections are present.

### 1.0 Project Location

**Layout:** Section heading + 1-2 aerial/satellite map images with captions below each.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Map images | `sites.location_map_url` OR `inspection_media` WHERE media_type='site_map' | Use stored site maps. These are typically static per site — satellite/aerial views with site boundaries drawn. Updated infrequently. |
| Captions | Generated | Format: "Map 1.0: Area of work site: [Site Name] found at [Address/Location]." |

**Note:** These maps are typically created once during site onboarding (from Google Earth) and reused across reports. They show the overall site boundary, not the monthly work areas.

### 2.0 Outline of Works

**Layout:** Main heading, then sub-sections per zone (2.1 Zone C, 2.2 Zone B, etc.). Under each zone: "Works Carried Out" sub-heading with bullet points. Each bullet has a bold title + paragraph narrative.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Zone sub-sections | `sites.zone_info_json` | If site has zones, create sub-section per zone. Single-zone sites skip the zone layer. |
| Works narrative | `inspection_tasks.details_text` across all inspections in period | **LLM-generated.** Aggregate all details_text for the period. Feed to LLM with instructions: write in professional ecological report voice, organize by task type, include species scientific names in italics, reference methods and ecological reasoning. |
| Task categories | `inspection_tasks.task_type` | Use as organizational structure for the narrative bullets |

**Content pattern from real reports:**
Each bullet follows this structure:
- **Bold title** summarizing the work category (e.g., "Eragrostis curvula (African Lovegrass) and Guinea Grass Management")
- Paragraph describing: what was done, where, which species, which method, ecological reasoning (e.g., "to minimise soil disturbance and protect existing native regeneration"), any special considerations

**This is the hardest section to automate.** The narrative includes professional ecological language and site-specific context that goes beyond raw data. LLM generation with review is the correct approach.

**For the Soil Translocation report type**, this section uses different sub-headings (2.1 Brush Matting, 2.2 Watering Native Tubestock) rather than zone-based organization. The template variant controls which structure to use.

### 3.0 Staff on Site

**Layout:** Section heading, then per-zone sub-sections (if multi-zone). Each zone has a simple 2-column table: Staff | Hours. Final line: italic total hours summary.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Zone sub-sections | `sites.zone_info_json` | Split hours by zone if multi-zone site |
| Staff names | `report_staff_summary.staff_id` → `staff.name` | List all staff, including those with 0 hours (shows full team roster) |
| Hours per staff | `report_staff_summary.hours_worked` | Integer values. Staff with 0 hours still appear in table. |
| Total | SUM of all hours | Format: "A total of [X] hours were completed this month for [zone description]." in italics |

**Table format:**
| **Staff** | **Hours** |
|-----------|-----------|
| Ryan Arford | 22 |
| Jordan Darnley | 30 |

**Note from real data:** Hours are broken by zone for multi-zone sites. The same staff member can appear in multiple zone tables with different hours. Total is across all zones.

### 4.0 Map of Areas Worked

**Layout:** Section heading + 1-2 annotated aerial map images showing colored polygons of work areas. Captions reference the weed works table.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Annotated maps | `inspection_media` WHERE media_type='area_work_map' OR generated polygon map | **Phase 1:** Supervisor's hand-annotated map from Safety Culture, supplemented by manual Google Earth polygon map. **Phase 3:** AI-generated polygon overlay on aerial base map. |
| Captions | Generated | Format: "Map 2.0: Map of all areas worked in correlation to Table 1.0." |

**Critical:** These maps must visually correlate with the weed works table (Section 4.1). Each polygon colour on the map corresponds to a row in the table.

### 4.1 Weed Works Table

**Layout:** Full-width table with blue/grey header row. This is the most data-rich section.

| Column | Source Table.Field | Auto-populatable? |
|--------|-------------------|-------------------|
| Weed Type | `report_weed_works.weed_type` (from `inspection_weeds.species_name_canonical`) | Yes — from Safety Culture multi-select |
| Density (m2) | `report_weed_works.polygon_area_m2` | **No — requires Google Earth polygon** (Phase 1). Future: auto from GPS tool (Phase 2) |
| Method Used | `report_weed_works.method_used` (from `inspection_tasks.task_type` cross-referenced with species) | Partial — method is known, linking to specific species/area requires logic |
| GIS Location | `report_weed_works.gis_lat`, `.gis_lon` | Partial — GPS from photos available, exact polygon centroid requires manual (Phase 1) |
| Area | Zone name from `sites.zone_info_json` | Yes |
| Hours Worked | `report_weed_works.hours_worked` | Partial — total hours known, allocation to specific weed work areas is currently manual |
| Map Polygon Colour | `report_weed_works.map_polygon_colour` | **No — manually assigned** to match the annotated map |

**Table styling from real reports:**
- Header row: blue/steel blue background (#4472C4), white italic text
- Data rows: alternating white/light blue shading
- Text: left-aligned, normal weight

**Real example row:**
| Weedy annuals and grasses | 7,557.79 m2 | Herbicide Spraying for Halos Around Plantings and mowing in planting area. | -34.0707394, 150.7320299 | Zone C | 40 | Orange |

**For the Soil Translocation report type**, this table tracks planting/restoration activities rather than weed works:
| Weed Type/Species | Density | Method Used | GIS Location | Area Worked | Hours Worked | Map Polygon Colour |
Example row: *Breynia oblongifolia*, *Duboisia myoporoides* | 171.46 m2 | Brush Matting | -34.07 150.7366056 | Soil Translocation Area | 4 | Purple |

### 5.0 Bird Sightings (Variable — bush regen sites)

**Layout:** Simple section with text content. Often just "No birds were sighted this month."

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Sightings | `inspection_observations` WHERE observation_type='fauna' | If no records: "No birds were sighted this month." If records exist: list species with details. |

**Included when:** `clients.report_template_variant` includes bird_sightings section. Typically for ecological/bush regen sites.

### 6.0 Herbicide Information

**Layout:** Section heading, then per-chemical sub-sections. Each sub-section heading names the chemical, rate, target species, and zone. Two bullet points per chemical: total amount sprayed and total concentrate.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Sub-section headings | `report_herbicide_summary` | Format: "6.1 [Chemical Name] [Rate] for [Target Species] ([Zone])" |
| Total amount sprayed | `report_herbicide_summary.total_amount_sprayed` | Format: "Total amount Sprayed: [X]L." |
| Total concentrate | `report_herbicide_summary.total_concentrate` | Format: "Total concentrate sprayed: [X]ml." Calculated: rate x volume |

**Real example:**
> 6.1 Grazon 5ml/L for Madeira Vine (Zone B)
> - Total amount Sprayed: 70L.
> - Total concentrate sprayed: 350ml.

**Data sources:** Aggregated from `inspection_chemicals` (daily report quick reference) and `chemical_application_records` (detailed compliance data). The Chemical Application Record has more precise data — prefer it when available, fall back to daily report data.

**For reports with no chemical use:** "No herbicide was used this month."

### 7.0 Incidents on Site

**Layout:** Simple text section.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Incident text | Inspection data (incident template or field) | If no incidents: "No incidents occurred on site this month. Should any incidents occur in the future, they will be promptly recorded and reported to the council." |

**Note:** This boilerplate text appears to be standard across all reports when no incidents occur.

### 7.0/8.0 Future Works (Variable — restoration/planting sites)

**Layout:** Section heading with bullet points describing planned activities.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Future works bullets | `inspection_metadata.future_works_comments` | Aggregate across inspections in period. LLM can consolidate into coherent bullet list if multiple entries. |

**Included when:** `clients.report_template_variant` includes future_works section. Common for restoration and planting projects.

### 8.0 Wombats and Other Fauna Sightings (Variable)

**Layout:** Simple text section, similar to bird sightings.

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Fauna sightings | `inspection_observations` WHERE observation_type='fauna' | If no records: "No New sightings were found this month." |

### 8.0 Site Photos/Photo Points (Variable)

**Layout:** 2-column grid of photos, typically 2 per row, 4-5 rows per page. No captions in the grid cells (photos only).

| Element | Source Table.Field | Transformation |
|---------|-------------------|----------------|
| Photos | `inspection_media` WHERE media_type='photo' | Select representative photos from the period. Arrange in 2x2 grid. May need selection logic — not all daily report photos go into the monthly report. |

**Layout from real report:** Photos placed in a borderless table (2 columns, multiple rows) with minimal cell padding. Photos are resized to fill cells proportionally.

---

## Report Template Variants

Based on the two analyzed reports, at minimum two variants are needed:

### Variant: "bush_regen_weed_management"
Sections included: Cover, TOC, 1.0 Project Location, 2.0 Outline of Works (zone-based), 3.0 Staff on Site (zone-based), 4.0 Maps, 4.1 Weed Works Table, 5.0 Bird Sightings, 6.0 Herbicide Information, 7.0 Incidents, 8.0 Fauna Sightings
Example: EBSF Zone B & C report

### Variant: "restoration_planting"
Sections included: Cover (with logo), TOC, 1.0 Project Location, 2.0 Outline of Works (activity-based: brush matting, watering, etc.), 3.0 Staff on Site (single table), 4.0 Maps, 4.1 Works Table (adapted for planting), 5.0 Herbicide Information, 6.0 Incidents, 7.0 Future Works, 8.0 Site Photos
Example: Soil Translocation report

Additional variants will likely emerge as more client reports are analyzed.

---

## Styling Spec

### Typography
- Headings: Green (#4E8542 or similar), sans-serif
- Body text: Black, standard serif or sans-serif
- Table headers: Blue/steel blue background (#4472C4), white text, italic
- Captions: Italic, standard text
- Page numbers: Footer, format "[N] | P a g e"

### Layout
- A4 page size
- Standard margins
- Photos: full-width or half-width depending on context
- Tables: full page width, alternating row shading (white / light blue)
- Maps: full-width with italic caption below

### Branding
- Some reports include Constance Conservation logo in header (top-left on every page)
- Company contact block on cover page: address, phone, email

---

## Automation Readiness by Section

| Section | Auto-generation | Manual Input Required | Notes |
|---------|----------------|----------------------|-------|
| Cover Page | 90% | Hero photo selection | Could default to first/last photo of period |
| TOC | 100% | None | Generated from headings |
| 1.0 Project Location | 95% | Initial map upload only | Reuses stored site maps |
| 2.0 Outline of Works | 70% | Review/edit LLM narrative | Biggest quality risk — needs review loop |
| 3.0 Staff on Site | 100% | None | Direct aggregation from inspection data |
| 4.0 Maps of Areas Worked | 20% | Polygon map creation (Phase 1) | Phase 3: AI-generated draft |
| 4.1 Weed Works Table | 40% | Polygon area, GIS, colours (Phase 1) | Species and method auto-populated |
| 5.0 Bird/Fauna Sightings | 100% | None | Direct from inspection_observations |
| 6.0 Herbicide Information | 95% | Verify totals | Aggregation + calculation |
| 7.0 Incidents | 100% | None | Boilerplate or incident data |
| 7.0 Future Works | 85% | Review wording | Aggregation from inspection comments |
| 8.0 Site Photos | 80% | Photo selection/ordering | Could auto-select representative set |

**Overall automation estimate: ~75% of report content can be auto-generated from database. The remaining 25% is polygon/map work and narrative review.**
