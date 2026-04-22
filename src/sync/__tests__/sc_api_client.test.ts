import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScApiClient, ScApiError, FeedResponse } from '../sc_api_client';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFeedResponse(
  data: { id: string; modified_at: string }[],
  overrides: Partial<FeedResponse['metadata']> = {}
): FeedResponse {
  return {
    count: data.length,
    total: data.length,
    data: data.map(d => ({
      id: d.id,
      modified_at: d.modified_at,
      template_id: 'template_test',
      archived: false,
      created_at: d.modified_at,
    })),
    metadata: {
      next_page: overrides.next_page ?? null,
      remaining_records: overrides.remaining_records ?? 0,
    },
  };
}

function createClient(rateLimitMs = 0): ScApiClient {
  return new ScApiClient({
    apiToken: 'test-token',
    baseUrl: 'https://api.safetyculture.io',
    rateLimitMs,
    feedPageSize: 10,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ScApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchFeedPage', () => {
    it('sends correct auth header and query params', async () => {
      const response = makeFeedResponse([
        { id: 'audit_1', modified_at: '2025-01-01T00:00:00Z' },
      ]);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const client = createClient();
      await client.fetchFeedPage('2025-01-01T00:00:00Z');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://api.safetyculture.io/feed/inspections?limit=10&modified_after=2025-01-01T00%3A00%3A00Z'
      );
      expect(opts.headers['Authorization']).toBe('Bearer test-token');
      expect(opts.headers['Accept']).toBe('application/json');
    });

    it('uses cursor URL directly when provided', async () => {
      const response = makeFeedResponse([]);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const client = createClient();
      await client.fetchFeedPage(undefined, 'https://api.safetyculture.io/feed/inspections?cursor=abc');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.safetyculture.io/feed/inspections?cursor=abc');
    });

    it('throws ScApiError on non-OK response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('Rate limited'),
      });

      const client = createClient();
      await expect(client.fetchFeedPage()).rejects.toThrow(ScApiError);

      try {
        await client.fetchFeedPage();
      } catch (err) {
        // fetchMock already consumed, need a second mock
      }
    });

    it('includes status code and body in ScApiError', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid token'),
      });

      const client = createClient();
      try {
        await client.fetchFeedPage();
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ScApiError);
        const apiErr = err as ScApiError;
        expect(apiErr.statusCode).toBe(401);
        expect(apiErr.responseBody).toBe('Invalid token');
      }
    });
  });

  describe('fetchAllFeedPages', () => {
    it('yields entries from a single page', async () => {
      const response = makeFeedResponse([
        { id: 'audit_1', modified_at: '2025-01-01T00:00:00Z' },
        { id: 'audit_2', modified_at: '2025-01-02T00:00:00Z' },
      ]);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const client = createClient();
      const pages: unknown[][] = [];
      for await (const entries of client.fetchAllFeedPages()) {
        pages.push(entries);
      }

      expect(pages).toHaveLength(1);
      expect(pages[0]).toHaveLength(2);
    });

    it('follows pagination until remaining_records is 0', async () => {
      // Page 1: 2 records, more to come
      const page1 = makeFeedResponse(
        [
          { id: 'audit_1', modified_at: '2025-01-01T00:00:00Z' },
          { id: 'audit_2', modified_at: '2025-01-02T00:00:00Z' },
        ],
        { next_page: '/feed/inspections?cursor=page2', remaining_records: 1 }
      );

      // Page 2: 1 record, done
      const page2 = makeFeedResponse(
        [{ id: 'audit_3', modified_at: '2025-01-03T00:00:00Z' }],
        { remaining_records: 0 }
      );

      fetchMock
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) });

      const client = createClient();
      const allEntries: string[] = [];
      for await (const entries of client.fetchAllFeedPages()) {
        allEntries.push(...entries.map(e => e.id));
      }

      expect(allEntries).toEqual(['audit_1', 'audit_2', 'audit_3']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops when data array is empty', async () => {
      const response = makeFeedResponse([]);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const client = createClient();
      const pages: unknown[][] = [];
      for await (const entries of client.fetchAllFeedPages()) {
        pages.push(entries);
      }

      expect(pages).toHaveLength(0);
    });

    it('passes modified_after to first page request', async () => {
      const response = makeFeedResponse([]);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const client = createClient();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of client.fetchAllFeedPages('2025-06-01T00:00:00Z')) {
        // consume
      }

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('modified_after=2025-06-01');
    });
  });

  describe('fetchAudit', () => {
    it('fetches full audit JSON by ID', async () => {
      const auditJson = { id: 'audit_123', template_id: 'template_abc' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(auditJson),
      });

      const client = createClient();
      const result = await client.fetchAudit('audit_123');

      expect(result).toEqual(auditJson);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.safetyculture.io/audits/audit_123');
    });
  });

  describe('rate limiting', () => {
    it('delays between requests when rate limit is set', async () => {
      const response = makeFeedResponse([]);
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const client = createClient(50); // 50ms rate limit
      const start = Date.now();

      await client.fetchFeedPage();
      await client.fetchFeedPage();
      await client.fetchFeedPage();

      const elapsed = Date.now() - start;
      // 3 requests with 50ms gap between each = at least 100ms total
      expect(elapsed).toBeGreaterThanOrEqual(90); // small tolerance
    });
  });
});
