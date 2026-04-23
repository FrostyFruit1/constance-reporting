import { describe, it, expect } from 'vitest';
import { resolveMonth, resolveIsoWeek, resolveRange, formatZonesPhrase } from '../period';

describe('period helpers', () => {
  it('resolveMonth 2025-06 → full June range', () => {
    const r = resolveMonth('2025-06');
    expect(r.start).toBe('2025-06-01');
    expect(r.end).toBe('2025-06-30');
    expect(r.cadence).toBe('monthly');
    expect(r.label).toBe('June 2025');
  });

  it('resolveMonth 2025-02 handles short month', () => {
    const r = resolveMonth('2025-02');
    expect(r.end).toBe('2025-02-28');
  });

  it('resolveMonth 2024-02 handles leap day', () => {
    const r = resolveMonth('2024-02');
    expect(r.end).toBe('2024-02-29');
  });

  it('resolveMonth rejects malformed input', () => {
    expect(() => resolveMonth('2025-13')).toThrow();
    expect(() => resolveMonth('not-a-month')).toThrow();
  });

  it('resolveIsoWeek 2025-W26 starts Monday', () => {
    const r = resolveIsoWeek('2025-W26');
    expect(r.start).toBe('2025-06-23');
    expect(r.end).toBe('2025-06-29');
    expect(r.cadence).toBe('weekly');
  });

  it('resolveRange validates format', () => {
    expect(() => resolveRange('bad', '2025-01-01', 'weekly')).toThrow();
  });

  it('formatZonesPhrase handles singular, pair, and trio', () => {
    expect(formatZonesPhrase(['EBSF Zone B']).display).toBe('Zone B');
    expect(formatZonesPhrase(['EBSF Zone B', 'EBSF Zone C']).display).toBe('Zones B and C');
    expect(formatZonesPhrase(['EBSF Zone B', 'EBSF Zone C', 'EBSF Zone D']).display).toBe('Zones B, C and D');
  });

  it('formatZonesPhrase leaves irregular site names alone', () => {
    const r = formatZonesPhrase(['EBSF Watering', 'EBSF Zone B']);
    expect(r.display).toBe('Watering and Zone B');
  });
});
