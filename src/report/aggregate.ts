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
  Cadence,
} from './types';
import { formatZonesPhrase, formatPublicationDate } from './period';

export interface AggregateInput {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  cadence: Cadence;
  periodLabel: string;
  periodFilenameLabel: string;
}

export async function aggregate(db: SupabaseClient, input: AggregateInput): Promise<ReportData> {
  const { clientId, periodStart, periodEnd, cadence, periodLabel, periodFilenameLabel } = input;

  // 1. Client
  const { data: client, error: cErr } = await db
    .from('clients')
    .select('id, organization_id, name, contact_name, council_or_body, report_template_variant, location_maps, active_roster_staff_ids')
    .eq('id', clientId)
    .single();
  if (cErr || !client) throw new Error(`Client not found: ${clientId} (${cErr?.message})`);

  // 2. Organization
  const { data: org, error: oErr } = await db
    .from('organizations')
    .select('id, name, address, phone, email, logo_url')
    .eq('id', client.organization_id)
    .single();
  if (oErr || !org) throw new Error(`Organization not found (${oErr?.message})`);

  // 3. Sites — for the pilot, pull all sites linked to this client. Fallback: sites where name begins with 'EBSF'.
  let sitesQ = db.from('sites')
    .select('id, organization_id, client_id, name, canonical_name, sc_label, long_name, street, suburb')
    .eq('organization_id', org.id);
  const { data: sitesByClient } = await db.from('sites')
    .select('id, organization_id, client_id, name, canonical_name, sc_label')
    .eq('client_id', clientId);
  let sites: SiteRow[];
  if (sitesByClient && sitesByClient.length > 0) {
    sites = sitesByClient as unknown as SiteRow[];
  } else {
    const { data: fallback } = await sitesQ;
    sites = ((fallback as unknown as SiteRow[]) || []).filter(s =>
      s.name.toUpperCase().startsWith(client.name.slice(0, 4).toUpperCase())
    );
  }
  if (sites.length === 0) throw new Error(`No sites found for client ${client.name}`);
  const siteIds = sites.map(s => s.id);
  const siteById = new Map(sites.map(s => [s.id, s]));

  // 4. Inspections in period + children
  const { data: inspRaw, error: iErr } = await db
    .from('inspections')
    .select('id, date, site_id, supervisor_id, sc_template_type, sc_raw_json')
    .in('site_id', siteIds)
    .not('date', 'is', null)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .eq('sc_template_type', 'daily_work_report')
    .order('date', { ascending: true });
  if (iErr) throw new Error(`Inspections query failed: ${iErr.message}`);
  const inspections = inspRaw || [];

  if (inspections.length === 0) {
    // Still produce a valid (empty) report — but narrative/sections will be placeholders.
  }

  const inspectionIds = inspections.map(i => i.id);

  // Eager-load children in one batch each
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

  // Supervisor names + all staff referenced
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

  // Build InspectionRow tree
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
    const zone = site?.name || 'Unknown Zone';
    return {
      id: i.id,
      date: i.date,
      site_id: i.site_id,
      zone,
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
        inspection_id: o.inspection_id, inspection_date: i.date, zone,
      })),
      metadata: metaByI.get(i.id)?.[0] || null,
    };
  });

  // Zones included (ordered by first appearance)
  const zonesSeen = new Set<string>();
  const zonesIncluded: string[] = [];
  for (const ins of inspectionRows) {
    if (!zonesSeen.has(ins.zone)) {
      zonesSeen.add(ins.zone);
      zonesIncluded.push(ins.zone);
    }
  }

  // Supervisor: staff with the most inspections in period
  const supervisorCounts = new Map<string, number>();
  for (const ins of inspectionRows) {
    if (ins.supervisor_id) {
      supervisorCounts.set(ins.supervisor_id, (supervisorCounts.get(ins.supervisor_id) || 0) + 1);
    }
  }
  const topSupId = [...supervisorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const supervisor = topSupId ? staffMap.get(topSupId) || null : null;

  // §3 Staff hours by zone
  const hoursKey = (zone: string, staffKey: string) => `${zone}${staffKey}`;
  const hoursMap = new Map<string, StaffHoursRow>();
  for (const ins of inspectionRows) {
    for (const p of ins.personnel) {
      const sid = p.staff_id || `null-${p.staff_name || 'unknown'}`;
      const name = p.staff_name || 'Unknown';
      const k = hoursKey(ins.zone, sid);
      const prev = hoursMap.get(k) || { zone: ins.zone, staff_id: p.staff_id, staff_name: name, hours: 0 };
      prev.hours += Number(p.hours_worked) || 0;
      hoursMap.set(k, prev);
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
  const staffHoursByZone = [...hoursMap.values()].sort((a, b) => {
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    return b.hours - a.hours;
  });

  // §4.1 Weed works — one row per (zone × weed-group × method)
  const weedWorksMap = new Map<string, WeedWorkRow>();
  for (const ins of inspectionRows) {
    const zoneTotalHours = ins.personnel.reduce((s, p) => s + (Number(p.hours_worked) || 0), 0);
    const methods = ins.tasks.map(t => t.task_type).filter(Boolean);
    const speciesList = [...new Set(ins.weeds.map(w => w.species_name_canonical || w.species_name_raw))];
    if (speciesList.length === 0 || methods.length === 0) continue;
    // Parse polygon colours from raw details_of_mapped_areas if present
    const rawJson = ins.sc_raw_json as any;
    let mappedLines: Array<{ colour: string; method: string; weed: string }> = [];
    try {
      const details = extractDetailsOfMappedAreas(rawJson);
      if (details) {
        mappedLines = parseMappedAreas(details);
      }
    } catch { /* ignore */ }

    const methodLabel = humanMethod(methods);
    for (const species of speciesList) {
      const colourMatch = mappedLines.find(l =>
        l.weed.toLowerCase().includes(species.toLowerCase()) ||
        species.toLowerCase().includes(l.weed.toLowerCase())
      );
      const key = `${ins.zone}${species}${methodLabel}`;
      const existing = weedWorksMap.get(key);
      if (existing) {
        existing.hours += zoneTotalHours / speciesList.length;
      } else {
        weedWorksMap.set(key, {
          zone: ins.zone,
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
  const weedWorks = [...weedWorksMap.values()]
    .map(w => ({ ...w, hours: Math.round(w.hours) }))
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.weed_type.localeCompare(b.weed_type));

  // §6 Herbicide totals — no CAR data, fallback to DWR chemicals. Flag needs_review.
  const herbMap = new Map<string, HerbicideRow>();
  for (const ins of inspectionRows) {
    for (const c of ins.chemicals) {
      const name = c.chemical_name_canonical || c.chemical_name_raw;
      const targetWeed = ins.weeds[0]?.species_name_canonical || ins.weeds[0]?.species_name_raw || null;
      const key = `${name}${ins.zone}${targetWeed || ''}`;
      const prev = herbMap.get(key) || {
        chemical_canonical: name,
        rate_text: c.rate_raw,
        target_weed: targetWeed,
        zone: ins.zone,
        total_sprayed_litres: null,
        total_concentrate_ml: null,
        needs_review: true,
      };
      herbMap.set(key, prev);
    }
  }
  const herbicideTotals = [...herbMap.values()];

  // observations flat list for §5/§7/§8
  const allObs: InspectionObservationRow[] = inspectionRows.flatMap(i => i.observations);

  // §2 LLM inputs — details of tasks by zone
  const detailsOfTasksByZone: Record<string, Array<{ date: string; text: string }>> = {};
  for (const ins of inspectionRows) {
    if (!detailsOfTasksByZone[ins.zone]) detailsOfTasksByZone[ins.zone] = [];
    const texts = new Set<string>();
    for (const t of ins.tasks) {
      if (t.details_text) texts.add(t.details_text.trim());
    }
    const combined = [...texts].join('\n\n');
    if (combined) detailsOfTasksByZone[ins.zone].push({ date: ins.date || '', text: combined });
  }

  // Title, filename label, addressed-to, author
  const zonesPhrase = formatZonesPhrase(zonesIncluded);
  const longName = (sites[0] as any)?.long_name || client.name;
  const cadenceLabel = cadence === 'monthly' ? 'Monthly Report' : cadence === 'weekly' ? 'Weekly Report' : 'Quarterly Report';
  const titleLine = `${longName}${zonesPhrase.display ? ` ${zonesPhrase.display}` : ''} ${periodLabel} ${cadenceLabel}`;
  const authorLine = supervisor ? `Constance Conservation - ${supervisor.name}` : 'Constance Conservation';
  const addressedToParts = [client.contact_name, client.council_or_body].filter(Boolean) as string[];
  const addressedToDedup = [...new Set(addressedToParts)];
  const addressedTo = addressedToDedup.join(', ') || client.name;
  const publicationDate = formatPublicationDate();

  return {
    client: client as ClientRow,
    organization: org as OrgRow,
    sites,
    supervisor,
    inspections: inspectionRows,
    staffHoursByZone,
    weedWorks,
    herbicideTotals,
    observations: allObs,
    detailsOfTasksByZone,
    periodStart,
    periodEnd,
    cadence,
    zonesIncluded,
    periodLabel,
    periodFilenameLabel,
    titleLine,
    addressedTo,
    authorLine,
    publicationDate,
  };
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
    // Items have 'label' and 'responses' in SC structure
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
