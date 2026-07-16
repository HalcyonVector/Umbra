import { describe, it, expect } from 'vitest';
import { speedAsJetMultiple, altitudeAsEverestMultiple, COMMERCIAL_JET_SPEED_KMH, EVEREST_HEIGHT_KM } from './scaleComparisons';

describe('speedAsJetMultiple', () => {
  it('reproduces the real-world ballpark for the ISS (~7.66 km/s, roughly 30x a jet)', () => {
    const multiple = speedAsJetMultiple(7.66);
    expect(multiple).toBeGreaterThan(25);
    expect(multiple).toBeLessThan(35);
  });

  it('is exactly 1 when orbital speed equals jet speed', () => {
    expect(speedAsJetMultiple(COMMERCIAL_JET_SPEED_KMH / 3600)).toBeCloseTo(1, 6);
  });

  it('scales linearly', () => {
    expect(speedAsJetMultiple(2)).toBeCloseTo(speedAsJetMultiple(1) * 2, 6);
  });
});

describe('altitudeAsEverestMultiple', () => {
  it('reproduces the real-world ballpark for the ISS (~408km, roughly 46x Everest)', () => {
    const multiple = altitudeAsEverestMultiple(408);
    expect(multiple).toBeGreaterThan(44);
    expect(multiple).toBeLessThan(48);
  });

  it('is exactly 1 at Everest\'s own height', () => {
    expect(altitudeAsEverestMultiple(EVEREST_HEIGHT_KM)).toBeCloseTo(1, 6);
  });
});
