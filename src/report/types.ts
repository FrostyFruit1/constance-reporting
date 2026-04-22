export type Cadence = 'weekly' | 'monthly' | 'quarterly';

export interface ReportOptions {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  cadence: Cadence;
  outputDir?: string;
  skipLLM?: boolean;
  writeDb?: boolean;
}

export interface ClientRow {
  id: string;
  organization_id: string;
  name: string;
  long_name: string | null;
  contact_name: string | null;
  council_or_body: string | null;
  report_template_variant: string | null;
  site_id_pattern: string | null;
  location_maps: string[] | null;
  active_roster_staff_ids: string[] | null;
}

export interface OrgRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

export interface SiteRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  canonical_name: string | null;
  sc_label: string | null;
  long_name?: string | null;
  street?: string | null;
  suburb?: string | null;
}

export interface StaffRow {
  id: string;
  name: string;
  role: string | null;
}

export interface InspectionPersonnelRow {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  hours_worked: number | null;
}

export interface InspectionTaskRow {
  id: string;
  task_type: string;
  details_text: string | null;
}

export interface InspectionWeedRow {
  id: string;
  species_name_raw: string;
  species_name_canonical: string | null;
}

export interface InspectionChemicalRow {
  id: string;
  chemical_name_raw: string;
  chemical_name_canonical: string | null;
  rate_raw: string | null;
  rate_value: number | null;
  rate_unit: string | null;
}

export interface InspectionObservationRow {
  id: string;
  observation_type: 'fauna' | 'flora';
  species_name: string | null;
  notes: string | null;
  inspection_id: string;
  inspection_date: string | null;
  zone: string | null;
}

export interface InspectionRow {
  id: string;
  date: string | null;
  site_id: string | null;
  site_name: string;
  zone: string;
  zoneLetters: string[];
  supervisor_id: string | null;
  supervisor_name: string | null;
  sc_template_type: string;
  sc_raw_json: any;
  personnel: InspectionPersonnelRow[];
  tasks: InspectionTaskRow[];
  weeds: InspectionWeedRow[];
  chemicals: InspectionChemicalRow[];
  observations: InspectionObservationRow[];
  metadata: Record<string, unknown> | null;
}

export interface StaffHoursRow {
  zone: string;
  staff_id: string | null;
  staff_name: string;
  hours: number;
}

export interface WeedWorkRow {
  zone: string;
  weed_type: string;
  method: string;
  species_list: string[];
  hours: number;
  colour: string | null;
  gis_lat: number | null;
  gis_lng: number | null;
  area_m2: number | null;
  needs_review: boolean;
}

export interface HerbicideRow {
  chemical_canonical: string;
  rate_text: string | null;
  target_weed: string | null;
  zone: string;
  total_sprayed_litres: number | null;
  total_concentrate_ml: number | null;
  needs_review: boolean;
}

export interface ReportData {
  client: ClientRow;
  organization: OrgRow;
  sites: SiteRow[];
  supervisor: StaffRow | null;
  inspections: InspectionRow[];
  staffHoursByZone: StaffHoursRow[];
  weedWorks: WeedWorkRow[];
  herbicideTotals: HerbicideRow[];
  observations: InspectionObservationRow[];
  detailsOfTasksByZone: Record<string, Array<{ date: string; text: string }>>;
  periodStart: string;
  periodEnd: string;
  cadence: Cadence;
  zonesIncluded: string[];
  zonesLabel: string;
  periodLabel: string;
  periodFilenameLabel: string;
  titleLine: string;
  addressedTo: string;
  authorLine: string;
  publicationDate: string;
}

export interface OutlineBullet {
  label: string;
  body: string;
}

export interface NarrativeSections {
  outlineOfWorks: Record<string, OutlineBullet[]>;
  birdSightings: string;
  incidents: string;
  faunaSightings: string;
}

export interface GeneratedReport {
  clientReportId: string | null;
  html: string;
  docxBuffer: Buffer;
  pdfBuffer?: Buffer;
  outputPaths: { html: string; docx: string; pdf?: string };
  data: ReportData;
  narratives: NarrativeSections;
}
