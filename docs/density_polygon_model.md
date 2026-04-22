# Density Tracking and Polygon Model

> Constance Conservation -- Data Automation Platform
>
> Last updated: 2026-04-15

## How Density Works in the Business

1. **Initial scope** defines a baseline density per site/zone, expressed as a percentage in banded categories:
   - `0-25%` — low density / maintenance level
   - `26-50%` — moderate density
   - `51-75%` — high density
   - `76-100%` — "major" classification / heavy infestation

2. **Field assessment** — the density figure is a visual field assessment slotted into bands, not a measured calculation. Supervisors estimate weed coverage within a polygon.

3. **Polygon drawing** — field team draws polygons manually using Google Earth to define work areas. Polygon area (m2) is calculated from the drawn boundary.

4. **Progress tracking** — subsequent reports compare current density against the baseline, producing a progress metric for the client. Stored in `report_weed_works.density_change_from_baseline`.

5. **Proof of work** — the polygon map is proof-of-work for the client: "we said we did this area, here it is."

## Schema Support

| Table | Role |
|-------|------|
| `site_scope_baselines` | Stores initial density band per site/zone + contract target |
| `report_weed_works` | Per-row polygon data: area, density, baseline comparison, GIS coords, colour |
| `inspection_media` (type=area_work_map) | Supervisor's hand-drawn work area maps from Safety Culture |

## Polygon Automation Path

### Phase 1: Current (Manual Polygon, Auto Data)

- System pre-populates weed works table from Safety Culture data (species, methods, hours)
- **Manual:** Polygon area (m2), GIS coordinates, density band, and map colours — Ryan fills during review step
- Ryan draws polygons in Google Earth, exports, and uploads during report review
- System notifies Ryan when report draft is ready for polygon markup

### Phase 2: Near-term (On-Site Capture)

- Simple Google Maps web app for supervisors to draw polygons on-site via phone
- GPS captures boundary, area auto-calculates
- Density band selected from dropdown
- Eliminates the Google Earth step entirely
- Data flows directly into `report_weed_works`

### Phase 3: Medium-term (AI-Assisted)

- Vision AI (Gemini) generates draft polygon maps from:
  - Baseline aerial map (from `sites.location_map_url`)
  - Supervisor's annotated work map from Safety Culture (`inspection_media` type=area_work_map)
  - GPS coordinates from geotagged photos
- Ryan verifies and adjusts rather than creating from scratch
- Significant time saving on the most manual part of reporting

### Phase 4: Long-term (Measured Density)

- Drone imagery + AI produces measured density figures
- Validated against historical supervisor assessments
- Moves density from subjective assessment to objective measurement
- Enables treatment effectiveness analysis at polygon level
