/**
 * daily_work_report.ts — Extract structured data from a Safety Culture
 * Daily Work Report audit JSON.
 *
 * Handles template evolution: early 2025 (list Site Name, question Supervisor)
 * vs late 2025+ (text Site Name, list Supervisor, address fields, slider, MVP).
 */

import {
  ScAudit,
  ScItem,
  findItem,
  findItems,
  findItemFuzzy,
  getChildren,
  readText,
  readSelectedLabels,
  readFirstSelectedLabel,
  readDatetime,
  readSliderValue,
  readAddress,
  readListText,
  collectAllMedia,
  classifyMediaType,
  normalizeLabel,
} from './field_extractors.js';
import {
  parseHours,
  parseWeedRemovalPct,
  parseHerbicideText,
} from './free_text_parsers.js';
import { normalizeSpecies, normalizeChemical } from './normalizers.js';
import type {
  ExtractionResult,
  InspectionFields,
  PersonnelEntry,
  TaskEntry,
  WeedEntry,
  ChemicalEntry,
  MediaEntry,
  ObservationEntry,
  MetadataFields,
  ParsingWarning,
} from './types.js';

// ── Main extractor ───────────────────────────────────────────────────

export function extractDailyWorkReport(audit: ScAudit): ExtractionResult {
  const warnings: ParsingWarning[] = [];
  const allItems = [...audit.header_items, ...audit.items];

  // ── Inspection-level fields ─────────────────────────────────────
  const inspection = extractInspectionFields(audit, allItems, warnings);

  // ── Personnel ──────────────────────────────────────────────────
  const personnel = extractPersonnel(audit.items, warnings);

  // ── Tasks ──────────────────────────────────────────────────────
  const tasks = extractTasks(audit.items, warnings);

  // ── Weeds ──────────────────────────────────────────────────────
  const weeds = extractWeeds(audit.items, warnings);

  // ── Chemicals ──────────────────────────────────────────────────
  const chemicals = extractChemicals(audit.items, warnings);

  // ── Media ──────────────────────────────────────────────────────
  const media = extractMedia(allItems);

  // ── Observations ───────────────────────────────────────────────
  const observations = extractObservations(audit.items, warnings);

  // ── Metadata ───────────────────────────────────────────────────
  const metadata = extractMetadata(audit.items, warnings);

  return {
    templateType: 'daily_work_report',
    inspection,
    personnel,
    tasks,
    weeds,
    chemicals,
    media,
    observations,
    metadata,
    parsingWarnings: warnings,
    rawJson: audit as unknown as Record<string, unknown>,
  };
}

// ── Inspection fields ────────────────────────────────────────────────

function extractInspectionFields(
  audit: ScAudit,
  allItems: ScItem[],
  warnings: ParsingWarning[]
): InspectionFields {
  // Site Name — template has evolved through multiple shapes:
  //   2022-2023: [type=site] label="Site conducted" (builtin picker, often empty)
  //   2024:      [type=list]/[type=question] label="Site conducted"
  //   2025+:     [type=text] label="Client / Site"
  // Multiple such items can coexist in the same audit (e.g. both builtin picker
  // AND free-text field). Iterate all matches under the 'site name' variant
  // group and pick the first one that actually yields a value.
  const siteNameCandidates = findItems(allItems, 'Site Name');
  let siteName: string | null = null;

  for (const item of siteNameCandidates) {
    let candidate: string | null = null;
    if (item.type === 'list' || item.type === 'question') {
      candidate = readFirstSelectedLabel(item);
      const textValue = readText(item);
      if (candidate && textValue && textValue.toLowerCase() !== candidate.toLowerCase()) {
        // Known data-quality issue: dropdown and typed-text disagree.
        warnings.push({
          field: 'siteName',
          message: `Site Name dropdown label "${candidate}" differs from text value "${textValue}"`,
          rawValue: textValue,
        });
      }
      if (!candidate) candidate = textValue;
    } else if (item.type === 'text' || item.type === 'textsingle') {
      candidate = readText(item);
    } else if (item.type === 'site') {
      // Builtin SC site picker — responses shape varies; try common fields.
      const r = item.responses as { site?: { name?: string }; text?: string } | undefined;
      candidate = r?.site?.name ?? r?.text ?? null;
    }
    if (candidate && candidate.trim()) {
      siteName = candidate.trim();
      break;
    }
  }

  // Conducted on — datetime header item; fall back to audit_data.date_completed
  // which is reliably present on every audit.
  const conductedOnItem = findItem(allItems, 'Conducted on');
  const datetimeRaw = readDatetime(conductedOnItem);
  let date: string | null = null;
  if (datetimeRaw) {
    date = datetimeRaw.substring(0, 10);
  } else if (audit.audit_data?.date_completed) {
    // Template evolution: some templates omit "Conducted on" as a header item.
    date = audit.audit_data.date_completed.substring(0, 10);
  }

  // Prepared by / Supervisor — could be question (early), list (2024+),
  // or plain text (2025+ "Prepared by" label). Try both read modes.
  const supervisorItem = findItem(allItems, 'Prepared by/ Supervisor');
  let supervisorName = readFirstSelectedLabel(supervisorItem);
  if (!supervisorName) {
    const text = readText(supervisorItem);
    if (text) supervisorName = text.trim();
  }

  return {
    scAuditId: audit.audit_id,
    scTemplateType: 'daily_work_report',
    scModifiedAt: audit.modified_at,
    siteName,
    date,
    supervisorName,
  };
}

// ── Personnel ────────────────────────────────────────────────────────

function extractPersonnel(
  items: ScItem[],
  warnings: ParsingWarning[]
): PersonnelEntry[] {
  const staffItem = findItem(items, 'Staff/Contractors');
  const staffNames = readSelectedLabels(staffItem);

  if (staffNames.length === 0) return [];

  // Individual hours — single value applied to all staff
  const hoursItem = findItem(items, 'Staff worked hours (individual)');
  const hoursRaw = readText(hoursItem);
  const hoursParsed = parseHours(hoursRaw);

  if (hoursRaw && hoursParsed === null) {
    warnings.push({
      field: 'personnel.hoursWorked',
      message: `Could not parse individual hours: "${hoursRaw}"`,
      rawValue: hoursRaw,
    });
  }

  return staffNames.map(name => ({
    staffName: name,
    hoursWorked: hoursParsed,
    rawHoursText: hoursRaw,
  }));
}

// ── Tasks ────────────────────────────────────────────────────────────

function extractTasks(
  items: ScItem[],
  _warnings: ParsingWarning[]
): TaskEntry[] {
  const tasksItem = findItem(items, 'Tasks Undertaken');
  if (!tasksItem) return [];

  // Get the details text (shared across all tasks)
  const detailsItem = findItem(items, 'Details Of Tasks');
  const detailsText = readText(detailsItem);

  const tasks: TaskEntry[] = [];

  // From multi-select
  const selectedTasks = readSelectedLabels(tasksItem);
  for (const taskName of selectedTasks) {
    tasks.push({ taskType: taskName, detailsText });
  }

  // From free text (e.g. "Watering" typed in the text field)
  const freeTextTasks = readListText(tasksItem);
  if (freeTextTasks) {
    const freeLines = freeTextTasks
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '');
    for (const line of freeLines) {
      // Don't duplicate if already in selected
      if (!selectedTasks.some(s => s.toLowerCase() === line.toLowerCase())) {
        tasks.push({ taskType: line, detailsText });
      }
    }
  }

  return tasks;
}

// ── Weeds ────────────────────────────────────────────────────────────

function extractWeeds(
  items: ScItem[],
  _warnings: ParsingWarning[]
): WeedEntry[] {
  const weeds: WeedEntry[] = [];

  // From multi-select
  const weedsItem = findItem(items, 'Weeds Targeted');
  const selectedWeeds = readSelectedLabels(weedsItem);
  for (const name of selectedWeeds) {
    weeds.push({ speciesNameRaw: name, source: 'multi_select' });
  }

  // From free text "Other Weeds"
  const otherWeedsItem = findItem(items, 'Other Weeds');
  const otherText = readText(otherWeedsItem);
  if (otherText) {
    const lines = otherText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '');
    for (const line of lines) {
      weeds.push({ speciesNameRaw: line, source: 'free_text' });
    }
  }

  return weeds;
}

// ── Chemicals ────────────────────────────────────────────────────────

function extractChemicals(
  items: ScItem[],
  warnings: ParsingWarning[]
): ChemicalEntry[] {
  const herbicideItem = findItem(items, 'Herbicide');
  if (!herbicideItem) return [];

  const chemicals: ChemicalEntry[] = [];
  const selectedChemicals = readSelectedLabels(herbicideItem);
  const herbicideText = readListText(herbicideItem);

  // Parse rates from free text
  const parsedLines = parseHerbicideText(herbicideText, selectedChemicals);
  const parsedByName = new Map(parsedLines.map(l => [l.chemicalName.toLowerCase(), l]));

  // Create entries for all selected chemicals
  for (const name of selectedChemicals) {
    const parsed = parsedByName.get(name.toLowerCase());
    chemicals.push({
      chemicalNameRaw: name,
      rateRaw: parsed?.rateRaw ?? null,
      rateValue: parsed?.rateValue ?? null,
      rateUnit: parsed?.rateUnit ?? null,
      sourceTemplate: 'daily_work_report',
    });
  }

  // If there's text but no matching chemicals were selected, log warning
  if (herbicideText && selectedChemicals.length === 0) {
    warnings.push({
      field: 'chemicals',
      message: 'Herbicide text present but no chemicals selected in dropdown',
      rawValue: herbicideText,
    });
  }

  return chemicals;
}

// ── Media ────────────────────────────────────────────────────────────

function extractMedia(allItems: ScItem[]): MediaEntry[] {
  const collected = collectAllMedia(allItems);

  return collected.map(m => ({
    scMediaHref: m.href,
    mediaType: classifyMediaType(m.parentItemLabel),
    gpsLat: null,
    gpsLon: null,
    beforeAfter: null,
  }));
}

// ── Observations (fauna/flora) ───────────────────────────────────────

function extractObservations(
  items: ScItem[],
  _warnings: ParsingWarning[]
): ObservationEntry[] {
  const observations: ObservationEntry[] = [];

  // Fauna
  const faunaItem = findItem(items, 'New observed fauna?');
  if (faunaItem) {
    const answer = readFirstSelectedLabel(faunaItem);
    if (answer?.toLowerCase() === 'yes') {
      // Find the child "What was it?" field
      const childItems = getChildren(items, faunaItem.item_id);
      // The child is usually a smartfield wrapping the actual text item
      let detailText: string | null = null;
      for (const child of childItems) {
        if (child.type === 'smartfield') {
          const grandchildren = getChildren(items, child.item_id);
          for (const gc of grandchildren) {
            const text = readText(gc);
            if (text) detailText = text;
          }
        } else {
          const text = readText(child);
          if (text) detailText = text;
        }
      }
      observations.push({
        observationType: 'fauna',
        speciesName: detailText,
        notes: null,
      });
    }
  }

  // Flora
  const floraItem = findItem(items, 'New observed flora?');
  if (floraItem) {
    const answer = readFirstSelectedLabel(floraItem);
    if (answer?.toLowerCase() === 'yes') {
      const childItems = getChildren(items, floraItem.item_id);
      let detailText: string | null = null;
      for (const child of childItems) {
        if (child.type === 'smartfield') {
          const grandchildren = getChildren(items, child.item_id);
          for (const gc of grandchildren) {
            const text = readText(gc);
            if (text) detailText = text;
          }
        } else {
          const text = readText(child);
          if (text) detailText = text;
        }
      }
      observations.push({
        observationType: 'flora',
        speciesName: detailText,
        notes: null,
      });
    }
  }

  return observations;
}

// ── Metadata ─────────────────────────────────────────────────────────

function extractMetadata(
  items: ScItem[],
  warnings: ParsingWarning[]
): MetadataFields {
  // Total Worked Hours
  const totalHoursItem = findItem(items, 'Total Worked Hours');
  const totalWorkedHours = readText(totalHoursItem);

  // Remaining Hours
  const remainingItem = findItem(items, 'Remaining Hours');
  const remainingHours = readText(remainingItem);

  // Weed removal percentage
  const pctItem = findItemFuzzy(items, 'Rough percentage of weeds removed');
  const pctRaw = readText(pctItem);
  const pctParsed = parseWeedRemovalPct(pctRaw);

  if (pctRaw && pctParsed.min === null) {
    warnings.push({
      field: 'metadata.weedRemovalPct',
      message: `Could not parse weed removal percentage: "${pctRaw}"`,
      rawValue: pctRaw,
    });
  }

  // Erosion works (early 2025 only)
  const erosionItem = findItemFuzzy(items, 'Erosion Works');
  const erosionWorks = readText(erosionItem);

  // Area of Concerns
  const concernsItem = findItemFuzzy(items, 'What is found there');
  let concernsText = readText(concernsItem);
  // Fallback to unlabeled textsingle under "Area Of Concerns" category
  if (!concernsText) {
    const aocCategory = findItem(items, 'Area Of Concerns');
    if (aocCategory) {
      const aocChildren = getChildren(items, aocCategory.item_id);
      for (const child of aocChildren) {
        if (child.type === 'textsingle' || child.type === 'text') {
          const text = readText(child);
          if (text) { concernsText = text; break; }
        }
      }
    }
  }

  // Future Works / Comments
  const commentsItem = findItem(items, 'Other Comments/ Future Works', 'Other Comments/Future Works');
  const futureWorksComments = readText(commentsItem);

  return {
    totalWorkedHours,
    remainingHours,
    weedRemovalPctMin: pctParsed.min,
    weedRemovalPctMax: pctParsed.max,
    erosionWorks,
    concernsText,
    futureWorksComments,
  };
}
