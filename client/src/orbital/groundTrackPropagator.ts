import { toRadians, toDegrees, normalizeDeg180 } from './greatCircle';
import { GM_EARTH_KM3_S2, ISS_MEAN_PERIOD_MIN } from './orbitalMechanics';

/** The ISS's real orbital inclination, not derivable from a single Open Notify fix, so it's a cited constant like altitude. */
export const ISS_INCLINATION_DEG = 51.6;

const SIDEREAL_DAY_MS = 86_164_090.5; // 86164.0905s, one Earth rotation relative to the stars, not the 24h solar day
const EARTH_ROTATION_DEG_PER_MS = 360 / SIDEREAL_DAY_MS;

// Earth's oblateness coefficient and equatorial radius (WGS-84), the inputs
// to the standard first-order J2 nodal precession formula below.
const J2 = 1.08262668e-3;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const MS_PER_DAY = 86_400_000;

/**
 * How fast the orbit's plane swings around Earth's axis because of the
 * equatorial bulge (J2 nodal precession), in degrees per day:
 *
 *   dOmega/dt = -3/2 * n * J2 * (Re/a)^2 * cos(i)
 *
 * About -5 deg/day for the ISS. Small next to Earth's rotation, but it is
 * what makes visible-pass "seasons" come and go: without it the ground
 * track lines up with the observer's dusk or dawn at almost the same times
 * every day, so a location that has no passes today would wrongly have
 * none for weeks.
 */
export function nodalPrecessionDegPerDay(inclinationDeg: number, periodMinutes: number): number {
  const periodS = periodMinutes * 60;
  const meanMotionRadS = (2 * Math.PI) / periodS;
  const semiMajorAxisKm = Math.cbrt((GM_EARTH_KM3_S2 * periodS * periodS) / (4 * Math.PI * Math.PI));
  const ratio = EARTH_EQUATORIAL_RADIUS_KM / semiMajorAxisKm;
  const rateRadS = -1.5 * meanMotionRadS * J2 * ratio * ratio * Math.cos(toRadians(inclinationDeg));
  return toDegrees(rateRadS) * 86_400;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface OrbitalElements {
  inclinationDeg: number;
  periodMinutes: number;
  /** Earth-fixed longitude of the ascending node at epochMs. */
  ascendingNodeLonDeg: number;
  /** Argument of latitude (angle traveled since the ascending node) at epochMs, 0..360. */
  argumentOfLatitudeDeg: number;
  epochMs: number;
}

/**
 * Closed-form orbit determination for a circular, spherical-Earth orbit
 * from a single observed (lat, lon, bearing, time) fix, the inclination
 * and period are taken as known constants (real values, cited elsewhere),
 * which is enough to solve for the remaining two elements algebraically:
 *
 *   sin(lat) = sin(i) * sin(u)   =>   u = asin(sin(lat) / sin(i))  [+ quadrant from direction of travel]
 *   lon = Omega + atan2(cos(i) * sin(u), cos(u))   =>   Omega = lon - atan2(...)
 *
 * See propagateSubSatellitePoint's doc comment for exactly what this
 * idealized model does and doesn't account for.
 */
export function deriveOrbitalElements(
  lat: number,
  lon: number,
  bearingDeg: number,
  atMs: number,
  inclinationDeg: number = ISS_INCLINATION_DEG,
  periodMinutes: number = ISS_MEAN_PERIOD_MIN,
): OrbitalElements | null {
  const i = toRadians(inclinationDeg);
  const sinI = Math.sin(i);
  if (Math.abs(sinI) < 1e-9) return null; // a ~0deg-inclination orbit never leaves the equator; lat/sinI is undefined

  const ratio = Math.max(-1, Math.min(1, Math.sin(toRadians(lat)) / sinI));
  const uPrincipal = toDegrees(Math.asin(ratio)); // principal branch, in [-90, 90]: the ascending arc
  const northbound = Math.cos(toRadians(bearingDeg)) >= 0;
  const u0 = northbound ? uPrincipal : 180 - uPrincipal; // reflect into the descending arc, (90, 270)

  const uRad = toRadians(u0);
  const deltaLambdaDeg = toDegrees(Math.atan2(Math.cos(i) * Math.sin(uRad), Math.cos(uRad)));
  const ascendingNodeLonDeg = normalizeDeg180(lon - deltaLambdaDeg);

  return {
    inclinationDeg,
    periodMinutes,
    ascendingNodeLonDeg,
    argumentOfLatitudeDeg: ((u0 % 360) + 360) % 360,
    epochMs: atMs,
  };
}

/**
 * Propagates the sub-satellite (ground track) point forward or backward in
 * time from a set of orbital elements. Models a satellite moving at a
 * constant angular rate around an inclined great circle, with that great
 * circle's Earth-fixed ascending-node longitude drifting westward at
 * Earth's sidereal rotation rate plus J2 nodal precession (see
 * nodalPrecessionDegPerDay).
 *
 * Deliberately NOT modeled (real, small effects):
 *  - Atmospheric drag (the ISS's real altitude and period slowly decay
 *    between reboosts).
 *  - Orbital eccentricity (the ISS's real orbit is very nearly but not
 *    exactly circular).
 *
 * See the README's Honest Limitations section for how this affects
 * prediction accuracy over longer horizons.
 */
export function propagateSubSatellitePoint(elements: OrbitalElements, atMs: number): LatLon {
  const dtMs = atMs - elements.epochMs;
  const i = toRadians(elements.inclinationDeg);
  const periodMs = elements.periodMinutes * 60_000;

  const uRad = toRadians(elements.argumentOfLatitudeDeg + (360 / periodMs) * dtMs);
  const precessionDegPerMs = nodalPrecessionDegPerDay(elements.inclinationDeg, elements.periodMinutes) / MS_PER_DAY;
  const ascendingNodeLonDeg = elements.ascendingNodeLonDeg + (precessionDegPerMs - EARTH_ROTATION_DEG_PER_MS) * dtMs;

  const lat = toDegrees(Math.asin(Math.sin(i) * Math.sin(uRad)));
  const deltaLambdaDeg = toDegrees(Math.atan2(Math.cos(i) * Math.sin(uRad), Math.cos(uRad)));
  const lon = normalizeDeg180(ascendingNodeLonDeg + deltaLambdaDeg);

  return { lat, lon };
}

/**
 * How far through the current real orbit the satellite is right now, as a
 * continuous 0..1 fraction of the argument of latitude, the Mission
 * Dashboard's orbit-progress ring reads this directly. Unlike a wall-clock
 * modulo, this reflects the satellite's actual current position in its
 * actual orbit, derived from the real elements.
 */
export function orbitalPhaseAt(elements: OrbitalElements, atMs: number): number {
  const periodMs = elements.periodMinutes * 60_000;
  const dtMs = atMs - elements.epochMs;
  const uDeg = elements.argumentOfLatitudeDeg + (360 / periodMs) * dtMs;
  return (((uDeg % 360) + 360) % 360) / 360;
}
