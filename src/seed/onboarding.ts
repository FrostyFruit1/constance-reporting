/**
 * Onboarding seed script — populates reference/lookup data the pipeline needs.
 *
 * Safe to run multiple times (all operations are idempotent).
 *
 * Usage:
 *   npx tsx src/seed/onboarding.ts
 */
import { supabase } from '../db/supabase_client';
import { createLogger } from '../shared/logger';
import staffData from './data/staff.json';
import sitesData from './data/sites.json';

const log = createLogger('seed:onboarding');

// ── Types for JSON data ──────────────────────────────────────────────

interface StaffEntry {
  name: string;
  role: string;
}

interface SiteEntry {
  canonical_name: string;
  sc_labels: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

async function upsertOrganization(): Promise<string> {
  const name = 'Constance Conservation';

  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', name)
    .limit(1)
    .single();

  if (existing?.id) {
    log.info('Organization already exists', { id: existing.id });
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('organizations')
    .insert({
      name,
      address: 'Harrington Park, NSW',
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Failed to create organization: ${error?.message ?? 'no data'}`);
  }

  log.info('Created organization', { id: created.id });
  return created.id;
}

async function upsertClient(organizationId: string): Promise<string> {
  const name = 'Camden Council';

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('name', name)
    .eq('organization_id', organizationId)
    .limit(1)
    .single();

  if (existing?.id) {
    log.info('Client already exists', { name, id: existing.id });
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name,
      council_or_body: 'Camden Council',
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Failed to create client: ${error?.message ?? 'no data'}`);
  }

  log.info('Created client', { name, id: created.id });
  return created.id;
}

async function upsertStaff(
  organizationId: string,
  entries: StaffEntry[]
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();

  for (const entry of entries) {
    const { data: existing } = await supabase
      .from('staff')
      .select('id')
      .ilike('name', entry.name)
      .eq('organization_id', organizationId)
      .limit(1)
      .single();

    if (existing?.id) {
      nameToId.set(entry.name, existing.id);
      log.info('Staff exists', { name: entry.name });
      continue;
    }

    const { data: created, error } = await supabase
      .from('staff')
      .insert({
        organization_id: organizationId,
        name: entry.name,
        role: entry.role,
        active: true,
      })
      .select('id')
      .single();

    if (error || !created) {
      throw new Error(`Failed to create staff "${entry.name}": ${error?.message ?? 'no data'}`);
    }

    nameToId.set(entry.name, created.id);
    log.info('Created staff', { name: entry.name, id: created.id });
  }

  return nameToId;
}

async function upsertSites(
  organizationId: string,
  entries: SiteEntry[]
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();

  for (const entry of entries) {
    const normalized = entry.canonical_name.trim().toLowerCase();

    const { data: existing } = await supabase
      .from('sites')
      .select('id')
      .ilike('canonical_name', normalized)
      .eq('organization_id', organizationId)
      .limit(1)
      .single();

    if (existing?.id) {
      nameToId.set(entry.canonical_name, existing.id);
      log.info('Site exists', { canonical_name: entry.canonical_name });
      continue;
    }

    const { data: created, error } = await supabase
      .from('sites')
      .insert({
        organization_id: organizationId,
        name: entry.canonical_name,
        canonical_name: normalized,
        sc_label: entry.sc_labels[0],
      })
      .select('id')
      .single();

    if (error || !created) {
      throw new Error(
        `Failed to create site "${entry.canonical_name}": ${error?.message ?? 'no data'}`
      );
    }

    nameToId.set(entry.canonical_name, created.id);
    log.info('Created site', { canonical_name: entry.canonical_name, id: created.id });
  }

  return nameToId;
}

async function upsertSiteNameLookups(
  entries: SiteEntry[],
  siteIdMap: Map<string, string>
): Promise<void> {
  for (const entry of entries) {
    const siteId = siteIdMap.get(entry.canonical_name);
    if (!siteId) {
      log.warn('No site_id for lookup entry, skipping', { canonical_name: entry.canonical_name });
      continue;
    }

    for (const label of entry.sc_labels) {
      const { error } = await supabase
        .from('site_name_lookup')
        .upsert(
          { sc_label: label, site_id: siteId },
          { onConflict: 'sc_label' }
        );

      if (error) {
        throw new Error(
          `Failed to upsert site_name_lookup "${label}": ${error.message}`
        );
      }

      log.info('Upserted site_name_lookup', { sc_label: label, site_id: siteId });
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting onboarding seed');

  // 1. Organization
  const orgId = await upsertOrganization();

  // 2. Client
  const clientId = await upsertClient(orgId);

  // 3. Staff (depends on org)
  const staffMap = await upsertStaff(orgId, staffData as StaffEntry[]);

  // 4. Sites (depends on org)
  const siteMap = await upsertSites(orgId, sitesData as SiteEntry[]);

  // 5. Site name lookups (depends on sites)
  await upsertSiteNameLookups(sitesData as SiteEntry[], siteMap);

  // Summary
  log.info('Onboarding seed complete', {
    organizationId: orgId,
    clientId,
    staffCount: staffMap.size,
    siteCount: siteMap.size,
  });

  console.log('\n=== Seed Summary ===');
  console.log(`Organization ID: ${orgId}`);
  console.log(`Client ID:       ${clientId}`);
  console.log(`Staff seeded:    ${staffMap.size}`);
  console.log(`Sites seeded:    ${siteMap.size}`);
}

main().catch((err) => {
  log.error('Seed failed', { error: String(err) });
  process.exit(1);
});
