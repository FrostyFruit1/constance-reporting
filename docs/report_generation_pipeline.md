# Report Generation Pipeline

> Constance Conservation -- Data Automation Platform
>
> Last updated: 2026-04-15

## Architecture Overview

Client profiles serve as the **configuration layer** driving report generation. Each client profile contains:

- Scope baselines (density bands, area, contract targets)
- Report frequency (monthly, quarterly)
- Section configuration (which sections to include via `report_template_variant`)
- Addressee and CC contacts
- Delivery channel (email, dashboard)

## Site Resolution

Incoming inspections are automatically linked to clients via site name resolution — no manual tagging required:

```
Safety Culture dropdown label
  -> site_name_lookup table
  -> sites table (site_id)
  -> clients table (client_id)
```

## Processing Model

**Daily inspections** are processed individually as they arrive (webhook-triggered). The heavy lifting — parsing, media download, chemical normalization, species matching — happens per-inspection in near real-time.

**Report assembly** is a separate step triggered by schedule.

## Report Generation Flow

1. **Cron fires** on reporting schedule (monthly/quarterly per client configuration)
2. **Query inspections** — all processed inspections for client's sites within the report period
3. **Hydrate baselines** — scope baselines from `site_scope_baselines` table
4. **Staff summary** — aggregate `inspection_personnel` across all inspections -> `report_staff_summary` (Section 3.0)
5. **Herbicide summary** — aggregate `inspection_chemicals` + `chemical_application_records` -> `report_herbicide_summary` (Section 6.0)
6. **Weed works** — pre-populate `report_weed_works` from `inspection_weeds` + `inspection_media` GPS data (Section 4.1) — flag density/polygon fields for manual input
7. **Density trend** — calculate current assessment vs baseline vs previous reporting periods
8. **Outline of Works** — collect `inspection_tasks.details_text` across all inspections -> feed to LLM -> generate narrative draft (Section 2.0)
9. **Project Location** — pull `inspection_media` (type=site_map) -> Section 1.0
10. **Areas Worked maps** — pull `inspection_media` (type=area_work_map) -> Section 4.0
11. **Observations** — pull `inspection_observations` -> Fauna/Flora sightings (Sections 5.0/8.0)
12. **Future Works** — pull `inspection_metadata.future_works_comments` -> Section 7.0
13. **Photo Points** — arrange `inspection_media` (type=photo) in 2x2 grid -> Section 8.0
14. **Apply template** — apply client-specific template variant from `clients.report_template_variant`
15. **Generate output** — produce PDF + DOCX -> write to `client_reports` -> set status to "review"
16. **Notify** — alert Ryan: "[Site Name] [Month] report ready for review"

## Review and Approval Workflow

```
draft -> review -> approved -> sent
```

### Review Step (Ryan)

1. Reviews draft in dashboard
2. Verifies/adjusts weed works table (fills polygon data, confirms density bands)
3. Verifies/adjusts Outline of Works narrative
4. Uploads polygon map from Google Earth (Phase 1) or verifies AI-generated map (Phase 3)
5. Approves -> status changes to "approved"

### Distribution Step (Automated)

1. Email to client with PDF/DOCX attachment
2. Upload to client dashboard (if applicable)
3. Archive in Supabase Storage

## Automation Maturity Timeline

| Period | Level | Description |
|--------|-------|-------------|
| Month 1-3 | Full review | Ryan reviews everything, provides corrections that train the system |
| Month 4-6 | Light review | Ryan scans and approves most sections, only edits edge cases |
| Month 6-12 | Exception review | Reports auto-generate with Ryan reviewing exceptions only |
| Month 12+ | Auto-distribution | Potential for fully automated distribution with exception-based review |

The key insight: automation maturity is gradual. Ryan's corrections in months 1-3 improve the LLM narrative generation and data normalization quality over time.
