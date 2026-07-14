import { describe, it, expect } from 'vitest';
import { crewCountToLayers, crewWarmth } from './crewCensus';

describe('crewCountToLayers', () => {
  it('maps a typical crew size 1:1', () => {
    expect(crewCountToLayers(7)).toBe(6); // clamped to the engine's max voice count
    expect(crewCountToLayers(3)).toBe(3);
  });

  it('never drops below 1 (a hiccup should not silence the drone)', () => {
    expect(crewCountToLayers(0)).toBe(1);
    expect(crewCountToLayers(-5)).toBe(1);
  });

  it('falls back to 1 for non-finite input', () => {
    expect(crewCountToLayers(NaN)).toBe(1);
  });

  it('rounds fractional input', () => {
    expect(crewCountToLayers(4.6)).toBe(5);
  });
});

describe('crewWarmth', () => {
  it('is monotonically increasing with crew count', () => {
    expect(crewWarmth(5)).toBeGreaterThan(crewWarmth(2));
  });

  it('stays within 0..1', () => {
    expect(crewWarmth(0)).toBeGreaterThanOrEqual(0);
    expect(crewWarmth(20)).toBeLessThanOrEqual(1);
  });
});
