import { describe, it, expect } from 'vitest';
import { deriveOrbitalElements, propagateSubSatellitePoint, orbitalPhaseAt, ISS_INCLINATION_DEG, type OrbitalElements } from './groundTrackPropagator';
import { initialBearingDeg } from './greatCircle';
import { ISS_MEAN_PERIOD_MIN } from './orbitalMechanics';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');

describe('propagateSubSatellitePoint — geometric sanity', () => {
  const elements: OrbitalElements = {
    inclinationDeg: ISS_INCLINATION_DEG,
    periodMinutes: ISS_MEAN_PERIOD_MIN,
    ascendingNodeLonDeg: 0,
    argumentOfLatitudeDeg: 0,
    epochMs: EPOCH,
  };

  function atArgumentOfLatitude(u0: number) {
    return propagateSubSatellitePoint({ ...elements, argumentOfLatitudeDeg: u0 }, EPOCH);
  }

  it('is on the equator at the ascending node (u=0)', () => {
    expect(atArgumentOfLatitude(0).lat).toBeCloseTo(0, 6);
  });

  it('reaches maximum northern latitude, equal to the inclination, at u=90', () => {
    expect(atArgumentOfLatitude(90).lat).toBeCloseTo(ISS_INCLINATION_DEG, 6);
  });

  it('is back on the equator (descending) at u=180', () => {
    expect(atArgumentOfLatitude(180).lat).toBeCloseTo(0, 5);
  });

  it('reaches maximum southern latitude, equal to -inclination, at u=270', () => {
    expect(atArgumentOfLatitude(270).lat).toBeCloseTo(-ISS_INCLINATION_DEG, 6);
  });

  it('never exceeds +-inclination at any argument of latitude', () => {
    for (let u = 0; u < 360; u += 15) {
      const { lat } = atArgumentOfLatitude(u);
      expect(Math.abs(lat)).toBeLessThanOrEqual(ISS_INCLINATION_DEG + 1e-6);
    }
  });

  it('completes one full period back to the same point', () => {
    const t0 = propagateSubSatellitePoint(elements, EPOCH);
    const periodMs = ISS_MEAN_PERIOD_MIN * 60_000;
    const t1 = propagateSubSatellitePoint(elements, EPOCH + periodMs);
    expect(t1.lat).toBeCloseTo(t0.lat, 3);
    // Longitude does NOT repeat exactly — Earth rotated underneath during one orbit — only latitude does.
  });
});

describe('deriveOrbitalElements / propagateSubSatellitePoint — round trip', () => {
  const groundTruth: OrbitalElements = {
    inclinationDeg: ISS_INCLINATION_DEG,
    periodMinutes: ISS_MEAN_PERIOD_MIN,
    ascendingNodeLonDeg: -47.3,
    argumentOfLatitudeDeg: 205, // a descending-arc seed, to exercise the southbound branch
    epochMs: EPOCH,
  };

  it('reproduces the exact seed point at dt=0', () => {
    const seed = propagateSubSatellitePoint(groundTruth, EPOCH + 5000);
    const next = propagateSubSatellitePoint(groundTruth, EPOCH + 5000 + 10_000);
    const bearing = initialBearingDeg(seed.lat, seed.lon, next.lat, next.lon);

    const derived = deriveOrbitalElements(seed.lat, seed.lon, bearing, EPOCH + 5000);
    expect(derived).not.toBeNull();

    const reproduced = propagateSubSatellitePoint(derived!, EPOCH + 5000);
    expect(reproduced.lat).toBeCloseTo(seed.lat, 4);
    expect(reproduced.lon).toBeCloseTo(seed.lon, 4);
  });

  it('correctly recovers ground truth over a multi-hour horizon (southbound seed)', () => {
    const seed = propagateSubSatellitePoint(groundTruth, EPOCH);
    const next = propagateSubSatellitePoint(groundTruth, EPOCH + 10_000);
    const bearing = initialBearingDeg(seed.lat, seed.lon, next.lat, next.lon);
    const derived = deriveOrbitalElements(seed.lat, seed.lon, bearing, EPOCH)!;

    const sixHoursLater = EPOCH + 6 * 60 * 60_000;
    const truth = propagateSubSatellitePoint(groundTruth, sixHoursLater);
    const predicted = propagateSubSatellitePoint(derived, sixHoursLater);
    expect(predicted.lat).toBeCloseTo(truth.lat, 3);
    expect(predicted.lon).toBeCloseTo(truth.lon, 3);
  });

  it('correctly recovers ground truth for a northbound (ascending-arc) seed', () => {
    const ascendingTruth: OrbitalElements = { ...groundTruth, argumentOfLatitudeDeg: 40 };
    const seed = propagateSubSatellitePoint(ascendingTruth, EPOCH);
    const next = propagateSubSatellitePoint(ascendingTruth, EPOCH + 10_000);
    const bearing = initialBearingDeg(seed.lat, seed.lon, next.lat, next.lon);
    const derived = deriveOrbitalElements(seed.lat, seed.lon, bearing, EPOCH)!;

    const laterMs = EPOCH + 3 * 60 * 60_000;
    const truth = propagateSubSatellitePoint(ascendingTruth, laterMs);
    const predicted = propagateSubSatellitePoint(derived, laterMs);
    expect(predicted.lat).toBeCloseTo(truth.lat, 3);
    expect(predicted.lon).toBeCloseTo(truth.lon, 3);
  });

  it('returns null for a degenerate ~0deg inclination', () => {
    expect(deriveOrbitalElements(0, 0, 90, EPOCH, 0)).toBeNull();
  });
});

describe('orbitalPhaseAt', () => {
  const elements: OrbitalElements = {
    inclinationDeg: ISS_INCLINATION_DEG,
    periodMinutes: ISS_MEAN_PERIOD_MIN,
    ascendingNodeLonDeg: 0,
    argumentOfLatitudeDeg: 90,
    epochMs: EPOCH,
  };

  it('equals argumentOfLatitudeDeg/360 at the epoch', () => {
    expect(orbitalPhaseAt(elements, EPOCH)).toBeCloseTo(0.25, 6);
  });

  it('advances to 0.5 a quarter-period later (from a 0.25 start)', () => {
    const quarterPeriodMs = (ISS_MEAN_PERIOD_MIN * 60_000) / 4;
    expect(orbitalPhaseAt(elements, EPOCH + quarterPeriodMs)).toBeCloseTo(0.5, 4);
  });

  it('wraps back around after a full period', () => {
    const periodMs = ISS_MEAN_PERIOD_MIN * 60_000;
    expect(orbitalPhaseAt(elements, EPOCH + periodMs)).toBeCloseTo(0.25, 4);
  });

  it('always stays within [0, 1)', () => {
    for (let t = -500_000; t < 500_000; t += 41_137) {
      const phase = orbitalPhaseAt(elements, EPOCH + t);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
