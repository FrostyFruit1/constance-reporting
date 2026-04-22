/**
 * ExtractionResult — the interface contract between WP1 (parser) and WP2 (DB writer).
 *
 * WP1 produces this from raw SC audit JSON.
 * WP2 consumes this to write to Supabase.
 */

// ── Top-level result ──────────────────────────────────────────────────

export interface ExtractionResult {
  /** Which template produced this result */
  templateType: 'daily_work_report' | 'chemical_application_record';

  /** Core inspection fields (maps to `inspections` table) */
  inspection: InspectionFields;

  /** Staff assigned with hours (maps to `inspection_personnel`) */
  personnel: PersonnelEntry[];

  /** Tasks from multi-select (maps to `inspection_tasks`) */
  tasks: TaskEntry[];

  /** Species targeted (maps to `inspection_weeds`) */
  weeds: WeedEntry[];

  /** Chemicals referenced (maps to `inspection_chemicals`) */
  chemicals: ChemicalEntry[];

  /** Photos and maps (maps to `inspection_media`) */
  media: MediaEntry[];

  /** Fauna/flora sightings (maps to `inspection_observations`) */
  observations: ObservationEntry[];

  /** Remaining DWR fields (maps to `inspection_metadata`) */
  metadata: MetadataFields;

  /** Chemical Application Record detail (maps to `chemical_application_records` + children) */
  chemicalApplicationRecord?: ChemicalApplicationFields;

  /** Fields that couldn't be cleanly parsed — triggers 'needs_review' status */
  parsingWarnings: ParsingWarning[];

  /** The full raw audit JSON for storage in `inspections.sc_raw_json` */
  rawJson: Record<string, unknown>;
}

// ── Inspection (parent record) ────────────────────────────────────────

export interface InspectionFields {
  scAuditId: string;
  scTemplateType: 'daily_work_report' | 'chemical_application_record';
  scModifiedAt: string | null;

  /** Site name as extracted from SC (raw — resolved to site_id by lookups) */
  siteName: string | null;

  /** Conducted-on date (ISO date string, e.g. "2025-01-15") */
  date: string | null;

  /** Supervisor / Prepared by name (raw — resolved to staff_id by lookups) */
  supervisorName: string | null;
}

// ── Personnel ─────────────────────────────────────────────────────────

export interface PersonnelEntry {
  /** Staff name as it appears in SC */
  staffName: string;

  /** Parsed numeric hours (null if unparseable) */
  hoursWorked: number | null;

  /** Original free-text hours value */
  rawHoursText: string | null;
}

// ── Tasks ─────────────────────────────────────────────────────────────

export interface TaskEntry {
  /** e.g. "Spraying", "Cut & Painting", "Handweeding", "Brushcutting" */
  taskType: string;

  /** Free-text narrative for this task (from Details Of Tasks) */
  detailsText: string | null;
}

// ── Weeds ─────────────────────────────────────────────────────────────

export interface WeedEntry {
  /** Species name as entered in SC */
  speciesNameRaw: string;

  /** Whether from multi-select or free-text "Other Weeds" */
  source: 'multi_select' | 'free_text';
}

// ── Chemicals ─────────────────────────────────────────────────────────

export interface ChemicalEntry {
  /** Chemical name as entered in SC */
  chemicalNameRaw: string;

  /** Raw rate text (e.g. "6ml/L") */
  rateRaw: string | null;

  /** Parsed numeric rate (null if unparseable) */
  rateValue: number | null;

  /** Parsed unit (e.g. "ml/L") */
  rateUnit: string | null;

  /** Which template this came from */
  sourceTemplate: 'daily_work_report' | 'chemical_application_record';
}

// ── Media ─────────────────────────────────────────────────────────────

export interface MediaEntry {
  /** SC download URL */
  scMediaHref: string;

  /** What the photo is attached to (parent item label) */
  mediaType: 'photo' | 'site_map' | 'area_work_map' | null;

  /** GPS coordinates if available */
  gpsLat: number | null;
  gpsLon: number | null;

  /** Before/after classification if determinable */
  beforeAfter: 'before' | 'after' | null;
}

// ── Observations ──────────────────────────────────────────────────────

export interface ObservationEntry {
  observationType: 'fauna' | 'flora';
  speciesName: string | null;
  notes: string | null;
}

// ── Metadata (DWR remaining fields) ───────────────────────────────────

export interface MetadataFields {
  totalWorkedHours: string | null;
  remainingHours: string | null;
  weedRemovalPctMin: number | null;
  weedRemovalPctMax: number | null;
  erosionWorks: string | null;
  concernsText: string | null;
  futureWorksComments: string | null;
}

// ── Chemical Application Record ───────────────────────────────────────

export interface ChemicalApplicationFields {
  scAuditId: string;
  siteName: string | null;
  date: string | null;
  applicationMethod: string | null;
  timeStart: string | null;
  timeFinish: string | null;
  totalAmountSprayedLitres: number | null;

  /** Weather */
  weatherGeneral: string | null;
  windDirection: string | null;
  windSpeed: string | null;
  windVariability: string | null;
  rainfall: string | null;
  temperature: string | null;
  humidity: string | null;

  publicNotification: string | null;

  /** Individual chemical lines (positionally matched) */
  items: ChemicalApplicationItem[];

  /** Operators who performed the application */
  operatorNames: string[];

  /** Wetters and dyes */
  additives: ChemicalApplicationAdditive[];
}

export interface ChemicalApplicationItem {
  chemicalNameRaw: string;
  rateRaw: string | null;
  rateValue: number | null;
  rateUnit: string | null;
  concentrateRaw: string | null;
}

export interface ChemicalApplicationAdditive {
  additiveName: string;
  rateRaw: string | null;
}

// ── Parsing warnings ──────────────────────────────────────────────────

export interface ParsingWarning {
  field: string;
  message: string;
  rawValue?: string;
}
