import { describe, it, expect } from 'vitest';
import {
  visVivaSpeedKmS,
  altitudeFromPeriodMin,
  periodFromAltitudeMin,
  groundSpeedToOrbitalSpeedKmS,
  orbitalPhase,
  ISS_MEAN_ALTITUDE_KM,
  ISS_MEAN_PERIOD_MIN,
} from './orbitalMechanics';

describe('visVivaSpeedKmS', () => {
  it('reproduces the ISS real-world orbital speed (~7.66 km/s) at its mean altitude', () => {
    expect(visVivaSpeedKmS(ISS_MEAN_ALTITUDE_KM)).toBeCloseTo(7.66, 1);
  });

  it('is slower at higher altitude (higher orbits move slower)', () => {
    expect(visVivaSpeedKmS(1000)).toBeLessThan(visVivaSpeedKmS(400));
  });
});

describe('altitudeFromPeriodMin / periodFromAltitudeMin', () => {
  it('are inverses of each other around the ISS mean altitude', () => {
    const period = periodFromAltitudeMin(ISS_MEAN_ALTITUDE_KM);
    expect(period).toBeCloseTo(ISS_MEAN_PERIOD_MIN, 0);
    expect(altitudeFromPeriodMin(period)).toBeCloseTo(ISS_MEAN_ALTITUDE_KM, 0);
  });

  it('reproduces the ISS real-world period (~92.68 min) from its mean altitude', () => {
    expect(periodFromAltitudeMin(ISS_MEAN_ALTITUDE_KM)).toBeCloseTo(92.68, 0);
  });

  it('a higher orbit has a longer period (geostationary sanity check, ~1436 min at ~35786km)', () => {
    expect(periodFromAltitudeMin(35786)).toBeCloseTo(1436, -1);
  });
});

describe('groundSpeedToOrbitalSpeedKmS', () => {
  it('scales ground speed up to orbital speed (orbital > ground, since ground track is at a smaller radius)', () => {
    const groundKmh = 27000; // roughly the ISS's real ground-track speed order of magnitude
    const orbital = groundSpeedToOrbitalSpeedKmS(groundKmh, ISS_MEAN_ALTITUDE_KM);
    expect(orbital).toBeGreaterThan(groundKmh / 3600);
  });

  it('is zero for zero ground speed', () => {
    expect(groundSpeedToOrbitalSpeedKmS(0, ISS_MEAN_ALTITUDE_KM)).toBe(0);
  });
});

describe('orbitalPhase', () => {
  it('starts at 0 at t=0 (mod period)', () => {
    expect(orbitalPhase(0, 90)).toBeCloseTo(0);
  });

  it('is 0.5 at exactly half the period', () => {
    const periodMs = 90 * 60_000;
    expect(orbitalPhase(periodMs / 2, 90)).toBeCloseTo(0.5, 6);
  });

  it('wraps back to (near) 0 at exactly one full period', () => {
    const periodMs = 90 * 60_000;
    expect(orbitalPhase(periodMs, 90)).toBeCloseTo(0, 6);
  });

  it('always stays within [0, 1)', () => {
    for (let t = -500_000; t < 500_000; t += 37_123) {
      const phase = orbitalPhase(t, ISS_MEAN_PERIOD_MIN);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
