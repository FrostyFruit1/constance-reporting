import type { SupabaseClient } from '@supabase/supabase-js';
import type { SiteRow } from './types';

const SITE_COLUMNS =
  'id, organization_id, client_id, parent_site_id, name, canonical_name, sc_label';

/**
 * Resolve all leaf sites for a client — zones plus any top-level sites that
 * have no zones. Leaves are where work actually happens, so the report
 * aggregate uses this as its set of site_ids for inspection queries.
 */
export async function getClientLeafSites(
  db: SupabaseClient,
  clientId: string
): Promise<SiteRow[]> {
  const { data: topLevel, error: topErr } = await db
    .from('sites')
    .select(SITE_COLUMNS)
    .eq('client_id', clientId)
    .is('parent_site_id', null);
  if (topErr) throw new Error(`Top-level site lookup failed: ${topErr.message}`);
  const tops = (topLevel as unknown as SiteRow[]) || [];
  if (tops.length === 0) return [];

  const { data: zones, error: zErr } = await db
    .from('sites')
    .select(SITE_COLUMNS)
    .in('parent_site_id', tops.map(t => t.id));
  if (zErr) throw new Error(`Zone lookup failed: ${zErr.message}`);
  const zoneRows = (zones as unknown as SiteRow[]) || [];

  const parentsWithZones = new Set(zoneRows.map(z => z.parent_site_id).filter(Boolean) as string[]);
  const childlessTops = tops.filter(t => !parentsWithZones.has(t.id));
  return [...childlessTops, ...zoneRows];
}

/** Resolve all zones under a site. Returns [] if the site has no zones. */
export async function getZonesForSite(
  db: SupabaseClient,
  siteId: string
): Promise<SiteRow[]> {
  const { data, error } = await db
    .from('sites')
    .select(SITE_COLUMNS)
    .eq('parent_site_id', siteId);
  if (error) throw new Error(`getZonesForSite failed: ${error.message}`);
  return ((data as unknown as SiteRow[]) || []);
}

/**
 * Walk from any site up to its top-level parent site row. If the input site
 * is already top-level, it is returned unchanged.
 */
export async function getTopLevelSite(
  db: SupabaseClient,
  siteId: string
): Promise<SiteRow> {
  const { data, error } = await db
    .from('sites')
    .select(SITE_COLUMNS)
    .eq('id', siteId)
    .single();
  if (error || !data) throw new Error(`Site not found: ${siteId} (${error?.message})`);
  const row = data as unknown as SiteRow;
  if (!row.parent_site_id) return row;
  return getTopLevelSite(db, row.parent_site_id);
}
