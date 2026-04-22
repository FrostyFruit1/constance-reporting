/**
 * free_text_parsers.ts — Parse free-text fields from Safety Culture audits
 * into structured data.
 *
 * All parsers are forgiving: they return null for unparseable input
 * rather than throwing.
 */

// ── Hours parsing ────────────────────────────────────────────────────

/**
 * Parse a free-text hours value to a number.
 * Handles: "24", "8", "440", "N/A", "", null.
 */
export function parseHours(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'n/a') return null;

  const num = parseFloat(trimmed);
  return isFinite(num) && num >= 0 ? num : null;
}

// ── Weed removal percentage ──────────────────────────────────────────

export interface WeedRemovalPct {
  min: number | null;
  max: number | null;
}

/**
 * Parse weed removal percentage from free text.
 * Handles: "30-40%", "90", "90%", "30 - 40%", "", null.
 */
export function parseWeedRemovalPct(raw: string | null | undefined): WeedRemovalPct {
  if (!raw) return { min: null, max: null };
  const trimmed = raw.trim().replace(/%/g, '');
  if (trimmed === '') return { min: null, max: null };

  // Range pattern: "30-40", "30 - 40"
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    if (isFinite(min) && isFinite(max)) {
      return { min, max };
    }
  }

  // Single value: "90"
  const num = parseFloat(trimmed);
  if (isFinite(num)) {
    return { min: num, max: num };
  }

  return { min: null, max: null };
}

// ── Chemical rate parsing ────────────────────────────────────────────

export interface ParsedRate {
  value: number | null;
  unit: string | null;
}

/**
 * Parse a rate string like "6ml/L", "7ml/L", "6ml per 1L".
 */
export function parseRate(raw: string | null | undefined): ParsedRate {
  if (!raw) return { value: null, unit: null };
  const trimmed = raw.trim();

  // Pattern: "6ml/L", "7ml/L"
  const slashMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ml\/L|g\/L|L\/ha)/i);
  if (slashMatch) {
    return { value: parseFloat(slashMatch[1]), unit: slashMatch[2] };
  }

  // Pattern: "6ml per 1L"
  const perMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ml|g)\s*per\s*(\d+)?\s*(L)/i);
  if (perMatch) {
    const value = parseFloat(perMatch[1]);
    const denom = perMatch[3] ? parseFloat(perMatch[3]) : 1;
    return { value: value / denom, unit: `${perMatch[2]}/${perMatch[4]}` };
  }

  return { value: null, unit: null };
}

// ── Herbicide free-text line parsing (Daily Work Reports) ────────────

export interface ParsedChemicalLine {
  chemicalName: string;
  rateRaw: string | null;
  rateValue: number | null;
  rateUnit: string | null;
  rawLine: string;
}

/**
 * Best-effort parse of the Herbicide free-text field.
 *
 * The field contains varied formats like:
 *   "Starane 6ml/L: 60ml - 10L sprayed."
 *   "Dicamba: 6ml/L: 60ml - 10L sprayed."
 *   "8, 10L packs sprayed.\n\nGrazon rate: 6ml per 1L"
 *
 * Strategy: split on newlines, try to match each non-empty line to a
 * chemical name (from selectedChemicals), then extract rate where possible.
 */
export function parseHerbicideText(
  text: string | null | undefined,
  selectedChemicals: string[]
): ParsedChemicalLine[] {
  if (!text) return [];

  const results: ParsedChemicalLine[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');

  for (const line of lines) {
    const lineLower = line.toLowerCase();

    // Try to match a known chemical name in this line.
    // Check full name first, then first word of multi-word names (e.g. "Grazon" for "Grazon Extra").
    let matchedChemical: string | null = null;
    for (const chem of selectedChemicals) {
      if (lineLower.includes(chem.toLowerCase())) {
        matchedChemical = chem;
        break;
      }
    }
    if (!matchedChemical) {
      for (const chem of selectedChemicals) {
        const firstWord = chem.split(/\s+/)[0].toLowerCase();
        if (firstWord.length >= 3 && lineLower.includes(firstWord)) {
          matchedChemical = chem;
          break;
        }
      }
    }

    if (!matchedChemical) continue; // Skip lines that don't mention a known chemical

    // Extract rate from the line
    const rateMatch = line.match(/(\d+(?:\.\d+)?)\s*(ml\/L|g\/L|L\/ha|ml\s+per\s+\d*\s*L)/i);
    let rateRaw: string | null = null;
    let rateValue: number | null = null;
    let rateUnit: string | null = null;

    if (rateMatch) {
      rateRaw = rateMatch[0];
      const parsed = parseRate(rateMatch[0]);
      rateValue = parsed.value;
      rateUnit = parsed.unit;
    }

    results.push({
      chemicalName: matchedChemical,
      rateRaw,
      rateValue,
      rateUnit,
      rawLine: line,
    });
  }

  return results;
}

// ── Time Start/Finish parsing (Chemical Application Records) ─────────

export interface ParsedTimeRange {
  start: string | null;
  finish: string | null;
}

/**
 * Parse "7:30/3:20" into separate start and finish time strings.
 */
export function parseTimeStartFinish(raw: string | null | undefined): ParsedTimeRange {
  if (!raw) return { start: null, finish: null };
  const trimmed = raw.trim();

  const parts = trimmed.split('/');
  if (parts.length === 2) {
    return {
      start: parts[0].trim() || null,
      finish: parts[1].trim() || null,
    };
  }

  return { start: null, finish: null };
}

// ── Total amount sprayed parsing ─────────────────────────────────────

/**
 * Parse "40L" or "40 L" or "40" to a number of litres.
 */
export function parseTotalAmountSprayed(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*L?$/i);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}
