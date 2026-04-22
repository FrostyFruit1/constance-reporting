/**
 * WP2 integration tests — writer + lookups against live Supabase.
 *
 * These tests hit the real Supabase instance. They create test records and
 * clean them up afterwards. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in .env.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { writeInspection } from '../writer';
import {
  resolveSite,
  resolveStaff,
  resolveSpecies,
  resolveChemical,
} from '../lookups';
import {
  makeDwrExtraction,
  makeDwrWithWarnings,
  makeCarExtraction,
  makeMinimalExtraction,
} from './fixtures';

// ── Setup ─────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

let db: SupabaseClient;
let testOrgId: string;
const createdAuditIds: string[] = [];

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for integration tests');
  }

  db = createClient(url, key, { auth: { persistSession: false } });

  // Get or create a test organization
  const { data: orgs } = await db
    .from('organizations')
    .select('id')
    .limit(1)
    .single();

  if (orgs?.id) {
    testOrgId = orgs.id;
  } else {
    const { data: newOrg, error } = await db
      .from('organizations')
      .insert({ name: 'Test Org (WP2 integration tests)' })
      .select('id')
      .single();

    if (error || !newOrg) throw new Error(`Failed to create test org: ${error?.message}`);
    testOrgId = newOrg.id;
  }
});

afterAll(async () => {
  // Clean up test inspections by sc_audit_id
  if (createdAuditIds.length > 0) {
    // Deleting the inspection cascades to all child records
    await db
      .from('inspections')
      .delete()
      .in('sc_audit_id', createdAuditIds);

    // Also clean up any test CARs
    await db
      .from('chemical_application_records')
      .delete()
      .in('sc_audit_id', createdAuditIds);
  }

  // Clean up auto-created test sites (prefixed with test markers)
  await db
    .from('sites')
    .delete()
    .ilike('name', '%WP2_TEST_SITE%');

  // Clean up auto-created test staff
  await db
    .from('staff')
    .delete()
    .ilike('name', '%WP2_TEST_STAFF%');
});

function trackAuditId(id: string) {
  createdAuditIds.push(id);
}

// ── Lookup tests ──────────────────────────────────────────────────────

describe('lookups', () => {
  describe('resolveSpecies', () => {
    it('resolves a known species by canonical name', async () => {
      const result = await resolveSpecies(db, 'Lantana');
      expect(result.canonicalName).toBe('Lantana');
      expect(result.speciesType).toBe('weed');
    });

    it('resolves case-insensitively', async () => {
      const result = await resolveSpecies(db, 'lantana');
      expect(result.canonicalName).toBe('Lantana');
    });

    it('returns nulls for unknown species', async () => {
      const result = await resolveSpecies(db, 'Totally Unknown Plant XYZ');
      expect(result.canonicalName).toBeNull();
      expect(result.scientificName).toBeNull();
      expect(result.speciesType).toBeNull();
    });
  });

  describe('resolveChemical', () => {
    it('resolves a known chemical by canonical name', async () => {
      const result = await resolveChemical(db, 'Glyphosate');
      expect(result.canonicalName).toBe('Glyphosate');
    });

    it('resolves case-insensitively', async () => {
      const result = await resolveChemical(db, 'glyphosate');
      expect(result.canonicalName).toBe('Glyphosate');
    });

    it('returns null for unknown chemical', async () => {
      const result = await resolveChemical(db, 'Mystery Chemical XYZ');
      expect(result.canonicalName).toBeNull();
    });
  });

  describe('resolveSite', () => {
    it('auto-creates a new site when not found', async () => {
      const uniqueName = `WP2_TEST_SITE_${Date.now()}`;
      const result = await resolveSite(db, testOrgId, uniqueName);

      expect(result.siteId).toBeTruthy();
      expect(result.created).toBe(true);

      // Verify the site exists in the DB
      const { data: site } = await db
        .from('sites')
        .select('name, canonical_name')
        .eq('id', result.siteId)
        .single();

      expect(site?.name).toBe(uniqueName);
      expect(site?.canonical_name).toBe(uniqueName.toLowerCase());
    });

    it('resolves the same site on second call', async () => {
      const uniqueName = `WP2_TEST_SITE_REUSE_${Date.now()}`;
      const first = await resolveSite(db, testOrgId, uniqueName);
      const second = await resolveSite(db, testOrgId, uniqueName);

      expect(second.siteId).toBe(first.siteId);
      expect(second.created).toBe(false);
    });
  });

  describe('resolveStaff', () => {
    it('auto-creates a new staff member when not found', async () => {
      const uniqueName = `WP2_TEST_STAFF_${Date.now()}`;
      const result = await resolveStaff(db, testOrgId, uniqueName);

      expect(result.staffId).toBeTruthy();
      expect(result.created).toBe(true);
    });

    it('resolves the same staff on second call', async () => {
      const uniqueName = `WP2_TEST_STAFF_REUSE_${Date.now()}`;
      const first = await resolveStaff(db, testOrgId, uniqueName);
      const second = await resolveStaff(db, testOrgId, uniqueName);

      expect(second.staffId).toBe(first.staffId);
      expect(second.created).toBe(false);
    });
  });
});

// ── Writer tests ──────────────────────────────────────────────────────

describe('writeInspection', () => {
  it('writes a full DWR and returns completed status', async () => {
    const extraction = makeDwrExtraction();
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    expect(result.status).toBe('completed');
    expect(result.inspectionId).toBeTruthy();
    expect(result.scAuditId).toBe(extraction.inspection.scAuditId);
    expect(result.warnings).toHaveLength(0);

    // Verify parent record
    const { data: insp } = await db
      .from('inspections')
      .select('*')
      .eq('id', result.inspectionId)
      .single();

    expect(insp).toBeTruthy();
    expect(insp!.sc_audit_id).toBe(extraction.inspection.scAuditId);
    expect(insp!.sc_template_type).toBe('daily_work_report');
    expect(insp!.processing_status).toBe('completed');
    expect(insp!.organization_id).toBe(testOrgId);
    expect(insp!.sc_raw_json).toBeTruthy();
    expect(insp!.date).toBe('2025-03-15');

    // Verify child records
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(personnel).toHaveLength(2);
    expect(personnel!.some(p => p.hours_worked === 8)).toBe(true);

    const { data: tasks } = await db
      .from('inspection_tasks')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(tasks).toHaveLength(2);
    expect(tasks!.some(t => t.task_type === 'Spraying')).toBe(true);

    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(weeds).toHaveLength(3);
    // Known species should be resolved
    const lantana = weeds!.find(w => w.species_name_raw === 'Lantana');
    expect(lantana?.species_name_canonical).toBe('Lantana');
    // Unknown species should have null canonical
    const mystery = weeds!.find(w => w.species_name_raw === 'Mystery Weed');
    expect(mystery?.species_name_canonical).toBeNull();

    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(chemicals).toHaveLength(2);
    const gly = chemicals!.find(c => c.chemical_name_raw === 'Glyphosate');
    expect(gly?.chemical_name_canonical).toBe('Glyphosate');
    expect(gly?.rate_value).toBe(7);

    const { data: media } = await db
      .from('inspection_media')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(media).toHaveLength(1);
    expect(media![0].media_type).toBe('photo');

    const { data: obs } = await db
      .from('inspection_observations')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(obs).toHaveLength(1);
    expect(obs![0].observation_type).toBe('fauna');

    const { data: meta } = await db
      .from('inspection_metadata')
      .select('*')
      .eq('inspection_id', result.inspectionId);
    expect(meta).toHaveLength(1);
    expect(meta![0].total_worked_hours).toBe('16');
    expect(meta![0].weed_removal_pct_min).toBe(30);
    expect(meta![0].weed_removal_pct_max).toBe(40);
  });

  it('returns needs_review when there are parsing warnings', async () => {
    const extraction = makeDwrWithWarnings();
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    expect(result.status).toBe('needs_review');
    expect(result.warnings.length).toBeGreaterThan(0);

    const { data: insp } = await db
      .from('inspections')
      .select('processing_status')
      .eq('id', result.inspectionId)
      .single();

    expect(insp!.processing_status).toBe('needs_review');
  });

  it('handles minimal extraction with all nulls/empty arrays', async () => {
    const extraction = makeMinimalExtraction();
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    expect(result.status).toBe('completed');
    expect(result.inspectionId).toBeTruthy();

    // Verify no child records were created
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(personnel).toHaveLength(0);

    const { data: meta } = await db
      .from('inspection_metadata')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(meta).toHaveLength(0);
  });

  it('is idempotent — reprocessing the same audit_id replaces child records', async () => {
    const auditId = `audit_idempotent_${Date.now()}`;
    trackAuditId(auditId);

    // First write — 2 personnel
    const first = makeDwrExtraction({ scAuditId: auditId });
    const result1 = await writeInspection(first, testOrgId, db);
    expect(result1.status).toBe('completed');

    const { data: personnel1 } = await db
      .from('inspection_personnel')
      .select('id')
      .eq('inspection_id', result1.inspectionId);
    expect(personnel1).toHaveLength(2);

    // Second write — modify to 1 person
    const second = makeDwrExtraction({ scAuditId: auditId });
    second.personnel = [
      { staffName: 'Ryan Arford', hoursWorked: 10, rawHoursText: '10' },
    ];
    const result2 = await writeInspection(second, testOrgId, db);

    // Same inspection row (upsert)
    expect(result2.inspectionId).toBe(result1.inspectionId);
    expect(result2.status).toBe('completed');

    // Only 1 personnel now (old ones deleted, new one inserted)
    const { data: personnel2 } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result2.inspectionId);
    expect(personnel2).toHaveLength(1);
    expect(personnel2![0].hours_worked).toBe(10);
  });

  it('writes a Chemical Application Record with items, operators, and additives', async () => {
    const extraction = makeCarExtraction();
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    expect(result.status).toBe('completed');

    // Verify CAR parent
    const { data: car } = await db
      .from('chemical_application_records')
      .select('*')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    expect(car).toBeTruthy();
    expect(car!.application_method).toBe('Backpack');
    expect(car!.total_amount_sprayed_litres).toBe(40);
    expect(car!.weather_general).toBe('Sunny');
    expect(car!.wind_direction).toBe('NW');

    // Verify chemical items
    const { data: items } = await db
      .from('chemical_application_items')
      .select('*')
      .eq('application_record_id', car!.id);
    expect(items).toHaveLength(3);

    const gly = items!.find(i => i.chemical_name_raw === 'Glyphosate');
    expect(gly?.chemical_name_canonical).toBe('Glyphosate');
    expect(gly?.rate_value).toBe(7);
    expect(gly?.concentrate_raw).toBe('70ml/10L');

    // Verify operators
    const { data: operators } = await db
      .from('chemical_application_operators')
      .select('*')
      .eq('application_record_id', car!.id);
    expect(operators).toHaveLength(2);

    // Verify additives
    const { data: additives } = await db
      .from('chemical_application_additives')
      .select('*')
      .eq('application_record_id', car!.id);
    expect(additives).toHaveLength(2);
    expect(additives!.some(a => a.additive_name === 'Brushwet')).toBe(true);
  });

  it('stores raw JSON in sc_raw_json', async () => {
    const extraction = makeMinimalExtraction();
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    const { data: insp } = await db
      .from('inspections')
      .select('sc_raw_json')
      .eq('id', result.inspectionId)
      .single();

    expect(insp!.sc_raw_json).toEqual(extraction.rawJson);
  });

  it('includes organization_id on the inspection record', async () => {
    const extraction = makeMinimalExtraction();
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    const { data: insp } = await db
      .from('inspections')
      .select('organization_id')
      .eq('id', result.inspectionId)
      .single();

    expect(insp!.organization_id).toBe(testOrgId);
  });
});
