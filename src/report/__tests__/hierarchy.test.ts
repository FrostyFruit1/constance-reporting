import { describe, it, expect } from 'vitest';
import { getClientLeafSites, getZonesForSite, getTopLevelSite } from '../hierarchy';
import type { SiteRow } from '../types';

interface Filter {
  col: string;
  op: 'eq' | 'is' | 'in';
  val: any;
}

function makeMock(rows: SiteRow[]) {
  const build = (filters: Filter[]) => {
    const run = () => {
      let out = rows.slice();
      for (const f of filters) {
        if (f.op === 'eq') out = out.filter(r => (r as any)[f.col] === f.val);
        else if (f.op === 'is') out = out.filter(r => (r as any)[f.col] === null);
        else if (f.op === 'in') out = out.filter(r => f.val.includes((r as any)[f.col]));
      }
      return out;
    };
    const api: any = {
      eq(col: string, val: any) { filters.push({ col, op: 'eq', val }); return api; },
      is(col: string, _val: null) { filters.push({ col, op: 'is', val: null }); return api; },
      in(col: string, val: any[]) { filters.push({ col, op: 'in', val }); return api; },
      select(_cols: string) { return api; },
      async single() {
        const data = run()[0];
        return data ? { data, error: null } : { data: null, error: { message: 'not found' } };
      },
      then(resolve: any, reject: any) {
        try { resolve({ data: run(), error: null }); } catch (e) { reject(e); }
      },
    };
    return api;
  };
  return {
    from(_table: string) {
      const filters: Filter[] = [];
      return build(filters);
    },
  } as any;
}

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';

const mkSite = (overrides: Partial<SiteRow>): SiteRow => ({
  id: overrides.id || 'id-' + Math.random(),
  organization_id: 'org-1',
  client_id: null,
  parent_site_id: null,
  name: 'unnamed',
  canonical_name: null,
  sc_label: null,
  ...overrides,
});

describe('hierarchy helpers', () => {
  const rows: SiteRow[] = [
    // Client A: top-level EBSF with 3 zones
    mkSite({ id: 'ebsf', client_id: CLIENT_A, name: 'EBSF' }),
    mkSite({ id: 'zb', parent_site_id: 'ebsf', name: 'EBSF Zone B' }),
    mkSite({ id: 'zc', parent_site_id: 'ebsf', name: 'EBSF Zone C' }),
    mkSite({ id: 'zd', parent_site_id: 'ebsf', name: 'EBSF Zone D' }),
    // Client A: also a childless top-level "Cloverhill" site
    mkSite({ id: 'cloverhill', client_id: CLIENT_A, name: 'Cloverhill Riparian' }),
    // Client B: unrelated top-level site
    mkSite({ id: 'other', client_id: CLIENT_B, name: 'Other' }),
    // Orphan: organization-level only, no client
    mkSite({ id: 'orphan', name: 'EBSF Watering' }),
  ];

  it('getClientLeafSites returns zones + childless tops for the client', async () => {
    const db = makeMock(rows);
    const leaves = await getClientLeafSites(db, CLIENT_A);
    const ids = leaves.map(l => l.id).sort();
    // Zones under EBSF + childless Cloverhill, but NOT the EBSF parent itself.
    expect(ids).toEqual(['cloverhill', 'zb', 'zc', 'zd']);
  });

  it('getClientLeafSites ignores orphan sites (no client, no parent)', async () => {
    const db = makeMock(rows);
    const leaves = await getClientLeafSites(db, CLIENT_A);
    expect(leaves.find(l => l.id === 'orphan')).toBeUndefined();
  });

  it('getClientLeafSites scopes zones by client', async () => {
    const db = makeMock(rows);
    const leaves = await getClientLeafSites(db, CLIENT_B);
    expect(leaves.map(l => l.id)).toEqual(['other']);
  });

  it('getZonesForSite returns children', async () => {
    const db = makeMock(rows);
    const zones = await getZonesForSite(db, 'ebsf');
    expect(zones.map(z => z.id).sort()).toEqual(['zb', 'zc', 'zd']);
  });

  it('getZonesForSite returns [] for a leaf', async () => {
    const db = makeMock(rows);
    const zones = await getZonesForSite(db, 'cloverhill');
    expect(zones).toEqual([]);
  });

  it('getTopLevelSite walks up from a zone', async () => {
    const db = makeMock(rows);
    const top = await getTopLevelSite(db, 'zb');
    expect(top.id).toBe('ebsf');
  });

  it('getTopLevelSite returns self when already top-level', async () => {
    const db = makeMock(rows);
    const top = await getTopLevelSite(db, 'cloverhill');
    expect(top.id).toBe('cloverhill');
  });
});
