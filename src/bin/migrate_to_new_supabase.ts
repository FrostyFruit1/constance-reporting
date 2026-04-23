/**
 * One-shot REST-based data migration: source Supabase → target Supabase.
 *
 * Schema must already be applied on target (via supabase/migrations/deploy_fresh.sql).
 * This script copies every row in every table in FK-dependency order.
 *
 * Usage:
 *   node -r dotenv/config dist/bin/migrate_to_new_supabase.js --dry-run
 *   node -r dotenv/config dist/bin/migrate_to_new_supabase.js --apply
 *
 * Env vars required:
 *   SUPABASE_URL                      — source project URL (from .env)
 *   SUPABASE_SERVICE_ROLE_KEY         — source service-role key (from .env)
 *   TARGET_SUPABASE_URL               — target project URL (passed inline)
 *   TARGET_SUPABASE_SERVICE_ROLE_KEY  — target service-role key (passed inline)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SOURCE_URL = process.env.SUPABASE_URL!;
const SOURCE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TARGET_URL = process.env.TARGET_SUPABASE_URL!;
const TARGET_KEY = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY!;

if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
  console.error('Missing env. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (SOURCE_URL === TARGET_URL) {
  console.error('Source and target URLs are identical. Refusing.');
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_KEY, { auth: { persistSession: false } });
const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } });

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
if (!DRY_RUN && !APPLY) {
  console.error('Pass --dry-run or --apply');
  process.exit(1);
}

interface TableSpec {
  name: string;
  batch: number;
  /**
   * If true, this table has a self-reference (parent_site_id on sites).
   * Insert all rows with the self-ref set to null first, then update in a
   * second pass.
   */
  selfRef?: { col: string };
}

// FK-dependency-ordered table list. Children come after parents.
const TABLES: TableSpec[] = [
  // Phase 1: independent lookups + tenancy
  { name: 'organizations',                  batch: 500 },
  { name: 'clients',                        batch: 500 },
  { name: 'staff',                          batch: 500 },
  { name: 'species_lookup',                 batch: 500 },
  { name: 'chemical_lookup',                batch: 500 },
  // Phase 2: sites (self-ref handled specially)
  { name: 'sites',                          batch: 500, selfRef: { col: 'parent_site_id' } },
  // Phase 3: tables depending on sites/clients
  { name: 'site_name_lookup',               batch: 500 },
  { name: 'site_scope_baselines',           batch: 500 },
  { name: 'client_contracts',               batch: 500 },
  { name: 'client_stakeholders',            batch: 500 },
  { name: 'client_notes',                   batch: 500 },
  // Phase 4: inspections + CAR (parents)
  { name: 'inspections',                    batch: 50 },   // sc_raw_json is heavy
  { name: 'chemical_application_records',   batch: 200 },
  // Phase 5: inspection children
  { name: 'inspection_personnel',           batch: 500 },
  { name: 'inspection_tasks',               batch: 500 },
  { name: 'inspection_weeds',               batch: 500 },
  { name: 'inspection_chemicals',           batch: 500 },
  { name: 'inspection_media',               batch: 500 },
  { name: 'inspection_observations',        batch: 500 },
  { name: 'inspection_metadata',            batch: 500 },
  // Phase 6: CAR children
  { name: 'chemical_application_items',     batch: 500 },
  { name: 'chemical_application_operators', batch: 500 },
  { name: 'chemical_application_additives', batch: 500 },
  // Phase 7: report artefacts
  { name: 'client_reports',                 batch: 20 },   // html_content is heavy
  { name: 'report_weed_works',              batch: 500 },
  { name: 'report_herbicide_summary',       batch: 500 },
  { name: 'report_staff_summary',           batch: 500 },
  // Phase 8: state
  { name: 'sync_state',                     batch: 10 },
];

async function fetchAllRows(client: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await client.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`source fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function insertBatched(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  batch: number,
  transform?: (row: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const prepared = transform ? slice.map(transform) : slice;
    const { error } = await client.from(table).upsert(prepared, { onConflict: 'id' });
    if (error) throw new Error(`target insert ${table} (batch ${i}-${i + slice.length}): ${error.message}`);
    process.stdout.write('.');
  }
  if (rows.length > 0) process.stdout.write('\n');
}

async function migrateTable(spec: TableSpec): Promise<{ table: string; sourceCount: number; targetCount: number }> {
  const rows = await fetchAllRows(source, spec.name);
  const sourceCount = rows.length;
  console.log(`  ${spec.name.padEnd(36)} ${sourceCount.toString().padStart(6)} rows from source`);

  if (DRY_RUN) {
    return { table: spec.name, sourceCount, targetCount: 0 };
  }

  if (rows.length > 0) {
    if (spec.selfRef) {
      // Pass 1: insert with self-ref column nulled out
      const col = spec.selfRef.col;
      const nulled = rows.map(r => ({ ...r, [col]: null }));
      process.stdout.write(`    pass 1 (self-ref nulled): `);
      await insertBatched(target, spec.name, nulled, spec.batch);
      // Pass 2: update rows that originally had a non-null self-ref
      const needsUpdate = rows.filter(r => r[col] != null);
      if (needsUpdate.length > 0) {
        process.stdout.write(`    pass 2 (${needsUpdate.length} self-refs): `);
        for (const row of needsUpdate) {
          const { error } = await target.from(spec.name).update({ [col]: row[col] }).eq('id', row.id as string);
          if (error) throw new Error(`self-ref update ${spec.name} ${row.id}: ${error.message}`);
          process.stdout.write('.');
        }
        process.stdout.write('\n');
      }
    } else {
      process.stdout.write(`    insert: `);
      await insertBatched(target, spec.name, rows, spec.batch);
    }
  }

  // Confirm target count
  const { count: targetCount, error } = await target.from(spec.name).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`target count ${spec.name}: ${error.message}`);
  return { table: spec.name, sourceCount, targetCount: targetCount || 0 };
}

async function main() {
  console.log(`Migration mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Target: ${TARGET_URL}`);
  console.log('');

  const results: { table: string; sourceCount: number; targetCount: number }[] = [];
  const started = Date.now();

  for (const spec of TABLES) {
    const result = await migrateTable(spec);
    results.push(result);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(70));
  console.log('VERIFICATION — source vs target row counts');
  console.log('='.repeat(70));
  let allMatch = true;
  for (const r of results) {
    const match = r.sourceCount === r.targetCount;
    if (!match && !DRY_RUN) allMatch = false;
    const marker = DRY_RUN ? '…' : (match ? '✓' : '✗ MISMATCH');
    console.log(`  ${r.table.padEnd(36)} source=${String(r.sourceCount).padStart(6)} target=${String(r.targetCount).padStart(6)} ${marker}`);
  }
  console.log('='.repeat(70));
  const totalSource = results.reduce((s, r) => s + r.sourceCount, 0);
  const totalTarget = results.reduce((s, r) => s + r.targetCount, 0);
  console.log(`  TOTAL                                source=${String(totalSource).padStart(6)} target=${String(totalTarget).padStart(6)}`);
  console.log(`  Elapsed: ${elapsed}s`);

  if (!DRY_RUN && !allMatch) {
    console.error('\nSome counts did not match. Investigate mismatches above.');
    process.exit(1);
  }
  console.log(DRY_RUN ? '\nDry run complete. Re-run with --apply.' : '\nMigration complete.');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
