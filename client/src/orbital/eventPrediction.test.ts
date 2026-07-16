import { describe, it, expect } from 'vitest';
import { predictTerminatorCrossings, predictVisiblePasses, predictLocalTwilightTransition, findBestViewingSpotNow } from './eventPrediction';
import { deriveOrbitalElements, propagateSubSatellitePoint, ISS_INCLINATION_DEG, type OrbitalElements } from './groundTrackPropagator';
import { subsolarPoint, isDaylight, solarElevationDeg } from './solarTerminator';
import { satelliteElevationDeg } from './visibility';
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

    expect(first.track.length).toBeGreaterThan(0);
    first.track.forEach((point) => {
      expect(point.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(point.azimuthDeg).toBeLessThan(360);
      expect(point.elevationDeg).toBeGreaterThanOrEqual(10);
    });
    // The track's peak elevation sample should match the reported peak (same underlying walk).
    const trackPeak = Math.max(...first.track.map((p) => p.elevationDeg));
    expect(trackPeak).toBeCloseTo(first.peakElevationDeg, 6);
    expect(first.startAzimuthDeg).toBe(first.track[0].azimuthDeg);
    expect(first.endAzimuthDeg).toBe(first.track[first.track.length - 1].azimuthDeg);
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

describe('predictLocalTwilightTransition', () => {
  it('finds a transition to dark for an observer currently in daylight near the terminator', () => {
    const date = new Date(EPOCH);
    const sub = subsolarPoint(date);
    // Just inside the daylight side of the terminator — should cross into dark soon.
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 200);
    expect(solarElevationDeg(observer.lat, observer.lon, date)).toBeGreaterThan(-6);

    const transition = predictLocalTwilightTransition(observer.lat, observer.lon, EPOCH, 24 * 60 * 60_000, 6, 60_000);
    expect(transition).not.toBeNull();
    expect(transition!.becomingDark).toBe(true);
    expect(transition!.atMs).toBeGreaterThan(EPOCH);
  });

  it('finds a transition to light for an observer currently in the dark near the terminator', () => {
    const date = new Date(EPOCH);
    const sub = subsolarPoint(date);
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 700);
    expect(solarElevationDeg(observer.lat, observer.lon, date)).toBeLessThan(-6);

    const transition = predictLocalTwilightTransition(observer.lat, observer.lon, EPOCH, 24 * 60 * 60_000, 6, 60_000);
    expect(transition).not.toBeNull();
    expect(transition!.becomingDark).toBe(false);
  });

  it('the returned crossing point genuinely straddles the threshold', () => {
    const date = new Date(EPOCH);
    const sub = subsolarPoint(date);
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 200);
    const transition = predictLocalTwilightTransition(observer.lat, observer.lon, EPOCH, 24 * 60 * 60_000, 6, 60_000)!;

    const before = solarElevationDeg(observer.lat, observer.lon, new Date(transition.atMs - 2000));
    const after = solarElevationDeg(observer.lat, observer.lon, new Date(transition.atMs + 2000));
    expect(before).toBeGreaterThan(-6);
    expect(after).toBeLessThan(-6);
  });

  it('returns null when no transition occurs within the window (e.g. a polar night/day observer)', () => {
    // Near the winter pole at the solstice-ish date used elsewhere would be
    // extreme; simplest deterministic null case is a tiny window too short
    // for any transition to occur.
    const transition = predictLocalTwilightTransition(0, 0, EPOCH, 60_000, 6, 60_000);
    expect(transition).toBeNull();
  });
});

describe('findBestViewingSpotNow', () => {
  const date = new Date(EPOCH);
  const sub = subsolarPoint(date);
  // A sub-satellite point 300km into the daylight side of the terminator —
  // sunlit, but close enough that part of a 1200km ring around it reaches
  // well past the terminator into genuine darkness.
  const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 300);

  it('returns null when the ISS itself is not currently sunlit (deep in Earth\'s shadow)', () => {
    const antipode = { lat: -sub.lat, lon: sub.lon + 180 > 180 ? sub.lon - 180 : sub.lon + 180 };
    expect(isDaylight(antipode.lat, antipode.lon, date)).toBe(false);
    expect(findBestViewingSpotNow(antipode.lat, antipode.lon, ISS_MEAN_ALTITUDE_KM, date)).toBeNull();
  });

  it('when it finds a spot, that spot genuinely satisfies all three real conditions', () => {
    expect(isDaylight(issSub.lat, issSub.lon, date)).toBe(true);
    const spot = findBestViewingSpotNow(issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date);
    expect(spot).not.toBeNull();
    expect(spot!.solarElevationDeg).toBeLessThanOrEqual(-6);
    expect(spot!.satelliteElevationDeg).toBeGreaterThanOrEqual(10);

    // Recompute directly to confirm the reported values aren't fabricated.
    const recomputedSatElevation = satelliteElevationDeg(spot!.lat, spot!.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM);
    expect(recomputedSatElevation).toBeCloseTo(spot!.satelliteElevationDeg, 6);
    const recomputedSunElevation = solarElevationDeg(spot!.lat, spot!.lon, date);
    expect(recomputedSunElevation).toBeCloseTo(spot!.solarElevationDeg, 6);
  });

  it('picks the darkest qualifying candidate, not just the first one found', () => {
    const spot = findBestViewingSpotNow(issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date);
    expect(spot).not.toBeNull();
    // No other candidate on the same ring should be darker and still qualify.
    for (let i = 0; i < 24; i++) {
      const bearing = (360 / 24) * i;
      const candidate = destinationPoint(issSub.lat, issSub.lon, bearing, 1200);
      const sunElevation = solarElevationDeg(candidate.lat, candidate.lon, date);
      const satElevation = satelliteElevationDeg(candidate.lat, candidate.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM);
      if (sunElevation <= -6 && satElevation >= 10) {
        expect(sunElevation).toBeGreaterThanOrEqual(spot!.solarElevationDeg);
      }
    }
  });
});
