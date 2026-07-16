import { describe, it, expect } from 'vitest';
import {
  solarDeclinationDeg,
  subsolarPoint,
  solarElevationDeg,
  isDaylight,
  terminatorProximity,
  terminatorLatitudeDeg,
} from './solarTerminator';
import { destinationPoint, normalizeDeg180, EARTH_RADIUS_KM } from './greatCircle';

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

describe('terminatorLatitudeDeg', () => {
  it('returns a latitude where solar elevation is actually ~0, across many longitudes and dates', () => {
    const dates = ['2026-03-25T10:00:00Z', '2026-06-21T00:00:00Z', '2026-09-10T18:30:00Z', '2026-12-21T06:00:00Z'];
    for (const iso of dates) {
      const date = new Date(iso);
      for (let lon = -180; lon <= 180; lon += 20) {
        const lat = terminatorLatitudeDeg(lon, date);
        expect(solarElevationDeg(lat, lon, date)).toBeCloseTo(0, 1);
      }
    }
  });

  it('does not divide by zero near an equinox (declination ~0)', () => {
    const date = new Date('2026-03-20T12:00:00Z');
    for (let lon = -180; lon <= 180; lon += 30) {
      const lat = terminatorLatitudeDeg(lon, date);
      expect(Number.isFinite(lat)).toBe(true);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
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
