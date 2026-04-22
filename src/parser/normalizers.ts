/**
 * normalizers.ts — Offline species and chemical name normalization.
 *
 * Uses the same seed data as the SQL schema (species_lookup, chemical_lookup)
 * so the parser can run independently of the database for testing.
 *
 * At runtime, the DB-based lookups in src/db/lookups.ts handle resolution
 * with alias support. This module provides the same normalization for
 * the pure extraction layer (WP1).
 */

// ── Species seed data ────────────────────────────────────────────────

interface SpeciesEntry {
  canonicalName: string;
  scientificName: string | null;
  aliases: string[];
}

const SPECIES_SEED: SpeciesEntry[] = [
  { canonicalName: 'Purple Top', scientificName: null, aliases: ['purple top', 'purple top grass'] },
  { canonicalName: 'Fleabane', scientificName: null, aliases: ['fleabane'] },
  { canonicalName: 'Thistle', scientificName: null, aliases: ['thistle'] },
  { canonicalName: 'Prickly Lettuce', scientificName: null, aliases: ['prickly lettuce'] },
  { canonicalName: "Paddy's Lucerne", scientificName: null, aliases: ["paddy's lucerne", 'paddys lucerne'] },
  { canonicalName: 'Bidens Pilosa', scientificName: null, aliases: ['bidens pilosa', 'bidens'] },
  { canonicalName: 'Paspalum', scientificName: null, aliases: ['paspalum'] },
  { canonicalName: 'Bromus', scientificName: null, aliases: ['bromus'] },
  { canonicalName: 'Pigeon Grass', scientificName: null, aliases: ['pigeon grass'] },
  { canonicalName: 'Kikuyu', scientificName: null, aliases: ['kikuyu'] },
  { canonicalName: 'African Olive', scientificName: null, aliases: ['african olive'] },
  { canonicalName: 'Moth Vine', scientificName: null, aliases: ['moth vine'] },
  { canonicalName: 'Sticky nightshade', scientificName: null, aliases: ['sticky nightshade', 'sticky nightshade (solanum sisymbriifolium)', 'solanum sisymbriifolium'] },
  { canonicalName: 'Cats claw creeper', scientificName: null, aliases: ['cats claw creeper', "cat's claw creeper"] },
  { canonicalName: 'Japanese honeysuckle', scientificName: null, aliases: ['japanese honeysuckle'] },
  { canonicalName: 'Balloon Vine', scientificName: null, aliases: ['balloon vine'] },
  { canonicalName: 'Privett sp.', scientificName: null, aliases: ['privett sp.', 'privett', 'privet'] },
  { canonicalName: 'African Love Grass', scientificName: null, aliases: ['african love grass', 'african lovegrass'] },
  { canonicalName: 'Lantana', scientificName: null, aliases: ['lantana'] },
  { canonicalName: 'Prickly Pear', scientificName: null, aliases: ['prickly pear'] },
  { canonicalName: 'Blackberry', scientificName: null, aliases: ['blackberry'] },
  { canonicalName: 'Asparagus Fern', scientificName: null, aliases: ['asparagus fern'] },
  { canonicalName: 'Bridal Creeper', scientificName: null, aliases: ['bridal creeper'] },
  { canonicalName: 'Crofton', scientificName: null, aliases: ['crofton', 'crofton weed'] },
];

// Build lookup map (lowercase -> entry)
const speciesMap = new Map<string, SpeciesEntry>();
for (const entry of SPECIES_SEED) {
  speciesMap.set(entry.canonicalName.toLowerCase(), entry);
  for (const alias of entry.aliases) {
    speciesMap.set(alias.toLowerCase(), entry);
  }
}

// ── Chemical seed data ───────────────────────────────────────────────

interface ChemicalEntry {
  canonicalName: string;
  aliases: string[];
}

const CHEMICAL_SEED: ChemicalEntry[] = [
  { canonicalName: 'Starane', aliases: ['starane'] },
  { canonicalName: 'Glyphosate', aliases: ['glyphosate', 'roundup'] },
  { canonicalName: 'Dicamba', aliases: ['dicamba'] },
  { canonicalName: 'Fusilade', aliases: ['fusilade'] },
  { canonicalName: 'Grazon Extra', aliases: ['grazon extra', 'grazon'] },
  { canonicalName: 'Metsulfuron', aliases: ['metsulfuron', 'metsulfuron methyl'] },
  { canonicalName: 'Brushwet', aliases: ['brushwet'] },
];

// Build lookup map
const chemicalMap = new Map<string, ChemicalEntry>();
for (const entry of CHEMICAL_SEED) {
  chemicalMap.set(entry.canonicalName.toLowerCase(), entry);
  for (const alias of entry.aliases) {
    chemicalMap.set(alias.toLowerCase(), entry);
  }
}

// ── Public API ───────────────────────────────────────────────────────

export interface NormalizedSpecies {
  canonicalName: string | null;
  scientificName: string | null;
}

/**
 * Normalize a raw species name against the seed data.
 * Returns canonical + scientific name if matched, nulls if unknown.
 */
export function normalizeSpecies(rawName: string): NormalizedSpecies {
  const key = rawName.trim().toLowerCase();
  const entry = speciesMap.get(key);
  if (entry) {
    return {
      canonicalName: entry.canonicalName,
      scientificName: entry.scientificName,
    };
  }
  return { canonicalName: null, scientificName: null };
}

export interface NormalizedChemical {
  canonicalName: string | null;
}

/**
 * Normalize a raw chemical name against the seed data.
 */
export function normalizeChemical(rawName: string): NormalizedChemical {
  const key = rawName.trim().toLowerCase();
  const entry = chemicalMap.get(key);
  if (entry) {
    return { canonicalName: entry.canonicalName };
  }
  return { canonicalName: null };
}
