import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────────

const {
  mockFrom,
  mockStorageFrom,
  mockListBuckets,
  mockCreateBucket,
  mockFetch,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockListBuckets: vi.fn(),
  mockCreateBucket: vi.fn(),
  mockFetch: vi.fn(),
}));

// ── Mock setup ──────────────────────────────────────────────────────────

vi.mock('../../shared/config', () => ({
  config: {
    scApiToken: 'test-sc-token',
    scOrgId: 'test-org',
    scApiBaseUrl: 'https://api.safetyculture.io',
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceRoleKey: 'test-key',
    syncRateLimitMs: 0,
    syncFeedPageSize: 10,
  },
}));

vi.mock('../../db/supabase_client', () => ({
  supabase: {
    from: mockFrom,
    storage: {
      listBuckets: mockListBuckets,
      createBucket: mockCreateBucket,
      from: mockStorageFrom,
    },
  },
}));

// Stub global fetch
vi.stubGlobal('fetch', mockFetch);

import {
  downloadPendingMedia,
  parseScMediaUrl,
  buildStoragePath,
  sanitizePath,
} from '../downloader';

// ── Helpers ─────────────────────────────────────────────────────────────

function makePendingMediaRows(
  overrides: Partial<{
    id: string;
    sc_media_href: string;
    inspection_id: string;
    sc_audit_id: string;
    date: string;
    site_name: string | null;
  }>[] = [{}],
) {
  return overrides.map((o, i) => ({
    id: o.id ?? `media-uuid-${i}`,
    sc_media_href:
      o.sc_media_href ??
      `https://api.safetyculture.io/audits/audit_abc/media/media_${i}`,
    inspection_id: o.inspection_id ?? `insp-uuid-${i}`,
    inspections: {
      sc_audit_id: o.sc_audit_id ?? 'audit_abc',
      date: o.date ?? '2025-06-15',
      sites: o.site_name !== undefined ? { name: o.site_name } : { name: 'Hinchinbrook' },
    },
  }));
}

function setupSupabaseMocks(opts: {
  bucketExists?: boolean;
  pendingRows?: ReturnType<typeof makePendingMediaRows>;
  queryError?: string;
  uploadError?: string;
  updateError?: string;
} = {}) {
  const {
    bucketExists = true,
    pendingRows = makePendingMediaRows(),
    queryError,
    uploadError,
    updateError,
  } = opts;

  // Storage: listBuckets
  mockListBuckets.mockResolvedValue({
    data: bucketExists ? [{ name: 'inspection-media' }] : [],
    error: null,
  });
  mockCreateBucket.mockResolvedValue({ error: null });

  // Storage: upload
  mockStorageFrom.mockReturnValue({
    upload: vi.fn().mockResolvedValue({
      error: uploadError ? { message: uploadError } : null,
    }),
  });

  // Supabase .from() chains
  mockFrom.mockImplementation((table: string) => {
    if (table === 'inspection_media') {
      return {
        select: () => ({
          is: () => ({
            not: () =>
              Promise.resolve({
                data: queryError ? null : pendingRows,
                error: queryError ? { message: queryError } : null,
              }),
          }),
        }),
        update: () => ({
          eq: () =>
            Promise.resolve({
              error: updateError ? { message: updateError } : null,
            }),
        }),
      };
    }
    return {};
  });
}

function makeFetchResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  body?: Buffer;
} = {}) {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'image/jpeg',
    body = Buffer.from('fake-image-data'),
  } = opts;

  return {
    ok,
    status,
    statusText,
    headers: {
      get: (key: string) => (key === 'content-type' ? contentType : null),
    },
    arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('media/downloader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Pure helpers ────────────────────────────────────────────────────

  describe('parseScMediaUrl', () => {
    it('extracts audit and media IDs from standard URL', () => {
      const result = parseScMediaUrl(
        'https://api.safetyculture.io/audits/audit_abc123/media/media_xyz789',
      );
      expect(result).toEqual({ auditId: 'audit_abc123', mediaId: 'media_xyz789' });
    });

    it('handles URLs with query parameters', () => {
      const result = parseScMediaUrl(
        'https://api.safetyculture.io/audits/audit_1/media/media_2?size=original',
      );
      expect(result).toEqual({ auditId: 'audit_1', mediaId: 'media_2' });
    });

    it('returns null for invalid URLs', () => {
      expect(parseScMediaUrl('https://example.com/other')).toBeNull();
      expect(parseScMediaUrl('')).toBeNull();
    });
  });

  describe('sanitizePath', () => {
    it('replaces special characters with underscores', () => {
      expect(sanitizePath('Hinchinbrook Island / Site A')).toBe(
        'Hinchinbrook_Island___Site_A',
      );
    });

    it('preserves hyphens and underscores', () => {
      expect(sanitizePath('north-reef_site')).toBe('north-reef_site');
    });

    it('truncates to 100 characters', () => {
      const long = 'a'.repeat(200);
      expect(sanitizePath(long)).toHaveLength(100);
    });
  });

  describe('buildStoragePath', () => {
    it('builds correct path with all values', () => {
      expect(buildStoragePath('Hinchinbrook', '2025-06-15', 'audit_1', 'media_2', 'jpg'))
        .toBe('Hinchinbrook/2025-06/audit_1/media_2.jpg');
    });

    it('uses unknown_site when site is null', () => {
      expect(buildStoragePath(null, '2025-06-15', 'audit_1', 'media_2', 'png'))
        .toBe('unknown_site/2025-06/audit_1/media_2.png');
    });

    it('uses unknown month when date is null', () => {
      expect(buildStoragePath('Site', null, 'audit_1', 'media_2', 'jpg'))
        .toBe('Site/unknown/audit_1/media_2.jpg');
    });
  });

  // ── downloadPendingMedia ───────────────────────────────────────────

  describe('downloadPendingMedia', () => {
    it('downloads and uploads a single media item', async () => {
      setupSupabaseMocks();
      mockFetch.mockResolvedValue(makeFetchResponse());

      const result = await downloadPendingMedia(1);

      expect(result.total).toBe(1);
      expect(result.uploaded).toBe(1);
      expect(result.failed).toBe(0);

      // Verify fetch was called with auth header
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.safetyculture.io/audits/audit_abc/media/media_0',
        { headers: { Authorization: 'Bearer test-sc-token' } },
      );

      // Verify storage upload was called
      expect(mockStorageFrom).toHaveBeenCalledWith('inspection-media');
    });

    it('returns early with no work when no pending media', async () => {
      setupSupabaseMocks({ pendingRows: [] });

      const result = await downloadPendingMedia();

      expect(result.total).toBe(0);
      expect(result.uploaded).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('creates bucket if it does not exist', async () => {
      setupSupabaseMocks({ bucketExists: false, pendingRows: [] });

      await downloadPendingMedia();

      expect(mockCreateBucket).toHaveBeenCalledWith('inspection-media', {
        public: false,
      });
    });

    it('skips bucket creation if it already exists', async () => {
      setupSupabaseMocks({ bucketExists: true, pendingRows: [] });

      await downloadPendingMedia();

      expect(mockCreateBucket).not.toHaveBeenCalled();
    });

    it('continues batch when one download fails', async () => {
      const rows = makePendingMediaRows([
        { id: 'fail-media', sc_media_href: 'https://api.safetyculture.io/audits/audit_1/media/media_fail' },
        { id: 'ok-media', sc_media_href: 'https://api.safetyculture.io/audits/audit_1/media/media_ok' },
      ]);
      setupSupabaseMocks({ pendingRows: rows });

      // First fetch fails, second succeeds
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse({ ok: false, status: 500, statusText: 'Internal Server Error' }))
        .mockResolvedValueOnce(makeFetchResponse());

      const result = await downloadPendingMedia(1);

      expect(result.total).toBe(2);
      expect(result.uploaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].mediaId).toBe('fail-media');
      expect(result.errors[0].error).toContain('500');
    });

    it('handles storage upload errors without crashing batch', async () => {
      const rows = makePendingMediaRows([
        { id: 'upload-fail' },
        { id: 'upload-ok' },
      ]);
      setupSupabaseMocks({ pendingRows: rows });

      mockFetch.mockResolvedValue(makeFetchResponse());

      // First upload fails, second succeeds
      const uploadMock = vi.fn()
        .mockResolvedValueOnce({ error: { message: 'Quota exceeded' } })
        .mockResolvedValueOnce({ error: null });
      mockStorageFrom.mockReturnValue({ upload: uploadMock });

      const result = await downloadPendingMedia(1);

      expect(result.failed).toBe(1);
      expect(result.uploaded).toBe(1);
      expect(result.errors[0].error).toContain('Quota exceeded');
    });

    it('handles update storage_url errors without crashing batch', async () => {
      setupSupabaseMocks({ updateError: 'constraint violation' });
      mockFetch.mockResolvedValue(makeFetchResponse());

      const result = await downloadPendingMedia(1);

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('constraint violation');
    });

    it('handles query error gracefully', async () => {
      setupSupabaseMocks({ queryError: 'connection refused' });

      const result = await downloadPendingMedia();

      expect(result.total).toBe(0);
      expect(result.uploaded).toBe(0);
    });

    it('processes multiple items with concurrency', async () => {
      const rows = makePendingMediaRows([
        { id: 'media-1' },
        { id: 'media-2' },
        { id: 'media-3' },
        { id: 'media-4' },
        { id: 'media-5' },
      ]);
      setupSupabaseMocks({ pendingRows: rows });
      mockFetch.mockResolvedValue(makeFetchResponse());

      const result = await downloadPendingMedia(3);

      expect(result.total).toBe(5);
      expect(result.uploaded).toBe(5);
      expect(result.failed).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('picks correct extension from content-type', async () => {
      setupSupabaseMocks();
      mockFetch.mockResolvedValue(makeFetchResponse({ contentType: 'image/png' }));

      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      mockStorageFrom.mockReturnValue({ upload: uploadMock });

      await downloadPendingMedia(1);

      // Path should end with .png
      const uploadPath = uploadMock.mock.calls[0][0] as string;
      expect(uploadPath).toMatch(/\.png$/);
    });

    it('defaults to jpg for unknown content types', async () => {
      setupSupabaseMocks();
      mockFetch.mockResolvedValue(makeFetchResponse({ contentType: 'application/octet-stream' }));

      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      mockStorageFrom.mockReturnValue({ upload: uploadMock });

      await downloadPendingMedia(1);

      const uploadPath = uploadMock.mock.calls[0][0] as string;
      expect(uploadPath).toMatch(/\.jpg$/);
    });

    it('handles unparseable media URL without crashing batch', async () => {
      const rows = makePendingMediaRows([
        { id: 'bad-url', sc_media_href: 'https://example.com/invalid' },
        { id: 'good-url' },
      ]);
      setupSupabaseMocks({ pendingRows: rows });
      mockFetch.mockResolvedValue(makeFetchResponse());

      const result = await downloadPendingMedia(1);

      expect(result.failed).toBe(1);
      expect(result.uploaded).toBe(1);
      expect(result.errors[0].error).toContain('Cannot parse media URL');
    });

    it('builds correct storage path from joined data', async () => {
      const rows = makePendingMediaRows([{
        id: 'path-test',
        sc_media_href: 'https://api.safetyculture.io/audits/audit_x1/media/media_y2',
        site_name: 'Hinchinbrook',
        date: '2025-06-15',
      }]);
      setupSupabaseMocks({ pendingRows: rows });
      mockFetch.mockResolvedValue(makeFetchResponse());

      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      mockStorageFrom.mockReturnValue({ upload: uploadMock });

      await downloadPendingMedia(1);

      const uploadPath = uploadMock.mock.calls[0][0] as string;
      expect(uploadPath).toBe('Hinchinbrook/2025-06/audit_x1/media_y2.jpg');
    });

    it('uses unknown_site when site is null', async () => {
      const rows = makePendingMediaRows([{
        id: 'no-site',
        sc_media_href: 'https://api.safetyculture.io/audits/audit_1/media/media_1',
        site_name: null,
        date: '2025-06-15',
      }]);
      setupSupabaseMocks({ pendingRows: rows });
      mockFetch.mockResolvedValue(makeFetchResponse());

      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      mockStorageFrom.mockReturnValue({ upload: uploadMock });

      await downloadPendingMedia(1);

      const uploadPath = uploadMock.mock.calls[0][0] as string;
      expect(uploadPath).toMatch(/^unknown_site\//);
    });
  });
});
