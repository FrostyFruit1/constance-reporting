import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import {
  handleWebhookPayload,
  handleHttpRequest,
  onProcessingComplete,
  ScWebhookPayload,
} from '../handler';

// ── Mock the pipeline so we don't hit real APIs ──────────────────────

vi.mock('../../pipeline/process_inspection', () => ({
  processInspection: vi.fn().mockResolvedValue({
    auditId: 'audit_test123',
    writeResult: {
      inspectionId: 'uuid-123',
      scAuditId: 'audit_test123',
      status: 'completed',
    },
    error: null,
  }),
}));

// ── Mock config so it doesn't throw on missing env vars ──────────────

vi.mock('../../shared/config', () => ({
  config: {
    scApiToken: 'test-token',
    scOrgId: 'test-org',
    scApiBaseUrl: 'https://api.safetyculture.io',
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceRoleKey: 'test-key',
    syncRateLimitMs: 200,
    syncFeedPageSize: 100,
  },
}));

// ── Import the mocked processInspection for assertions ───────────────

import { processInspection } from '../../pipeline/process_inspection';

const mockedProcessInspection = vi.mocked(processInspection);

// ── Sample webhook payloads ──────────────────────────────────────────

const PAYLOAD_COMPLETED: ScWebhookPayload = {
  event: 'inspection.completed',
  audit_id: 'audit_abc123',
  organisation_id: 'role_775367e3fb5f4686b1cd1160ed8d818e',
  triggered_at: '2026-01-15T10:00:00Z',
};

const PAYLOAD_UPDATED: ScWebhookPayload = {
  event: 'inspection.updated',
  audit_id: 'audit_def456',
  organisation_id: 'role_775367e3fb5f4686b1cd1160ed8d818e',
  triggered_at: '2026-01-15T10:05:00Z',
};

const PAYLOAD_STARTED: ScWebhookPayload = {
  event: 'inspection.started',
  audit_id: 'audit_ghi789',
  organisation_id: 'role_775367e3fb5f4686b1cd1160ed8d818e',
};

const PAYLOAD_DELETED: ScWebhookPayload = {
  event: 'inspection.deleted',
  audit_id: 'audit_jkl012',
};

const PAYLOAD_HEADER_FORMAT: ScWebhookPayload = {
  header: { event: 'inspection.completed' },
  inspection_id: 'audit_mno345',
};

const PAYLOAD_UNDERSCORE_EVENT: ScWebhookPayload = {
  event: 'inspection_completed',
  audit_id: 'audit_pqr678',
};

const PAYLOAD_NO_EVENT: ScWebhookPayload = {
  audit_id: 'audit_stu901',
};

const PAYLOAD_NO_AUDIT_ID: ScWebhookPayload = {
  event: 'inspection.completed',
};

// ── Tests: handleWebhookPayload ──────────────────────────────────────

describe('handleWebhookPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    onProcessingComplete(null);
  });

  it('accepts inspection.completed and triggers async processing', () => {
    const result = handleWebhookPayload(PAYLOAD_COMPLETED);

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.action).toBe('processing');
    expect(result.body.auditId).toBe('audit_abc123');
    expect(mockedProcessInspection).toHaveBeenCalledWith('audit_abc123');
  });

  it('accepts inspection.updated and triggers async processing', () => {
    const result = handleWebhookPayload(PAYLOAD_UPDATED);

    expect(result.statusCode).toBe(200);
    expect(result.body.action).toBe('processing');
    expect(result.body.auditId).toBe('audit_def456');
    expect(mockedProcessInspection).toHaveBeenCalledWith('audit_def456');
  });

  it('acknowledges but ignores inspection.started', () => {
    const result = handleWebhookPayload(PAYLOAD_STARTED);

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.action).toBe('ignored');
    expect(result.body.reason).toBe('event_type_not_handled');
    expect(mockedProcessInspection).not.toHaveBeenCalled();
  });

  it('acknowledges but ignores inspection.deleted', () => {
    const result = handleWebhookPayload(PAYLOAD_DELETED);

    expect(result.statusCode).toBe(200);
    expect(result.body.action).toBe('ignored');
    expect(mockedProcessInspection).not.toHaveBeenCalled();
  });

  it('handles SC header-format event payloads', () => {
    const result = handleWebhookPayload(PAYLOAD_HEADER_FORMAT);

    expect(result.statusCode).toBe(200);
    expect(result.body.action).toBe('processing');
    expect(result.body.auditId).toBe('audit_mno345');
    expect(mockedProcessInspection).toHaveBeenCalledWith('audit_mno345');
  });

  it('handles underscore-delimited event names (inspection_completed)', () => {
    const result = handleWebhookPayload(PAYLOAD_UNDERSCORE_EVENT);

    expect(result.statusCode).toBe(200);
    expect(result.body.action).toBe('processing');
    expect(mockedProcessInspection).toHaveBeenCalledWith('audit_pqr678');
  });

  it('ignores payloads with missing event type', () => {
    const result = handleWebhookPayload(PAYLOAD_NO_EVENT);

    expect(result.statusCode).toBe(200);
    expect(result.body.action).toBe('ignored');
    expect(result.body.reason).toBe('missing_event_type');
    expect(mockedProcessInspection).not.toHaveBeenCalled();
  });

  it('ignores processable event with missing audit_id', () => {
    const result = handleWebhookPayload(PAYLOAD_NO_AUDIT_ID);

    expect(result.statusCode).toBe(200);
    expect(result.body.action).toBe('ignored');
    expect(result.body.reason).toBe('missing_audit_id');
    expect(mockedProcessInspection).not.toHaveBeenCalled();
  });

  it('is idempotent — same audit_id can be sent multiple times', () => {
    handleWebhookPayload(PAYLOAD_COMPLETED);
    handleWebhookPayload(PAYLOAD_COMPLETED);
    handleWebhookPayload(PAYLOAD_COMPLETED);

    // All three trigger processing — WP2 UPSERT handles dedup
    expect(mockedProcessInspection).toHaveBeenCalledTimes(3);
    expect(mockedProcessInspection).toHaveBeenCalledWith('audit_abc123');
  });

  it('invokes onProcessingComplete callback after async processing', async () => {
    const completionPromise = new Promise<void>((resolve) => {
      onProcessingComplete((result) => {
        expect(result.auditId).toBe('audit_test123');
        expect(result.writeResult?.status).toBe('completed');
        resolve();
      });
    });

    // Use the audit_id that matches the mock return value
    handleWebhookPayload({
      event: 'inspection.completed',
      audit_id: 'audit_test123',
    });

    // Wait for the async callback
    await completionPromise;
  });
});

// ── Tests: handleHttpRequest ─────────────────────────────────────────

describe('handleHttpRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(
    method: string,
    url: string,
    body?: string
  ): IncomingMessage {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;

    // If body is provided, simulate it being sent
    if (body !== undefined) {
      process.nextTick(() => {
        req.push(Buffer.from(body, 'utf-8'));
        req.push(null);
      });
    } else {
      process.nextTick(() => {
        req.push(null);
      });
    }

    return req;
  }

  function createMockResponse(): ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
  } {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    const res = new ServerResponse(req) as ServerResponse & {
      _statusCode: number;
      _headers: Record<string, string>;
      _body: string;
    };

    res._statusCode = 200;
    res._headers = {};
    res._body = '';

    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = ((statusCode: number, headers?: Record<string, string>) => {
      res._statusCode = statusCode;
      if (headers) Object.assign(res._headers, headers);
      return originalWriteHead(statusCode, headers);
    }) as typeof res.writeHead;

    const originalEnd = res.end.bind(res);
    res.end = ((chunk?: string | Buffer) => {
      if (chunk) res._body = typeof chunk === 'string' ? chunk : chunk.toString();
      return originalEnd(chunk);
    }) as typeof res.end;

    return res;
  }

  it('responds 200 to GET /health', async () => {
    const req = createMockRequest('GET', '/health');
    const res = createMockResponse();

    await handleHttpRequest(req, res);

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('constance-webhook');
  });

  it('responds 200 with processing action for valid webhook POST', async () => {
    const req = createMockRequest(
      'POST',
      '/webhook',
      JSON.stringify(PAYLOAD_COMPLETED)
    );
    const res = createMockResponse();

    await handleHttpRequest(req, res);

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.ok).toBe(true);
    expect(body.action).toBe('processing');
  });

  it('responds 400 for invalid JSON body', async () => {
    const req = createMockRequest('POST', '/webhook', 'not-json{{{');
    const res = createMockResponse();

    await handleHttpRequest(req, res);

    expect(res._statusCode).toBe(400);
    const body = JSON.parse(res._body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_json');
  });

  it('responds 404 for unknown routes', async () => {
    const req = createMockRequest('GET', '/unknown');
    const res = createMockResponse();

    await handleHttpRequest(req, res);

    expect(res._statusCode).toBe(404);
    const body = JSON.parse(res._body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('not_found');
  });

  it('responds 404 for non-POST to /webhook', async () => {
    const req = createMockRequest('GET', '/webhook');
    const res = createMockResponse();

    await handleHttpRequest(req, res);

    expect(res._statusCode).toBe(404);
  });
});
