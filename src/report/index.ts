import * as fs from 'fs';
import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultDb } from '../db/supabase_client';
import type { ReportOptions, GeneratedReport } from './types';
import { aggregate } from './aggregate';
import { generateNarratives } from './narratives';
import { renderHtml } from './render_html';
import { renderDocx } from './render_docx';
import { inferPeriodLabels } from './period';
import { extractZoneLetters } from './zones';

export async function generateReport(
  opts: ReportOptions,
  db?: SupabaseClient
): Promise<GeneratedReport> {
  const client = db ?? defaultDb;

  const { label: periodLabel, filenameLabel: periodFilenameLabel } = inferPeriodLabels(opts.periodStart, opts.periodEnd, opts.cadence);

  // 1. Aggregate
  const data = await aggregate(client, {
    clientId: opts.clientId,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    cadence: opts.cadence,
    periodLabel,
    periodFilenameLabel,
  });

  // 2. Narratives
  const narratives = await generateNarratives(data, { skipLLM: opts.skipLLM });

  // 3. Render
  const html = renderHtml(data, narratives);
  const docxBuffer = await renderDocx(data, narratives);

  // 4. Write files
  const outputDir = opts.outputDir || path.resolve(process.cwd(), 'dist', 'reports');
  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = reportFilenameBase(data);
  const htmlPath = path.join(outputDir, `${baseName}.html`);
  const docxPath = path.join(outputDir, `${baseName}.docx`);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  fs.writeFileSync(docxPath, docxBuffer);

  // 5. Upsert client_reports row
  let clientReportId: string | null = null;
  if (opts.writeDb !== false) {
    clientReportId = await upsertClientReport(client, data, narratives, html);
  }

  return {
    clientReportId,
    html,
    docxBuffer,
    outputPaths: { html: htmlPath, docx: docxPath },
    data,
    narratives,
  };
}

function reportFilenameBase(data: any): string {
  const longName: string = data.client.long_name || data.client.name;
  const clientPart = longName.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_') || 'Client';
  const zonesPart = (data.zonesLabel || '').replace(/\s+/g, '_');
  const cadencePretty = data.cadence === 'monthly' ? 'Monthly' : data.cadence === 'weekly' ? 'Weekly' : 'Quarterly';
  const parts = [clientPart];
  if (zonesPart) parts.push(zonesPart);
  parts.push(data.periodFilenameLabel, `${cadencePretty}_Report`);
  return parts.join('_');
}

async function upsertClientReport(
  db: SupabaseClient,
  data: any,
  narratives: any,
  html: string,
): Promise<string> {
  const payload = {
    organization_id: data.organization.id,
    client_id: data.client.id,
    site_id: data.sites[0]?.id || null,
    report_period_start: data.periodStart,
    report_period_end: data.periodEnd,
    title: data.titleLine,
    author_name: data.supervisor?.name || null,
    addressed_to: data.addressedTo,
    status: 'draft',
    cadence: data.cadence,
    html_content: html,
    narrative_sections: {
      outline_of_works: narratives.outlineOfWorks,
      bird_sightings: narratives.birdSightings,
      incidents: narratives.incidents,
      fauna_sightings: narratives.faunaSightings,
    },
    zones_included: data.zonesIncluded.flatMap((z: string) => extractZoneLetters(z)),
    generated_at: new Date().toISOString(),
  };

  // Look for existing row by (client_id, period_start, period_end)
  const { data: existing } = await db
    .from('client_reports')
    .select('id')
    .eq('client_id', data.client.id)
    .eq('report_period_start', data.periodStart)
    .eq('report_period_end', data.periodEnd)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from('client_reports').update(payload).eq('id', existing.id);
    if (error) throw new Error(`client_reports update failed: ${error.message}`);
    return existing.id;
  }
  const { data: inserted, error } = await db.from('client_reports').insert(payload).select('id').single();
  if (error || !inserted) throw new Error(`client_reports insert failed: ${error?.message}`);
  return inserted.id;
}

export type { ReportOptions, GeneratedReport, ReportData, NarrativeSections } from './types';
