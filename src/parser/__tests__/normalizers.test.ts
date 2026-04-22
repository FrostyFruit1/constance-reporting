import { describe, it, expect } from 'vitest';
import { normalizeSpecies, normalizeChemical } from '../normalizers.js';

describe('normalizeSpecies', () => {
  it('matches exact canonical name', () => {
    expect(normalizeSpecies('Purple Top')).toEqual({
      canonicalName: 'Purple Top',
      scientificName: null,
    });
  });

  it('matches case-insensitively', () => {
    expect(normalizeSpecies('purple top')).toEqual({
      canonicalName: 'Purple Top',
      scientificName: null,
    });
  });

  it('matches alias with parenthetical', () => {
    const result = normalizeSpecies('Sticky nightshade (solanum sisymbriifolium)');
    expect(result.canonicalName).toBe('Sticky nightshade');
  });

  it('matches Paddy\'s Lucerne with apostrophe', () => {
    expect(normalizeSpecies("Paddy's Lucerne")).toEqual({
      canonicalName: "Paddy's Lucerne",
      scientificName: null,
    });
  });

  it('returns nulls for unknown species', () => {
    expect(normalizeSpecies('Unknown Weed XYZ')).toEqual({
      canonicalName: null,
      scientificName: null,
    });
  });

  it('trims whitespace', () => {
    expect(normalizeSpecies('  Lantana  ')).toEqual({
      canonicalName: 'Lantana',
      scientificName: null,
    });
  });

  it('matches all seed species', () => {
    const knownSpecies = [
      'Purple Top', 'Fleabane', 'Thistle', 'Prickly Lettuce', "Paddy's Lucerne",
      'Bidens Pilosa', 'Paspalum', 'Bromus', 'Pigeon Grass', 'Kikuyu',
      'African Olive', 'Moth Vine', 'Sticky nightshade', 'Cats claw creeper',
      'Japanese honeysuckle', 'Balloon Vine', 'Privett sp.', 'African Love Grass',
      'Lantana', 'Prickly Pear', 'Blackberry', 'Asparagus Fern', 'Bridal Creeper',
      'Crofton',
    ];
    for (const name of knownSpecies) {
      const result = normalizeSpecies(name);
      expect(result.canonicalName).not.toBeNull();
    }
  });
});

describe('normalizeChemical', () => {
  it('matches exact canonical name', () => {
    expect(normalizeChemical('Starane')).toEqual({ canonicalName: 'Starane' });
  });

  it('matches case-insensitively', () => {
    expect(normalizeChemical('glyphosate')).toEqual({ canonicalName: 'Glyphosate' });
  });

  it('matches Grazon alias', () => {
    expect(normalizeChemical('Grazon')).toEqual({ canonicalName: 'Grazon Extra' });
  });

  it('returns null for unknown chemical', () => {
    expect(normalizeChemical('Unknown Chemical')).toEqual({ canonicalName: null });
  });

  it('matches all seed chemicals', () => {
    const known = ['Starane', 'Glyphosate', 'Dicamba', 'Fusilade', 'Grazon Extra', 'Metsulfuron', 'Brushwet'];
    for (const name of known) {
      expect(normalizeChemical(name).canonicalName).not.toBeNull();
    }
  });
});
