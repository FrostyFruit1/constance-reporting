# Ingestion Architecture — Safety Culture API

> Constance Conservation -- Data Automation Platform
>
> Last updated: 2026-04-15

## Overview

The Safety Culture API returns structured JSON data (not PDF exports). Each audit JSON has four main sections:

| Section | Contents |
|---------|----------|
| `audit_data` | Metadata (dates, authorship, scores, duration) |
| `template_data` | Template definition including `response_sets` (dropdown option lists) |
| `header_items` | Title page fields (Site Name, Conducted on, Prepared by) |
| `items` | Inspection data nested via `parent_id` -> `item_id` |

## Templates in Use

| Template | Volume | Purpose |
|----------|--------|---------|
| Daily Work Report | ~50 per year | Primary data source covering all field work (spraying, handweeding, brushcutting, etc. via multi-select) |
| Chemical Application Record | ~3 per year | Detailed chemical compliance documentation |

## Architecture: Dual-Path Reliability Model

### Real-time Path

```
Webhook fires on new inspection event
  -> Extract inspection ID from lightweight payload
  -> Enqueue processing job
  -> Call GET /audits/{audit_id} for full inspection JSON
  -> Pull associated media (inline on items, not separate endpoint)
  -> Process and store
```

The webhook payload is lightweight — it contains the event type and audit ID but not the full inspection data. The processing job fetches the full JSON via the audits endpoint.

### Reliability Path (Scheduled Sync)

```
Cron job runs on schedule (e.g., every 6 hours)
  -> Query GET /feed/inspections?modified_after={last_sync}
  -> Compare against processed records via sc_audit_id
  -> Pull anything missed by webhook
  -> Reprocess if sc_modified_at has changed
```

This path serves four purposes:

1. **Backfill** — catches any inspections that arrived while the webhook endpoint was down
2. **Reconciliation** — ensures no gaps between webhook events and stored records
3. **Change detection** — picks up edits to previously submitted inspections (supervisors sometimes update reports after submission)
4. **Recovery** — provides a fallback if the webhook infrastructure has issues

## API Endpoints

```
GET /feed/inspections?limit=N&modified_after=DATE  -- Paginated inspection list
GET /audits/{audit_id}                              -- Full inspection JSON
```

## Media Handling

Photos are inline on items — each item can have a `media[]` array with `href` URLs pointing to the SC media CDN. There is no separate media endpoint. Media is downloaded during the processing job and stored in Supabase Storage.

## Processing Flow Per Inspection

1. Fetch full audit JSON
2. Determine template type from `template_id`
3. Extract header fields (site name, date, supervisor)
4. Resolve site via `site_name_lookup` table
5. Walk `items[]` tree, extracting fields by label + type
6. Parse free-text fields (hours, chemical rates, weed percentages)
7. Normalize species and chemical names via lookup tables
8. Download and store media attachments
9. Write to inspection tables (inspections, inspection_personnel, inspection_tasks, inspection_weeds, inspection_chemicals, inspection_media, inspection_observations, inspection_metadata)
10. Set `processing_status` to 'completed' (or 'needs_review' if parsing issues detected)
