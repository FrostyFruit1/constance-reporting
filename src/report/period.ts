import type { Cadence } from './types';
// (keep imports above)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface ResolvedPeriod {
  start: string;
  end: string;
  cadence: Cadence;
  label: string;
  filenameLabel: string;
}

export function resolveMonth(yyyyMm: string): ResolvedPeriod {
  const [yStr, mStr] = yyyyMm.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid month: ${yyyyMm} (expected YYYY-MM)`);
  }
  const monthName = MONTH_NAMES[m - 1];
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    start,
    end,
    cadence: 'monthly',
    label: `${monthName} ${y}`,
    filenameLabel: `${monthName}_${y}`,
  };
}

// ISO week: weeks start Monday. yyyy-Www format.
export function resolveIsoWeek(isoWeek: string): ResolvedPeriod {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(isoWeek);
  if (!match) throw new Error(`Invalid ISO week: ${isoWeek} (expected YYYY-Www)`);
  const y = parseInt(match[1], 10);
  const w = parseInt(match[2], 10);
  // Find Jan 4th of year (always in week 1 per ISO)
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // 0 = Monday
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: iso(start),
    end: iso(end),
    cadence: 'weekly',
    label: `Week ${w} ${y}`,
    filenameLabel: `Week_${w}_${y}`,
  };
}

export function resolveRange(from: string, to: string, cadence: Cadence): ResolvedPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('from/to must be YYYY-MM-DD');
  }
  const label = `${from} to ${to}`;
  return {
    start: from,
    end: to,
    cadence,
    label,
    filenameLabel: `${from}_to_${to}`,
  };
}

/**
 * Condense zone site names into the report phrase.
 * - Strips the shared "EBSF" prefix and (when present on all entries) the "Zone" token,
 *   so singular results become "B" / "B and D" / "B, C and D".
 * - Returns both the short phrase (for the summary) and a display phrase with leading token
 *   ("Zone B" / "Zones B and C").
 */
export function formatZonesPhrase(zones: string[]): { short: string; display: string } {
  const stripped = zones.map(z => z.replace(/^EBSF\s+/i, '').trim());
  if (stripped.length === 0) return { short: '', display: '' };

  // If each entry still begins with "Zone " literally, strip that token and re-prepend once.
  const allHaveZone = stripped.every(s => /^Zone\s+/i.test(s));
  const tokens = allHaveZone ? stripped.map(s => s.replace(/^Zone\s+/i, '')) : stripped;

  let joined: string;
  if (tokens.length === 1) joined = tokens[0];
  else if (tokens.length === 2) joined = `${tokens[0]} and ${tokens[1]}`;
  else joined = `${tokens.slice(0, -1).join(', ')} and ${tokens[tokens.length - 1]}`;

  if (!allHaveZone) return { short: joined, display: joined };
  const prefix = tokens.length === 1 ? 'Zone' : 'Zones';
  return { short: joined, display: `${prefix} ${joined}` };
}

/**
 * Given a start/end/cadence, infer the most human-friendly label + filename slug.
 * If the range exactly matches a calendar month, use "June 2025" / "June_2025".
 * Otherwise fall back to range form.
 */
export function inferPeriodLabels(start: string, end: string, cadence: Cadence): { label: string; filenameLabel: string } {
  if (cadence === 'monthly') {
    const mStart = /^(\d{4})-(\d{2})-01$/.exec(start);
    if (mStart) {
      const month = `${mStart[1]}-${mStart[2]}`;
      const r = resolveMonth(month);
      if (r.start === start && r.end === end) {
        return { label: r.label, filenameLabel: r.filenameLabel };
      }
    }
  }
  if (cadence === 'weekly') {
    // Fall through to range format for arbitrary week ranges
    const label = `${start} to ${end}`;
    return { label, filenameLabel: `${start}_to_${end}` };
  }
  return { label: `${start} to ${end}`, filenameLabel: `${start}_to_${end}` };
}

export function formatPublicationDate(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
