/**
 * WP4 — Webhook registration script.
 *
 * Registers, lists, or deletes SC webhooks via the Safety Culture API.
 *
 * Usage:
 *   npx ts-node src/webhook/register.ts register <URL>
 *   npx ts-node src/webhook/register.ts list
 *   npx ts-node src/webhook/register.ts delete <WEBHOOK_ID>
 *
 * Requires SAFETY_CULTURE_API_TOKEN in .env.
 */

import { config } from '../shared/config';
import { createLogger } from '../shared/logger';

const log = createLogger('webhook-register');

const SC_BASE_URL = config.scApiBaseUrl;
const SC_TOKEN = config.scApiToken;

// ── API calls ────────────────────────────────────────────────────────

interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
}

async function scFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${SC_BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${SC_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

async function registerWebhook(webhookUrl: string): Promise<void> {
  const events = ['inspection.completed', 'inspection.updated'];

  log.info('Registering webhook', { url: webhookUrl, events });

  const response = await scFetch('/webhooks', {
    method: 'POST',
    body: JSON.stringify({ url: webhookUrl, events }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    console.error(`Registration failed: ${response.status} ${response.statusText}`);
    console.error(body);
    process.exit(1);
  }

  const data = await response.json() as Record<string, unknown>;
  console.log('Webhook registered successfully:');
  console.log(JSON.stringify(data, null, 2));
}

async function listWebhooks(): Promise<void> {
  log.info('Listing webhooks');

  const response = await scFetch('/webhooks', { method: 'GET' });

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    console.error(`List failed: ${response.status} ${response.statusText}`);
    console.error(body);
    process.exit(1);
  }

  const data = await response.json() as Record<string, unknown>;
  const webhooks = (data.webhooks ?? data) as unknown[];

  if (Array.isArray(webhooks) && webhooks.length > 0) {
    console.log(`Found ${webhooks.length} webhook(s):\n`);
    for (const w of webhooks) {
      const record = w as WebhookRecord;
      console.log(`  ID:     ${record.id}`);
      console.log(`  URL:    ${record.url}`);
      console.log(`  Events: ${(record.events ?? []).join(', ')}`);
      console.log('');
    }
  } else {
    console.log('No webhooks registered.');
  }
}

async function deleteWebhook(webhookId: string): Promise<void> {
  log.info('Deleting webhook', { webhookId });

  const response = await scFetch(`/webhooks/${encodeURIComponent(webhookId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    console.error(`Delete failed: ${response.status} ${response.statusText}`);
    console.error(body);
    process.exit(1);
  }

  console.log(`Webhook ${webhookId} deleted.`);
}

// ── CLI ──────────────────────────────────────────────────────────────

const USAGE = `
Usage:
  npx ts-node src/webhook/register.ts register <WEBHOOK_URL>
  npx ts-node src/webhook/register.ts list
  npx ts-node src/webhook/register.ts delete <WEBHOOK_ID>

Examples:
  npx ts-node src/webhook/register.ts register https://my-app.ngrok.io/webhook
  npx ts-node src/webhook/register.ts list
  npx ts-node src/webhook/register.ts delete whk_abc123
`.trim();

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case 'register':
      if (!arg) {
        console.error('Error: Missing webhook URL.\n');
        console.error(USAGE);
        process.exit(1);
      }
      await registerWebhook(arg);
      break;

    case 'list':
      await listWebhooks();
      break;

    case 'delete':
      if (!arg) {
        console.error('Error: Missing webhook ID.\n');
        console.error(USAGE);
        process.exit(1);
      }
      await deleteWebhook(arg);
      break;

    default:
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
