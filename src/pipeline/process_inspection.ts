/**
 * Shared processing pipeline — fetch, parse, write.
 *
 * Used by both WP3 (scheduled sync) and WP4 (webhook handler).
 * This is the "Processing Core" from the architecture diagram.
 */

import { ScApiClient } from '../sync/sc_api_client';
import { parseInspection } from '../parser/index';
import { writeInspection, WriteResult } from '../db/writer';
import { createLogger } from '../shared/logger';
import { config } from '../shared/config';

const log = createLogger('pipeline');

/** Default organization ID — single-tenant for now (WP6 seeds this). */
const DEFAULT_ORG_ID = process.env.DEFAULT_ORGANIZATION_ID ?? '';

/** Lazily initialized shared SC API client. */
let _scClient: ScApiClient | null = null;

function getScClient(): ScApiClient {
  if (!_scClient) {
    _scClient = new ScApiClient({
      apiToken: config.scApiToken,
      baseUrl: config.scApiBaseUrl,
      rateLimitMs: config.syncRateLimitMs,
    });
  }
  return _scClient;
}

export interface ProcessResult {
  auditId: string;
  writeResult: WriteResult | null;
  error: string | null;
}

/**
 * Process a single inspection end-to-end:
 *   1. Fetch full audit JSON from SC API
 *   2. Parse with WP1 parser
 *   3. Write to Supabase with WP2 writer
 *
 * Never throws — returns error in ProcessResult.
 *
 * @param auditId - The SC audit_id to process
 * @param organizationId - Organization UUID (defaults to DEFAULT_ORGANIZATION_ID env var)
 * @param scClient - Optional SC API client (for testing/reuse). Uses shared instance if omitted.
 */
export async function processInspection(
  auditId: string,
  organizationId?: string,
  scClient?: ScApiClient
): Promise<ProcessResult> {
  const orgId = organizationId ?? DEFAULT_ORG_ID;
  const client = scClient ?? getScClient();

  try {
    // 1. Fetch full audit JSON
    log.info('Processing inspection', { auditId });
    const json = await client.fetchAudit(auditId);

    // 2. Parse
    const extraction = parseInspection(json);
    log.info('Parsed inspection', {
      auditId,
      templateType: extraction.templateType,
      warnings: extraction.parsingWarnings.length,
    });

    // 3. Write
    const writeResult = await writeInspection(extraction, orgId);
    log.info('Wrote inspection', {
      auditId,
      inspectionId: writeResult.inspectionId,
      status: writeResult.status,
    });

    return { auditId, writeResult, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to process inspection', { auditId, error: message });
    return { auditId, writeResult: null, error: message };
  }
}
