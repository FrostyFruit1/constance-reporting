/**
 * Parser entry point — routes Safety Culture audit JSON to the appropriate
 * template-specific extractor based on template_id.
 *
 * Usage:
 *   import { parseInspection } from './parser/index.js';
 *   const result = parseInspection(rawAuditJson);
 */

import type { ScAudit } from './field_extractors.js';
import type { ExtractionResult, ParsingWarning } from './types.js';
import { extractDailyWorkReport } from './daily_work_report.js';
import { extractChemicalApplicationRecord } from './chemical_application_record.js';

// ── Known template IDs ───────────────────────────────────────────────

const DAILY_WORK_REPORT_TEMPLATE = 'template_f0eb0c0c58d24ce6bd21ab671f200a69';
const CHEMICAL_APPLICATION_RECORD_TEMPLATE = 'template_6710ff759a2f4150aba889837ecd9ed2';

// ── Template detection ───────────────────────────────────────────────

export type TemplateType = 'daily_work_report' | 'chemical_application_record' | 'unknown';

export function detectTemplateType(templateId: string): TemplateType {
  switch (templateId) {
    case DAILY_WORK_REPORT_TEMPLATE:
      return 'daily_work_report';
    case CHEMICAL_APPLICATION_RECORD_TEMPLATE:
      return 'chemical_application_record';
    default:
      return 'unknown';
  }
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Parse a raw Safety Culture audit JSON into a structured ExtractionResult.
 *
 * Determines the template type from `template_id` and routes to the
 * appropriate extractor. Never throws — returns warnings for any issues.
 */
export function parseInspection(rawJson: Record<string, unknown>): ExtractionResult {
  const audit = rawJson as unknown as ScAudit;

  // Validate minimum required fields
  if (!audit.audit_id || !audit.template_id) {
    return errorResult(
      audit.audit_id ?? 'unknown',
      'Missing required fields: audit_id or template_id'
    );
  }

  const templateType = detectTemplateType(audit.template_id);

  switch (templateType) {
    case 'daily_work_report':
      return safeExtract(() => extractDailyWorkReport(audit), audit);

    case 'chemical_application_record':
      return safeExtract(() => extractChemicalApplicationRecord(audit), audit);

    case 'unknown':
      return errorResult(
        audit.audit_id,
        `Unknown template_id: ${audit.template_id}`,
        rawJson
      );
  }
}

// ── Safety wrapper ───────────────────────────────────────────────────

function safeExtract(
  extractor: () => ExtractionResult,
  audit: ScAudit
): ExtractionResult {
  try {
    return extractor();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(
      audit.audit_id,
      `Extraction failed with error: ${message}`,
      audit as unknown as Record<string, unknown>
    );
  }
}

// ── Error result factory ─────────────────────────────────────────────

function errorResult(
  auditId: string,
  message: string,
  rawJson?: Record<string, unknown>
): ExtractionResult {
  const warning: ParsingWarning = {
    field: '_extraction',
    message,
  };

  return {
    templateType: 'daily_work_report',
    inspection: {
      scAuditId: auditId,
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
    parsingWarnings: [warning],
    rawJson: rawJson ?? {},
  };
}

// ── Re-exports ───────────────────────────────────────────────────────

export { extractDailyWorkReport } from './daily_work_report.js';
export { extractChemicalApplicationRecord } from './chemical_application_record.js';
export type { ExtractionResult } from './types.js';
export type { ScAudit } from './field_extractors.js';
