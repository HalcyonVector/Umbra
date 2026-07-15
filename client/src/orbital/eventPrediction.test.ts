import { describe, it, expect } from 'vitest';
import { predictTerminatorCrossings, predictVisiblePasses } from './eventPrediction';
import { deriveOrbitalElements, propagateSubSatellitePoint, ISS_INCLINATION_DEG, type OrbitalElements } from './groundTrackPropagator';
import { subsolarPoint, isDaylight } from './solarTerminator';
import { destinationPoint, EARTH_RADIUS_KM } from './greatCircle';
import { ISS_MEAN_ALTITUDE_KM, ISS_MEAN_PERIOD_MIN } from './orbitalMechanics';

const QUARTER_CIRCUMFERENCE_KM = (Math.PI * EARTH_RADIUS_KM) / 2;
const EPOCH = Date.parse('2026-09-10T06:00:00Z');

const BASE_ELEMENTS: OrbitalElements = {
  inclinationDeg: ISS_INCLINATION_DEG,
  periodMinutes: ISS_MEAN_PERIOD_MIN,
  ascendingNodeLonDeg: 12.4,
  argumentOfLatitudeDeg: 33,
  epochMs: EPOCH,
};

describe('predictTerminatorCrossings', () => {
  it('finds multiple crossings over a 6-hour window (~4 orbits), each within the window', () => {
    const crossings = predictTerminatorCrossings(BASE_ELEMENTS, EPOCH);
    expect(crossings.length).toBeGreaterThan(0);
    crossings.forEach((c) => {
      expect(c.atMs).toBeGreaterThanOrEqual(EPOCH);
      expect(c.atMs).toBeLessThanOrEqual(EPOCH + 6 * 60 * 60_000);
    });
  });

  it('alternates sunrise and sunset (never two of the same direction back to back)', () => {
    const crossings = predictTerminatorCrossings(BASE_ELEMENTS, EPOCH);
    for (let i = 1; i < crossings.length; i++) {
      expect(crossings[i].direction).not.toBe(crossings[i - 1].direction);
    }
  });

  it('each reported crossing point is genuinely near the day/night boundary', () => {
    const crossings = predictTerminatorCrossings(BASE_ELEMENTS, EPOCH);
    crossings.forEach((c) => {
      const justBefore = propagateSubSatellitePoint(BASE_ELEMENTS, c.atMs - 5000);
      const justAfter = propagateSubSatellitePoint(BASE_ELEMENTS, c.atMs + 5000);
      const dayBefore = isDaylight(justBefore.lat, justBefore.lon, new Date(c.atMs - 5000));
      const dayAfter = isDaylight(justAfter.lat, justAfter.lon, new Date(c.atMs + 5000));
      expect(dayBefore).not.toBe(dayAfter);
    });
  });

  it('respects a shorter window', () => {
    const short = predictTerminatorCrossings(BASE_ELEMENTS, EPOCH, 5 * 60_000);
    short.forEach((c) => expect(c.atMs).toBeLessThanOrEqual(EPOCH + 5 * 60_000));
  });
});

describe('predictVisiblePasses', () => {
  it('finds an engineered guaranteed-visible pass right at the epoch', () => {
    const date = new Date(EPOCH);
    const sub = subsolarPoint(date);
    // ISS subpoint 50km into daylight, near the terminator (sunlit).
    const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 50);
    // Observer 700km into the night side (past civil twilight).
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 700);

    // Seed orbital elements so the propagated position AT the epoch is exactly issSub.
    const elements = deriveOrbitalElements(issSub.lat, issSub.lon, 0, EPOCH)!;
    expect(elements).not.toBeNull();

    const passes = predictVisiblePasses(elements, observer.lat, observer.lon, ISS_MEAN_ALTITUDE_KM, EPOCH, 5 * 60_000);
    expect(passes.length).toBeGreaterThan(0);
    const first = passes[0];
    expect(first.startMs).toBeLessThanOrEqual(first.peakMs);
    expect(first.peakMs).toBeLessThanOrEqual(first.endMs);
    expect(first.peakElevationDeg).toBeGreaterThanOrEqual(10);
  });

  it('finds no passes when the observer never gets dark enough (near-equatorial observer at a bright instant)', () => {
    const date = new Date(EPOCH);
    const sub = subsolarPoint(date);
    // Observer AT the subsolar point: always in full daylight, never dark enough regardless of ISS position.
    const elements = deriveOrbitalElements(sub.lat, sub.lon, 0, EPOCH)!;
    const passes = predictVisiblePasses(elements, sub.lat, sub.lon, ISS_MEAN_ALTITUDE_KM, EPOCH, 2 * 60_000);
    expect(passes).toHaveLength(0);
  });

  it('groups a contiguous visible stretch into one pass, not several', () => {
    const date = new Date(EPOCH);
    const sub = subsolarPoint(date);
    const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 50);
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 700);
    const elements = deriveOrbitalElements(issSub.lat, issSub.lon, 0, EPOCH)!;

    const passes = predictVisiblePasses(elements, observer.lat, observer.lon, ISS_MEAN_ALTITUDE_KM, EPOCH, 2 * 60_000);
    // A single fast-moving pass lasting a couple of minutes should not fragment into multiple entries.
    expect(passes.length).toBeLessThanOrEqual(1);
  });
});
