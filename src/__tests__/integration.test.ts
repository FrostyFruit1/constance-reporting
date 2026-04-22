/**
 * Task C: End-to-End Integration Test
 *
 * Runs all 5 sample JSONs through the full pipeline (parse -> write -> verify)
 * against live Supabase. Validates WP1 + WP2 integration against real data.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parseInspection } from '../parser';
import { writeInspection } from '../db/writer';
import type { ExtractionResult } from '../parser/types';
import type { WriteResult } from '../db/writer';

// ── Setup ────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SAMPLES_DIR = path.resolve(__dirname, '../../samples');

let db: SupabaseClient;
let testOrgId: string;
const createdAuditIds: string[] = [];

function loadSample(filename: string): Record<string, unknown> {
  const filePath = path.join(SAMPLES_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function trackAuditId(id: string) {
  if (!createdAuditIds.includes(id)) {
    createdAuditIds.push(id);
  }
}

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
      .insert({ name: 'Test Org (E2E integration tests)' })
      .select('id')
      .single();

    if (error || !newOrg) throw new Error(`Failed to create test org: ${error?.message}`);
    testOrgId = newOrg.id;
  }
});

afterAll(async () => {
  if (createdAuditIds.length === 0) return;

  // Deleting inspections cascades to all child records
  await db
    .from('inspections')
    .delete()
    .in('sc_audit_id', createdAuditIds);

  // Also clean up CARs (have their own sc_audit_id)
  await db
    .from('chemical_application_records')
    .delete()
    .in('sc_audit_id', createdAuditIds);
});

// ── Helpers ──────────────────────────────────────────────────────────

const CHILD_TABLES = [
  'inspection_personnel',
  'inspection_tasks',
  'inspection_weeds',
  'inspection_chemicals',
  'inspection_media',
  'inspection_observations',
  'inspection_metadata',
] as const;

async function getChildCounts(inspectionId: string) {
  const counts: Record<string, number> = {};
  for (const table of CHILD_TABLES) {
    const { data } = await db
      .from(table)
      .select('id')
      .eq('inspection_id', inspectionId);
    counts[table] = data?.length ?? 0;
  }
  return counts;
}

/**
 * Parse + write a sample JSON end-to-end. Returns both the extraction and write result.
 */
async function processAndWrite(filename: string): Promise<{
  extraction: ExtractionResult;
  writeResult: WriteResult;
}> {
  const raw = loadSample(filename);
  const extraction = parseInspection(raw);
  trackAuditId(extraction.inspection.scAuditId);
  const writeResult = await writeInspection(extraction, testOrgId, db);
  return { extraction, writeResult };
}

// ── Sample 1: DWR Early 2025 — Hinchinbrook ─────────────────────────

describe('E2E: DWR Early 2025 — Hinchinbrook', () => {
  let extraction: ExtractionResult;
  let result: WriteResult;

  beforeAll(async () => {
    const out = await processAndWrite('daily_work_report_2025_jan_hinchinbrook.json');
    extraction = out.extraction;
    result = out.writeResult;
  });

  it('parses and writes successfully', () => {
    // Has a siteName mismatch warning, so needs_review
    expect(['completed', 'needs_review']).toContain(result.status);
    expect(result.inspectionId).toBeTruthy();
    expect(result.scAuditId).toBe('audit_aa71472bea104d04935d8d414944b1ce');
  });

  it('populates the inspection parent record', async () => {
    const { data: insp } = await db
      .from('inspections')
      .select('*')
      .eq('id', result.inspectionId)
      .single();

    expect(insp).toBeTruthy();
    expect(insp!.sc_audit_id).toBe(extraction.inspection.scAuditId);
    expect(insp!.sc_template_type).toBe('daily_work_report');
    expect(insp!.organization_id).toBe(testOrgId);
    expect(insp!.date).toBe('2025-01-07');
    expect(insp!.sc_raw_json).toBeTruthy();
  });

  it('writes personnel (3 staff)', async () => {
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(personnel).toHaveLength(3);
    for (const p of personnel!) {
      expect(p.hours_worked).toBe(8);
      expect(p.staff_id).toBeTruthy();
    }
  });

  it('writes tasks (4+ task types)', async () => {
    const { data: tasks } = await db
      .from('inspection_tasks')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(tasks!.length).toBeGreaterThanOrEqual(4);
    const types = tasks!.map(t => t.task_type);
    expect(types).toContain('Spraying');
    expect(types).toContain('Cut & Painting');
    expect(types).toContain('Handweeding');
    expect(types).toContain('Brushcutting');
  });

  it('writes weeds with species normalization', async () => {
    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(weeds!.length).toBeGreaterThanOrEqual(10);

    // Known species should have canonical names populated
    const lantana = weeds!.find(w => w.species_name_raw === 'Lantana');
    expect(lantana).toBeDefined();
    expect(lantana!.species_name_canonical).toBe('Lantana');

    const purpleTop = weeds!.find(w => w.species_name_raw === 'Purple Top');
    expect(purpleTop).toBeDefined();
    expect(purpleTop!.species_name_canonical).toBe('Purple Top');

    const blackberry = weeds!.find(w => w.species_name_raw === 'Blackberry');
    expect(blackberry).toBeDefined();
    expect(blackberry!.species_name_canonical).toBe('Blackberry');
  });

  it('writes chemicals with normalization', async () => {
    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(chemicals!.length).toBeGreaterThanOrEqual(3);

    const starane = chemicals!.find(c => c.chemical_name_raw === 'Starane');
    expect(starane).toBeDefined();
    expect(starane!.chemical_name_canonical).toBe('Starane');
    expect(starane!.rate_value).toBe(6);
    expect(starane!.rate_unit).toBe('ml/L');
    expect(starane!.source_template).toBe('daily_work_report');
  });

  it('writes media items', async () => {
    const { data: media } = await db
      .from('inspection_media')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(media!.length).toBeGreaterThanOrEqual(12);
  });

  it('writes metadata', async () => {
    const { data: meta } = await db
      .from('inspection_metadata')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(meta).toHaveLength(1);
    expect(meta![0].total_worked_hours).toBe('24');
    expect(meta![0].remaining_hours).toBe('440');
    expect(meta![0].weed_removal_pct_min).toBe(30);
    expect(meta![0].weed_removal_pct_max).toBe(40);
  });

  it('populates all expected child tables', async () => {
    const counts = await getChildCounts(result.inspectionId);

    expect(counts.inspection_personnel).toBe(3);
    expect(counts.inspection_tasks).toBeGreaterThanOrEqual(4);
    expect(counts.inspection_weeds).toBeGreaterThanOrEqual(10);
    expect(counts.inspection_chemicals).toBeGreaterThanOrEqual(3);
    expect(counts.inspection_media).toBeGreaterThanOrEqual(12);
    // No fauna/flora observations in this sample
    expect(counts.inspection_observations).toBe(0);
    expect(counts.inspection_metadata).toBe(1);
  });
});

// ── Sample 2: DWR Late 2025 — Erosion Control ──────────────────────

describe('E2E: DWR Late 2025 — Erosion Control', () => {
  let extraction: ExtractionResult;
  let result: WriteResult;

  beforeAll(async () => {
    const out = await processAndWrite('daily_work_report_2025_erosion_control.json');
    extraction = out.extraction;
    result = out.writeResult;
  });

  it('parses and writes successfully', () => {
    expect(['completed', 'needs_review']).toContain(result.status);
    expect(result.inspectionId).toBeTruthy();
  });

  it('resolves site from text-type field (late 2025+)', async () => {
    const { data: insp } = await db
      .from('inspections')
      .select('site_id')
      .eq('id', result.inspectionId)
      .single();

    expect(insp!.site_id).toBeTruthy();

    const { data: site } = await db
      .from('sites')
      .select('name')
      .eq('id', insp!.site_id)
      .single();

    expect(site!.name).toBe('Rotary Cowpasture Erosion Control');
  });

  it('writes 3 personnel', async () => {
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(personnel).toHaveLength(3);
  });

  it('writes weeds including African Olive', async () => {
    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    const names = weeds!.map(w => w.species_name_raw);
    expect(names).toContain('African Olive');
    expect(names).toContain('Purple Top');
    expect(names).toContain('Kikuyu');
  });

  it('writes chemicals (Glyphosate)', async () => {
    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(chemicals!.length).toBeGreaterThanOrEqual(1);
    expect(chemicals![0].chemical_name_raw).toBe('Glyphosate');
    expect(chemicals![0].chemical_name_canonical).toBe('Glyphosate');
  });

  it('writes metadata with single-value weed removal pct', async () => {
    const { data: meta } = await db
      .from('inspection_metadata')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(meta).toHaveLength(1);
    expect(meta![0].weed_removal_pct_min).toBe(90);
    expect(meta![0].weed_removal_pct_max).toBe(90);
    expect(meta![0].remaining_hours).toBeNull();
  });
});

// ── Sample 3: DWR 2026 — Reece Morgan ──────────────────────────────

describe('E2E: DWR 2026 — Reece Morgan', () => {
  let extraction: ExtractionResult;
  let result: WriteResult;

  beforeAll(async () => {
    const out = await processAndWrite('daily_work_report_2026_reece_morgan.json');
    extraction = out.extraction;
    result = out.writeResult;
  });

  it('parses and writes successfully', () => {
    expect(['completed', 'needs_review']).toContain(result.status);
    expect(result.inspectionId).toBeTruthy();
  });

  it('resolves site "Kavanaugh Riparian"', async () => {
    const { data: insp } = await db
      .from('inspections')
      .select('site_id')
      .eq('id', result.inspectionId)
      .single();

    expect(insp!.site_id).toBeTruthy();

    const { data: site } = await db
      .from('sites')
      .select('name')
      .eq('id', insp!.site_id)
      .single();

    expect(site!.name).toBe('Kavanaugh Riparian');
  });

  it('writes 3 personnel', async () => {
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(personnel).toHaveLength(3);
  });

  it('writes weeds with normalization (Moth Vine, African Olive, Bidens Pilosa)', async () => {
    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    const names = weeds!.map(w => w.species_name_raw);
    expect(names).toContain('Moth Vine');
    expect(names).toContain('African Olive');
    expect(names).toContain('Bidens Pilosa');

    // African Olive should be normalized
    const olive = weeds!.find(w => w.species_name_raw === 'African Olive');
    expect(olive!.species_name_canonical).toBe('African Olive');
  });

  it('writes chemicals including Grazon Extra', async () => {
    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(chemicals!.length).toBeGreaterThanOrEqual(1);
    const grazon = chemicals!.find(c => c.chemical_name_raw === 'Grazon Extra');
    expect(grazon).toBeDefined();
  });

  it('writes media (28+ items including area_work_map)', async () => {
    const { data: media } = await db
      .from('inspection_media')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(media!.length).toBeGreaterThanOrEqual(28);

    const maps = media!.filter(m => m.media_type === 'area_work_map');
    expect(maps.length).toBeGreaterThanOrEqual(1);
  });

  it('writes metadata with 90% weed removal', async () => {
    const { data: meta } = await db
      .from('inspection_metadata')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(meta).toHaveLength(1);
    expect(meta![0].weed_removal_pct_min).toBe(90);
    expect(meta![0].weed_removal_pct_max).toBe(90);
  });
});

// ── Sample 4: DWR 2026 — Regen Manager (sparse data) ───────────────

describe('E2E: DWR 2026 — Regen Manager (sparse/watering day)', () => {
  let extraction: ExtractionResult;
  let result: WriteResult;

  beforeAll(async () => {
    const out = await processAndWrite('daily_work_report_2026_regen_manager.json');
    extraction = out.extraction;
    result = out.writeResult;
  });

  it('parses and writes successfully', () => {
    expect(['completed', 'needs_review']).toContain(result.status);
    expect(result.inspectionId).toBeTruthy();
  });

  it('resolves site with trimmed trailing whitespace', async () => {
    const { data: insp } = await db
      .from('inspections')
      .select('site_id')
      .eq('id', result.inspectionId)
      .single();

    expect(insp!.site_id).toBeTruthy();

    const { data: site } = await db
      .from('sites')
      .select('name')
      .eq('id', insp!.site_id)
      .single();

    expect(site!.name).toBe('Spring Farm AV Jennings');
  });

  it('writes 2 personnel', async () => {
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(personnel).toHaveLength(2);
  });

  it('handles free-text "Watering" task', async () => {
    const { data: tasks } = await db
      .from('inspection_tasks')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(tasks!.length).toBeGreaterThanOrEqual(1);
    const types = tasks!.map(t => t.task_type);
    expect(types).toContain('Watering');
  });

  it('writes no weeds (watering day)', async () => {
    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('id')
      .eq('inspection_id', result.inspectionId);

    expect(weeds).toHaveLength(0);
  });

  it('writes no chemicals (watering day)', async () => {
    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('id')
      .eq('inspection_id', result.inspectionId);

    expect(chemicals).toHaveLength(0);
  });

  it('writes metadata with N/A remaining hours and null weed pct', async () => {
    const { data: meta } = await db
      .from('inspection_metadata')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(meta).toHaveLength(1);
    expect(meta![0].total_worked_hours).toBe('16');
    expect(meta![0].remaining_hours).toBe('N/A');
    expect(meta![0].weed_removal_pct_min).toBeNull();
    expect(meta![0].weed_removal_pct_max).toBeNull();
  });

  it('writes media (11+ photos)', async () => {
    const { data: media } = await db
      .from('inspection_media')
      .select('id')
      .eq('inspection_id', result.inspectionId);

    expect(media!.length).toBeGreaterThanOrEqual(11);
  });
});

// ── Sample 5: Chemical Application Record 2025 ─────────────────────

describe('E2E: Chemical Application Record 2025', () => {
  let extraction: ExtractionResult;
  let result: WriteResult;

  beforeAll(async () => {
    const out = await processAndWrite('chemical_application_2025.json');
    extraction = out.extraction;
    result = out.writeResult;
  });

  it('parses and writes successfully', () => {
    expect(['completed', 'needs_review']).toContain(result.status);
    expect(result.inspectionId).toBeTruthy();
    expect(result.scAuditId).toBe('audit_cda07055bba440529c8120dc6f40d882');
  });

  it('writes to dedicated chemical_application_records table', async () => {
    const { data: car } = await db
      .from('chemical_application_records')
      .select('*')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    expect(car).toBeTruthy();
    expect(car!.application_method).toBe('Backpack');
    expect(car!.time_start).toBe('7:30');
    expect(car!.time_finish).toBe('3:20');
    expect(car!.total_amount_sprayed_litres).toBe(40);
  });

  it('writes chemical items with normalization (3 chemicals)', async () => {
    const { data: car } = await db
      .from('chemical_application_records')
      .select('id')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    const { data: items } = await db
      .from('chemical_application_items')
      .select('*')
      .eq('application_record_id', car!.id);

    expect(items).toHaveLength(3);

    const gly = items!.find(i => i.chemical_name_raw === 'Glyphosate');
    expect(gly).toBeDefined();
    expect(gly!.chemical_name_canonical).toBe('Glyphosate');
    expect(gly!.rate_value).toBe(7);
    expect(gly!.rate_unit).toBe('ml/L');
    expect(gly!.concentrate_raw).toBe('70ml/10L');

    const starane = items!.find(i => i.chemical_name_raw === 'Starane');
    expect(starane).toBeDefined();
    expect(starane!.chemical_name_canonical).toBe('Starane');
    expect(starane!.rate_value).toBe(6);

    const dicamba = items!.find(i => i.chemical_name_raw === 'Dicamba');
    expect(dicamba).toBeDefined();
    expect(dicamba!.rate_value).toBe(6);
  });

  it('writes operators (2 staff)', async () => {
    const { data: car } = await db
      .from('chemical_application_records')
      .select('id')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    const { data: operators } = await db
      .from('chemical_application_operators')
      .select('*')
      .eq('application_record_id', car!.id);

    expect(operators).toHaveLength(2);
    // Each should have a resolved staff_id
    for (const op of operators!) {
      expect(op.staff_id).toBeTruthy();
    }
  });

  it('writes additives (Brushwet + Blue Dye)', async () => {
    const { data: car } = await db
      .from('chemical_application_records')
      .select('id')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    const { data: additives } = await db
      .from('chemical_application_additives')
      .select('*')
      .eq('application_record_id', car!.id);

    expect(additives).toHaveLength(2);
    const names = additives!.map(a => a.additive_name);
    expect(names).toContain('Brushwet 2ml/L');
    expect(names).toContain('Blue Dye 5ml/L');
  });

  it('writes weather data', async () => {
    const { data: car } = await db
      .from('chemical_application_records')
      .select('*')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    expect(car!.weather_general).toBe('Overcast');
    expect(car!.wind_direction).toBe('E');
    expect(car!.rainfall).toBe('0');
    expect(car!.public_notification).toBe('Signage');
  });

  it('also writes flattened chemicals to inspection_chemicals', async () => {
    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(chemicals).toHaveLength(3);
    for (const c of chemicals!) {
      expect(c.source_template).toBe('chemical_application_record');
    }
  });

  it('writes operators as personnel on the inspection', async () => {
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('*')
      .eq('inspection_id', result.inspectionId);

    expect(personnel).toHaveLength(2);
  });

  it('has empty tasks/weeds/observations for CAR template', async () => {
    const { data: tasks } = await db
      .from('inspection_tasks')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(tasks).toHaveLength(0);

    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(weeds).toHaveLength(0);

    const { data: obs } = await db
      .from('inspection_observations')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(obs).toHaveLength(0);
  });
});

// ── Cross-cutting: Idempotency ──────────────────────────────────────

describe('E2E: Idempotency — reprocess same inspection', () => {
  it('DWR: second write replaces child records, no duplicates', async () => {
    // Process the Hinchinbrook sample
    const raw = loadSample('daily_work_report_2025_jan_hinchinbrook.json');
    const extraction = parseInspection(raw);

    // We already wrote this audit_id in the Hinchinbrook test above,
    // so this is a genuine reprocess.
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    expect(['completed', 'needs_review']).toContain(result.status);
    // Should reuse the same inspection row (upsert on sc_audit_id)
    expect(result.inspectionId).toBeTruthy();

    // Verify no duplicate child records — counts should match first write
    const { data: personnel } = await db
      .from('inspection_personnel')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(personnel).toHaveLength(extraction.personnel.length);

    const { data: tasks } = await db
      .from('inspection_tasks')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(tasks).toHaveLength(extraction.tasks.length);

    const { data: weeds } = await db
      .from('inspection_weeds')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(weeds).toHaveLength(extraction.weeds.length);

    const { data: chemicals } = await db
      .from('inspection_chemicals')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(chemicals).toHaveLength(extraction.chemicals.length);

    const { data: media } = await db
      .from('inspection_media')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    expect(media).toHaveLength(extraction.media.length);

    const { data: meta } = await db
      .from('inspection_metadata')
      .select('id')
      .eq('inspection_id', result.inspectionId);
    // Metadata inserts 1 row if any non-null field present
    const hasMetadata = extraction.metadata.totalWorkedHours != null
      || extraction.metadata.remainingHours != null
      || extraction.metadata.weedRemovalPctMin != null
      || extraction.metadata.weedRemovalPctMax != null
      || extraction.metadata.erosionWorks != null
      || extraction.metadata.concernsText != null
      || extraction.metadata.futureWorksComments != null;
    expect(meta).toHaveLength(hasMetadata ? 1 : 0);
  });

  it('CAR: second write replaces CAR child records, no duplicates', async () => {
    const raw = loadSample('chemical_application_2025.json');
    const extraction = parseInspection(raw);
    trackAuditId(extraction.inspection.scAuditId);

    const result = await writeInspection(extraction, testOrgId, db);

    expect(['completed', 'needs_review']).toContain(result.status);

    // Verify CAR items are not duplicated
    const { data: car } = await db
      .from('chemical_application_records')
      .select('id')
      .eq('sc_audit_id', extraction.inspection.scAuditId)
      .single();

    expect(car).toBeTruthy();

    const { data: items } = await db
      .from('chemical_application_items')
      .select('id')
      .eq('application_record_id', car!.id);
    expect(items).toHaveLength(extraction.chemicalApplicationRecord!.items.length);

    const { data: operators } = await db
      .from('chemical_application_operators')
      .select('id')
      .eq('application_record_id', car!.id);
    expect(operators).toHaveLength(extraction.chemicalApplicationRecord!.operatorNames.length);

    const { data: additives } = await db
      .from('chemical_application_additives')
      .select('id')
      .eq('application_record_id', car!.id);
    expect(additives).toHaveLength(extraction.chemicalApplicationRecord!.additives.length);
  });
});

// ── Cross-cutting: Species & Chemical Normalization ─────────────────

describe('E2E: Normalization across all samples', () => {
  it('known species have canonical names populated', async () => {
    // Query all test inspection weeds that have a known species
    const knownSpecies = ['Lantana', 'Purple Top', 'Blackberry', 'African Olive', 'Crofton', 'Kikuyu'];

    for (const species of knownSpecies) {
      const { data } = await db
        .from('inspection_weeds')
        .select('species_name_canonical')
        .eq('species_name_raw', species)
        .limit(1)
        .single();

      if (data) {
        expect(data.species_name_canonical).toBe(species);
      }
    }
  });

  it('known chemicals have canonical names populated', async () => {
    const knownChemicals = ['Glyphosate', 'Starane'];

    for (const chem of knownChemicals) {
      const { data } = await db
        .from('inspection_chemicals')
        .select('chemical_name_canonical')
        .eq('chemical_name_raw', chem)
        .limit(1)
        .single();

      if (data) {
        expect(data.chemical_name_canonical).toBe(chem);
      }
    }
  });
});

// ── Cross-cutting: All 5 Samples Summary ────────────────────────────

describe('E2E: All 5 samples processed without failure', () => {
  const SAMPLES = [
    'daily_work_report_2025_jan_hinchinbrook.json',
    'daily_work_report_2025_erosion_control.json',
    'daily_work_report_2026_reece_morgan.json',
    'daily_work_report_2026_regen_manager.json',
    'chemical_application_2025.json',
  ];

  it('no sample produced a "failed" status', async () => {
    for (const filename of SAMPLES) {
      const raw = loadSample(filename);
      const extraction = parseInspection(raw);

      // These were already written above; verify via DB query
      const { data: insp } = await db
        .from('inspections')
        .select('processing_status')
        .eq('sc_audit_id', extraction.inspection.scAuditId)
        .single();

      expect(insp).toBeTruthy();
      expect(insp!.processing_status).not.toBe('failed');
    }
  });
});
