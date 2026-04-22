/**
 * WP3: Scheduled Sync — polls GET /feed/inspections for new or modified inspections.
 *
 * Run modes:
 *   Normal:   npm run sync          — uses high-water mark from sync_state table
 *   Backfill: npm run sync:backfill -- syncs from epoch (ignores high-water mark)
 *
 * CLI flags (via process.argv):
 *   --backfill              Ignore high-water mark, sync from epoch
 *   --backfill-from <date>  Sync from a specific ISO date
 */

import { supabase } from '../db/supabase_client';
import { parseInspection } from '../parser/index';
import { writeInspection, WriteResult } from '../db/writer';
import { ScApiClient, FeedInspectionEntry, ScApiError } from './sc_api_client';
import { config } from '../shared/config';
import { createLogger } from '../shared/logger';

const log = createLogger('scheduled-sync');

// ── Sync state persistence ─────────────────────────────────────────────

interface SyncState {
  id: string;
  last_sync_at: string | null;
  high_water_mark: string | null;
  last_cursor: string | null;
  total_synced: number;
  last_error: string | null;
}

async function getSyncState(): Promise<SyncState> {
  const { data, error } = await supabase
    .from('sync_state')
    .select('*')
    .eq('sync_type', 'scheduled_feed')
    .single();

  if (error) {
    throw new Error(`Failed to read sync_state: ${error.message}`);
  }

  return data as SyncState;
}

async function updateSyncState(
  id: string,
  updates: Partial<Pick<SyncState, 'high_water_mark' | 'last_sync_at' | 'total_synced' | 'last_error' | 'last_cursor'>>
): Promise<void> {
  const { error } = await supabase
    .from('sync_state')
    .update(updates)
    .eq('id', id);

  if (error) {
    log.error('Failed to update sync_state', { error: error.message });
  }
}

// ── Dedup check ────────────────────────────────────────────────────────

/**
 * Check if an inspection already exists with matching sc_modified_at.
 * Returns true if the inspection exists and is unchanged (should skip).
 */
async function isUnchanged(scAuditId: string, scModifiedAt: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inspections')
    .select('sc_modified_at')
    .eq('sc_audit_id', scAuditId)
    .maybeSingle();

  if (error) {
    log.warn('Dedup check failed, will reprocess', { scAuditId, error: error.message });
    return false;
  }

  if (!data) {
    return false; // New inspection
  }

  // Compare timestamps — skip if unchanged
  return data.sc_modified_at === scModifiedAt;
}

// ── Process a single inspection ────────────────────────────────────────

async function processInspection(
  client: ScApiClient,
  entry: FeedInspectionEntry,
  organizationId: string
): Promise<WriteResult | null> {
  const { id: audit_id, modified_at } = entry;

  // Skip archived inspections
  if (entry.archived) {
    log.debug('Skipping archived inspection', { audit_id });
    return null;
  }

  // Dedup check
  if (await isUnchanged(audit_id, modified_at)) {
    log.debug('Skipping unchanged inspection', { audit_id, modified_at });
    return null;
  }

  log.info('Processing inspection', { audit_id, modified_at });

  // Fetch full audit JSON
  const auditJson = await client.fetchAudit(audit_id);

  // Parse
  const extraction = parseInspection(auditJson);

  // Write to Supabase
  const result = await writeInspection(extraction, organizationId);

  log.info('Inspection processed', {
    audit_id,
    status: result.status,
    inspectionId: result.inspectionId,
  });

  return result;
}

// ── CLI argument parsing ───────────────────────────────────────────────

interface SyncOptions {
  backfill: boolean;
  backfillFrom: string | null;
}

function parseCliArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const backfillIdx = args.indexOf('--backfill');
  const backfillFromIdx = args.indexOf('--backfill-from');

  return {
    backfill: backfillIdx !== -1 || backfillFromIdx !== -1,
    backfillFrom: backfillFromIdx !== -1 ? args[backfillFromIdx + 1] ?? null : null,
  };
}

// ── Main sync loop ─────────────────────────────────────────────────────

export async function runSync(options?: Partial<SyncOptions>): Promise<SyncRunResult> {
  const opts = options ?? parseCliArgs();
  const isBackfill = opts.backfill ?? false;

  const result: SyncRunResult = {
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Read current sync state
  const syncState = await getSyncState();
  log.info('Sync starting', {
    mode: isBackfill ? 'backfill' : 'incremental',
    highWaterMark: syncState.high_water_mark,
    totalSynced: syncState.total_synced,
  });

  // Determine the modified_after parameter
  let modifiedAfter: string | undefined;
  if (isBackfill) {
    modifiedAfter = opts.backfillFrom ?? undefined; // undefined = from beginning of time
    log.info('Backfill mode', { from: modifiedAfter ?? 'epoch' });
  } else {
    modifiedAfter = syncState.high_water_mark ?? undefined;
  }

  // Initialize API client
  const client = new ScApiClient({
    apiToken: config.scApiToken,
    baseUrl: config.scApiBaseUrl,
    rateLimitMs: config.syncRateLimitMs,
    feedPageSize: config.syncFeedPageSize,
  });

  // Resolve organization ID (single-tenant for now)
  const organizationId = await getOrganizationId();

  // Track the highest modified_at across all processed inspections
  let newHighWaterMark = syncState.high_water_mark;

  try {
    for await (const entries of client.fetchAllFeedPages(modifiedAfter)) {
      for (const entry of entries) {
        try {
          const writeResult = await processInspection(client, entry, organizationId);

          if (writeResult === null) {
            result.skipped++;
          } else if (writeResult.status === 'failed') {
            result.failed++;
            result.errors.push({
              auditId: entry.id,
              error: writeResult.error ?? 'Unknown error',
            });
          } else {
            result.processed++;
          }

          // Update high-water mark to the latest modified_at seen
          if (!newHighWaterMark || entry.modified_at > newHighWaterMark) {
            newHighWaterMark = entry.modified_at;
          }
        } catch (err) {
          // Per-inspection error — log and continue
          const errorMessage = err instanceof Error ? err.message : String(err);
          log.error('Failed to process inspection', {
            audit_id: entry.id,
            error: errorMessage,
          });
          result.failed++;
          result.errors.push({
            auditId: entry.id,
            error: errorMessage,
          });

          // Mark failed in DB if we can
          try {
            await markFailed(entry.id, errorMessage, organizationId);
          } catch {
            // Best-effort — don't fail the batch
          }
        }
      }
    }

    // Update sync state on success
    await updateSyncState(syncState.id, {
      high_water_mark: newHighWaterMark,
      last_sync_at: new Date().toISOString(),
      total_synced: syncState.total_synced + result.processed,
      last_error: null,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Sync run failed', { error: errorMessage });

    // Save error state but preserve high-water mark progress
    await updateSyncState(syncState.id, {
      high_water_mark: newHighWaterMark,
      last_error: errorMessage,
    });

    throw err;
  }

  log.info('Sync complete', {
    processed: result.processed,
    skipped: result.skipped,
    failed: result.failed,
  });

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────

async function getOrganizationId(): Promise<string> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(
      'No organization found in database. Run onboarding seed first (WP6).'
    );
  }

  return data.id;
}

async function markFailed(
  scAuditId: string,
  errorMessage: string,
  organizationId: string
): Promise<void> {
  // Upsert a minimal record so the failure is visible in the inspections table
  await supabase
    .from('inspections')
    .upsert(
      {
        sc_audit_id: scAuditId,
        sc_template_type: 'daily_work_report', // placeholder — may be wrong
        organization_id: organizationId,
        processing_status: 'failed',
      },
      { onConflict: 'sc_audit_id' }
    );
}

// ── Result type ────────────────────────────────────────────────────────

export interface SyncRunResult {
  processed: number;
  skipped: number;
  failed: number;
  errors: { auditId: string; error: string }[];
}

// ── CLI entry point ────────────────────────────────────────────────────

if (require.main === module) {
  runSync()
    .then((result) => {
      console.log('\nSync run complete:');
      console.log(`  Processed: ${result.processed}`);
      console.log(`  Skipped:   ${result.skipped}`);
      console.log(`  Failed:    ${result.failed}`);
      if (result.errors.length > 0) {
        console.log('\nFailed inspections:');
        for (const e of result.errors) {
          console.log(`  ${e.auditId}: ${e.error}`);
        }
      }
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal sync error:', err);
      process.exit(2);
    });
}
