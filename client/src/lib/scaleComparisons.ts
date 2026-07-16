/**
 * Relatable framing for raw telemetry numbers — the app already computes
 * real orbital speed and altitude; these turn them into comparisons a
 * reader can feel rather than just read as digits.
 */

/** A typical commercial jet's cruise speed, km/h (Boeing 777/Airbus A350 class, ~Mach 0.85 at altitude). */
export const COMMERCIAL_JET_SPEED_KMH = 900;

/** Mount Everest's height above sea level, km. */
export const EVEREST_HEIGHT_KM = 8.849;

/** Orbital speed (km/s) expressed as a multiple of commercial jet cruise speed. */
export function speedAsJetMultiple(orbitalSpeedKmS: number): number {
  return (orbitalSpeedKmS * 3600) / COMMERCIAL_JET_SPEED_KMH;
}

/** Altitude (km) expressed as a multiple of Mount Everest's height. */
export function altitudeAsEverestMultiple(altitudeKm: number): number {
  return altitudeKm / EVEREST_HEIGHT_KM;
}
