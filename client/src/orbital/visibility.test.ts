import { describe, it, expect } from 'vitest';
import { satelliteElevationDeg, satelliteAzimuthDeg, evaluateVisibility } from './visibility';
import { subsolarPoint, isDaylight, solarElevationDeg } from './solarTerminator';
import { destinationPoint, EARTH_RADIUS_KM, toDegrees } from './greatCircle';
import { ISS_MEAN_ALTITUDE_KM } from './orbitalMechanics';

const QUARTER_CIRCUMFERENCE_KM = (Math.PI * EARTH_RADIUS_KM) / 2;
// Geometric horizon central angle for the ISS's altitude: acos(Re/(Re+h)).
const ISS_HORIZON_CENTRAL_ANGLE_DEG = toDegrees(Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + ISS_MEAN_ALTITUDE_KM)));
const ISS_HORIZON_DISTANCE_KM = (ISS_HORIZON_CENTRAL_ANGLE_DEG * Math.PI * EARTH_RADIUS_KM) / 180;

describe('satelliteElevationDeg', () => {
  it('is 90deg when the satellite is directly overhead', () => {
    expect(satelliteElevationDeg(10, 20, 10, 20, ISS_MEAN_ALTITUDE_KM)).toBeCloseTo(90, 3);
  });

  it('is ~0deg at the geometric horizon distance for the ISS\'s altitude', () => {
    const observer = { lat: 0, lon: 0 };
    const sub = destinationPoint(observer.lat, observer.lon, 90, ISS_HORIZON_DISTANCE_KM);
    expect(satelliteElevationDeg(observer.lat, observer.lon, sub.lat, sub.lon, ISS_MEAN_ALTITUDE_KM)).toBeCloseTo(0, 0);
  });

  it('is negative well beyond the horizon', () => {
    const observer = { lat: 0, lon: 0 };
    const sub = destinationPoint(observer.lat, observer.lon, 90, ISS_HORIZON_DISTANCE_KM * 2);
    expect(satelliteElevationDeg(observer.lat, observer.lon, sub.lat, sub.lon, ISS_MEAN_ALTITUDE_KM)).toBeLessThan(0);
  });

  it('the horizon distance is in the real ballpark for the ISS (roughly 2000-2400km)', () => {
    expect(ISS_HORIZON_DISTANCE_KM).toBeGreaterThan(2000);
    expect(ISS_HORIZON_DISTANCE_KM).toBeLessThan(2400);
  });
});

describe('satelliteAzimuthDeg', () => {
  it('reads 90 (east) for a satellite due east of the observer', () => {
    expect(satelliteAzimuthDeg(0, 0, 0, 10)).toBeCloseTo(90, 6);
  });

  it('reads 0 (north) for a satellite due north of the observer', () => {
    expect(satelliteAzimuthDeg(0, 0, 10, 0)).toBeCloseTo(0, 6);
  });

  it('reads 180 (south) for a satellite due south of the observer', () => {
    expect(satelliteAzimuthDeg(10, 0, 0, 0)).toBeCloseTo(180, 6);
  });

  it('stays within [0, 360)', () => {
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -150; lon <= 150; lon += 30) {
        const az = satelliteAzimuthDeg(0, 0, lat, lon);
        expect(az).toBeGreaterThanOrEqual(0);
        expect(az).toBeLessThan(360);
      }
    }
  });
});

describe('evaluateVisibility', () => {
  const date = new Date('2026-09-10T06:00:00Z');
  const sub = subsolarPoint(date);

  it('is visible when the ISS is sunlit, geometrically above the observer\'s horizon, and the observer is in the dark', () => {
    // ISS subpoint 50km into the daylight side of the terminator (sunlit).
    const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 50);
    // Observer 700km into the night side (~-6.3deg solar elevation, past civil twilight).
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 700);

    expect(isDaylight(issSub.lat, issSub.lon, date)).toBe(true);
    expect(solarElevationDeg(observer.lat, observer.lon, date)).toBeLessThan(-6);

    const result = evaluateVisibility(observer.lat, observer.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date);
    expect(result.visible).toBe(true);
    expect(result.elevationDeg).toBeGreaterThanOrEqual(10);
  });

  it('is not visible when the ISS itself is in Earth\'s shadow, even if geometrically well-placed', () => {
    const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 50); // just past the terminator into night
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 700);

    const result = evaluateVisibility(observer.lat, observer.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date);
    expect(result.issSunlit).toBe(false);
    expect(result.visible).toBe(false);
  });

  it('is not visible when the observer\'s sky is not dark enough, even if the ISS is sunlit and overhead', () => {
    // Observer right at the subsolar point: full daylight, satellite directly overhead.
    const result = evaluateVisibility(sub.lat, sub.lon, sub.lat, sub.lon, ISS_MEAN_ALTITUDE_KM, date);
    expect(result.elevationDeg).toBeCloseTo(90, 0);
    expect(result.issSunlit).toBe(true);
    expect(result.visible).toBe(false);
  });

  it('is not visible when the satellite is below the observer\'s horizon, even if illumination conditions are perfect', () => {
    const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 50);
    const farObserver = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 5000);

    const result = evaluateVisibility(farObserver.lat, farObserver.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date);
    expect(result.elevationDeg).toBeLessThan(0);
    expect(result.visible).toBe(false);
  });

  it('respects a custom minElevationDeg threshold', () => {
    const issSub = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM - 50);
    const observer = destinationPoint(sub.lat, sub.lon, 90, QUARTER_CIRCUMFERENCE_KM + 700);

    const lenient = evaluateVisibility(observer.lat, observer.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date, { minElevationDeg: 5 });
    const strict = evaluateVisibility(observer.lat, observer.lon, issSub.lat, issSub.lon, ISS_MEAN_ALTITUDE_KM, date, { minElevationDeg: 80 });
    expect(lenient.visible).toBe(true);
    expect(strict.visible).toBe(false);
  });
});
