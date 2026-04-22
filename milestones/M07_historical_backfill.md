# M07: Historical Backfill

## Objective
Seed the production database with reference data and sync all ~1,680 historical inspections from the Safety Culture API into Supabase.

## Status: IN PROGRESS (backfill running)

## Date: 2026-04-15

## Prerequisites Completed

### 1. sync_state table
- Table already existed in the database (migration `003_sync_state.sql` had been applied previously)
- PostgREST schema cache was stale, causing initial 404 — resolved on re-query
- Seed row: `sync_type = 'scheduled_feed'`, `total_synced = 0`

### 2. Database cleanup (test data removal)
- Deleted 33 inspections (9 real + 24 test from WP2 integration tests)
- Deleted 1 test organization ("Test Org (WP2 integration tests)")
- Deleted 10 staff, 6 auto-created sites, 0 clients, 0 site_name_lookups
- All deletions via Supabase REST API (direct DB connection unavailable — IPv6 only, no IPv4)

### 3. Onboarding seed
- Created organization: **Constance Conservation** (`2c43e83e-9729-4e24-b5ed-765585ea0b66`)
- Created client: **Camden Council** (`292ef1e7-4427-470f-9648-d5a5252cbbcb`)
- Seeded **12 staff** (added Ethan Tuema, Bailey Sellen — previously missing)
- Seeded **22 sites** with canonical names (up from 6 auto-created)
- Seeded **23 site_name_lookup** entries (Hinchinbrook has 2 variants: "Hinchinbrook", "Hichinbrook")

### 4. Storage bucket
- `inspection-media` bucket auto-creates via `ensureBucket()` in `src/media/downloader.ts` — no manual step needed

## Bug Fix: SC API Feed Field Name Mismatch

**Problem:** Every audit fetch returned `SC API 400: Bad Request` during initial backfill attempt.

**Root cause:** The Safety Culture `/feed/inspections` endpoint returns entries with field `id` (e.g., `"id": "audit_9f51ffb876cd484d817776a96621730f"`), but `FeedInspectionEntry` interface in `src/sync/sc_api_client.ts` declared the field as `audit_id`. This caused the sync to call `/audits/undefined` for every inspection.

**Fix:**
- Changed `FeedInspectionEntry.audit_id` → `FeedInspectionEntry.id` in `src/sync/sc_api_client.ts`
- Updated destructuring in `scheduled_sync.ts`: `const { id: audit_id, modified_at } = entry;`
- Updated all `entry.audit_id` references → `entry.id` in `scheduled_sync.ts`
- Updated both test files (`sc_api_client.test.ts`, `scheduled_sync.test.ts`)
- All 21 tests passing after fix

## Backfill Execution

- **Command:** `npm run sync:backfill`
- **Feed total:** ~1,683 inspections (1,583 remaining after page 1)
- **Rate limiting:** 200ms between API calls (configurable via `SYNC_RATE_LIMIT_MS`)
- **Processing rate:** ~3 seconds per inspection (fetch + parse + write)
- **Estimated duration:** ~85 minutes

### Expected processing status breakdown:
- `completed` — Daily Work Reports, Chemical Application Records (fully parsed)
- `needs_review` — Toolbox talks, OSHA talks, older/unknown templates (stored with raw JSON)
- `failed` — Edge cases, malformed data (expected to be near-zero)

## Success Criteria
- [ ] `sync_state.total_synced` > 1,000
- [ ] `inspections` table has 1,000+ rows
- [ ] Majority `completed` with some `needs_review` in processing_status
- [ ] Zero or near-zero `failed`
- [ ] `inspection_media` has rows (photos extracted)
- [ ] `chemical_application_records` has rows (CAR template processed)
- [ ] `sites` table has grown (auto-created from new site names)
- [ ] `staff` table has grown (auto-created from new staff names)

## DB Connection Note
Direct PostgreSQL connection (`db.yrkclyeklwjlfblxvdbc.supabase.co`) resolves to IPv6 only (`2406:da14:271:9903:...`). The local network cannot route IPv6 traffic, so all database interaction uses the Supabase REST API. The Supabase connection pooler also failed (tenant not found across all AWS regions). For DDL operations, use the Supabase Dashboard SQL Editor.

## Key Files
- `src/sync/scheduled_sync.ts` — sync entry point (fixed)
- `src/sync/sc_api_client.ts` — SC API client (fixed)
- `src/seed/onboarding.ts` — seed script (ran successfully)
- `supabase/migrations/003_sync_state.sql` — sync_state DDL
