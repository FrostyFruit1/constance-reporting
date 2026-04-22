/**
 * WP5: Media Pipeline — download from Safety Culture, upload to Supabase Storage.
 *
 * Fetches inspection photos via SC API, uploads to the `inspection-media`
 * storage bucket, and updates `inspection_media.storage_url` for each row.
 */

import { config } from '../shared/config';
import { supabase } from '../db/supabase_client';
import { createLogger } from '../shared/logger';

const log = createLogger('media');

// ── Types ─────────────────────────────────────────────────────────────

interface PendingMedia {
  id: string;
  sc_media_href: string;
  inspection_id: string;
  sc_audit_id: string;
  date: string | null;
  site_name: string | null;
}

export interface MediaDownloadResult {
  total: number;
  uploaded: number;
  skipped: number;
  failed: number;
  errors: { mediaId: string; error: string }[];
}

// ── Helpers (exported for testing) ────────────────────────────────────

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

export function parseScMediaUrl(href: string): { auditId: string; mediaId: string } | null {
  const match = href.match(/\/audits\/([^/]+)\/media\/([^/?]+)/);
  if (!match) return null;
  return { auditId: match[1], mediaId: match[2] };
}

export function sanitizePath(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

export function buildStoragePath(
  siteName: string | null,
  date: string | null,
  auditId: string,
  mediaId: string,
  ext: string,
): string {
  const site = sanitizePath(siteName ?? 'unknown_site');
  const month = date ? date.substring(0, 7) : 'unknown';
  return `${site}/${month}/${auditId}/${mediaId}.${ext}`;
}

// ── Bucket setup ──────────────────────────────────────────────────────

const BUCKET_NAME = 'inspection-media';

async function ensureBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
    });
    if (error) throw new Error(`Failed to create bucket: ${error.message}`);
    log.info('Created storage bucket', { bucket: BUCKET_NAME });
  }
}

// ── Single media download + upload ────────────────────────────────────

async function processOne(row: PendingMedia): Promise<void> {
  const parsed = parseScMediaUrl(row.sc_media_href);
  if (!parsed) {
    throw new Error(`Cannot parse media URL: ${row.sc_media_href}`);
  }

  // Download from SC API
  const response = await fetch(row.sc_media_href, {
    headers: {
      Authorization: `Bearer ${config.scApiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`SC API ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const ext = CONTENT_TYPE_EXT[contentType.split(';')[0].trim()] ?? 'jpg';
  const buffer = Buffer.from(await response.arrayBuffer());

  const storagePath = buildStoragePath(
    row.site_name,
    row.date,
    parsed.auditId,
    parsed.mediaId,
    ext,
  );

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Update inspection_media row
  const { error: updateError } = await supabase
    .from('inspection_media')
    .update({ storage_url: storagePath })
    .eq('id', row.id);

  if (updateError) {
    throw new Error(`Failed to update storage_url: ${updateError.message}`);
  }

  log.info('Uploaded media', { mediaId: parsed.mediaId, path: storagePath });
}

// ── Concurrency pool ─────────────────────────────────────────────────

async function processInBatches(
  rows: PendingMedia[],
  concurrency: number,
  result: MediaDownloadResult,
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < rows.length) {
      const current = index++;
      const row = rows[current];
      try {
        await processOne(row);
        result.uploaded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Media download failed', {
          id: row.id,
          scMediaHref: row.sc_media_href,
          error: message,
        });
        result.failed++;
        result.errors.push({ mediaId: row.id, error: message });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, rows.length) },
    () => worker(),
  );
  await Promise.all(workers);
}

// ── Main entry point ──────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 3;

/**
 * Download all pending media from Safety Culture and upload to Supabase Storage.
 *
 * Queries inspection_media rows where storage_url IS NULL, downloads each
 * from the SC API, uploads to the `inspection-media` bucket, and updates
 * the row with the storage path.
 *
 * Never throws — returns a result summary.
 */
export async function downloadPendingMedia(
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<MediaDownloadResult> {
  const result: MediaDownloadResult = {
    total: 0,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    await ensureBucket();

    // Query pending media with joined inspection + site data
    const { data: rows, error } = await supabase
      .from('inspection_media')
      .select(`
        id,
        sc_media_href,
        inspection_id,
        inspections!inner (
          sc_audit_id,
          date,
          sites ( name )
        )
      `)
      .is('storage_url', null)
      .not('sc_media_href', 'is', null);

    if (error) {
      throw new Error(`Failed to query pending media: ${error.message}`);
    }

    if (!rows || rows.length === 0) {
      log.info('No pending media to download');
      return result;
    }

    // Flatten joined data
    const pending: PendingMedia[] = rows.map((r: any) => ({
      id: r.id,
      sc_media_href: r.sc_media_href,
      inspection_id: r.inspection_id,
      sc_audit_id: r.inspections.sc_audit_id,
      date: r.inspections.date,
      site_name: r.inspections.sites?.name ?? null,
    }));

    result.total = pending.length;
    log.info('Found pending media', { count: pending.length });

    await processInBatches(pending, concurrency, result);

    log.info('Media download complete', {
      total: result.total,
      uploaded: result.uploaded,
      failed: result.failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Media pipeline failed', { error: message });
  }

  return result;
}
