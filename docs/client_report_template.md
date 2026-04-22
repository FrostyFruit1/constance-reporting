# Client Report Template Structure

> Constance Conservation -- Data Automation Platform
>
> Last updated: 2026-04-15
>
> Source: Analysis of EBSF Zone B/C June Report + Soil Translocation December Report

## Overview

Client reports follow a consistent template with variable sections. Reports are NOT one-size-fits-all — sections adapt based on work type and client requirements. The `clients.report_template_variant` field controls which optional sections appear.

---

## Fixed Sections (All Reports)

| Section | Content | Data Source |
|---------|---------|-------------|
| **Cover Page** | Title (site + period), hero photo, author, date, addressee, CC contact info | `clients` profile + `client_reports` metadata + `inspection_media` |
| **Table of Contents** | Auto-generated from headings | Generated |
| **1.0 Project Location** | Aerial/satellite maps showing site boundaries | `sites.location_map_url` or `inspection_media` (type=site_map) |
| **2.0 Outline of Works** | Detailed narrative per zone, broken by task type with ecological context | LLM-generated from `inspection_tasks.details_text` across all inspections in period |
| **3.0 Staff on Site** | Table: staff name x hours, broken by zone, with total | `report_staff_summary` (aggregated from `inspection_personnel`) |
| **4.0 Maps of Areas Worked** | Annotated aerial maps with colored polygons | `inspection_media` (type=area_work_map) + `report_weed_works` polygon data |
| **4.1 Weed Works Table** | Weed Type, Density (m2), Method, GIS Location, Area, Hours, Polygon Colour | `report_weed_works` -- partially auto-populated, partially manual |
| **6.0 Herbicide Information** | Per-chemical: name, rate, target species, zone, total volume, concentrate | `report_herbicide_summary` (aggregated from `inspection_chemicals` + `chemical_application_records`) |
| **7.0 Incidents on Site** | Incident narrative or "no incidents" | `inspection_metadata` or separate incident template |

## Variable Sections (Client/Site-Type Dependent)

Controlled by `clients.report_template_variant`:

| Section | When Included | Data Source |
|---------|---------------|-------------|
| **5.0 Bird Sightings** | Bush regen / ecological sites | `inspection_observations` (type=fauna) |
| **7.0 Future Works** | Restoration / planting projects | `inspection_metadata.future_works_comments` |
| **8.0 Site Photos / Photo Points** | Most reports (2x2 grid layout) | `inspection_media` (type=photo), arranged chronologically |
| **8.0 Fauna Sightings** | Ecological / sensitive sites | `inspection_observations` |

---

## Key Findings

### Outline of Works (Section 2.0) — Most Complex Section

This is a professional ecological narrative, not raw data. Currently written by Ryan. For automation:

- LLM generates a draft from the aggregated `details_text` fields across all inspections in the reporting period
- Draft is reviewed by Ryan before approval
- The narrative must be broken by zone and task type with ecological context
- This is not a simple concatenation — it requires synthesis and professional tone

### Weed Works Table (Section 4.1) — Hardest to Automate

- **Auto-populated:** Species targeted, methods used, hours worked (from Safety Culture data)
- **Manual input required (Phase 1):** Polygon area (m2), GIS coordinates, map polygon colours
- Currently requires Google Earth polygon drawing by Ryan
- See `docs/density_polygon_model.md` for the automation path (Phases 1-4)

### Photo Layout

- Photos arranged in 2-column grids with captions
- Section 8.0 uses a 2x2 grid layout
- Photos are ordered chronologically within each section

### Branding

- Constance Conservation logo appears in headers on some reports but not all
- Controlled by `clients.report_template_variant`

### Section Numbering Note

Section numbers are not always sequential in actual reports (e.g., Section 5.0 may be skipped if not applicable). The generated report should match this behaviour — skip sections rather than renumber.
