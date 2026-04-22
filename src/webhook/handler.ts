/**
 * WP4 — Webhook handler for Safety Culture events.
 *
 * Receives lightweight SC webhook payloads, filters by event type,
 * returns 200 OK immediately, and processes the inspection asynchronously.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { processInspection, ProcessResult } from '../pipeline/process_inspection';
import { createLogger } from '../shared/logger';

const log = createLogger('webhook');

// ── SC webhook payload shape ─────────────────────────────────────────

export interface ScWebhookPayload {
  /** Event type, e.g. "inspection.completed", "inspection.updated" */
  event?: string;
  /** Alternative: event in a header object */
  header?: { event?: string };
  /** The audit ID — may appear as audit_id or inspection_id */
  audit_id?: string;
  inspection_id?: string;
  /** Organization */
  organisation_id?: string;
  organization_id?: string;
  /** When the event was triggered */
  triggered_at?: string;
}

// ── Event filtering ──────────────────────────────────────────────────

/** Events we process. Everything else is acknowledged but ignored. */
const PROCESSABLE_EVENTS = new Set([
  'inspection.completed',
  'inspection.updated',
  // SC API may also use underscore-delimited event names
  'inspection_completed',
  'inspection_modified',
]);

function normalizeEventName(raw: string): string {
  return raw.trim().toLowerCase();
}

function isProcessableEvent(event: string): boolean {
  return PROCESSABLE_EVENTS.has(normalizeEventName(event));
}

// ── Payload extraction ───────────────────────────────────────────────

function extractEventType(payload: ScWebhookPayload): string | null {
  return payload.event ?? payload.header?.event ?? null;
}

function extractAuditId(payload: ScWebhookPayload): string | null {
  return payload.audit_id ?? payload.inspection_id ?? null;
}

// ── Async processing tracker (for observability & testing) ───────────

export type ProcessingCallback = (result: ProcessResult) => void;

let _onProcessingComplete: ProcessingCallback | null = null;

/**
 * Set a callback invoked after each async processing completes.
 * Useful for testing and observability. Pass null to clear.
 */
export function onProcessingComplete(cb: ProcessingCallback | null): void {
  _onProcessingComplete = cb;
}

// ── Core handler logic ───────────────────────────────────────────────

export interface WebhookHandlerResult {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Handle a parsed webhook payload.
 * Returns immediately with the HTTP response. Kicks off async processing.
 *
 * This is the platform-agnostic core — usable by the standalone server,
 * Vercel serverless, Supabase Edge Function, etc.
 */
export function handleWebhookPayload(payload: ScWebhookPayload): WebhookHandlerResult {
  const eventType = extractEventType(payload);
  const auditId = extractAuditId(payload);

  log.info('Webhook received', { event: eventType, auditId });

  // Missing event type — still acknowledge (SC may retry otherwise)
  if (!eventType) {
    log.warn('Webhook payload missing event type', { payload });
    return {
      statusCode: 200,
      body: { ok: true, action: 'ignored', reason: 'missing_event_type' },
    };
  }

  // Event type we don't process — acknowledge and ignore
  if (!isProcessableEvent(eventType)) {
    log.info('Ignoring non-processable event', { event: eventType });
    return {
      statusCode: 200,
      body: { ok: true, action: 'ignored', reason: 'event_type_not_handled', event: eventType },
    };
  }

  // Missing audit ID — can't process, but still acknowledge
  if (!auditId) {
    log.warn('Webhook payload missing audit_id for processable event', { event: eventType });
    return {
      statusCode: 200,
      body: { ok: true, action: 'ignored', reason: 'missing_audit_id' },
    };
  }

  // Fire-and-forget async processing — don't block the webhook response
  processInspection(auditId)
    .then((result) => {
      if (result.error) {
        log.error('Async processing failed', { auditId, error: result.error });
      } else {
        log.info('Async processing completed', {
          auditId,
          status: result.writeResult?.status,
        });
      }
      _onProcessingComplete?.(result);
    })
    .catch((err) => {
      // processInspection never throws, but guard against unexpected errors
      log.error('Unexpected error in async processing', {
        auditId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return {
    statusCode: 200,
    body: { ok: true, action: 'processing', auditId },
  };
}

// ── Node.js HTTP adapter ─────────────────────────────────────────────

/**
 * Read the full request body as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Node.js HTTP request handler for the webhook endpoint.
 *
 * Handles:
 *   POST /webhook — process SC webhook payload
 *   GET  /health  — health check
 *   *    *        — 404
 */
export async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // Health check
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'constance-webhook' }));
    return;
  }

  // Webhook endpoint
  if (url === '/webhook' && method === 'POST') {
    let payload: ScWebhookPayload;

    try {
      const body = await readBody(req);
      payload = JSON.parse(body) as ScWebhookPayload;
    } catch {
      log.warn('Failed to parse webhook body');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
      return;
    }

    const result = handleWebhookPayload(payload);

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
}
