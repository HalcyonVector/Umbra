import { destinationPoint, normalizeDeg180, toRadians } from './greatCircle';

const DEFAULT_TERMINATOR_BAND_DEG = 8;
const DEFAULT_STEP_MS = 15_000;
const DEFAULT_MAX_LOOKAHEAD_MS = 20 * 60_000;

export function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

/** The sun's declination (deg) for a given date — how far north/south of the equator the subsolar point sits. */
export function solarDeclinationDeg(date: Date): number {
  const n = dayOfYearUTC(date);
  return 23.44 * Math.sin(toRadians((360 / 365) * (284 + n)));
}

/**
 * The equation of time (minutes): the small, date-dependent gap between
 * apparent solar time and mean solar time caused by Earth's axial tilt and
 * orbital eccentricity. A standard low-order approximation (NOAA), good to
 * within about a minute — plenty precise for a ~8deg terminator band.
 */
export function equationOfTimeMinutes(date: Date): number {
  const n = dayOfYearUTC(date);
  const b = toRadians((360 / 365) * (n - 81));
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** The point on Earth directly beneath the sun right now: latitude = declination, longitude from the equation of time. */
export function subsolarPoint(date: Date): LatLon {
  const declination = solarDeclinationDeg(date);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const eot = equationOfTimeMinutes(date);
  const lon = normalizeDeg180(15 * (12 - utcHours) - eot / 4);
  return { lat: declination, lon };
}

/**
 * Solar elevation angle (deg) at any lat/lon at a given instant. Uses the
 * standard identity sin(elevation) = sin(lat)sin(decl) + cos(lat)cos(decl)cos(H),
 * where H is the hour angle (the point's longitude offset from the subsolar
 * meridian). Equivalently — and this is what predictNextCrossing leans on —
 * elevation = 90 deg minus the great-circle angular distance to the subsolar
 * point, since the subsolar point is by definition where the sun is
 * straight up.
 */
export function solarElevationDeg(lat: number, lon: number, date: Date): number {
  const sub = subsolarPoint(date);
  const phi = toRadians(lat);
  const decl = toRadians(sub.lat);
  const hourAngle = toRadians(normalizeDeg180(lon - sub.lon));
  const sinElevation = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  return (Math.asin(Math.max(-1, Math.min(1, sinElevation))) * 180) / Math.PI;
}

export function isDaylight(lat: number, lon: number, date: Date): boolean {
  return solarElevationDeg(lat, lon, date) > 0;
}

/**
 * A continuous 0..1 "how close to the terminator right now" value: 1 exactly
 * on the day/night line (elevation 0), fading to 0 once solar elevation is
 * at least `bandDeg` away from zero in either direction. This drives the
 * drone's day<->night crossfade smoothly instead of the audio snapping
 * abruptly the instant isDaylight flips.
 */
export function terminatorProximity(lat: number, lon: number, date: Date, bandDeg: number = DEFAULT_TERMINATOR_BAND_DEG): number {
  const elevation = Math.abs(solarElevationDeg(lat, lon, date));
  return Math.max(0, Math.min(1, 1 - elevation / bandDeg));
}

export interface CrossingPrediction {
  /** Milliseconds from `fromDate` until the predicted crossing. */
  deltaMs: number;
  direction: 'sunrise' | 'sunset';
}

/**
 * Walks the ground track forward from (lat, lon) at a constant bearing and
 * ground speed, sampling solar elevation every `stepMs`, and returns the
 * (linearly-interpolated) time of the next day/night terminator crossing —
 * or null if none is found within `maxLookaheadMs`.
 *
 * This is a genuinely predictive feature (the crossing is computed from
 * solar geometry, not detected after the fact from a polled position), but
 * it assumes a LOCALLY LINEAR ground track: constant bearing and speed for
 * the whole lookahead window. The ISS's real ground track curves
 * continuously (orbital inclination + Earth's rotation), so this is a
 * short-horizon estimate, not a precise ephemeris — accurate close in,
 * fuzzier the further out the prediction reaches. See the README's Honest
 * Limitations section.
 */
export function predictNextCrossing(
  lat: number,
  lon: number,
  bearingDeg: number,
  groundSpeedKmh: number,
  fromDate: Date,
  maxLookaheadMs: number = DEFAULT_MAX_LOOKAHEAD_MS,
  stepMs: number = DEFAULT_STEP_MS,
): CrossingPrediction | null {
  if (groundSpeedKmh <= 0) return null;

  const fromMs = fromDate.getTime();
  const kmPerStep = groundSpeedKmh * (stepMs / 3_600_000);

  let prevT = 0;
  let prevPos: LatLon = { lat, lon };
  let prevElevation = solarElevationDeg(lat, lon, fromDate);

  for (let t = stepMs; t <= maxLookaheadMs; t += stepMs) {
    const pos = destinationPoint(prevPos.lat, prevPos.lon, bearingDeg, kmPerStep);
    const at = new Date(fromMs + t);
    const elevation = solarElevationDeg(pos.lat, pos.lon, at);

    if (Math.sign(elevation) !== Math.sign(prevElevation) && elevation !== prevElevation) {
      // Linear interpolation between the two straddling samples for a
      // sub-step-resolution crossing time.
      const frac = prevElevation / (prevElevation - elevation);
      const deltaMs = prevT + frac * (t - prevT);
      return { deltaMs, direction: elevation > prevElevation ? 'sunrise' : 'sunset' };
    }

    prevT = t;
    prevPos = pos;
    prevElevation = elevation;
  }

  return null;
}
