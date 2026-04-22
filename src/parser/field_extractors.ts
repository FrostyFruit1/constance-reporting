/**
 * field_extractors.ts — Utilities for navigating Safety Culture audit JSON
 * and reading responses from items by type.
 *
 * SC audits store fields as a flat list of items with parent_id / item_id
 * relationships. Response data varies by item type (list, text, question, etc.).
 */

// ── SC JSON interfaces ───────────────────────────────────────────────

export interface ScSelectedResponse {
  id: string;
  label: string;
  colour?: string;
  score?: number;
  enable_score?: boolean;
}

export interface ScLocation {
  name?: string;
  country?: string;
  geometry?: {
    type: string;
    coordinates: number[];  // [lon, lat] for GeoJSON Point
  };
  locality?: string;
  postal_code?: string;
  thoroughfare?: string;
  iso_country_code?: string;
  administrative_area?: string;
  sub_administrative_area?: string;
}

export interface ScResponses {
  text?: string;
  selected?: ScSelectedResponse[];
  failed?: boolean;
  datetime?: string;
  value?: number;
  location_text?: string;
  location?: ScLocation;
  location_input?: ScLocation;
}

export interface ScMediaItem {
  media_id: string;
  href: string;
  file_ext: string;
  label: string;
  date_created: string;
}

export interface ScItem {
  item_id: string;
  parent_id?: string;
  label: string;
  type: string;
  children?: string[];
  scoring?: Record<string, unknown>;
  options?: {
    response_set?: string;
    failed_responses?: string[];
    multiple_selection?: boolean;
    is_mandatory?: boolean;
    condition?: string;
    values?: string[];
    require_action?: boolean;
    increment?: number;
    max?: number;
    min?: number;
    weighting?: number;
  };
  responses?: ScResponses;
  media?: ScMediaItem[];
  inactive?: boolean;
  evaluation?: boolean;
}

export interface ScAudit {
  template_id: string;
  audit_id: string;
  archived: boolean;
  created_at: string;
  modified_at: string;
  audit_data: {
    score: number;
    total_score: number;
    score_percentage: number;
    name: string;
    duration: number;
    authorship: {
      device_id: string;
      owner: string;
      owner_id: string;
      author: string;
      author_id: string;
    };
    date_completed: string;
    date_modified: string;
    date_started: string;
  };
  template_data: {
    authorship: Record<string, unknown>;
    metadata: {
      description: string;
      name: string;
    };
    response_sets: Record<string, unknown>;
  };
  header_items: ScItem[];
  items: ScItem[];
}

// ── Label normalization ──────────────────────────────────────────────

/**
 * Normalize a label for matching: lowercase, collapse whitespace, trim.
 */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Label variants for fields with known spelling changes ────────────

const LABEL_VARIANTS: Record<string, string[]> = {
  'site name': [
    'site name',
    'client / site',
    'client/ site',
    'client /site',
    'client/site',
    'site conducted',
    'site',
  ],
  'prepared by/ supervisor': [
    'prepared by/ supervisor',
    'prepared by/supervisor',
    'prepared by /supervisor',
    'prepared by / supervisor',
    'prepared by',
    'supervisor',
  ],
  'details of mapped areas': [
    'details of mapped areas or discription of areas worked',
    'details of mapped areas or description of areas worked',
  ],
  'site area work map': [
    'site area work map',
    'site area work map - yellow=general area worked, blue=brushcutting, red= area of concern',
  ],
  'rough percentage of weeds removed': [
    'rough percentage of weeds removed (within the zones worked in)',
    'rough percentage of weeds removed',
  ],
  'rainfall': [
    'rainfall (mm)',
    'rainfall (mm) & was is before, during or after',
  ],
  'variability': [
    'variability e.g: gusting, light breeze',
    'variability',
  ],
  'humidity': [
    'humidity %',
    'humidity',
  ],
  'time start/finish': [
    'time occurred start/finish',
    'time start/finish',
  ],
  'other comments/ future works': [
    'other comments/ future works',
    'other comments/future works',
  ],
  'team performance slider': [
    'how would you rate the overall teams performance, efficiency and kpi delivery?',
    'how would you rate the overall teams performance today?',
  ],
  'why this rating': [
    'why this rating? or any comments?',
  ],
  'area of concern text': [
    'what is found there and describe the area and why its an aoc',
  ],
  'iap media': [
    '',  // IAP media items can have empty labels
  ],
  'iap location': [
    'location of iap or gps, if not accurate please upload in media',
    'location of iap or gps',
  ],
};

// ── Item finders ─────────────────────────────────────────────────────

/**
 * Find the first item matching any of the given label variants.
 * Searches both exact normalized match and known variant groups.
 */
export function findItem(items: ScItem[], ...labelCandidates: string[]): ScItem | undefined {
  const normalizedCandidates = labelCandidates.map(normalizeLabel);

  // Also expand from variant groups
  const allCandidates = new Set<string>(normalizedCandidates);
  for (const candidate of normalizedCandidates) {
    for (const [, variants] of Object.entries(LABEL_VARIANTS)) {
      if (variants.some(v => normalizeLabel(v) === candidate)) {
        for (const v of variants) {
          allCandidates.add(normalizeLabel(v));
        }
      }
    }
  }

  return items.find(item => allCandidates.has(normalizeLabel(item.label)));
}

/**
 * Find all items matching any of the given label variants.
 */
export function findItems(items: ScItem[], ...labelCandidates: string[]): ScItem[] {
  const normalizedCandidates = new Set(labelCandidates.map(normalizeLabel));
  for (const candidate of [...normalizedCandidates]) {
    for (const [, variants] of Object.entries(LABEL_VARIANTS)) {
      if (variants.some(v => normalizeLabel(v) === candidate)) {
        for (const v of variants) {
          normalizedCandidates.add(normalizeLabel(v));
        }
      }
    }
  }

  return items.filter(item => normalizedCandidates.has(normalizeLabel(item.label)));
}

/**
 * Find item by label using substring/fuzzy matching as fallback.
 */
export function findItemFuzzy(items: ScItem[], labelSubstring: string): ScItem | undefined {
  const normalized = normalizeLabel(labelSubstring);
  // Exact match first
  const exact = items.find(item => normalizeLabel(item.label) === normalized);
  if (exact) return exact;

  // Substring match
  return items.find(item => normalizeLabel(item.label).includes(normalized));
}

/**
 * Get all direct children of a given item by parent_id.
 */
export function getChildren(items: ScItem[], parentItemId: string): ScItem[] {
  return items.filter(item => item.parent_id === parentItemId);
}

/**
 * Get all items within a category (section/category and its descendants).
 */
export function getItemsInCategory(items: ScItem[], categoryLabel: string): ScItem[] {
  const category = findItem(items, categoryLabel);
  if (!category) return [];

  const result: ScItem[] = [];
  const queue = [category.item_id];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = getChildren(items, parentId);
    for (const child of children) {
      result.push(child);
      if (child.children && child.children.length > 0) {
        queue.push(child.item_id);
      }
    }
  }

  return result;
}

// ── Response readers ─────────────────────────────────────────────────

/**
 * Read text response from an item (for text, textsingle types).
 * Returns trimmed text or null if empty/absent.
 */
export function readText(item: ScItem | undefined): string | null {
  if (!item?.responses?.text) return null;
  const trimmed = item.responses.text.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Read all selected labels from a list/question response.
 */
export function readSelectedLabels(item: ScItem | undefined): string[] {
  if (!item?.responses?.selected) return [];
  return item.responses.selected.map(s => s.label);
}

/**
 * Read the first selected label (for single-select list or question).
 */
export function readFirstSelectedLabel(item: ScItem | undefined): string | null {
  const labels = readSelectedLabels(item);
  return labels.length > 0 ? labels[0] : null;
}

/**
 * Read datetime response (ISO 8601 string).
 */
export function readDatetime(item: ScItem | undefined): string | null {
  return item?.responses?.datetime ?? null;
}

/**
 * Read slider value.
 */
export function readSliderValue(item: ScItem | undefined): number | null {
  return item?.responses?.value ?? null;
}

/**
 * Read address response, extracting text and GPS coordinates.
 */
export function readAddress(item: ScItem | undefined): {
  text: string | null;
  lat: number | null;
  lon: number | null;
} {
  if (!item?.responses) return { text: null, lat: null, lon: null };

  const locationText = item.responses.location_text?.trim() || null;
  const location = item.responses.location ?? item.responses.location_input;

  let lat: number | null = null;
  let lon: number | null = null;

  if (location?.geometry?.coordinates && location.geometry.coordinates.length >= 2) {
    // GeoJSON: [longitude, latitude]
    lon = location.geometry.coordinates[0];
    lat = location.geometry.coordinates[1];
  }

  return { text: locationText, lat, lon };
}

/**
 * Read the free-text portion of a list response (e.g. Herbicide text field
 * alongside the selected chemicals).
 */
export function readListText(item: ScItem | undefined): string | null {
  return readText(item);
}

// ── Media collection ─────────────────────────────────────────────────

export interface CollectedMedia {
  mediaId: string;
  href: string;
  fileExt: string;
  label: string;
  dateCreated: string;
  parentItemLabel: string;
  parentItemType: string;
}

/**
 * Collect all media items from all items in a list, tagging each with
 * its parent item's label for context.
 */
export function collectAllMedia(items: ScItem[]): CollectedMedia[] {
  const result: CollectedMedia[] = [];

  for (const item of items) {
    if (!item.media || item.media.length === 0) continue;
    for (const m of item.media) {
      result.push({
        mediaId: m.media_id,
        href: m.href,
        fileExt: m.file_ext,
        label: m.label,
        dateCreated: m.date_created,
        parentItemLabel: item.label,
        parentItemType: item.type,
      });
    }
  }

  return result;
}

/**
 * Determine media_type classification from the parent item's label.
 */
export function classifyMediaType(parentItemLabel: string): 'photo' | 'site_map' | 'area_work_map' {
  const normalized = normalizeLabel(parentItemLabel);
  if (normalized.includes('site area work map')) return 'area_work_map';
  if (normalized.includes('area worked')) return 'site_map';
  return 'photo';
}
