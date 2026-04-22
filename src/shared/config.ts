import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Safety Culture API
  scApiToken: required('SAFETY_CULTURE_API_TOKEN'),
  scOrgId: required('SAFETY_CULTURE_ORG_ID'),
  scApiBaseUrl: optional('SAFETY_CULTURE_API_BASE_URL', 'https://api.safetyculture.io'),

  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  // Sync settings
  syncRateLimitMs: parseInt(optional('SYNC_RATE_LIMIT_MS', '200'), 10),
  syncFeedPageSize: parseInt(optional('SYNC_FEED_PAGE_SIZE', '100'), 10),
} as const;
