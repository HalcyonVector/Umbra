import { EARTH_RADIUS_KM } from './greatCircle';

/** Earth's standard gravitational parameter, km^3/s^2 (product of G and Earth's mass). */
export const GM_EARTH_KM3_S2 = 398600.4418;

/**
 * The ISS's mean altitude above mean sea level, in km. Open Notify's
 * iss-now.json does NOT report altitude or velocity — only lat/lon and a
 * timestamp — so this cited figure (NASA/ISS tracking consensus, ~408km as
 * of the mid-2020s) is the one external constant this module trusts. Real
 * altitude varies roughly 370-460km as atmospheric drag lowers the orbit
 * between periodic reboosts; see the README's Honest Limitations section.
 */
export const ISS_MEAN_ALTITUDE_KM = 408;

/** The ISS's mean orbital period, in minutes, consistent with ISS_MEAN_ALTITUDE_KM via Kepler's third law. */
export const ISS_MEAN_PERIOD_MIN = 92.68;

/**
 * Vis-viva equation for a circular orbit (semi-major axis == orbital
 * radius): orbital speed in km/s at a given altitude above Earth's surface.
 */
export function visVivaSpeedKmS(altitudeKm: number): number {
  const r = EARTH_RADIUS_KM + altitudeKm;
  return Math.sqrt(GM_EARTH_KM3_S2 / r);
}

/** Kepler's third law, inverted: orbital period (minutes) -> circular-orbit altitude (km). */
export function altitudeFromPeriodMin(periodMinutes: number): number {
  const periodSeconds = periodMinutes * 60;
  const semiMajorAxisKm = Math.cbrt((GM_EARTH_KM3_S2 * periodSeconds ** 2) / (4 * Math.PI ** 2));
  return semiMajorAxisKm - EARTH_RADIUS_KM;
}

/** Kepler's third law: circular-orbit altitude (km) -> orbital period (minutes). */
export function periodFromAltitudeMin(altitudeKm: number): number {
  const r = EARTH_RADIUS_KM + altitudeKm;
  const periodSeconds = 2 * Math.PI * Math.sqrt(r ** 3 / GM_EARTH_KM3_S2);
  return periodSeconds / 60;
}

/**
 * Converts a measured ground-track speed (km/h, from consecutive Open
 * Notify position fixes — see orbital/groundTrack.ts) into an estimated true
 * orbital speed (km/s). The ground track sweeps out the same angular rate as
 * the spacecraft, but at Earth's radius rather than orbital radius, so
 * ground speed under-reports true orbital speed by the ratio R_earth /
 * (R_earth + altitude). This does NOT correct for Earth's own rotation
 * (~0.46 km/s at the equator, small but non-zero relative to the ISS's
 * ~7.66 km/s) — a known simplification, documented in the README.
 */
export function groundSpeedToOrbitalSpeedKmS(groundSpeedKmh: number, altitudeKm: number): number {
  const groundSpeedKmS = groundSpeedKmh / 3600;
  const scale = (EARTH_RADIUS_KM + altitudeKm) / EARTH_RADIUS_KM;
  return groundSpeedKmS * scale;
}

/**
 * Where in a canonical orbital cycle "now" falls, as a continuous 0..1
 * phase that wraps every `periodMinutes`. This is the backbone of the
 * drone's slow harmonic structure (see audio/orbitalTheory.ts) — a musical
 * arc tied to the ISS's real ~92.68-minute period rather than wall-clock
 * convenience, so one full loop of the piece really does correspond to one
 * real orbit.
 */
export function orbitalPhase(atMs: number, periodMinutes: number = ISS_MEAN_PERIOD_MIN): number {
  const periodMs = periodMinutes * 60_000;
  const wrapped = ((atMs % periodMs) + periodMs) % periodMs;
  return wrapped / periodMs;
}

/**
 * True exactly when consecutive phase readings show the orbit-progress dial
 * has wrapped back to 0% — i.e. a full lap completed — rather than just
 * ticking forward normally. Guards against false positives from a
 * *backward* phase jump (e.g. the display position briefly re-deriving from
 * a fresh live fix) by requiring the previous reading to have been near the
 * end of the cycle, not just numerically greater than the new one.
 */
export function didOrbitWrap(prevPhase: number, currPhase: number, nearEndThreshold: number = 0.9, nearStartThreshold: number = 0.1): boolean {
  return prevPhase >= nearEndThreshold && currPhase <= nearStartThreshold;
}
