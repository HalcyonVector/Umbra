import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, initialBearingDeg, destinationPoint, normalizeDeg180, EARTH_RADIUS_KM } from './greatCircle';

describe('haversineDistanceKm', () => {
  it('is zero for identical points', () => {
    expect(haversineDistanceKm(10, 20, 10, 20)).toBeCloseTo(0, 6);
  });

  it('is roughly a quarter of Earth circumference from pole to equator', () => {
    const quarterCircumference = (Math.PI * EARTH_RADIUS_KM) / 2;
    expect(haversineDistanceKm(90, 0, 0, 0)).toBeCloseTo(quarterCircumference, 0);
  });

  it('matches a known real-world distance (London to Paris, ~344km)', () => {
    const d = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });
});

describe('initialBearingDeg', () => {
  it('is 0 (north) travelling straight up a meridian', () => {
    expect(initialBearingDeg(0, 0, 10, 0)).toBeCloseTo(0, 6);
  });

  it('is 90 (east) travelling along the equator', () => {
    expect(initialBearingDeg(0, 0, 0, 10)).toBeCloseTo(90, 6);
  });

  it('is 180 (south) travelling straight down a meridian', () => {
    expect(initialBearingDeg(10, 0, 0, 0)).toBeCloseTo(180, 6);
  });
});

describe('destinationPoint', () => {
  it('round-trips distance and bearing back to the origin point via haversine', () => {
    const start = { lat: 35, lon: -50 };
    const dest = destinationPoint(start.lat, start.lon, 47, 1200);
    const roundTripDistance = haversineDistanceKm(start.lat, start.lon, dest.lat, dest.lon);
    expect(roundTripDistance).toBeCloseTo(1200, 0);
  });

  it('travelling 0km returns the same point', () => {
    const dest = destinationPoint(12, 34, 200, 0);
    expect(dest.lat).toBeCloseTo(12, 5);
    expect(dest.lon).toBeCloseTo(34, 5);
  });

  it('travelling a quarter circumference due east from the equator lands on the antimeridian-ish point', () => {
    const quarterCircumference = (Math.PI * EARTH_RADIUS_KM) / 2;
    const dest = destinationPoint(0, 0, 90, quarterCircumference);
    expect(dest.lat).toBeCloseTo(0, 3);
    expect(Math.abs(dest.lon)).toBeCloseTo(90, 1);
  });
});

describe('normalizeDeg180', () => {
  it('leaves in-range values untouched', () => {
    expect(normalizeDeg180(90)).toBeCloseTo(90);
    expect(normalizeDeg180(-90)).toBeCloseTo(-90);
  });

  it('wraps values past 180 and -180', () => {
    expect(normalizeDeg180(190)).toBeCloseTo(-170);
    expect(normalizeDeg180(-190)).toBeCloseTo(170);
    expect(normalizeDeg180(360)).toBeCloseTo(0);
  });
});
