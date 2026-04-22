/**
 * chemical_application_record.ts — Extract structured data from a Safety Culture
 * Chemical Application Record audit JSON.
 *
 * The CAR template uses positional matching: line N of "Chemical/s Used"
 * corresponds to line N of "Rate Used" and line N of "Concentrate used".
 */

import {
  ScAudit,
  findItem,
  findItemFuzzy,
  readText,
  readSelectedLabels,
  readFirstSelectedLabel,
  readDatetime,
  collectAllMedia,
  classifyMediaType,
} from './field_extractors.js';
import {
  parseTimeStartFinish,
  parseTotalAmountSprayed,
  parseRate,
} from './free_text_parsers.js';
import type {
  ExtractionResult,
  InspectionFields,
  PersonnelEntry,
  ChemicalEntry,
  MediaEntry,
  MetadataFields,
  ChemicalApplicationFields,
  ChemicalApplicationItem,
  ChemicalApplicationAdditive,
  ParsingWarning,
} from './types.js';

// ── Main extractor ───────────────────────────────────────────────────

export function extractChemicalApplicationRecord(audit: ScAudit): ExtractionResult {
  const warnings: ParsingWarning[] = [];
  const allItems = [...audit.header_items, ...audit.items];

  // ── Inspection-level fields ─────────────────────────────────────
  const inspection = extractInspectionFields(audit, allItems, warnings);

  // ── Personnel (operators) ───────────────────────────────────────
  const personnel = extractOperatorsAsPersonnel(audit.items);

  // ── Chemical Application Record detail ──────────────────────────
  const carFields = extractCARFields(audit, allItems, warnings);

  // ── Chemicals (flattened for the chemicals[] array) ─────────────
  const chemicals = extractChemicals(carFields);

  // ── Media ──────────────────────────────────────────────────────
  const media = extractMedia(allItems);

  return {
    templateType: 'chemical_application_record',
    inspection,
    personnel,
    tasks: [], // CARs don't have a tasks multi-select
    weeds: [], // CARs don't have a weeds multi-select
    chemicals,
    media,
    observations: [], // CARs don't have fauna/flora observations
    metadata: emptyMetadata(),
    chemicalApplicationRecord: carFields,
    parsingWarnings: warnings,
    rawJson: audit as unknown as Record<string, unknown>,
  };
}

// ── Inspection fields ────────────────────────────────────────────────

function extractInspectionFields(
  audit: ScAudit,
  allItems: ScAudit['header_items'],
  _warnings: ParsingWarning[]
): InspectionFields {
  // Site Name — CAR uses "Site treated" or "Site conducted" as list
  const siteItem = findItem(allItems, 'Site treated', 'Site conducted');
  let siteName = readFirstSelectedLabel(siteItem);
  // Fallback to text value
  if (!siteName) {
    siteName = readText(siteItem);
  }
  if (siteName) siteName = siteName.trim();

  // Conducted on
  const conductedOnItem = findItem(allItems, 'Conducted on');
  const datetimeRaw = readDatetime(conductedOnItem);
  let date: string | null = null;
  if (datetimeRaw) {
    date = datetimeRaw.substring(0, 10);
  }

  // Supervisor
  const supervisorItem = findItem(allItems, 'Prepared by', 'Prepared by/ Supervisor');
  const supervisorName = readFirstSelectedLabel(supervisorItem);

  return {
    scAuditId: audit.audit_id,
    scTemplateType: 'chemical_application_record',
    scModifiedAt: audit.modified_at,
    siteName,
    date,
    supervisorName,
  };
}

// ── Operators as personnel ───────────────────────────────────────────

function extractOperatorsAsPersonnel(items: ScAudit['items']): PersonnelEntry[] {
  const operatorsItem = findItem(items, 'Operator/Applicators Names');
  const names = readSelectedLabels(operatorsItem);

  return names.map(name => ({
    staffName: name,
    hoursWorked: null,
    rawHoursText: null,
  }));
}

// ── Chemical Application Record fields ───────────────────────────────

function extractCARFields(
  audit: ScAudit,
  allItems: ScAudit['header_items'],
  warnings: ParsingWarning[]
): ChemicalApplicationFields {
  // Site name (same as inspection)
  const siteItem = findItem(allItems, 'Site treated', 'Site conducted');
  let siteName = readFirstSelectedLabel(siteItem);
  if (!siteName) siteName = readText(siteItem);
  if (siteName) siteName = siteName.trim();

  // Date
  const conductedOnItem = findItem(allItems, 'Conducted on');
  const datetimeRaw = readDatetime(conductedOnItem);
  const date = datetimeRaw ? datetimeRaw.substring(0, 10) : null;

  // Application method
  const methodItem = findItem(allItems, 'Application Method');
  const applicationMethod = readFirstSelectedLabel(methodItem);

  // Time start/finish
  const timeItem = findItemFuzzy(allItems, 'Time Occurred Start/Finish');
  if (!timeItem) {
    // Try alternate label
    findItemFuzzy(allItems, 'Time Start/Finish');
  }
  const timeRaw = readText(timeItem);
  const timeParsed = parseTimeStartFinish(timeRaw);

  // Total amount sprayed
  const totalItem = findItemFuzzy(allItems, 'Total Amount Sprayed');
  const totalRaw = readText(totalItem);
  const totalLitres = parseTotalAmountSprayed(totalRaw);

  if (totalRaw && totalLitres === null) {
    warnings.push({
      field: 'chemicalApplicationRecord.totalAmountSprayed',
      message: `Could not parse total amount sprayed: "${totalRaw}"`,
      rawValue: totalRaw,
    });
  }

  // Public notification
  const notifItem = findItem(allItems, 'Public Notification');
  const publicNotification = readFirstSelectedLabel(notifItem);

  // ── Weather fields ──────────────────────────────────────────────
  const weatherGeneralItem = findItem(allItems, 'General Weather');
  const weatherGeneral = readFirstSelectedLabel(weatherGeneralItem);

  const windDirItem = findItem(allItems, 'Wind Direction');
  const windDirection = readFirstSelectedLabel(windDirItem);

  const windSpeedItem = findItemFuzzy(allItems, 'Wind Speed');
  const windSpeed = readText(windSpeedItem);

  const variabilityItem = findItemFuzzy(allItems, 'Variability');
  const windVariability = readText(variabilityItem);

  const rainfallItem = findItemFuzzy(allItems, 'Rainfall');
  const rainfall = readText(rainfallItem);

  const tempItem = findItem(allItems, 'Temperature');
  const temperature = readText(tempItem);

  const humidityItem = findItemFuzzy(allItems, 'Humidity');
  const humidity = readText(humidityItem);

  // ── Chemical items (positional matching) ────────────────────────
  const chemicalsUsedItem = findItemFuzzy(allItems, 'Chemical/s Used');
  const rateUsedItem = findItemFuzzy(allItems, 'Rate Used');
  const concentrateItem = findItemFuzzy(allItems, 'Concentrate used');

  const chemicalsText = readText(chemicalsUsedItem);
  const rateText = readText(rateUsedItem);
  const concentrateText = readText(concentrateItem);

  const chemicalLines = splitLines(chemicalsText);
  const rateLines = splitLines(rateText);
  const concentrateLines = splitLines(concentrateText);

  const items: ChemicalApplicationItem[] = [];
  const maxLen = Math.max(chemicalLines.length, rateLines.length, concentrateLines.length);

  for (let i = 0; i < maxLen; i++) {
    const chemName = chemicalLines[i] ?? null;
    if (!chemName) {
      warnings.push({
        field: 'chemicalApplicationRecord.items',
        message: `Rate/concentrate line ${i + 1} has no corresponding chemical name`,
      });
      continue;
    }

    const rateLine = rateLines[i] ?? null;
    const concentrateLine = concentrateLines[i] ?? null;
    const parsedRate = parseRate(rateLine);

    items.push({
      chemicalNameRaw: chemName,
      rateRaw: rateLine,
      rateValue: parsedRate.value,
      rateUnit: parsedRate.unit,
      concentrateRaw: concentrateLine,
    });
  }

  if (chemicalLines.length !== rateLines.length && rateLines.length > 0) {
    warnings.push({
      field: 'chemicalApplicationRecord.items',
      message: `Chemical line count (${chemicalLines.length}) does not match rate line count (${rateLines.length})`,
    });
  }

  // ── Operators ──────────────────────────────────────────────────
  const operatorsItem = findItem(allItems, 'Operator/Applicators Names');
  const operatorNames = readSelectedLabels(operatorsItem);

  // ── Additives ──────────────────────────────────────────────────
  const additivesItem = findItem(allItems, 'Additives or Wetters');
  const additiveLabels = readSelectedLabels(additivesItem);
  const additives: ChemicalApplicationAdditive[] = additiveLabels.map(label => {
    // Try to extract rate from the label itself (e.g. "Brushwet 2ml/L")
    const rateMatch = label.match(/(\d+(?:\.\d+)?)\s*(ml\/L|g\/L)/i);
    return {
      additiveName: label,
      rateRaw: rateMatch ? rateMatch[0] : null,
    };
  });

  return {
    scAuditId: audit.audit_id,
    siteName,
    date,
    applicationMethod,
    timeStart: timeParsed.start,
    timeFinish: timeParsed.finish,
    totalAmountSprayedLitres: totalLitres,
    weatherGeneral,
    windDirection,
    windSpeed,
    windVariability,
    rainfall,
    temperature,
    humidity,
    publicNotification,
    items,
    operatorNames,
    additives,
  };
}

// ── Flatten CAR chemicals for the top-level chemicals[] array ────────

function extractChemicals(carFields: ChemicalApplicationFields): ChemicalEntry[] {
  return carFields.items.map(item => ({
    chemicalNameRaw: item.chemicalNameRaw,
    rateRaw: item.rateRaw,
    rateValue: item.rateValue,
    rateUnit: item.rateUnit,
    sourceTemplate: 'chemical_application_record' as const,
  }));
}

// ── Media ────────────────────────────────────────────────────────────

function extractMedia(allItems: ScAudit['header_items']): MediaEntry[] {
  const collected = collectAllMedia(allItems);
  return collected.map(m => ({
    scMediaHref: m.href,
    mediaType: classifyMediaType(m.parentItemLabel),
    gpsLat: null,
    gpsLon: null,
    beforeAfter: null,
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────

function splitLines(text: string | null): string[] {
  if (!text) return [];
  return text.split('\n').map(l => l.trim()).filter(l => l !== '');
}

function emptyMetadata(): MetadataFields {
  return {
    totalWorkedHours: null,
    remainingHours: null,
    weedRemovalPctMin: null,
    weedRemovalPctMax: null,
    erosionWorks: null,
    concernsText: null,
    futureWorksComments: null,
  };
}
