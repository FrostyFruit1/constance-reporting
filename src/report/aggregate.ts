import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ClientRow,
  OrgRow,
  SiteRow,
  StaffRow,
  InspectionRow,
  InspectionPersonnelRow,
  InspectionTaskRow,
  InspectionWeedRow,
  InspectionChemicalRow,
  InspectionObservationRow,
  StaffHoursRow,
  WeedWorkRow,
  HerbicideRow,
  ReportData,
  ReportScopeKind,
  Cadence,
} from './types';
import { extractZoneLetters, zoneLabel, formatZoneLabel } from './zones';
import { getClientLeafSites, getZonesForSite } from './hierarchy';

export type AggregateScope =
  | { kind: 'client'; clientId: string }
  | { kind: 'site'; siteId: string }
  | { kind: 'zone'; zoneId: string };

export interface AggregateInput {
  scope: AggregateScope;
  periodStart: string;
  periodEnd: string;
  cadence: Cadence;
  periodLabel: string;
  periodFilenameLabel: string;
}

const SITE_COLUMNS =
  'id, organization_id, client_id, parent_site_id, name, canonical_name, sc_label, long_name';

interface ResolvedScope {
  client: ClientRow;
  primarySites: SiteRow[];
  topLevelSite: SiteRow | null;
  zoneSite: SiteRow | null;
  multipleTopLevelSites: boolean;
  kind: ReportScopeKind;
  scopeSiteId: string | null;
}

async function loadSite(db: SupabaseClient, id: string): Promise<SiteRow> {
  const { data, error } = await db.from('sites').select(SITE_COLUMNS).eq('id', id).single();
  if (error || !data) throw new Error(`Site not found: ${id} (${error?.message})`);
  return data as unknown as SiteRow;
}

async function loadClient(db: SupabaseClient, clientId: string): Promise<ClientRow> {
  const { data, error } = await db
    .from('clients')
    .select('id, organization_id, name, long_name, contact_name, council_or_body, report_template_variant, location_maps, active_roster_staff_ids')
    .eq('id', clientId)
    .single();
  if (error || !data) throw new Error(`Client not found: ${clientId} (${error?.message})`);
  const row = data as unknown as ClientRow;
  // Filter nullish/empty URLs so the template can trust location_maps.length as
  // the "has real maps" signal. The dashboard writes sparse arrays when Ryan
  // uploads only Map 1.1 before Map 1.0.
  if (Array.isArray(row.location_maps)) {
    row.location_maps = row.location_maps.filter((u): u is string => !!u && typeof u === 'string');
  }
  return row;
}

async function resolveScope(db: SupabaseClient, scope: AggregateScope): Promise<ResolvedScope> {
  if (scope.kind === 'zone') {
    const zone = await loadSite(db, scope.zoneId);
    const parent = zone.parent_site_id ? await loadSite(db, zone.parent_site_id) : zone;
    const clientId = parent.client_id || zone.client_id;
    if (!clientId) throw new Error(`Zone ${scope.zoneId} has no associated client`);
    const client = await loadClient(db, clientId);
    return {
      client,
      primarySites: [zone],
      topLevelSite: parent,
      zoneSite: zone,
      multipleTopLevelSites: false,
      kind: 'zone',
      scopeSiteId: zone.id,
    };
  }
  if (scope.kind === 'site') {
    const site = await loadSite(db, scope.siteId);
    const clientId = site.client_id;
    if (!clientId) throw new Error(`Site ${scope.siteId} has no associated client`);
    const client = await loadClient(db, clientId);
    const zones = await getZonesForSite(db, scope.siteId);
    const primarySites = zones.length > 0 ? [site, ...zones] : [site];
    return {
      client,
      primarySites,
      topLevelSite: site,
      zoneSite: null,
      multipleTopLevelSites: false,
      kind: 'site',
      scopeSiteId: site.id,
    };
  }
  // client scope
  const client = await loadClient(db, scope.clientId);
  const primarySites = await getClientLeafSites(db, scope.clientId);
  if (primarySites.length === 0) throw new Error(`No sites found for client ${client.name}`);
  const { data: tops, error: topErr } = await db
    .from('sites')
    .select(SITE_COLUMNS)
    .eq('client_id', scope.clientId)
    .is('parent_site_id', null);
  if (topErr) throw new Error(`Top-level site lookup failed: ${topErr.message}`);
  const topRows = ((tops as unknown) as SiteRow[]) || [];
  const topLevelSite = topRows.length > 0 ? topRows[0] : null;
  return {
    client,
    primarySites,
    topLevelSite,
    zoneSite: null,
    multipleTopLevelSites: topRows.length > 1,
    kind: 'client',
    scopeSiteId: topRows.length === 1 && topLevelSite ? topLevelSite.id : null,
  };
}

export async function aggregate(db: SupabaseClient, input: AggregateInput): Promise<ReportData> {
  const { scope, periodStart, periodEnd, cadence, periodLabel, periodFilenameLabel } = input;

  // 1. Resolve scope → client + sites to query
  const resolved = await resolveScope(db, scope);
  const { client, primarySites, topLevelSite, zoneSite, multipleTopLevelSites } = resolved;

  // 2. Organization
  const { data: org, error: oErr } = await db
    .from('organizations')
    .select('id, name, address, phone, email, logo_url')
    .eq('id', client.organization_id)
    .single();
  if (oErr || !org) throw new Error(`Organization not found (${oErr?.message})`);

  const primarySiteIds = primarySites.map(s => s.id);
  const patternSiteIds = primarySiteIds;
  const siteById = new Map(primarySites.map(s => [s.id, s]));

  // 4. Inspections in period + children (restricted to primary client sites only)
  const { data: inspRaw, error: iErr } = await db
    .from('inspections')
    .select('id, date, site_id, supervisor_id, sc_template_type, sc_raw_json')
    .in('site_id', primarySiteIds)
    .not('date', 'is', null)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .eq('sc_template_type', 'daily_work_report')
    .order('date', { ascending: true });
  if (iErr) throw new Error(`Inspections query failed: ${iErr.message}`);
  const inspections = inspRaw || [];

  const inspectionIds = inspections.map(i => i.id);

  const childFetch = async <T>(table: string): Promise<T[]> => {
    if (inspectionIds.length === 0) return [];
    const { data, error } = await db.from(table).select('*').in('inspection_id', inspectionIds);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    return (data as unknown as T[]) || [];
  };

  const [personnelRows, taskRows, weedRows, chemRows, obsRows, metaRows] = await Promise.all([
    childFetch<any>('inspection_personnel'),
    childFetch<any>('inspection_tasks'),
    childFetch<any>('inspection_weeds'),
    childFetch<any>('inspection_chemicals'),
    childFetch<any>('inspection_observations'),
    childFetch<any>('inspection_metadata'),
  ]);

  // Staff names
  const staffIdsReferenced = new Set<string>();
  inspections.forEach(i => i.supervisor_id && staffIdsReferenced.add(i.supervisor_id));
  personnelRows.forEach(p => p.staff_id && staffIdsReferenced.add(p.staff_id));
  (client.active_roster_staff_ids || []).forEach((id: string) => staffIdsReferenced.add(id));
  const staffMap = new Map<string, StaffRow>();
  if (staffIdsReferenced.size > 0) {
    const { data: staffRows } = await db
      .from('staff')
      .select('id, name, role')
      .in('id', [...staffIdsReferenced]);
    (staffRows || []).forEach((s: any) => staffMap.set(s.id, s));
  }

  const byInspection = <T extends { inspection_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.inspection_id) || [];
      list.push(r);
      m.set(r.inspection_id, list);
    }
    return m;
  };
  const personnelByI = byInspection(personnelRows);
  const tasksByI = byInspection(taskRows);
  const weedsByI = byInspection(weedRows);
  const chemsByI = byInspection(chemRows);
  const obsByI = byInspection(obsRows);
  const metaByI = byInspection(metaRows);

  const inspectionRows: InspectionRow[] = inspections.map(i => {
    const site = i.site_id ? siteById.get(i.site_id) : undefined;
    const siteName = site?.name || 'Unknown Site';
    const letters = extractZoneLetters(siteName);
    const displayZone = letters.length > 0 ? formatZoneLabel(letters) : siteName;
    return {
      id: i.id,
      date: i.date,
      site_id: i.site_id,
      site_name: siteName,
      zone: displayZone,
      zoneLetters: letters,
      supervisor_id: i.supervisor_id,
      supervisor_name: i.supervisor_id ? staffMap.get(i.supervisor_id)?.name || null : null,
      sc_template_type: i.sc_template_type,
      sc_raw_json: i.sc_raw_json,
      personnel: (personnelByI.get(i.id) || []).map((p: any): InspectionPersonnelRow => ({
        id: p.id,
        staff_id: p.staff_id,
        staff_name: p.staff_id ? staffMap.get(p.staff_id)?.name || null : null,
        hours_worked: p.hours_worked,
      })),
      tasks: (tasksByI.get(i.id) || []).map((t: any): InspectionTaskRow => ({
        id: t.id, task_type: t.task_type, details_text: t.details_text,
      })),
      weeds: (weedsByI.get(i.id) || []).map((w: any): InspectionWeedRow => ({
        id: w.id, species_name_raw: w.species_name_raw, species_name_canonical: w.species_name_canonical,
      })),
      chemicals: (chemsByI.get(i.id) || []).map((c: any): InspectionChemicalRow => ({
        id: c.id, chemical_name_raw: c.chemical_name_raw, chemical_name_canonical: c.chemical_name_canonical,
        rate_raw: c.rate_raw, rate_value: c.rate_value, rate_unit: c.rate_unit,
      })),
      observations: (obsByI.get(i.id) || []).map((o: any): InspectionObservationRow => ({
        id: o.id, observation_type: o.observation_type, species_name: o.species_name, notes: o.notes,
        inspection_id: o.inspection_id, inspection_date: i.date, zone: displayZone,
      })),
      metadata: metaByI.get(i.id)?.[0] || null,
    };
  });

  // Zones: letters in order of first appearance across inspections.
  const zoneOrder: string[] = [];
  const zoneSeen = new Set<string>();
  for (const ins of inspectionRows) {
    for (const L of ins.zoneLetters) {
      if (!zoneSeen.has(L)) {
        zoneSeen.add(L);
        zoneOrder.push(L);
      }
    }
  }
  const zonesIncluded = zoneOrder.map(zoneLabel);
  const zonesLetters = [...zoneOrder].sort();
  const zonesLabel = formatZoneLabel(zonesLetters);

  // Supervisor
  const supervisorCounts = new Map<string, number>();
  for (const ins of inspectionRows) {
    if (ins.supervisor_id) {
      supervisorCounts.set(ins.supervisor_id, (supervisorCounts.get(ins.supervisor_id) || 0) + 1);
    }
  }
  const topSupId = [...supervisorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const supervisor = topSupId ? staffMap.get(topSupId) || null : null;

  // §3 Staff hours by zone — umbrella inspections contribute full hours to each component zone.
  const hoursMap = new Map<string, StaffHoursRow>();
  const hoursKey = (zone: string, staffKey: string) => `${zone}${staffKey}`;
  for (const ins of inspectionRows) {
    const contributingZones = ins.zoneLetters.length > 0 ? ins.zoneLetters : [];
    for (const letter of contributingZones) {
      const zone = zoneLabel(letter);
      for (const p of ins.personnel) {
        const sid = p.staff_id || `null-${p.staff_name || 'unknown'}`;
        const name = p.staff_name || 'Unknown';
        const k = hoursKey(zone, sid);
        const prev = hoursMap.get(k) || { zone, staff_id: p.staff_id, staff_name: name, hours: 0 };
        prev.hours += Number(p.hours_worked) || 0;
        hoursMap.set(k, prev);
      }
    }
  }
  // Include roster staff with 0 hours across each zone
  if (client.active_roster_staff_ids) {
    for (const zone of zonesIncluded) {
      for (const sid of client.active_roster_staff_ids) {
        const k = hoursKey(zone, sid);
        if (!hoursMap.has(k)) {
          const s = staffMap.get(sid);
          if (s) hoursMap.set(k, { zone, staff_id: sid, staff_name: s.name, hours: 0 });
        }
      }
    }
  }
  const zoneOrderIndex = new Map(zonesIncluded.map((z, i) => [z, i] as const));
  const staffHoursByZone = [...hoursMap.values()].sort((a, b) => {
    const ai = zoneOrderIndex.get(a.zone) ?? 999;
    const bi = zoneOrderIndex.get(b.zone) ?? 999;
    if (ai !== bi) return ai - bi;
    return b.hours - a.hours;
  });

  // §4.1 Weed works — umbrella inspections produce one row per (zone × weed × method).
  const weedWorksMap = new Map<string, WeedWorkRow>();
  for (const ins of inspectionRows) {
    const zoneTotalHours = ins.personnel.reduce((s, p) => s + (Number(p.hours_worked) || 0), 0);
    const methods = ins.tasks.map(t => t.task_type).filter(Boolean);
    const speciesList = [...new Set(ins.weeds.map(w => w.species_name_canonical || w.species_name_raw))];
    if (speciesList.length === 0 || methods.length === 0) continue;
    const rawJson = ins.sc_raw_json as any;
    let mappedLines: Array<{ colour: string; method: string; weed: string }> = [];
    try {
      const details = extractDetailsOfMappedAreas(rawJson);
      if (details) mappedLines = parseMappedAreas(details);
    } catch { /* ignore */ }

    const methodLabel = humanMethod(methods);
    const contributingZones = ins.zoneLetters.length > 0 ? ins.zoneLetters.map(zoneLabel) : [];
    for (const zone of contributingZones) {
      for (const species of speciesList) {
        const colourMatch = mappedLines.find(l =>
          l.weed.toLowerCase().includes(species.toLowerCase()) ||
          species.toLowerCase().includes(l.weed.toLowerCase())
        );
        const key = `${zone}${species}${methodLabel}`;
        const existing = weedWorksMap.get(key);
        if (existing) {
          existing.hours += zoneTotalHours / speciesList.length;
        } else {
          weedWorksMap.set(key, {
            zone,
            weed_type: species,
            method: methodLabel,
            species_list: [species],
            hours: zoneTotalHours / speciesList.length,
            colour: colourMatch?.colour || null,
            gis_lat: null,
            gis_lng: null,
            area_m2: null,
            needs_review: true,
          });
        }
      }
    }
  }
  const weedWorks = [...weedWorksMap.values()]
    .map(w => ({ ...w, hours: Math.round(w.hours) }))
    .sort((a, b) => {
      const ai = zoneOrderIndex.get(a.zone) ?? 999;
      const bi = zoneOrderIndex.get(b.zone) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.weed_type.localeCompare(b.weed_type);
    });

  // §6 Herbicide totals — combine DWR chemicals (per-zone × chemical × weed) with
  // Chemical Application Record (CAR) real totals aggregated by chemical.
  const herbMap = new Map<string, HerbicideRow>();
  for (const ins of inspectionRows) {
    const contributingZones = ins.zoneLetters.length > 0 ? ins.zoneLetters.map(zoneLabel) : [];
    for (const zone of contributingZones) {
      for (const c of ins.chemicals) {
        const name = c.chemical_name_canonical || c.chemical_name_raw;
        const targetWeed = ins.weeds[0]?.species_name_canonical || ins.weeds[0]?.species_name_raw || null;
        const key = `${name}${zone}${targetWeed || ''}`;
        const prev = herbMap.get(key) || {
          chemical_canonical: name,
          rate_text: c.rate_raw,
          target_weed: targetWeed,
          zone,
          total_sprayed_litres: null,
          total_concentrate_ml: null,
          needs_review: true,
        };
        herbMap.set(key, prev);
      }
    }
  }

  // Fetch matched CARs in period for pattern-matched sites (broader than primary client sites).
  const carTotalsByChem = new Map<string, { litres: number; concentrate_ml: number; records: number }>();
  if (patternSiteIds.length > 0) {
    const { data: cars } = await db
      .from('chemical_application_records')
      .select('id, date, site_id, total_amount_sprayed_litres')
      .in('site_id', patternSiteIds)
      .gte('date', periodStart)
      .lte('date', periodEnd);
    const carIds = (cars || []).map((r: any) => r.id);
    let items: any[] = [];
    if (carIds.length > 0) {
      const { data: itemRows } = await db
        .from('chemical_application_items')
        .select('application_record_id, chemical_name_canonical, chemical_name_raw, rate_raw, rate_value, rate_unit, concentrate_raw')
        .in('application_record_id', carIds);
      items = itemRows || [];
    }
    // Aggregate: sprayed litres per chemical = sum over CARs / n_items_of_that_chem_in_record * record.total
    // Simpler: if a CAR has N distinct chemicals, split the total evenly.
    const itemsByCar = new Map<string, any[]>();
    for (const it of items) {
      const l = itemsByCar.get(it.application_record_id) || [];
      l.push(it);
      itemsByCar.set(it.application_record_id, l);
    }
    for (const car of cars || []) {
      const its = itemsByCar.get(car.id) || [];
      if (its.length === 0) continue;
      const totalL = Number(car.total_amount_sprayed_litres) || 0;
      const perChemL = totalL / its.length;
      for (const it of its) {
        const name = it.chemical_name_canonical || it.chemical_name_raw || 'Unknown';
        const concMl = parseConcentrateMl(it.concentrate_raw);
        const prev = carTotalsByChem.get(name) || { litres: 0, concentrate_ml: 0, records: 0 };
        prev.litres += perChemL;
        prev.concentrate_ml += concMl;
        prev.records += 1;
        carTotalsByChem.set(name, prev);
      }
    }
  }

  // Apply CAR totals to §6 subsections. For each chemical, split totals evenly across
  // matching (chemical × zone × weed) subsections so sums don't inflate.
  {
    const subsectionsByChem = new Map<string, HerbicideRow[]>();
    for (const h of herbMap.values()) {
      const list = subsectionsByChem.get(h.chemical_canonical) || [];
      list.push(h);
      subsectionsByChem.set(h.chemical_canonical, list);
    }
    for (const [chem, totals] of carTotalsByChem) {
      const matches = subsectionsByChem.get(chem) || [];
      if (matches.length === 0) continue;
      const perL = totals.litres / matches.length;
      const perMl = totals.concentrate_ml / matches.length;
      for (const m of matches) {
        m.total_sprayed_litres = round(perL, 2);
        m.total_concentrate_ml = round(perMl, 1);
        m.needs_review = false;
      }
    }
  }

  const herbicideTotals = [...herbMap.values()].sort((a, b) => {
    if (a.chemical_canonical !== b.chemical_canonical) return a.chemical_canonical.localeCompare(b.chemical_canonical);
    const ai = zoneOrderIndex.get(a.zone) ?? 999;
    const bi = zoneOrderIndex.get(b.zone) ?? 999;
    return ai - bi;
  });

  const allObs: InspectionObservationRow[] = inspectionRows.flatMap(i => i.observations);

  // §2 LLM inputs — details of tasks, grouped by zone letter with umbrella inspections folded in.
  const detailsOfTasksByZone: Record<string, Array<{ date: string; text: string }>> = {};
  for (const ins of inspectionRows) {
    const contributingZones = ins.zoneLetters.length > 0 ? ins.zoneLetters.map(zoneLabel) : [];
    for (const zone of contributingZones) {
      if (!detailsOfTasksByZone[zone]) detailsOfTasksByZone[zone] = [];
      const texts = new Set<string>();
      for (const t of ins.tasks) {
        if (t.details_text) texts.add(t.details_text.trim());
      }
      const combined = [...texts].join('\n\n');
      if (combined) detailsOfTasksByZone[zone].push({ date: ins.date || '', text: combined });
    }
  }

  // Title, addressed-to, author, publication date
  const cadenceLabel = cadence === 'monthly' ? 'Monthly Report' : cadence === 'weekly' ? 'Weekly Report' : 'Quarterly Report';
  const titleLine = composeTitleLine({
    kind: resolved.kind,
    client,
    topLevelSite,
    zoneSite,
    zonesLabel,
    periodLabel,
    cadenceLabel,
    multipleTopLevelSites,
  });
  const authorLine = supervisor ? `Constance Conservation - ${supervisor.name}` : 'Constance Conservation';
  const addressedToParts = [client.contact_name, client.council_or_body].filter(Boolean) as string[];
  const addressedToDedup = [...new Set(addressedToParts)];
  const addressedTo = addressedToDedup.join(', ') || client.name;
  const publicationDate = formatDdMmYyyy(periodEnd);

  return {
    client: client as ClientRow,
    organization: org as OrgRow,
    sites: primarySites,
    supervisor,
    inspections: inspectionRows,
    staffHoursByZone,
    weedWorks,
    herbicideTotals,
    observations: allObs,
    detailsOfTasksByZone,
    scopeKind: resolved.kind,
    scopeSiteId: resolved.scopeSiteId,
    periodStart,
    periodEnd,
    cadence,
    zonesIncluded,
    zonesLabel,
    periodLabel,
    periodFilenameLabel,
    titleLine,
    addressedTo,
    authorLine,
    publicationDate,
  };
}

interface TitleInput {
  kind: ReportScopeKind;
  client: ClientRow;
  topLevelSite: SiteRow | null;
  zoneSite: SiteRow | null;
  zonesLabel: string;
  periodLabel: string;
  cadenceLabel: string;
  multipleTopLevelSites: boolean;
}

export function composeTitleLine(t: TitleInput): string {
  // Prefer site.long_name, but fall back to client.long_name when sites
  // haven't been seeded with a display name (common in early rollout).
  const clientName = t.client.long_name || t.client.name;
  const sitePrefix = (s: SiteRow | null): string =>
    (s && s.long_name) || clientName || (s && s.name) || '';

  if (t.kind === 'zone' && t.zoneSite) {
    const letters = extractZoneLetters(t.zoneSite.name);
    const zoneDisp = letters.length > 0 ? formatZoneLabel(letters) : t.zoneSite.name;
    return `${sitePrefix(t.topLevelSite)} ${zoneDisp} ${t.periodLabel} ${t.cadenceLabel}`;
  }

  if (t.kind === 'site') {
    return `${sitePrefix(t.topLevelSite)}${t.zonesLabel ? ` ${t.zonesLabel}` : ''} ${t.periodLabel} ${t.cadenceLabel}`;
  }

  // client scope
  if (t.multipleTopLevelSites) {
    return `${clientName} — All Sites — ${t.periodLabel} ${t.cadenceLabel}`;
  }
  // single top-level site → fall back to site-scope title shape
  return `${sitePrefix(t.topLevelSite)}${t.zonesLabel ? ` ${t.zonesLabel}` : ''} ${t.periodLabel} ${t.cadenceLabel}`;
}

function humanMethod(methods: string[]): string {
  const uniq = [...new Set(methods)];
  if (uniq.length === 0) return '';
  const pretty = uniq.map(m => {
    const n = m.toLowerCase();
    if (n.includes('spray')) return 'herbicide spraying';
    if (n.includes('cut') && n.includes('paint')) return 'cut and paint';
    if (n.includes('brushcut')) return 'brushcutting';
    if (n.includes('handweed')) return 'hand weeding';
    return m.toLowerCase();
  });
  const uniqPretty = [...new Set(pretty)];
  if (uniqPretty.length === 1) return capFirst(uniqPretty[0]);
  if (uniqPretty.length === 2) return capFirst(`${uniqPretty[0]} and ${uniqPretty[1]}`);
  return capFirst(`${uniqPretty.slice(0, -1).join(', ')} and ${uniqPretty[uniqPretty.length - 1]}`);
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractDetailsOfMappedAreas(rawJson: any): string | null {
  if (!rawJson) return null;
  const walk = (node: any): string | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const c of node) {
        const r = walk(c);
        if (r) return r;
      }
      return null;
    }
    const label = (node.label || '').toString().toLowerCase();
    if (label.includes('details of mapped areas') || label.includes('mapped areas')) {
      const txt = node.responses?.text || node.responses?.value || node.text;
      if (typeof txt === 'string') return txt;
    }
    for (const v of Object.values(node)) {
      const r = walk(v);
      if (r) return r;
    }
    return null;
  };
  return walk(rawJson);
}

function parseMappedAreas(text: string): Array<{ colour: string; method: string; weed: string }> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: Array<{ colour: string; method: string; weed: string }> = [];
  const rx = /^(\w+(?:\s+\w+)?)\s*-\s*(.+?)\s*-\s*(.+)$/;
  for (const line of lines) {
    const m = rx.exec(line);
    if (m) out.push({ colour: m[1].trim(), method: m[2].trim(), weed: m[3].trim() });
  }
  return out;
}

function parseConcentrateMl(raw: string | null | undefined): number {
  if (!raw) return 0;
  // "70ml", "70ml/10L", "70 ml"
  const m = /([\d.]+)\s*ml/i.exec(raw);
  return m ? Number(m[1]) : 0;
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function formatDdMmYyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
