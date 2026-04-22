/**
 * Standalone HTTP server for the webhook handler.
 *
 * Usage:
 *   npx ts-node src/webhook/server.ts
 *   # or after build:
 *   node dist/webhook/server.js
 *
 * For local dev with public URL:
 *   npx ts-node src/webhook/server.ts &
 *   ngrok http 3100
 *   # Then register the ngrok URL as the webhook endpoint
 */

import { createServer } from 'http';
import { handleHttpRequest } from './handler';
import { createLogger } from '../shared/logger';

const log = createLogger('webhook-server');

const PORT = parseInt(process.env.WEBHOOK_PORT ?? '3100', 10);

const server = createServer((req, res) => {
  handleHttpRequest(req, res).catch((err) => {
    log.error('Unhandled error in request handler', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
    }
  });
});

server.listen(PORT, () => {
  log.info(`Webhook server listening on port ${PORT}`);
  log.info(`POST http://localhost:${PORT}/webhook`);
  log.info(`GET  http://localhost:${PORT}/health`);
});
