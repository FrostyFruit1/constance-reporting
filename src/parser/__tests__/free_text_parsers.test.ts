import { describe, it, expect } from 'vitest';
import {
  parseHours,
  parseWeedRemovalPct,
  parseRate,
  parseHerbicideText,
  parseTimeStartFinish,
  parseTotalAmountSprayed,
} from '../free_text_parsers.js';

// ── parseHours ───────────────────────────────────────────────────────

describe('parseHours', () => {
  it('parses integer string', () => {
    expect(parseHours('24')).toBe(24);
    expect(parseHours('8')).toBe(8);
  });

  it('parses decimal string', () => {
    expect(parseHours('7.5')).toBe(7.5);
  });

  it('returns null for N/A', () => {
    expect(parseHours('N/A')).toBeNull();
    expect(parseHours('n/a')).toBeNull();
  });

  it('returns null for empty/null/undefined', () => {
    expect(parseHours('')).toBeNull();
    expect(parseHours(null)).toBeNull();
    expect(parseHours(undefined)).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseHours('lots')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseHours(' 16 ')).toBe(16);
  });
});

// ── parseWeedRemovalPct ──────────────────────────────────────────────

describe('parseWeedRemovalPct', () => {
  it('parses range with % sign', () => {
    expect(parseWeedRemovalPct('30-40%')).toEqual({ min: 30, max: 40 });
  });

  it('parses range without % sign', () => {
    expect(parseWeedRemovalPct('30-40')).toEqual({ min: 30, max: 40 });
  });

  it('parses range with spaces', () => {
    expect(parseWeedRemovalPct('30 - 40%')).toEqual({ min: 30, max: 40 });
  });

  it('parses single value', () => {
    expect(parseWeedRemovalPct('90')).toEqual({ min: 90, max: 90 });
  });

  it('parses single value with %', () => {
    expect(parseWeedRemovalPct('90%')).toEqual({ min: 90, max: 90 });
  });

  it('returns nulls for empty/null', () => {
    expect(parseWeedRemovalPct('')).toEqual({ min: null, max: null });
    expect(parseWeedRemovalPct(null)).toEqual({ min: null, max: null });
  });
});

// ── parseRate ────────────────────────────────────────────────────────

describe('parseRate', () => {
  it('parses "6ml/L"', () => {
    expect(parseRate('6ml/L')).toEqual({ value: 6, unit: 'ml/L' });
  });

  it('parses "7ml/L"', () => {
    expect(parseRate('7ml/L')).toEqual({ value: 7, unit: 'ml/L' });
  });

  it('parses "6ml per 1L"', () => {
    const result = parseRate('6ml per 1L');
    expect(result.value).toBe(6);
    expect(result.unit).toBe('ml/L');
  });

  it('returns nulls for unparseable', () => {
    expect(parseRate('unknown')).toEqual({ value: null, unit: null });
    expect(parseRate(null)).toEqual({ value: null, unit: null });
  });
});

// ── parseHerbicideText ───────────────────────────────────────────────

describe('parseHerbicideText', () => {
  it('parses lines with known chemicals', () => {
    const text = 'Starane 6ml/L: 60ml - 10L sprayed. \nDicamba: 6ml/L: 60ml - 10L sprayed.';
    const result = parseHerbicideText(text, ['Starane', 'Dicamba', 'Brushwet', 'Grazon Extra']);

    expect(result).toHaveLength(2);
    expect(result[0].chemicalName).toBe('Starane');
    expect(result[0].rateValue).toBe(6);
    expect(result[0].rateUnit).toBe('ml/L');
    expect(result[1].chemicalName).toBe('Dicamba');
  });

  it('handles Grazon rate format', () => {
    const text = '8, 10L packs sprayed.\n\nGrazon rate: 6ml per 1L';
    const result = parseHerbicideText(text, ['Brushwet', 'Grazon Extra']);

    // "Grazon" substring matches "Grazon Extra"
    expect(result).toHaveLength(1);
    expect(result[0].chemicalName).toBe('Grazon Extra');
    expect(result[0].rateValue).toBe(6);
  });

  it('returns empty for null/empty', () => {
    expect(parseHerbicideText(null, ['Starane'])).toEqual([]);
    expect(parseHerbicideText('', ['Starane'])).toEqual([]);
  });
});

// ── parseTimeStartFinish ─────────────────────────────────────────────

describe('parseTimeStartFinish', () => {
  it('parses "7:30/3:20"', () => {
    expect(parseTimeStartFinish('7:30/3:20')).toEqual({ start: '7:30', finish: '3:20' });
  });

  it('returns nulls for null/empty', () => {
    expect(parseTimeStartFinish(null)).toEqual({ start: null, finish: null });
    expect(parseTimeStartFinish('')).toEqual({ start: null, finish: null });
  });
});

// ── parseTotalAmountSprayed ──────────────────────────────────────────

describe('parseTotalAmountSprayed', () => {
  it('parses "40L"', () => {
    expect(parseTotalAmountSprayed('40L')).toBe(40);
  });

  it('parses "40" without unit', () => {
    expect(parseTotalAmountSprayed('40')).toBe(40);
  });

  it('returns null for unparseable', () => {
    expect(parseTotalAmountSprayed(null)).toBeNull();
    expect(parseTotalAmountSprayed('lots')).toBeNull();
  });
});
