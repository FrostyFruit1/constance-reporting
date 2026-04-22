/**
 * Test fixtures — mock ExtractionResult objects for writer integration tests.
 */

import { ExtractionResult } from '../../parser/types';

/**
 * Minimal valid DWR extraction result for testing.
 * Uses a unique sc_audit_id per call to avoid collisions between tests.
 */
export function makeDwrExtraction(overrides?: {
  scAuditId?: string;
  siteName?: string;
  supervisorName?: string;
}): ExtractionResult {
  const id = overrides?.scAuditId ?? `audit_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    templateType: 'daily_work_report',
    inspection: {
      scAuditId: id,
      scTemplateType: 'daily_work_report',
      scModifiedAt: '2025-03-15T10:30:00Z',
      siteName: overrides?.siteName ?? 'Harrington Forest',
      date: '2025-03-15',
      supervisorName: overrides?.supervisorName ?? 'Cameron Constance',
    },
    personnel: [
      { staffName: 'Ryan Arford', hoursWorked: 8, rawHoursText: '8' },
      { staffName: 'Maddie Bryant', hoursWorked: 8, rawHoursText: '8' },
    ],
    tasks: [
      { taskType: 'Spraying', detailsText: 'Sprayed lantana along creek banks' },
      { taskType: 'Handweeding', detailsText: null },
    ],
    weeds: [
      { speciesNameRaw: 'Lantana', source: 'multi_select' },
      { speciesNameRaw: 'Fleabane', source: 'multi_select' },
      { speciesNameRaw: 'Mystery Weed', source: 'free_text' },
    ],
    chemicals: [
      {
        chemicalNameRaw: 'Glyphosate',
        rateRaw: '7ml/L',
        rateValue: 7,
        rateUnit: 'ml/L',
        sourceTemplate: 'daily_work_report',
      },
      {
        chemicalNameRaw: 'Starane',
        rateRaw: '6ml/L',
        rateValue: 6,
        rateUnit: 'ml/L',
        sourceTemplate: 'daily_work_report',
      },
    ],
    media: [
      {
        scMediaHref: 'https://api.safetyculture.io/audits/test/media/photo1.jpg',
        mediaType: 'photo',
        gpsLat: -33.95,
        gpsLon: 150.70,
        beforeAfter: 'before',
      },
    ],
    observations: [
      { observationType: 'fauna', speciesName: 'Eastern Water Dragon', notes: 'Seen near creek' },
    ],
    metadata: {
      totalWorkedHours: '16',
      remainingHours: '440',
      weedRemovalPctMin: 30,
      weedRemovalPctMax: 40,
      erosionWorks: null,
      concernsText: 'Erosion near southern bank',
      futureWorksComments: 'Follow-up spray in 4 weeks',
    },
    parsingWarnings: [],
    rawJson: { audit_id: id, template_id: 'template_test', items: [] },
  };
}

/**
 * Extraction result with parsing warnings — should produce 'needs_review' status.
 */
export function makeDwrWithWarnings(scAuditId?: string): ExtractionResult {
  const result = makeDwrExtraction({ scAuditId });
  result.parsingWarnings = [
    { field: 'hours', message: 'Could not parse hours text', rawValue: 'N/A' },
    { field: 'weed_removal_pct', message: 'Unexpected format', rawValue: '~50ish' },
  ];
  return result;
}

/**
 * Chemical Application Record extraction result.
 */
export function makeCarExtraction(scAuditId?: string): ExtractionResult {
  const id = scAuditId ?? `audit_car_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    templateType: 'chemical_application_record',
    inspection: {
      scAuditId: id,
      scTemplateType: 'chemical_application_record',
      scModifiedAt: '2025-06-10T14:00:00Z',
      siteName: 'Hinchinbrook',
      date: '2025-06-10',
      supervisorName: 'Cameron Constance',
    },
    personnel: [],
    tasks: [],
    weeds: [],
    chemicals: [],
    media: [
      {
        scMediaHref: 'https://api.safetyculture.io/audits/test/media/area_worked.jpg',
        mediaType: 'area_work_map',
        gpsLat: null,
        gpsLon: null,
        beforeAfter: null,
      },
    ],
    observations: [],
    metadata: {
      totalWorkedHours: null,
      remainingHours: null,
      weedRemovalPctMin: null,
      weedRemovalPctMax: null,
      erosionWorks: null,
      concernsText: null,
      futureWorksComments: null,
    },
    chemicalApplicationRecord: {
      scAuditId: id,
      siteName: 'Hinchinbrook',
      date: '2025-06-10',
      applicationMethod: 'Backpack',
      timeStart: '7:30',
      timeFinish: '3:20',
      totalAmountSprayedLitres: 40,
      weatherGeneral: 'Sunny',
      windDirection: 'NW',
      windSpeed: '10km/h',
      windVariability: 'Gusting',
      rainfall: 'None',
      temperature: '22C',
      humidity: '60%',
      publicNotification: 'Signage',
      items: [
        {
          chemicalNameRaw: 'Glyphosate',
          rateRaw: '7ml/L',
          rateValue: 7,
          rateUnit: 'ml/L',
          concentrateRaw: '70ml/10L',
        },
        {
          chemicalNameRaw: 'Starane',
          rateRaw: '6ml/L',
          rateValue: 6,
          rateUnit: 'ml/L',
          concentrateRaw: '60ml/10L',
        },
        {
          chemicalNameRaw: 'Dicamba',
          rateRaw: '6ml/L',
          rateValue: 6,
          rateUnit: 'ml/L',
          concentrateRaw: '60ml/10L',
        },
      ],
      operatorNames: ['Ryan Arford', 'Maddie Bryant'],
      additives: [
        { additiveName: 'Brushwet', rateRaw: '2ml/L' },
        { additiveName: 'Blue Dye', rateRaw: '5ml/L' },
      ],
    },
    parsingWarnings: [],
    rawJson: { audit_id: id, template_id: 'template_car_test', items: [] },
  };
}

/**
 * Minimal extraction — empty child arrays, null optional fields.
 * Tests that the writer handles sparse data gracefully.
 */
export function makeMinimalExtraction(scAuditId?: string): ExtractionResult {
  const id = scAuditId ?? `audit_minimal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    templateType: 'daily_work_report',
    inspection: {
      scAuditId: id,
      scTemplateType: 'daily_work_report',
      scModifiedAt: null,
      siteName: null,
      date: null,
      supervisorName: null,
    },
    personnel: [],
    tasks: [],
    weeds: [],
    chemicals: [],
    media: [],
    observations: [],
    metadata: {
      totalWorkedHours: null,
      remainingHours: null,
      weedRemovalPctMin: null,
      weedRemovalPctMax: null,
      erosionWorks: null,
      concernsText: null,
      futureWorksComments: null,
    },
    parsingWarnings: [],
    rawJson: { audit_id: id },
  };
}
