import { normalizeDeg180, toRadians } from './greatCircle';

const DEFAULT_TERMINATOR_BAND_DEG = 8;

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
 * meridian). Equivalently, elevation = 90 deg minus the great-circle angular
 * distance to the subsolar point, since the subsolar point is by definition
 * where the sun is straight up — a handy identity for tests.
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
 * at least `bandDeg` away from zero in either direction. Used to shade the
 * map's twilight band a little wider than a hard binary day/night line.
 */
export function terminatorProximity(lat: number, lon: number, date: Date, bandDeg: number = DEFAULT_TERMINATOR_BAND_DEG): number {
  const elevation = Math.abs(solarElevationDeg(lat, lon, date));
  return Math.max(0, Math.min(1, 1 - elevation / bandDeg));
}
