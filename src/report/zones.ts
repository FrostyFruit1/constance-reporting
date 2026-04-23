export interface ReportZones {
  label: string;
  letters: string[];
}

const ZONE_RX = /Zone\s+([A-Z])(?:\s+and\s+([A-Z]))?/g;

export function extractZoneLetters(siteName: string): string[] {
  if (!siteName) return [];
  const letters = new Set<string>();
  ZONE_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ZONE_RX.exec(siteName)) !== null) {
    if (m[1]) letters.add(m[1].toUpperCase());
    if (m[2]) letters.add(m[2].toUpperCase());
  }
  return [...letters].sort();
}

export function isUmbrellaSite(siteName: string): boolean {
  return extractZoneLetters(siteName).length > 1;
}

export function zoneLabel(letter: string): string {
  return `Zone ${letter}`;
}

export function resolveReportZones(siteNames: string[]): ReportZones {
  const set = new Set<string>();
  for (const n of siteNames) {
    for (const l of extractZoneLetters(n)) set.add(l);
  }
  const letters = [...set].sort();
  return { label: formatZoneLabel(letters), letters };
}

export function formatZoneLabel(letters: string[]): string {
  if (letters.length === 0) return '';
  if (letters.length === 1) return `Zone ${letters[0]}`;
  if (letters.length === 2) return `Zone ${letters[0]} and ${letters[1]}`;
  const head = letters.slice(0, -1).join(', ');
  return `Zones ${head} and ${letters[letters.length - 1]}`;
}
