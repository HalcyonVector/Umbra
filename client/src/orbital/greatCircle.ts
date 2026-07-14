export const EARTH_RADIUS_KM = 6371;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wraps a longitude/bearing-like degree value into (-180, 180]. */
export function normalizeDeg180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Great-circle distance between two lon/lat points, in km (haversine). */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Initial bearing (deg, 0=north, clockwise) along the great circle from point 1 to point 2. */
export function initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * The point reached by travelling `distanceKm` along the great circle
 * starting at (lat, lon) on initial bearing `bearingDeg`. Used both to walk
 * the ISS ground track forward in time (predictive terminator crossing) and
 * to sample the terminator great circle itself for rendering.
 */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distanceKm: number): LatLon {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = toRadians(bearingDeg);
  const phi1 = toRadians(lat);
  const lambda1 = toRadians(lon);

  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  return { lat: toDegrees(phi2), lon: normalizeDeg180(toDegrees(lambda2)) };
}
