#!/usr/bin/env node
import { supabase } from '../db/supabase_client';
import { generateReport } from '../report';
import { resolveMonth, resolveIsoWeek, resolveRange } from '../report/period';
import type { Cadence } from '../report/types';

interface CliArgs {
  client?: string;
  clientId?: string;
  siteId?: string;
  zoneId?: string;
  month?: string;
  week?: string;
  from?: string;
  to?: string;
  cadence?: Cadence;
  outputDir?: string;
  skipLLM?: boolean;
  listClients?: boolean;
  noDb?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--client': args.client = next(); break;
      case '--client-id': args.clientId = next(); break;
      case '--site-id': args.siteId = next(); break;
      case '--zone-id': args.zoneId = next(); break;
      case '--month': args.month = next(); break;
      case '--week': args.week = next(); break;
      case '--from': args.from = next(); break;
      case '--to': args.to = next(); break;
      case '--cadence': args.cadence = next() as Cadence; break;
      case '--output-dir': args.outputDir = next(); break;
      case '--skip-llm': args.skipLLM = true; break;
      case '--list-clients': args.listClients = true; break;
      case '--no-db': args.noDb = true; break;
      case '-h': case '--help':
        printHelp(); process.exit(0);
      default:
        console.error(`Unknown arg: ${a}`);
        printHelp(); process.exit(1);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  npm run report -- --client <name>  --month YYYY-MM
  npm run report -- --client-id <uuid> --month YYYY-MM
  npm run report -- --site-id  <uuid>  --week YYYY-Www
  npm run report -- --zone-id  <uuid>  --month YYYY-MM
  npm run report -- --list-clients

Scope (exactly one required):
  --client <name>     Client name (matched via ILIKE) — shortcut for --client-id
  --client-id <uuid>  Whole-client aggregate (all leaf sites under this client)
  --site-id <uuid>    One top-level site — zones rolled up
  --zone-id <uuid>    One zone only (leaf-level)

Period (exactly one required):
  --month <YYYY-MM>   Monthly cadence
  --week <YYYY-Www>   ISO week cadence
  --from/--to         Custom range (requires --cadence)
  --cadence           weekly | monthly | quarterly

Other:
  --output-dir <dir>  Output directory (default: dist/reports)
  --skip-llm          Skip LLM narratives (use placeholders)
  --no-db             Don't upsert client_reports row
  --list-clients      Print available clients and exit`);
}

async function listClients(): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, contact_name, council_or_body, report_template_variant')
    .order('name');
  if (error) { console.error(error.message); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

async function resolveClientId(clientQuery: string): Promise<string> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .ilike('name', `${clientQuery}%`);
  if (error) throw new Error(`Client lookup failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`No client matching '${clientQuery}'. Try --list-clients.`);
  if (data.length > 1) throw new Error(`Multiple clients match '${clientQuery}': ${data.map(c => c.name).join(', ')}. Be more specific.`);
  return data[0].id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.listClients) {
    await listClients();
    return;
  }

  const scopeFlags = [
    args.client ? '--client' : null,
    args.clientId ? '--client-id' : null,
    args.siteId ? '--site-id' : null,
    args.zoneId ? '--zone-id' : null,
  ].filter(Boolean) as string[];

  if (scopeFlags.length === 0) {
    console.error('Missing scope: provide exactly one of --client, --client-id, --site-id, --zone-id');
    printHelp(); process.exit(1);
  }
  if (scopeFlags.length > 1) {
    console.error(`Exactly one scope flag required (got ${scopeFlags.join(', ')})`);
    printHelp(); process.exit(1);
  }

  let period: { start: string; end: string; cadence: Cadence };
  if (args.month) {
    const r = resolveMonth(args.month);
    period = { start: r.start, end: r.end, cadence: r.cadence };
  } else if (args.week) {
    const r = resolveIsoWeek(args.week);
    period = { start: r.start, end: r.end, cadence: r.cadence };
  } else if (args.from && args.to) {
    const cadence: Cadence = args.cadence || 'weekly';
    const r = resolveRange(args.from, args.to, cadence);
    period = { start: r.start, end: r.end, cadence: r.cadence };
  } else {
    console.error('Provide one of: --month, --week, or --from/--to --cadence');
    printHelp(); process.exit(1);
  }

  // Resolve scope → clientId | siteId | zoneId for generateReport()
  let clientId: string | undefined;
  let siteId: string | undefined;
  let zoneId: string | undefined;
  let scopeDescription: string;
  if (args.zoneId) {
    zoneId = args.zoneId;
    scopeDescription = `zoneId=${zoneId}`;
  } else if (args.siteId) {
    siteId = args.siteId;
    scopeDescription = `siteId=${siteId}`;
  } else if (args.clientId) {
    clientId = args.clientId;
    scopeDescription = `clientId=${clientId}`;
  } else {
    // --client <name> shortcut
    clientId = await resolveClientId(args.client!);
    scopeDescription = `client=${args.client} clientId=${clientId}`;
  }

  console.log(`Generating report: ${scopeDescription} period=${period.start}..${period.end} cadence=${period.cadence}`);
  const report = await generateReport({
    clientId,
    siteId,
    zoneId,
    periodStart: period.start,
    periodEnd: period.end,
    cadence: period.cadence,
    outputDir: args.outputDir,
    skipLLM: args.skipLLM,
    writeDb: !args.noDb,
  });

  console.log('\nOutputs:');
  console.log(`  HTML: ${report.outputPaths.html}`);
  console.log(`  DOCX: ${report.outputPaths.docx}`);
  if (report.clientReportId) console.log(`  client_reports.id: ${report.clientReportId}`);

  const d = report.data;
  console.log('\nSummary:');
  console.log(`  zones: ${d.zonesIncluded.join(', ') || '—'}`);
  console.log(`  inspections: ${d.inspections.length}`);
  console.log(`  staff rows: ${d.staffHoursByZone.length}`);
  console.log(`  weed works rows: ${d.weedWorks.length}`);
  console.log(`  herbicide rows: ${d.herbicideTotals.length}`);
  console.log(`  observations: ${d.observations.length}`);
}

main().catch(err => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
