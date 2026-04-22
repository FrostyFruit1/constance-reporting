import { describe, it, expect } from 'vitest';
import { extractZoneLetters, isUmbrellaSite, resolveReportZones, formatZoneLabel } from '../zones';

describe('zone helpers', () => {
  it('extracts single zone letter', () => {
    expect(extractZoneLetters('EBSF Zone B')).toEqual(['B']);
    expect(extractZoneLetters('EBSF Zone C')).toEqual(['C']);
  });

  it('extracts umbrella site as two letters', () => {
    expect(extractZoneLetters('EBSF Zone B and C')).toEqual(['B', 'C']);
  });

  it('ignores non-zone site names', () => {
    expect(extractZoneLetters('Harrington Park')).toEqual([]);
    expect(extractZoneLetters('Spring Farm EBSF')).toEqual([]);
  });

  it('isUmbrellaSite detects multi-letter sites', () => {
    expect(isUmbrellaSite('EBSF Zone B and C')).toBe(true);
    expect(isUmbrellaSite('EBSF Zone B')).toBe(false);
  });

  it('resolveReportZones dedupes + sorts B, C umbrella', () => {
    const r = resolveReportZones(['EBSF Zone B', 'EBSF Zone C', 'EBSF Zone B and C']);
    expect(r.letters).toEqual(['B', 'C']);
    expect(r.label).toBe('Zone B and C');
  });

  it('resolveReportZones handles trio', () => {
    const r = resolveReportZones(['EBSF Zone A', 'EBSF Zone B', 'EBSF Zone C']);
    expect(r.letters).toEqual(['A', 'B', 'C']);
    expect(r.label).toBe('Zones A, B and C');
  });

  it('formatZoneLabel handles 1/2/3 letters', () => {
    expect(formatZoneLabel(['B'])).toBe('Zone B');
    expect(formatZoneLabel(['B', 'C'])).toBe('Zone B and C');
    expect(formatZoneLabel(['A', 'B', 'C'])).toBe('Zones A, B and C');
  });
});
