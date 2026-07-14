import { describe, it, expect } from 'vitest';
import { intervalPaletteForPhase, rootSemitoneForPhase, colorForState } from './orbitalTheory';

describe('intervalPaletteForPhase', () => {
  it('always contains the root (0)', () => {
    for (let p = 0; p < 1; p += 0.05) {
      expect(intervalPaletteForPhase(p)).toContain(0);
    }
  });

  it('cycles through four distinct stages across one orbit', () => {
    const stages = new Set([
      JSON.stringify(intervalPaletteForPhase(0.1)),
      JSON.stringify(intervalPaletteForPhase(0.35)),
      JSON.stringify(intervalPaletteForPhase(0.6)),
      JSON.stringify(intervalPaletteForPhase(0.9)),
    ]);
    expect(stages.size).toBe(4);
  });

  it('wraps phases outside [0,1) the same as their fractional part', () => {
    expect(intervalPaletteForPhase(1.1)).toEqual(intervalPaletteForPhase(0.1));
    expect(intervalPaletteForPhase(-0.1)).toEqual(intervalPaletteForPhase(0.9));
  });
});

describe('rootSemitoneForPhase', () => {
  it('stays within +-2.5 semitones', () => {
    for (let p = 0; p < 1; p += 0.02) {
      const semis = rootSemitoneForPhase(p);
      expect(semis).toBeGreaterThanOrEqual(-2.5001);
      expect(semis).toBeLessThanOrEqual(2.5001);
    }
  });

  it('is continuous across the phase wrap (0 and 1 give the same value)', () => {
    expect(rootSemitoneForPhase(0)).toBeCloseTo(rootSemitoneForPhase(1), 6);
  });

  it('is 0 at the start of the orbit and at the halfway point', () => {
    expect(rootSemitoneForPhase(0)).toBeCloseTo(0, 6);
    expect(rootSemitoneForPhase(0.5)).toBeCloseTo(0, 6);
  });
});

describe('colorForState', () => {
  it('day reads brighter and warmer than night at the same terminator proximity', () => {
    const day = colorForState('day', 0.2);
    const night = colorForState('night', 0.2);
    expect(day.brightness).toBeGreaterThan(night.brightness);
    expect(day.warmth).toBeGreaterThan(night.warmth);
  });

  it('twilight sits between day and night', () => {
    const day = colorForState('day', 0);
    const night = colorForState('night', 0);
    const twilight = colorForState('twilight', 1);
    expect(twilight.brightness).toBeGreaterThan(night.brightness);
    expect(twilight.brightness).toBeLessThan(day.brightness);
  });

  it('stays within 0..1 across all states and proximities', () => {
    (['day', 'night', 'twilight'] as const).forEach((state) => {
      for (let p = 0; p <= 1; p += 0.25) {
        const color = colorForState(state, p);
        expect(color.brightness).toBeGreaterThanOrEqual(0);
        expect(color.brightness).toBeLessThanOrEqual(1);
        expect(color.warmth).toBeGreaterThanOrEqual(0);
        expect(color.warmth).toBeLessThanOrEqual(1);
      }
    });
  });
});
