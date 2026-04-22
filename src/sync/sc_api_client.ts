/**
 * Safety Culture API client — feed + audit endpoints.
 *
 * Handles pagination, rate limiting, and authentication.
 */

import { createLogger } from '../shared/logger';

const log = createLogger('sc-api');

// ── Response types from SC API ─────────────────────────────────────────

export interface FeedInspectionEntry {
  id: string;
  modified_at: string;
  template_id: string;
  archived: boolean;
  created_at: string;
  /** Some feed responses include the audit name */
  name?: string;
}

export interface FeedResponse {
  count: number;
  total: number;
  data: FeedInspectionEntry[];
  metadata: {
    next_page: string | null;
    remaining_records: number;
  };
}

export interface ScApiClientOptions {
  apiToken: string;
  baseUrl?: string;
  rateLimitMs?: number;
  feedPageSize?: number;
}

export class ScApiClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly rateLimitMs: number;
  private readonly feedPageSize: number;
  private lastRequestTime: number = 0;

  constructor(options: ScApiClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = options.baseUrl ?? 'https://api.safetyculture.io';
    this.rateLimitMs = options.rateLimitMs ?? 200;
    this.feedPageSize = options.feedPageSize ?? 100;
  }

  // ── Rate limiting ──────────────────────────────────────────────────

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.rateLimitMs) {
      const delay = this.rateLimitMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    this.lastRequestTime = Date.now();
  }

  // ── HTTP layer ─────────────────────────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    await this.throttle();

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    log.debug('API request', { url });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable>');
      throw new ScApiError(
        `SC API ${response.status}: ${response.statusText}`,
        response.status,
        body
      );
    }

    return response.json() as Promise<T>;
  }

  // ── Feed endpoint ──────────────────────────────────────────────────

  /**
   * Fetch a single page of the inspections feed.
   *
   * @param modifiedAfter - ISO timestamp to filter by modified_at > this value
   * @param cursor - Pagination cursor (from metadata.next_page of previous response)
   */
  async fetchFeedPage(
    modifiedAfter?: string,
    cursor?: string
  ): Promise<FeedResponse> {
    if (cursor) {
      // next_page is a full URL or path — use it directly
      return this.request<FeedResponse>(cursor);
    }

    const params = new URLSearchParams();
    params.set('limit', String(this.feedPageSize));
    if (modifiedAfter) {
      params.set('modified_after', modifiedAfter);
    }

    return this.request<FeedResponse>(`/feed/inspections?${params.toString()}`);
  }

  /**
   * Iterate through all pages of the inspections feed.
   * Yields each page's entries. Follows metadata.next_page until remaining_records is 0.
   *
   * @param modifiedAfter - ISO timestamp high-water mark
   */
  async *fetchAllFeedPages(
    modifiedAfter?: string
  ): AsyncGenerator<FeedInspectionEntry[], void, unknown> {
    let cursor: string | undefined;
    let pageNumber = 0;

    while (true) {
      pageNumber++;
      const response = await this.fetchFeedPage(modifiedAfter, cursor);

      log.info('Feed page fetched', {
        page: pageNumber,
        count: response.count,
        total: response.total,
        remaining: response.metadata.remaining_records,
      });

      if (response.data.length > 0) {
        yield response.data;
      }

      if (
        response.metadata.remaining_records === 0 ||
        !response.metadata.next_page
      ) {
        break;
      }

      cursor = response.metadata.next_page;
    }
  }

  // ── Audit endpoint ─────────────────────────────────────────────────

  /**
   * Fetch the full audit JSON for a single inspection.
   *
   * @param auditId - The SC audit_id (e.g. "audit_abc123")
   */
  async fetchAudit(auditId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/audits/${auditId}`);
  }
}

// ── Error class ────────────────────────────────────────────────────────

export class ScApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'ScApiError';
  }
}
