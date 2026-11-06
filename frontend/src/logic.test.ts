import { describe, expect, it } from 'vitest';
import {
  changeWeight,
  DEFAULT_WEIGHTS,
  duration,
  euro,
  normalizeWeights,
  number,
  validWeights,
  WEIGHT_KEYS,
} from './logic';

describe('deterministic weight input formatting', () => {
  it('accepts five integer percentages totalling exactly 100', () => {
    expect(validWeights(DEFAULT_WEIGHTS)).toBe(true);
    expect(validWeights({ ...DEFAULT_WEIGHTS, risk: 9 })).toBe(false);
    expect(validWeights({ ...DEFAULT_WEIGHTS, risk: 10.1 })).toBe(false);
    expect(validWeights({ ...DEFAULT_WEIGHTS, risk: -1 })).toBe(false);
    expect(validWeights({ ...DEFAULT_WEIGHTS, risk: NaN })).toBe(false);
  });

  it('redistributes every slider position while preserving its requested value', () => {
    for (const key of WEIGHT_KEYS) {
      for (let value = 0; value <= 100; value++) {
        const next = changeWeight(DEFAULT_WEIGHTS, key, value);
        expect(next[key]).toBe(value);
        expect(validWeights(next)).toBe(true);
      }
    }
  });

  it('normalizes zero, fractional and unbalanced input with exact integer rounding', () => {
    expect(normalizeWeights({ service: 0, cost: 0, delay: 0, co2: 0, risk: 0 })).toEqual({
      service: 20,
      cost: 20,
      delay: 20,
      co2: 20,
      risk: 20,
    });
    expect(
      validWeights(normalizeWeights({ service: 99, cost: 3.3, delay: 7, co2: 1, risk: 0 })),
    ).toBe(true);
    expect(changeWeight(DEFAULT_WEIGHTS, 'service', 120).service).toBe(100);
    expect(changeWeight(DEFAULT_WEIGHTS, 'service', -5).service).toBe(0);
  });

  it('formats French amounts and durations without claiming real billing', () => {
    expect(number(12000).replace(/\s/g, ' ')).toBe('12 000');
    expect(euro(18500, 0).replace(/\s/g, ' ')).toBe('18 500 €');
    expect(euro(2.5).replace(/\s/g, ' ')).toBe('2,50 €');
    expect(duration(2500)).toBe('2,5 s');
  });
});
