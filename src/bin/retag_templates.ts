#!/usr/bin/env node
/**
 * Re-tag inspections.sc_template_type based on the template_id stored in
 * sc_raw_json. Written for E6 Fix 4 — earlier parser runs stored
 * 'daily_work_report' as a hard-coded fallback for unknown templates, so
 * toolbox talks / OSHA / Incident Report rows were mis-classified.
 *
 * Usage:
 *   npm run build
 *   node dist/bin/retag_templates.js          # dry run (default)
 *   node dist/bin/retag_templates.js --apply  # write updates
 */
import { supabase } from '../db/supabase_client';
import { detectTemplateType } from '../parser/index';

const PAGE_SIZE = 500;

interface InspectionRow {
  id: string;
  sc_template_type: string | null;
  sc_raw_json: { template_id?: string } | null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(`retag_templates — ${apply ? 'APPLY' : 'dry run'}`);

  const counts = {
    total: 0,
    changed: 0,
    unchanged: 0,
    toUnknown: 0,
    toDwr: 0,
    toCar: 0,
  };
  const sampleChanges: Array<{ id: string; from: string | null; to: string; templateId: string | null }> = [];

  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inspections')
      .select('id, sc_template_type, sc_raw_json')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Select failed at offset ${from}: ${error.message}`);
    if (!data || data.length === 0) break;

    const updates: Array<{ id: string; sc_template_type: string }> = [];
    for (const row of data as InspectionRow[]) {
      counts.total++;
      const templateId = row.sc_raw_json?.template_id ?? null;
      const trueType = templateId ? detectTemplateType(templateId) : 'unknown';
      if (trueType === row.sc_template_type) {
        counts.unchanged++;
        continue;
      }
      counts.changed++;
      if (trueType === 'unknown') counts.toUnknown++;
      else if (trueType === 'daily_work_report') counts.toDwr++;
      else if (trueType === 'chemical_application_record') counts.toCar++;
      if (sampleChanges.length < 10) {
        sampleChanges.push({
          id: row.id,
          from: row.sc_template_type,
          to: trueType,
          templateId,
        });
      }
      updates.push({ id: row.id, sc_template_type: trueType });
    }

    if (apply && updates.length > 0) {
      // Batch update via per-row PATCH — PostgREST doesn't support bulk
      // updates with distinct values in a single call.
      for (const u of updates) {
        const { error: upErr } = await supabase
          .from('inspections')
          .update({ sc_template_type: u.sc_template_type })
          .eq('id', u.id);
        if (upErr) throw new Error(`Update ${u.id} failed: ${upErr.message}`);
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log('\nResult:');
  console.log(`  total scanned       : ${counts.total}`);
  console.log(`  unchanged           : ${counts.unchanged}`);
  console.log(`  changed             : ${counts.changed}`);
  console.log(`    → daily_work_report         : ${counts.toDwr}`);
  console.log(`    → chemical_application_record: ${counts.toCar}`);
  console.log(`    → unknown                    : ${counts.toUnknown}`);
  if (sampleChanges.length > 0) {
    console.log('\nFirst changes:');
    for (const c of sampleChanges) {
      console.log(`  ${c.id}  ${c.from || '(null)'} → ${c.to}  (template_id=${c.templateId || '(null)'})`);
    }
  }
  if (!apply) console.log('\nDry run — rerun with --apply to write.');
}

main().catch(err => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
