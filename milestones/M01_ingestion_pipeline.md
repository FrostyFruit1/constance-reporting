# M01: Ingestion Pipeline

## Objective
Build the dual-path ingestion pipeline that takes Safety Culture inspection data from the API and writes it into the Supabase schema deployed in M00. This milestone produces a working pipeline that processes both Daily Work Reports and Chemical Application Records, stores raw JSON for reprocessing, and handles all documented data quality issues.

## Status: IN PROGRESS

## Prerequisites
- [x] M00 complete — schema deployed (27 tables), API validated, field mapping documented
- [x] Safety Culture API credentials configured (`.env`)
- [x] Supabase project live (`yrkclyeklwjlfblxvdbc`)
- [x] Sample JSONs available in `samples/` for testing
- [x] Field mapping doc (`docs/field_mapping.md`) defines all extraction paths
- [x] Data quality notes (`docs/data_quality_notes.md`) defines all edge cases to handle
- [x] Ingestion architecture doc (`docs/ingestion_architecture.md`) defines dual-path model

## Architecture Overview

```
                    ┌─────────────────────┐
                    │  Safety Culture API  │
                    └──────┬──────┬───────┘
                           │      │
              ┌────────────┘      └────────────┐
              ▼                                 ▼
    ┌──────────────────┐             ┌──────────────────┐
    │  Webhook Handler │             │  Scheduled Sync   │
    │  (real-time)     │             │  (cron / backfill) │
    └────────┬─────────┘             └────────┬──────────┘
             │                                │
             └───────────┬────────────────────┘
                         ▼
              ┌──────────────────┐
              │  Processing Core │
              │  (shared logic)  │
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │    Supabase      │
              │  (27 tables)     │
              └──────────────────┘
```

The Processing Core is the same code regardless of whether the inspection arrived via webhook or scheduled sync.

---

## Work Packages (designed for parallel execution)

### WP1: Processing Core — SC JSON Parser & Field Extractor
**Can run: Independently**
**Depends on: Nothing (uses sample JSONs for development)**

Build the core extraction module that takes a raw Safety Culture audit JSON and returns a structured object ready for database insertion. This is pure data transformation — no API calls, no database writes.

**Inputs:** Raw audit JSON (as returned by `GET /audits/{audit_id}`)
**Outputs:** Structured extraction result object containing:
- `inspection` record fields
- `personnel[]` array
- `tasks[]` array
- `weeds[]` array
- `chemicals[]` array
- `media[]` array
- `observations[]` array
- `metadata` record fields
- `parsing_warnings[]` — any fields that couldn't be cleanly parsed

**Key implementation requirements:**
1. **Template detection:** Branch on `template_id` to determine Daily Work Report vs Chemical Application Record
2. **Header field extraction:** Handle type evolution (Site Name: `list` vs `text`, Supervisor: `question` vs `list`)
3. **Item tree walking:** Navigate `items[]` via `parent_id` / `item_id` to locate fields by label
4. **Response reading by type:** `list` → `selected[].label`, `text`/`textsingle` → `text`, `question` → `selected[0].label`, `datetime` → `datetime`, `media` → `media[]`
5. **Free-text parsing:**
   - Hours: parse to numeric, handle "N/A" and empty → null
   - Weed removal %: handle ranges ("30-40%"), bare numbers ("90"), empty
   - Chemical rates: best-effort line-by-line parsing from herbicide text field
6. **Species normalization:** Match raw species names against `species_lookup` to populate `species_name_canonical` and `scientific_name`
7. **Chemical normalization:** Match raw chemical names against `chemical_lookup` to populate `chemical_name_canonical`
8. **Chemical Application Record:** Handle the separate template with positional line matching (chemical name lines → rate lines → concentrate lines)
9. **Media extraction:** Collect all `media[]` arrays from all items, tag each with parent item label as context
10. **Conditional fields:** Only extract fauna/flora details when parent Yes/No answer is "Yes"
11. **Robustness:** Never throw on malformed data. Log warnings, store what parses, flag for review.

**Test against:** All 5 sample JSONs in `samples/`

**Files to create:**
- `src/parser/index.ts` — main entry point
- `src/parser/daily_work_report.ts` — DWR-specific extraction
- `src/parser/chemical_application_record.ts` — CAR-specific extraction
- `src/parser/field_extractors.ts` — response reading utilities
- `src/parser/normalizers.ts` — species/chemical name normalization
- `src/parser/free_text_parsers.ts` — hours, percentages, chemical rates
- `src/parser/__tests__/` — tests against sample JSONs

---

### WP2: Database Writer — Supabase Upsert Layer
**Can run: Independently (mock parser output for testing)**
**Depends on: WP1 interface contract (extraction result shape)**

Build the database writer that takes the structured extraction result from WP1 and writes it to Supabase. All operations must be idempotent via UPSERT on `sc_audit_id`.

**Key implementation requirements:**
1. **Upsert logic:** Use `sc_audit_id` as conflict key on `inspections` table. On conflict, update all fields and set `updated_at`.
2. **Cascading writes:** Delete-and-reinsert child records (personnel, tasks, weeds, chemicals, media, observations, metadata) on reprocess. Use the `ON DELETE CASCADE` constraints.
3. **Lookup resolution:**
   - Site: query `site_name_lookup` by SC label/text → get `site_id`. If no match, create a new `sites` row and log for manual review.
   - Staff: query `staff` by name → get `staff_id`. If no match, create a new `staff` row.
   - Species: query `species_lookup` by canonical name → populate canonical fields. If no match, store raw name only.
   - Chemicals: query `chemical_lookup` by canonical name → populate canonical fields. If no match, store raw name only.
4. **Raw JSON storage:** Store the full audit JSON in `inspections.sc_raw_json` for future reprocessing.
5. **Processing status:** Set to `'completed'` on success, `'needs_review'` if any parsing warnings, `'failed'` on error.
6. **Organization ID:** All writes must include `organization_id`. For now, hardcode the single org (created during onboarding seed). Future: resolve from API context.
7. **Transaction safety:** Wrap each inspection's writes in a single transaction — all child records succeed or none do.

**Connection note:** Direct DB connection is IPv6-only and may timeout. Use Supabase REST API (`@supabase/supabase-js` with service role key) for all writes. This works over HTTPS.

**Files to create:**
- `src/db/writer.ts` — main upsert orchestration
- `src/db/lookups.ts` — site, staff, species, chemical resolution
- `src/db/supabase_client.ts` — configured Supabase client (reads from `.env`)
- `src/db/__tests__/` — integration tests against live Supabase

---

### WP3: Scheduled Sync — Polling the Feed API ✅ COMPLETE (2026-04-15)
**Can run: After WP1 + WP2 interfaces are defined**
**Depends on: WP1 (parser), WP2 (writer)**

Build the scheduled sync path that polls `GET /feed/inspections` for new or modified inspections.

**Key implementation requirements:**
1. **Pagination:** The feed endpoint returns `metadata.next_page` for pagination. Follow until `remaining_records` is 0.
2. **High-water mark:** Track `last_sync_timestamp` (the `modified_after` parameter). Store in a `sync_state` table or config. After each successful run, update to the latest `modified_at` seen.
3. **Dedup check:** Before fetching full JSON, check if `sc_audit_id` already exists in `inspections` with matching `sc_modified_at`. Skip if unchanged.
4. **Change detection:** If `sc_modified_at` has changed, re-fetch and reprocess (the upsert in WP2 handles this).
5. **Rate limiting:** SC API has rate limits. Add configurable delay between requests (default 200ms).
6. **Backfill mode:** Support a `--backfill` flag that ignores the high-water mark and syncs from a given date (for initial historical load).
7. **Error handling:** Log failures per-inspection but continue processing the batch. Failed inspections get `processing_status = 'failed'`.

**Files to create:**
- `src/sync/scheduled_sync.ts` — main sync loop
- `src/sync/sc_api_client.ts` — Safety Culture API client (feed + audit endpoints)
- `src/sync/__tests__/` — tests with mocked API responses

---

### WP4: Webhook Handler — Real-time Ingestion Endpoint ✅ COMPLETE (2026-04-15)
**Can run: After WP1 + WP2 interfaces are defined**
**Depends on: WP1 (parser), WP2 (writer)**

Build the webhook endpoint that receives Safety Culture events and triggers processing.

**Key implementation requirements:**
1. **Endpoint:** HTTP POST handler that receives SC webhook payloads
2. **Payload parsing:** SC webhook payloads are lightweight — extract `audit_id` and event type
3. **Event filtering:** Only process `inspection.completed` and `inspection.updated` events. Ignore `inspection.started`, `inspection.deleted`.
4. **Async processing:** Don't block the webhook response. Accept the webhook (200 OK), then process asynchronously.
5. **Idempotency:** Webhook may fire multiple times for the same event. The UPSERT in WP2 handles this naturally.
6. **Webhook registration:** Script/instructions to register the webhook URL with SC API (`POST /webhooks`)
7. **Hosting:** Standalone Node.js HTTP server (port 3100). Platform-agnostic core (`handleWebhookPayload`) can be wrapped for Vercel/Edge Functions later. Local dev via ngrok.

**Decision resolved:** Standalone Node.js HTTP server. Keeps runtime consistent with rest of codebase (no Deno), deployable to Railway/Vercel/any Node host. `handleWebhookPayload()` is a pure function — easy to adapt to serverless if needed.

**Files created:**
- `src/webhook/handler.ts` — HTTP handler (event filtering, async processing, health check)
- `src/webhook/server.ts` — Standalone HTTP server entry point
- `src/webhook/register.ts` — CLI script: register/list/delete SC webhooks
- `src/webhook/__tests__/handler.test.ts` — 15 tests (all passing)
- `src/pipeline/process_inspection.ts` — Shared fetch→parse→write pipeline (used by WP3 + WP4)

---

### WP5: Media Pipeline — Photo Download & Storage
**Can run: Independently (uses sample media URLs)**
**Depends on: WP2 (needs inspection_id for linking)**

Build the media download pipeline that fetches photos from SC and stores them in Supabase Storage.

**Key implementation requirements:**
1. **Download:** Fetch photos from SC media URLs (`https://api.safetyculture.io/audits/{audit_id}/media/{media_id}`) using the bearer token
2. **Storage:** Upload to Supabase Storage bucket (create `inspection-media` bucket)
3. **Path convention:** `{org_id}/{site_name}/{YYYY-MM}/{audit_id}/{media_id}.{ext}`
4. **Update record:** After successful upload, update `inspection_media.storage_url` with the Supabase Storage public URL
5. **Dedup:** Skip download if `storage_url` is already populated
6. **Async/batch:** Media download is slow — process in parallel batches (configurable concurrency, default 3)
7. **Error handling:** If a download fails, log the error but don't fail the inspection processing. Leave `storage_url` null for retry.

**Files to create:**
- `src/media/downloader.ts` — SC media download + Supabase Storage upload
- `src/media/__tests__/` — tests with one real media download

---

### WP6: Onboarding Seed Data
**Can run: Independently**
**Depends on: WP2 (Supabase client)**

Seed the reference/lookup data that the pipeline needs before processing real inspections.

**Key implementation requirements:**
1. **Organization:** Create Constance Conservation org record
2. **Staff:** Seed known staff from SC template response_sets: Cameron Constance, Maddie Bryant, Matthew Constance, Ryan Arford, Ethan Tuema, Ethan Magtoto, Bailey Sellen, Jordan Darnley, Reece Morgan, Suzie Kiloh, Josh Collins, Madeline Sharpe
3. **Sites:** Seed known sites from SC response_sets: Harrington Forest, Camden Town Farm, McArthur Reserve, KLMP, Liverpool planting areas, Camden Basins (Elderslie + Spring Farm), Camden Alligator Weed, Harrington Lake Alligator Weed, Tom Way Reserve Liverpool, Gough Park Cecil Hills, EBSF Zone D, EBSF Zone B, Gough Park, Riverside Dr, Mount Annan Botanic Gardens, South Creek, Acacia pubescence, Rotary Cowpasture, Kavanaugh Riparian, Westwood Court, Spring Farm AV Jennings, Hinchinbrook
4. **Site name lookup:** Map SC labels to canonical site names (including known typos)
5. **Clients:** Seed Camden Council (primary client from sample data)

**Files to create:**
- `src/seed/onboarding.ts` — seed script
- `src/seed/data/` — JSON seed data files

---

## Dependency Graph

```
WP1 (Parser)          WP2 (DB Writer)       WP5 (Media)        WP6 (Seed Data)
     │                      │                     │                    │
     │                      │                     │                    │
     └──────┬───────────────┘                     │                    │
            │                                     │                    │
     ┌──────┴──────┐                              │                    │
     │             │                              │                    │
     ▼             ▼                              │                    │
WP3 (Sync)    WP4 (Webhook)                      │                    │
     │             │                              │                    │
     └──────┬──────┘                              │                    │
            │                                     │                    │
            ▼                                     ▼                    ▼
     Integration Testing (all WPs combined)
```

**Parallel execution plan:**
- **Wave 1 (immediate, all parallel):** WP1, WP2, WP5, WP6
- **Wave 2 (after WP1+WP2 complete):** WP3, WP4
- **Wave 3 (after all WPs):** Integration testing, backfill run

---

## Tech Stack Decisions Needed

| Decision | Options | Recommendation | Notes |
|----------|---------|----------------|-------|
| Language | TypeScript / Python | TypeScript | Already have npm project, Supabase JS SDK, consistent with M04/M05 (React dashboards) |
| Runtime | Node.js | Node.js 22 | Already installed |
| Webhook hosting | Supabase Edge Functions / Railway / Vercel | **Standalone Node.js** | Decided in WP4. Platform-agnostic core, deployable anywhere. Local dev via ngrok. |
| Scheduled sync trigger | Cron job / Supabase pg_cron / external scheduler | **Defer to WP3** | pg_cron keeps it in Supabase. External cron gives more control. |
| Testing | Jest / Vitest | Vitest | Faster, native TS support |

---

## Acceptance Criteria

- [ ] Can process all 5 sample JSONs from `samples/` without errors
- [ ] All inspection tables populated correctly (inspections, personnel, tasks, weeds, chemicals, media, observations, metadata)
- [ ] Chemical Application Record processed into dedicated tables
- [ ] Species and chemical names normalized via lookup tables
- [ ] Free-text fields parsed with warnings logged for unparseable values
- [ ] Media downloaded and stored in Supabase Storage with URLs updated
- [ ] Scheduled sync processes new inspections from SC API into Supabase
- [ ] Webhook endpoint receives SC events and triggers processing
- [ ] Reprocessing an inspection (same sc_audit_id) is idempotent — no duplicate records
- [ ] Processing status set correctly (completed / needs_review / failed)
- [ ] Full backfill of historical data executed successfully (all ~1,680 inspections)

---

## Files & Folder Structure

```
src/
├── parser/
│   ├── index.ts                          # Entry point: parseInspection(json) → ExtractionResult
│   ├── daily_work_report.ts              # DWR-specific extraction
│   ├── chemical_application_record.ts    # CAR-specific extraction
│   ├── field_extractors.ts               # Response reading by type
│   ├── normalizers.ts                    # Species/chemical name normalization
│   ├── free_text_parsers.ts              # Hours, %, chemical rates
│   ├── types.ts                          # ExtractionResult interface definition
│   └── __tests__/
├── db/
│   ├── writer.ts                         # Upsert orchestration
│   ├── lookups.ts                        # Site, staff, species, chemical resolution
│   ├── supabase_client.ts                # Configured client
│   └── __tests__/
├── sync/
│   ├── scheduled_sync.ts                 # Polling loop
│   ├── sc_api_client.ts                  # SC API wrapper
│   └── __tests__/
├── webhook/
│   ├── handler.ts                        # HTTP endpoint
│   ├── register.ts                       # Webhook registration
│   └── __tests__/
├── media/
│   ├── downloader.ts                     # Download + upload
│   └── __tests__/
├── seed/
│   ├── onboarding.ts                     # Seed script
│   └── data/                             # JSON seed files
└── shared/
    ├── config.ts                         # .env reader
    └── logger.ts                         # Structured logging
```

---

## Estimated Scope Per Work Package

| WP | Description | Complexity | Estimated effort |
|----|-------------|-----------|-----------------|
| WP1 | Parser & field extractor | High | Largest — handles all template evolution, data quality issues |
| WP2 | Database writer | Medium | UPSERT logic, lookup resolution, transaction wrapping |
| WP3 | Scheduled sync | Medium | Pagination, high-water mark, backfill mode |
| WP4 | Webhook handler | Low-Medium | Lightweight HTTP handler + SC registration |
| WP5 | Media pipeline | Medium | Download, storage, path conventions, concurrency |
| WP6 | Seed data | Low | Scripted inserts from known data |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| SC API rate limits hit during backfill | Medium | Configurable delay between requests. Process in batches. |
| IPv6-only DB connection blocks direct SQL | Low | Already mitigated: use Supabase REST API via `@supabase/supabase-js` |
| Template evolves again during M01 build | Medium | Parser is defensive by design — unknown fields logged, never crash. `sc_raw_json` stored for reprocessing. |
| Webhook URL requires public endpoint | Medium | Use ngrok for dev. Production decision deferred to WP4. |
| Free-text chemical rate parsing unreliable | Accepted | Store raw text always. Best-effort parsing with warnings. LLM extraction deferred to M02. |

---

## WP2 Completion Log — 2026-04-15

**Status: COMPLETE**

### Files Delivered

| File | Lines | Purpose |
|------|-------|---------|
| `src/db/writer.ts` | ~340 | Main upsert orchestration — `writeInspection(extraction, orgId)` |
| `src/db/lookups.ts` | ~290 | Site, staff, species, chemical resolution with auto-create |
| `src/db/supabase_client.ts` | ~27 | Configured Supabase client (service role key from `.env`) |
| `src/db/__tests__/fixtures.ts` | ~180 | Mock ExtractionResult builders (DWR, CAR, minimal, warnings) |
| `src/db/__tests__/writer.test.ts` | ~250 | 17 integration tests against live Supabase |

### Implementation Details

**Upsert logic:**
- `inspections` table uses Supabase `.upsert()` with `onConflict: 'sc_audit_id'`
- On reprocess: all 7 child tables (personnel, tasks, weeds, chemicals, media, observations, metadata) are explicitly deleted then reinserted
- Chemical Application Records use a separate delete-and-reinsert path via `sc_audit_id` on `chemical_application_records`, with child tables (`chemical_application_items`, `chemical_application_operators`, `chemical_application_additives`) cascading from parent delete

**Lookup resolution:**
- **Site:** `site_name_lookup` by `sc_label` (case-insensitive) → fallback to `sites` by `canonical_name`/`name` → auto-create + log for manual review
- **Staff:** `staff` by `name` (case-insensitive) → auto-create + log
- **Species:** `species_lookup` by `canonical_name` → alias search via `common_aliases` JSONB → return nulls if unknown (raw name still stored)
- **Chemicals:** `chemical_lookup` by `canonical_name` → alias search → return null if unknown (raw name still stored)
- Batch helpers (`resolveStaffBatch`, `resolveSpeciesBatch`, `resolveChemicalBatch`) deduplicate before querying

**Processing status:**
- `'completed'` — no parsing warnings
- `'needs_review'` — one or more `parsingWarnings[]` present
- `'failed'` — any write error; catch block sets status on the inspection row and returns error in `WriteResult`

**Signature compatibility:**
- `writeInspection(extraction: ExtractionResult, organizationId: string, client?: SupabaseClient): Promise<WriteResult>`
- `WriteResult.status` field matches what `src/pipeline/process_inspection.ts` reads
- Optional `client` parameter allows tests to inject their own Supabase client; defaults to module singleton

**Connection:**
- All writes use Supabase REST API via `@supabase/supabase-js` (service role key, HTTPS) — no direct DB connection needed

### Test Results

```
17 tests passed (0 failed)

lookups:
  ✓ resolveSpecies — known, case-insensitive, unknown
  ✓ resolveChemical — known, case-insensitive, unknown
  ✓ resolveSite — auto-create, reuse on second call
  ✓ resolveStaff — auto-create, reuse on second call

writeInspection:
  ✓ Full DWR write — all 7 child tables populated, species/chemical normalization verified
  ✓ Parsing warnings → needs_review status
  ✓ Minimal extraction (all nulls/empty arrays) — no child records created
  ✓ Idempotent reprocess — same sc_audit_id replaces child records, count verified
  ✓ Chemical Application Record — items, operators, additives all written
  ✓ Raw JSON stored in sc_raw_json
  ✓ organization_id present on inspection record
```

All tests run against live Supabase (`yrkclyeklwjlfblxvdbc`). Test cleanup removes all test records in `afterAll`.

### Design Decisions

1. **No true DB transactions** — Supabase REST API doesn't support multi-statement transactions. Compensating design: sequential writes with error-marks-as-failed pattern. Reprocessing (same `sc_audit_id`) cleans up any partial state from a prior failed run.
2. **Alias search is client-side** — Supabase doesn't support case-insensitive JSONB array containment queries natively. Species/chemical alias lookup fetches all rows with non-null `common_aliases` and filters client-side. Acceptable at current scale (~24 species, ~7 chemicals).
3. **Auto-create sites/staff** — rather than rejecting unknown names, the writer creates placeholder rows and logs warnings. This prevents ingestion failures while flagging data for manual review.

---

## WP3 Completion Log — 2026-04-15

**Status: COMPLETE**

### Files Delivered

| File | Purpose |
|------|---------|
| `src/sync/sc_api_client.ts` | SC API client — feed endpoint with pagination, audit fetch, configurable rate limiting |
| `src/sync/scheduled_sync.ts` | Main sync loop — high-water mark, dedup, change detection, backfill mode, CLI entry point |
| `src/sync/__tests__/sc_api_client.test.ts` | 10 tests — auth headers, pagination, cursor URLs, error handling, rate limiting |
| `src/sync/__tests__/scheduled_sync.test.ts` | 11 tests — end-to-end, dedup, change detection, archived skip, error continuity, backfill |
| `supabase/migrations/003_sync_state.sql` | `sync_state` table for high-water mark tracking |

### Supporting Infrastructure Created

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript config (ES2022, commonjs, strict) |
| `vitest.config.mts` | Vitest test runner config |
| `src/shared/config.ts` | Environment variable reader (SC API + Supabase + sync settings) |
| `src/shared/logger.ts` | Structured JSON logging with levels (debug/info/warn/error) |
| `src/parser/types.ts` | ExtractionResult interface contract (WP1↔WP2↔WP3) |
| `src/parser/index.ts` | Parser entry point with template detection and safe extraction wrapper |
| `src/db/writer.ts` | Full upsert orchestration (fleshed out from stub during WP2) |
| `src/db/supabase_client.ts` | Configured Supabase client (service role key) |

### Implementation Details

**SC API Client (`ScApiClient`):**
- `fetchFeedPage(modifiedAfter?, cursor?)` — single page fetch with auth header
- `fetchAllFeedPages(modifiedAfter?)` — async generator that follows `metadata.next_page` until `remaining_records === 0`
- `fetchAudit(auditId)` — full audit JSON for a single inspection
- Rate limiting via configurable delay between requests (env `SYNC_RATE_LIMIT_MS`, default 200ms)
- `ScApiError` class with `statusCode` and `responseBody` for structured error handling

**Scheduled Sync (`runSync`):**
- Reads high-water mark from `sync_state` table (`sync_type = 'scheduled_feed'`)
- Iterates all feed pages, for each entry:
  - Skips archived inspections
  - Dedup check: queries `inspections` by `sc_audit_id` + `sc_modified_at`, skips if unchanged
  - Change detection: mismatched `sc_modified_at` triggers re-fetch and full reprocess
  - Calls `parseInspection()` → `writeInspection()` pipeline
- Tracks highest `modified_at` seen across batch, updates `sync_state.high_water_mark` on success
- Per-inspection error handling: logs failure, marks `processing_status = 'failed'`, continues batch
- Returns `SyncRunResult` with `processed`, `skipped`, `failed` counts + error details

**Backfill mode:**
- `--backfill` flag: ignores high-water mark, syncs from beginning of time
- `--backfill-from <date>` flag: syncs from a specific ISO date
- Programmatic: `runSync({ backfill: true, backfillFrom: '2024-01-01T00:00:00Z' })`

**Sync state table (`003_sync_state.sql`):**
- `high_water_mark` — latest `sc_modified_at` seen (used as `modified_after` param)
- `last_sync_at` — timestamp of last successful sync completion
- `total_synced` — running total of inspections processed
- `last_error` — error from last run (null = clean)
- Seeded with initial row for `sync_type = 'scheduled_feed'`

**npm scripts:**
- `npm run sync` — incremental sync using high-water mark
- `npm run sync:backfill` — full backfill from epoch

### Spec Requirements Coverage

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | Pagination | `fetchAllFeedPages` async generator follows `metadata.next_page` until `remaining_records === 0` |
| 2 | High-water mark | `sync_state` table read/write; passes `high_water_mark` as `modified_after` param |
| 3 | Dedup check | Queries `inspections` by `sc_audit_id` + `sc_modified_at` before fetching full JSON |
| 4 | Change detection | Mismatched `sc_modified_at` triggers re-fetch; WP2 upsert handles the update |
| 5 | Rate limiting | Configurable `rateLimitMs` (env `SYNC_RATE_LIMIT_MS`, default 200ms) between all API requests |
| 6 | Backfill mode | `--backfill` ignores high-water mark; `--backfill-from <date>` syncs from specific date |
| 7 | Error handling | Per-inspection try/catch, failed inspections logged + marked `processing_status = 'failed'`, batch continues |

### Test Results

```
21 tests passed (0 failed)

sc_api_client (10):
  ✓ Sends correct auth header and query params
  ✓ Uses cursor URL directly when provided
  ✓ Throws ScApiError on non-OK response
  ✓ Includes status code and body in ScApiError
  ✓ Yields entries from a single page
  ✓ Follows pagination until remaining_records is 0
  ✓ Stops when data array is empty
  ✓ Passes modified_after to first page request
  ✓ Fetches full audit JSON by ID
  ✓ Delays between requests when rate limit is set

scheduled_sync (11):
  ✓ Processes new inspections end-to-end
  ✓ Skips unchanged inspections (dedup)
  ✓ Reprocesses inspections with changed sc_modified_at
  ✓ Skips archived inspections
  ✓ Continues batch on per-inspection failure
  ✓ Records failed status from writer
  ✓ Uses high-water mark from sync_state for incremental sync
  ✓ Ignores high-water mark in backfill mode
  ✓ Uses backfill-from date when specified
  ✓ Handles empty feed (no inspections to sync)
  ✓ Processes multiple pages
```

All sync tests use mocked API responses and Supabase queries (no live API calls).

### Design Decisions

1. **Async generator for pagination** — `fetchAllFeedPages` yields page-by-page rather than buffering all results. This keeps memory bounded during backfill of ~1,680 inspections.
2. **Rate limiting in the client** — throttle is applied to all API requests (feed + audit fetches) at the HTTP layer, not the sync loop. This ensures the 200ms minimum gap is respected regardless of how the client is used.
3. **Dedup before fetch** — checking `sc_modified_at` against the existing inspection row before calling `fetchAudit` avoids unnecessary API calls during incremental syncs where most inspections haven't changed.
4. **High-water mark updated per-run, not per-inspection** — the mark advances only after the full batch completes. If a run crashes mid-batch, the next run re-checks from the last successful position rather than skipping potentially unprocessed inspections.
5. **`runSync` is importable** — the sync loop is exported as a function with options parameter, not just a CLI script. This allows WP4's webhook handler or a future cron trigger to call it programmatically.
