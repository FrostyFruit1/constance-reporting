import { describe, it, expect } from 'vitest';
import { resolveScopeFromOptions } from '../index';
import { composeTitleLine } from '../aggregate';
import type { ClientRow, SiteRow } from '../types';

const mkClient = (overrides: Partial<ClientRow> = {}): ClientRow => ({
  id: 'client-1',
  organization_id: 'org-1',
  name: 'Camden Council',
  long_name: null,
  contact_name: null,
  council_or_body: null,
  report_template_variant: null,
  location_maps: null,
  active_roster_staff_ids: null,
  ...overrides,
});

const mkSite = (overrides: Partial<SiteRow>): SiteRow => ({
  id: 'site-1',
  organization_id: 'org-1',
  client_id: 'client-1',
  parent_site_id: null,
  name: 'EBSF',
  canonical_name: null,
  sc_label: null,
  long_name: null,
  ...overrides,
});

describe('resolveScopeFromOptions', () => {
  const period = { periodStart: '2025-06-01', periodEnd: '2025-06-30', cadence: 'monthly' as const };

  it('resolves zone scope', () => {
    const s = resolveScopeFromOptions({ ...period, zoneId: 'zone-b' });
    expect(s).toEqual({ kind: 'zone', zoneId: 'zone-b' });
  });

  it('resolves site scope', () => {
    const s = resolveScopeFromOptions({ ...period, siteId: 'site-1' });
    expect(s).toEqual({ kind: 'site', siteId: 'site-1' });
  });

  it('resolves client scope', () => {
    const s = resolveScopeFromOptions({ ...period, clientId: 'client-1' });
    expect(s).toEqual({ kind: 'client', clientId: 'client-1' });
  });

  it('throws when no scope provided', () => {
    expect(() => resolveScopeFromOptions({ ...period })).toThrow(/scope required/i);
  });

  it('throws when more than one scope provided', () => {
    expect(() => resolveScopeFromOptions({ ...period, zoneId: 'z', siteId: 's' })).toThrow(/exactly one/i);
    expect(() => resolveScopeFromOptions({ ...period, clientId: 'c', siteId: 's' })).toThrow(/exactly one/i);
    expect(() => resolveScopeFromOptions({ ...period, clientId: 'c', zoneId: 'z' })).toThrow(/exactly one/i);
  });
});

describe('composeTitleLine', () => {
  const client = mkClient({ long_name: 'Camden Council' });
  const ebsf = mkSite({
    id: 'ebsf',
    name: 'EBSF',
    long_name: 'Elderslie Banksia Scrub Forest',
  });
  const zoneB = mkSite({
    id: 'zone-b',
    name: 'EBSF Zone B',
    parent_site_id: 'ebsf',
  });

  it('zone scope → "{site.long_name} Zone B {period} Monthly Report"', () => {
    const title = composeTitleLine({
      kind: 'zone',
      client,
      topLevelSite: ebsf,
      zoneSite: zoneB,
      zonesLabel: 'Zone B',
      periodLabel: 'June 2025',
      cadenceLabel: 'Monthly Report',
      multipleTopLevelSites: false,
    });
    expect(title).toBe('Elderslie Banksia Scrub Forest Zone B June 2025 Monthly Report');
  });

  it('site scope rolls up zones', () => {
    const title = composeTitleLine({
      kind: 'site',
      client,
      topLevelSite: ebsf,
      zoneSite: null,
      zonesLabel: 'Zone B and C',
      periodLabel: 'June 2025',
      cadenceLabel: 'Monthly Report',
      multipleTopLevelSites: false,
    });
    expect(title).toBe('Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report');
  });

  it('client scope with multiple sites → "All Sites"', () => {
    const title = composeTitleLine({
      kind: 'client',
      client,
      topLevelSite: ebsf,
      zoneSite: null,
      zonesLabel: '',
      periodLabel: 'June 2025',
      cadenceLabel: 'Monthly Report',
      multipleTopLevelSites: true,
    });
    expect(title).toBe('Camden Council — All Sites — June 2025 Monthly Report');
  });

  it('client scope with single top-level site falls back to site shape', () => {
    const title = composeTitleLine({
      kind: 'client',
      client,
      topLevelSite: ebsf,
      zoneSite: null,
      zonesLabel: 'Zone B and C',
      periodLabel: 'June 2025',
      cadenceLabel: 'Monthly Report',
      multipleTopLevelSites: false,
    });
    expect(title).toBe('Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report');
  });

  it('falls back to site.name when neither site.long_name nor client.long_name are set', () => {
    const bareClient = mkClient({ long_name: null, name: 'Ad-hoc' });
    const title = composeTitleLine({
      kind: 'site',
      client: bareClient,
      topLevelSite: mkSite({ id: 'x', name: 'Cloverhill Riparian', long_name: null }),
      zoneSite: null,
      zonesLabel: '',
      periodLabel: 'Week 27 2025',
      cadenceLabel: 'Weekly Report',
      multipleTopLevelSites: false,
    });
    // client.long_name is null → fall through to client.name ("Ad-hoc")
    expect(title).toBe('Ad-hoc Week 27 2025 Weekly Report');
  });
});
