import { haversineDistanceKm, initialBearingDeg } from './greatCircle';

export interface TrackPoint {
  lat: number;
  lon: number;
  timeMs: number;
}

/**
 * Open Notify's iss-now.json has no documented SLA: samples can arrive with
 * a duplicate timestamp (nothing new to compute from) or, after a network
 * hiccup, a large gap (during which the ISS moved far enough that a naive
 * distance/time division would read as a wildly implausible speed). Both
 * are guarded against here rather than trusted blindly — see the README's
 * Honest Limitations section.
 */
const MIN_DT_MS = 500;
const MAX_DT_MS = 60_000;
/** Generous ceiling in km/h — well above the ISS's real ~27,600 km/h — used only to reject obviously-corrupt samples. */
const MAX_PLAUSIBLE_SPEED_KMH = 40_000;

/** Ground-track speed (km/h) between two consecutive position fixes, or null if the pair is unusable (see guards above). */
export function computeGroundSpeedKmh(prev: TrackPoint, curr: TrackPoint): number | null {
  const dtMs = curr.timeMs - prev.timeMs;
  if (dtMs < MIN_DT_MS || dtMs > MAX_DT_MS) return null;

  const distanceKm = haversineDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
  const speedKmh = distanceKm / (dtMs / 3_600_000);
  return speedKmh <= MAX_PLAUSIBLE_SPEED_KMH ? speedKmh : null;
}

/** Ground-track bearing (deg) between two consecutive position fixes, or null if they're the same point (bearing undefined). */
export function computeBearingDeg(prev: TrackPoint, curr: TrackPoint): number | null {
  if (prev.lat === curr.lat && prev.lon === curr.lon) return null;
  return initialBearingDeg(prev.lat, prev.lon, curr.lat, curr.lon);
}

/** Drops trail points older than `maxAgeMs` relative to `atMs`, for the fading ground-track trail on the map. */
export function pruneTrail(points: TrackPoint[], atMs: number, maxAgeMs: number): TrackPoint[] {
  const cutoff = atMs - maxAgeMs;
  return points.filter((p) => p.timeMs >= cutoff);
}
