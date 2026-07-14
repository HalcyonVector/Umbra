import { describe, it, expect } from 'vitest';
import {
  solarDeclinationDeg,
  subsolarPoint,
  solarElevationDeg,
  isDaylight,
  terminatorProximity,
  predictNextCrossing,
} from './solarTerminator';
import { destinationPoint, initialBearingDeg, normalizeDeg180, EARTH_RADIUS_KM } from './greatCircle';

const QUARTER_CIRCUMFERENCE_KM = (Math.PI * EARTH_RADIUS_KM) / 2;

describe('solarDeclinationDeg', () => {
  it('is near +23.44 deg at the northern summer solstice', () => {
    expect(solarDeclinationDeg(new Date('2026-06-21T12:00:00Z'))).toBeGreaterThan(23);
  });

  it('is near -23.44 deg at the northern winter solstice', () => {
    expect(solarDeclinationDeg(new Date('2026-12-21T12:00:00Z'))).toBeLessThan(-23);
  });

  it('is near 0 at the equinoxes', () => {
    expect(Math.abs(solarDeclinationDeg(new Date('2026-03-20T12:00:00Z')))).toBeLessThan(1);
  });
});

describe('subsolarPoint / solarElevationDeg', () => {
  it('the subsolar point itself always reads ~90deg elevation', () => {
    const date = new Date('2026-04-15T09:23:00Z');
    const sub = subsolarPoint(date);
    expect(solarElevationDeg(sub.lat, sub.lon, date)).toBeCloseTo(90, 0);
  });

  it('the antipode of the subsolar point reads ~-90deg elevation (deep night)', () => {
    const date = new Date('2026-04-15T09:23:00Z');
    const sub = subsolarPoint(date);
    const antipode = { lat: -sub.lat, lon: normalizeDeg180(sub.lon + 180) };
    expect(solarElevationDeg(antipode.lat, antipode.lon, date)).toBeCloseTo(-90, 0);
  });

  it('a point exactly a quarter-circumference from the subsolar point sits on the terminator (elevation ~0)', () => {
    const date = new Date('2026-08-02T18:47:00Z');
    const sub = subsolarPoint(date);
    const onTerminator = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM);
    expect(solarElevationDeg(onTerminator.lat, onTerminator.lon, date)).toBeCloseTo(0, 1);
  });
});

describe('isDaylight', () => {
  it('is true at the subsolar point and false at its antipode', () => {
    const date = new Date('2026-01-10T03:00:00Z');
    const sub = subsolarPoint(date);
    expect(isDaylight(sub.lat, sub.lon, date)).toBe(true);
    const antipode = { lat: -sub.lat, lon: normalizeDeg180(sub.lon + 180) };
    expect(isDaylight(antipode.lat, antipode.lon, date)).toBe(false);
  });
});

describe('terminatorProximity', () => {
  it('is 1 exactly on the terminator and fades toward 0 further from it', () => {
    const date = new Date('2026-05-05T14:12:00Z');
    const sub = subsolarPoint(date);
    const onTerminator = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM);
    expect(terminatorProximity(onTerminator.lat, onTerminator.lon, date)).toBeCloseTo(1, 1);
    expect(terminatorProximity(sub.lat, sub.lon, date)).toBe(0);
  });

  it('never leaves the 0..1 range', () => {
    const date = new Date('2026-05-05T14:12:00Z');
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lon = -180; lon < 180; lon += 30) {
        const p = terminatorProximity(lat, lon, date);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('predictNextCrossing', () => {
  it('predicts a sunset crossing at roughly the expected time for a point heading toward the terminator', () => {
    const date = new Date('2026-09-10T06:00:00Z');
    const sub = subsolarPoint(date);
    const onTerminator = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM);
    // 500km before the terminator, on the daylight side, heading straight at it.
    const start = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 500);
    expect(isDaylight(start.lat, start.lon, date)).toBe(true);

    const bearing = initialBearingDeg(start.lat, start.lon, onTerminator.lat, onTerminator.lon);
    const groundSpeedKmh = 27000; // ISS-order-of-magnitude ground speed
    const expectedDeltaMs = (500 / groundSpeedKmh) * 3_600_000; // ~66.7s

    const prediction = predictNextCrossing(start.lat, start.lon, bearing, groundSpeedKmh, date);
    expect(prediction).not.toBeNull();
    expect(prediction!.direction).toBe('sunset');
    expect(Math.abs(prediction!.deltaMs - expectedDeltaMs)).toBeLessThan(20_000);
  });

  it('returns null when no crossing occurs within the lookahead window', () => {
    const date = new Date('2026-09-10T06:00:00Z');
    const sub = subsolarPoint(date);
    // Standing still at the subsolar point never crosses anything.
    const prediction = predictNextCrossing(sub.lat, sub.lon, 90, 100, date, 60_000);
    expect(prediction).toBeNull();
  });

  it('returns null for zero or negative ground speed', () => {
    const date = new Date('2026-09-10T06:00:00Z');
    expect(predictNextCrossing(0, 0, 90, 0, date)).toBeNull();
    expect(predictNextCrossing(0, 0, 90, -10, date)).toBeNull();
  });
});
