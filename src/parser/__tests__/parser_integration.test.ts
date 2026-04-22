import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseInspection } from '../index.js';
import type { ExtractionResult } from '../types.js';

// ── Load sample JSONs ────────────────────────────────────────────────

const SAMPLES_DIR = path.resolve(__dirname, '../../../samples');

function loadSample(filename: string): Record<string, unknown> {
  const filePath = path.join(SAMPLES_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ── Test: DWR Early 2025 — Hinchinbrook (Jan 2025) ──────────────────

describe('DWR Early 2025 — Hinchinbrook', () => {
  let result: ExtractionResult;

  beforeAll(() => {
    const json = loadSample('daily_work_report_2025_jan_hinchinbrook.json');
    result = parseInspection(json);
  });

  it('detects template type as daily_work_report', () => {
    expect(result.templateType).toBe('daily_work_report');
  });

  it('extracts audit_id', () => {
    expect(result.inspection.scAuditId).toBe('audit_aa71472bea104d04935d8d414944b1ce');
  });

  it('extracts site name from list-type dropdown (early 2025)', () => {
    // In early 2025, Site Name is a list. Selected = "South Creek", text = "Hinchinbrook creek"
    // Parser should prefer selected label
    expect(result.inspection.siteName).toBe('South Creek');
  });

  it('warns about site name mismatch between dropdown and text', () => {
    const siteWarning = result.parsingWarnings.find(w => w.field === 'siteName');
    expect(siteWarning).toBeDefined();
    expect(siteWarning?.message).toContain('Hinchinbrook creek');
  });

  it('extracts conducted_on date', () => {
    expect(result.inspection.date).toBe('2025-01-07');
  });

  it('extracts supervisor from question-type (early 2025)', () => {
    expect(result.inspection.supervisorName).toBe('Ryan Arford');
  });

  it('extracts personnel with hours', () => {
    expect(result.personnel).toHaveLength(3);
    const names = result.personnel.map(p => p.staffName).sort();
    expect(names).toEqual(['Jordan Darnley', 'Maddie Bryant', 'Ryan Arford']);
    // All should have 8 hours
    for (const p of result.personnel) {
      expect(p.hoursWorked).toBe(8);
      expect(p.rawHoursText).toBe('8');
    }
  });

  it('extracts tasks from multi-select', () => {
    expect(result.tasks.length).toBeGreaterThanOrEqual(4);
    const taskTypes = result.tasks.map(t => t.taskType);
    expect(taskTypes).toContain('Spraying');
    expect(taskTypes).toContain('Cut & Painting');
    expect(taskTypes).toContain('Handweeding');
    expect(taskTypes).toContain('Brushcutting');
  });

  it('extracts task details text', () => {
    expect(result.tasks[0].detailsText).toContain('Annuals and woody weeds');
  });

  it('extracts weeds from multi-select', () => {
    expect(result.weeds.length).toBeGreaterThanOrEqual(10);
    const names = result.weeds.map(w => w.speciesNameRaw);
    expect(names).toContain('Purple Top');
    expect(names).toContain('Lantana');
    expect(names).toContain('Crofton');
    expect(names).toContain('Blackberry');
    // All should be multi_select source
    for (const w of result.weeds) {
      expect(w.source).toBe('multi_select');
    }
  });

  it('extracts chemicals with rates from herbicide field', () => {
    expect(result.chemicals.length).toBeGreaterThanOrEqual(3);
    const starane = result.chemicals.find(c => c.chemicalNameRaw === 'Starane');
    expect(starane).toBeDefined();
    expect(starane?.rateValue).toBe(6);
    expect(starane?.rateUnit).toBe('ml/L');
    expect(starane?.sourceTemplate).toBe('daily_work_report');
  });

  it('extracts media items', () => {
    // Has 12+ photos on "Details Of Tasks" + 1 on weather
    expect(result.media.length).toBeGreaterThanOrEqual(12);
  });

  it('extracts observations (no fauna/flora = empty)', () => {
    // Both fauna and flora are "No" in this sample
    expect(result.observations).toHaveLength(0);
  });

  it('extracts metadata', () => {
    expect(result.metadata.totalWorkedHours).toBe('24');
    expect(result.metadata.remainingHours).toBe('440');
    expect(result.metadata.weedRemovalPctMin).toBe(30);
    expect(result.metadata.weedRemovalPctMax).toBe(40);
  });

  it('has no fatal extraction warnings', () => {
    const fatal = result.parsingWarnings.filter(w => w.field === '_extraction');
    expect(fatal).toHaveLength(0);
  });

  it('stores rawJson', () => {
    expect(result.rawJson).toBeDefined();
    expect((result.rawJson as any).audit_id).toBe('audit_aa71472bea104d04935d8d414944b1ce');
  });
});

// ── Test: DWR Late 2025 — Erosion Control (Jul 2025) ─────────────────

describe('DWR Late 2025 — Erosion Control', () => {
  let result: ExtractionResult;

  beforeAll(() => {
    const json = loadSample('daily_work_report_2025_erosion_control.json');
    result = parseInspection(json);
  });

  it('detects daily_work_report', () => {
    expect(result.templateType).toBe('daily_work_report');
  });

  it('extracts site name from text-type (late 2025+)', () => {
    expect(result.inspection.siteName).toBe('Rotary Cowpasture Erosion Control');
  });

  it('extracts supervisor from list-type (late 2025+)', () => {
    expect(result.inspection.supervisorName).toBe('Jordan Darnley');
  });

  it('extracts date', () => {
    expect(result.inspection.date).toBe('2025-07-21');
  });

  it('extracts personnel (3 staff)', () => {
    expect(result.personnel).toHaveLength(3);
    const names = result.personnel.map(p => p.staffName).sort();
    expect(names).toEqual(['Ethan Magtoto', 'Jordan Darnley', 'Matthew Constance']);
  });

  it('parses hours correctly', () => {
    for (const p of result.personnel) {
      expect(p.hoursWorked).toBe(8);
    }
  });

  it('extracts tasks', () => {
    const types = result.tasks.map(t => t.taskType);
    expect(types).toContain('Spraying');
    expect(types).toContain('Chainsawing');
    expect(types).toContain('Handweeding');
    expect(types).toContain('Brushcutting');
  });

  it('extracts weeds', () => {
    const names = result.weeds.map(w => w.speciesNameRaw);
    expect(names).toContain('Purple Top');
    expect(names).toContain('Kikuyu');
    expect(names).toContain('African Olive');
    expect(names).toContain('Privett sp.');
  });

  it('extracts chemicals (single chemical, no rates text)', () => {
    expect(result.chemicals.length).toBeGreaterThanOrEqual(1);
    expect(result.chemicals[0].chemicalNameRaw).toBe('Glyphosate');
  });

  it('parses weed removal percentage (single value)', () => {
    expect(result.metadata.weedRemovalPctMin).toBe(90);
    expect(result.metadata.weedRemovalPctMax).toBe(90);
  });

  it('handles absent remaining hours', () => {
    expect(result.metadata.remainingHours).toBeNull();
  });

  it('extracts media from Area Of Concerns', () => {
    expect(result.media.length).toBeGreaterThanOrEqual(14);
  });

  it('has no fatal warnings', () => {
    const fatal = result.parsingWarnings.filter(w => w.field === '_extraction');
    expect(fatal).toHaveLength(0);
  });
});

// ── Test: DWR 2026 — Regen Manager ───────────────────────────────────

describe('DWR 2026 — Regen Manager', () => {
  let result: ExtractionResult;

  beforeAll(() => {
    const json = loadSample('daily_work_report_2026_regen_manager.json');
    result = parseInspection(json);
  });

  it('extracts site name from text field (with trailing whitespace trimmed)', () => {
    // Raw value: "Spring Farm AV Jennings " (trailing space)
    expect(result.inspection.siteName).toBe('Spring Farm AV Jennings');
  });

  it('extracts supervisor as Suzie Kiloh', () => {
    expect(result.inspection.supervisorName).toBe('Suzie Kiloh');
  });

  it('extracts date', () => {
    expect(result.inspection.date).toBe('2026-01-05');
  });

  it('extracts 2 personnel', () => {
    expect(result.personnel).toHaveLength(2);
    const names = result.personnel.map(p => p.staffName).sort();
    expect(names).toEqual(['Madeline Sharpe', 'Suzie Kiloh']);
  });

  it('handles free-text task "Watering" (no multi-select)', () => {
    // Tasks Undertaken has text="Watering" but empty selected
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    const types = result.tasks.map(t => t.taskType);
    expect(types).toContain('Watering');
  });

  it('handles empty weeds list (watering day, no spraying)', () => {
    expect(result.weeds).toHaveLength(0);
  });

  it('handles empty chemicals list', () => {
    expect(result.chemicals).toHaveLength(0);
  });

  it('extracts metadata — N/A remaining hours', () => {
    expect(result.metadata.remainingHours).toBe('N/A');
    expect(result.metadata.totalWorkedHours).toBe('16');
  });

  it('handles empty weed removal percentage', () => {
    expect(result.metadata.weedRemovalPctMin).toBeNull();
    expect(result.metadata.weedRemovalPctMax).toBeNull();
  });

  it('extracts media (IAP photos + site map)', () => {
    expect(result.media.length).toBeGreaterThanOrEqual(11);
  });

  it('has no fatal warnings', () => {
    const fatal = result.parsingWarnings.filter(w => w.field === '_extraction');
    expect(fatal).toHaveLength(0);
  });
});

// ── Test: DWR 2026 — Reece Morgan ────────────────────────────────────

describe('DWR 2026 — Reece Morgan', () => {
  let result: ExtractionResult;

  beforeAll(() => {
    const json = loadSample('daily_work_report_2026_reece_morgan.json');
    result = parseInspection(json);
  });

  it('extracts site name', () => {
    expect(result.inspection.siteName).toBe('Kavanaugh Riparian');
  });

  it('extracts supervisor', () => {
    expect(result.inspection.supervisorName).toBe('Reece Morgan');
  });

  it('extracts date', () => {
    expect(result.inspection.date).toBe('2026-01-22');
  });

  it('extracts 3 personnel', () => {
    expect(result.personnel).toHaveLength(3);
    const names = result.personnel.map(p => p.staffName).sort();
    expect(names).toEqual(['Josh Collins', 'Matthew Constance', 'Reece Morgan']);
  });

  it('extracts tasks', () => {
    const types = result.tasks.map(t => t.taskType);
    expect(types).toContain('Spraying');
    expect(types).toContain('Cut & Painting');
    expect(types).toContain('Handweeding');
  });

  it('extracts weeds including Moth Vine', () => {
    const names = result.weeds.map(w => w.speciesNameRaw);
    expect(names).toContain('Moth Vine');
    expect(names).toContain('African Olive');
    expect(names).toContain('Bidens Pilosa');
  });

  it('extracts chemicals with complex text', () => {
    // Herbicide has Brushwet and Grazon Extra selected, with long text about rates
    expect(result.chemicals.length).toBeGreaterThanOrEqual(1);
    const grazon = result.chemicals.find(c => c.chemicalNameRaw === 'Grazon Extra');
    expect(grazon).toBeDefined();
  });

  it('parses weed removal at 90%', () => {
    expect(result.metadata.weedRemovalPctMin).toBe(90);
    expect(result.metadata.weedRemovalPctMax).toBe(90);
  });

  it('handles absent remaining hours', () => {
    expect(result.metadata.remainingHours).toBeNull();
  });

  it('extracts media (IAP photos, site area work map)', () => {
    expect(result.media.length).toBeGreaterThanOrEqual(28);
  });

  it('classifies site area work map media', () => {
    const maps = result.media.filter(m => m.mediaType === 'area_work_map');
    expect(maps.length).toBeGreaterThanOrEqual(1);
  });

  it('has no fatal warnings', () => {
    const fatal = result.parsingWarnings.filter(w => w.field === '_extraction');
    expect(fatal).toHaveLength(0);
  });
});

// ── Test: Chemical Application Record 2025 ───────────────────────────

describe('Chemical Application Record 2025', () => {
  let result: ExtractionResult;

  beforeAll(() => {
    const json = loadSample('chemical_application_2025.json');
    result = parseInspection(json);
  });

  it('detects template type as chemical_application_record', () => {
    expect(result.templateType).toBe('chemical_application_record');
  });

  it('extracts audit_id', () => {
    expect(result.inspection.scAuditId).toBe('audit_cda07055bba440529c8120dc6f40d882');
  });

  it('extracts site name from "Site treated" list', () => {
    // Selected: "South Creek", text: "Hichinbrook" (typo)
    expect(result.inspection.siteName).toBe('South Creek');
  });

  it('extracts date', () => {
    expect(result.inspection.date).toBe('2025-01-13');
  });

  it('extracts supervisor', () => {
    expect(result.inspection.supervisorName).toBe('Ryan Arford');
  });

  it('extracts operators as personnel', () => {
    expect(result.personnel).toHaveLength(2);
    const names = result.personnel.map(p => p.staffName).sort();
    expect(names).toEqual(['Ethan Magtoto', 'Jordan Darnley']);
  });

  it('has chemicalApplicationRecord populated', () => {
    expect(result.chemicalApplicationRecord).toBeDefined();
    const car = result.chemicalApplicationRecord!;

    expect(car.applicationMethod).toBe('Backpack');
    expect(car.timeStart).toBe('7:30');
    expect(car.timeFinish).toBe('3:20');
    expect(car.totalAmountSprayedLitres).toBe(40);
    expect(car.publicNotification).toBe('Signage');
  });

  it('extracts chemicals with positional matching', () => {
    const car = result.chemicalApplicationRecord!;
    expect(car.items).toHaveLength(3);

    expect(car.items[0].chemicalNameRaw).toBe('Glyphosate');
    expect(car.items[0].rateRaw).toBe('7ml/L');
    expect(car.items[0].rateValue).toBe(7);
    expect(car.items[0].rateUnit).toBe('ml/L');
    expect(car.items[0].concentrateRaw).toBe('70ml/10L');

    expect(car.items[1].chemicalNameRaw).toBe('Starane');
    expect(car.items[1].rateRaw).toBe('6ml/L');
    expect(car.items[1].rateValue).toBe(6);

    expect(car.items[2].chemicalNameRaw).toBe('Dicamba');
    expect(car.items[2].rateValue).toBe(6);
  });

  it('extracts additives', () => {
    const car = result.chemicalApplicationRecord!;
    expect(car.additives).toHaveLength(2);
    const names = car.additives.map(a => a.additiveName);
    expect(names).toContain('Brushwet 2ml/L');
    expect(names).toContain('Blue Dye 5ml/L');
  });

  it('extracts weather data', () => {
    const car = result.chemicalApplicationRecord!;
    expect(car.weatherGeneral).toBe('Overcast');
    expect(car.windDirection).toBe('E');
    expect(car.rainfall).toBe('0');
  });

  it('extracts operators', () => {
    const car = result.chemicalApplicationRecord!;
    expect(car.operatorNames).toHaveLength(2);
    expect(car.operatorNames).toContain('Jordan Darnley');
    expect(car.operatorNames).toContain('Ethan Magtoto');
  });

  it('flattens chemicals to top-level chemicals[]', () => {
    expect(result.chemicals).toHaveLength(3);
    for (const c of result.chemicals) {
      expect(c.sourceTemplate).toBe('chemical_application_record');
    }
  });

  it('extracts media (area worked photo)', () => {
    expect(result.media.length).toBeGreaterThanOrEqual(1);
  });

  it('has empty tasks, weeds, observations for CAR', () => {
    expect(result.tasks).toHaveLength(0);
    expect(result.weeds).toHaveLength(0);
    expect(result.observations).toHaveLength(0);
  });

  it('has no fatal warnings', () => {
    const fatal = result.parsingWarnings.filter(w => w.field === '_extraction');
    expect(fatal).toHaveLength(0);
  });
});

// ── Test: Error handling ─────────────────────────────────────────────

describe('Error handling', () => {
  it('returns warning for unknown template_id', () => {
    const result = parseInspection({
      audit_id: 'audit_test',
      template_id: 'template_unknown_xyz',
      header_items: [],
      items: [],
      audit_data: { authorship: {} },
    });
    expect(result.parsingWarnings).toHaveLength(1);
    expect(result.parsingWarnings[0].message).toContain('Unknown template_id');
  });

  it('returns warning for missing audit_id', () => {
    const result = parseInspection({ template_id: 'template_f0eb0c0c58d24ce6bd21ab671f200a69' });
    expect(result.parsingWarnings).toHaveLength(1);
    expect(result.parsingWarnings[0].field).toBe('_extraction');
  });

  it('does not throw on empty audit', () => {
    expect(() => parseInspection({})).not.toThrow();
  });

  it('does not throw on minimal valid DWR', () => {
    const result = parseInspection({
      audit_id: 'audit_minimal',
      template_id: 'template_f0eb0c0c58d24ce6bd21ab671f200a69',
      modified_at: '2025-01-01T00:00:00Z',
      header_items: [],
      items: [],
      audit_data: { authorship: {} },
      template_data: { metadata: { name: 'Daily Work Report' } },
    });
    expect(result.templateType).toBe('daily_work_report');
    expect(result.inspection.scAuditId).toBe('audit_minimal');
    expect(result.personnel).toHaveLength(0);
    expect(result.tasks).toHaveLength(0);
  });
});
