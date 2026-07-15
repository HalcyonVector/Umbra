import { haversineDistanceKm, toDegrees, EARTH_RADIUS_KM } from './greatCircle';
import { isDaylight, solarElevationDeg } from './solarTerminator';

/**
 * The look-angle elevation (deg) of a satellite at `altitudeKm` above its
 * sub-satellite point, as seen from an observer elsewhere on Earth's
 * surface — the standard spherical-Earth formula:
 *
 *   elevation = atan2(cos(gamma) - Re/(Re+h), sin(gamma))
 *
 * where gamma is the great-circle central angle between observer and
 * sub-satellite point (groundDistanceKm / Re). At gamma=0 (satellite
 * directly overhead) this returns 90deg; at the geometric horizon — for the
 * ISS's altitude, about 20deg of central angle, ~2200km of ground distance
 * — it returns 0deg; beyond the horizon it goes negative (not a real
 * observable angle, just a convenient monotonic value below the 0 cutoff).
 */
export function satelliteElevationDeg(observerLat: number, observerLon: number, subLat: number, subLon: number, altitudeKm: number): number {
  const groundDistanceKm = haversineDistanceKm(observerLat, observerLon, subLat, subLon);
  const gamma = groundDistanceKm / EARTH_RADIUS_KM;
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm);
  const elevationRad = Math.atan2(Math.cos(gamma) - ratio, Math.sin(gamma));
  return toDegrees(elevationRad);
}

export interface VisibilityOptions {
  /** Minimum look-angle elevation to count as "worth looking for," degrees above the horizon. */
  minElevationDeg?: number;
  /** How far below the horizon the sun must be at the observer's location — 6deg is civil twilight, the loose common threshold for "dark enough to spot a bright moving point." */
  minObserverDarknessDeg?: number;
}

export interface VisibilityResult {
  visible: boolean;
  elevationDeg: number;
  issSunlit: boolean;
  observerSolarElevationDeg: number;
}

const DEFAULT_MIN_ELEVATION_DEG = 10;
const DEFAULT_MIN_OBSERVER_DARKNESS_DEG = 6;

/**
 * Whether the ISS would actually be visible to the naked eye right now from
 * (observerLat, observerLon): high enough above the local horizon, lit by
 * the sun (it has no lights of its own — visibility is entirely reflected
 * sunlight, the same reason it looks like a fast-moving star), and the
 * observer's own sky dark enough that a lit satellite isn't washed out by
 * daylight or bright twilight. This is the real condition that makes ISS
 * passes only visible in a window around dawn/dusk, never at local noon or
 * local midnight.
 */
export function evaluateVisibility(
  observerLat: number,
  observerLon: number,
  subLat: number,
  subLon: number,
  altitudeKm: number,
  date: Date,
  options: VisibilityOptions = {},
): VisibilityResult {
  const minElevationDeg = options.minElevationDeg ?? DEFAULT_MIN_ELEVATION_DEG;
  const minObserverDarknessDeg = options.minObserverDarknessDeg ?? DEFAULT_MIN_OBSERVER_DARKNESS_DEG;

  const elevationDeg = satelliteElevationDeg(observerLat, observerLon, subLat, subLon, altitudeKm);
  const issSunlit = isDaylight(subLat, subLon, date);
  const observerSolarElevationDeg = solarElevationDeg(observerLat, observerLon, date);

  const visible = elevationDeg >= minElevationDeg && issSunlit && observerSolarElevationDeg <= -minObserverDarknessDeg;

  return { visible, elevationDeg, issSunlit, observerSolarElevationDeg };
}
