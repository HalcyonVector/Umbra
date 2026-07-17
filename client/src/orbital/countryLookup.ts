export type Ring = [number, number][];
export type PolygonCoords = Ring[];
export type MultiPolygonCoords = Ring[][];

export interface CountryGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: PolygonCoords | MultiPolygonCoords;
}

export interface CountryFeature {
  name: string;
  geometry: CountryGeometry;
  /** [minLon, minLat, maxLon, maxLat] — computed once and cached alongside the feature for a fast reject before the precise test. */
  bbox: [number, number, number, number];
}

/**
 * Standard ray-casting point-in-polygon test against a single ring (works
 * for the outer ring; a point "inside" a hole ring is treated as inside the
 * hole, so callers XOR outer/hole results — see pointInPolygon).
 *
 * Rings that cross the antimeridian (Fiji, Russia's far-east lobe, etc.)
 * store raw coordinates that jump from ~180 to ~-180 between consecutive
 * vertices. Interpreted literally, that edge spans nearly the entire globe
 * the wrong way around: confirmed to produce false-positive matches at
 * totally unrelated longitudes (a point over Peru was matching "Fiji").
 * Unwrapping this ring's own longitude sequence, then testing the query
 * point against whichever +-360 equivalent lands nearest this ring's own
 * coordinates, fixes that without touching how rings are stored elsewhere
 * (bbox included — computeBBox is a separate, cheap pre-filter, and an
 * over-wide bbox for a dateline-crossing ring just means this precise test
 * runs a bit more often, not that it can return a wrong answer).
 */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  if (ring.length === 0) return false;

  const unwrapped: Ring = [ring[0]];
  let offset = 0;
  for (let i = 1; i < ring.length; i++) {
    const delta = ring[i][0] - ring[i - 1][0];
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    unwrapped.push([ring[i][0] + offset, ring[i][1]]);
  }
  const referenceLon = unwrapped[0][0];
  const testLon = lon + Math.round((referenceLon - lon) / 360) * 360;

  let inside = false;
  for (let i = 0, j = unwrapped.length - 1; i < unwrapped.length; j = i++) {
    const [xi, yi] = unwrapped[i];
    const [xj, yj] = unwrapped[j];
    const intersects = yi > lat !== yj > lat && testLon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** GeoJSON Polygon test: inside the outer ring and not inside any hole ring. */
export function pointInPolygon(lon: number, lat: number, rings: PolygonCoords): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lon, lat, rings[i])) return false;
  }
  return true;
}

/** GeoJSON MultiPolygon test: inside any one of the constituent polygons. */
export function pointInMultiPolygon(lon: number, lat: number, polygons: MultiPolygonCoords): boolean {
  return polygons.some((rings) => pointInPolygon(lon, lat, rings));
}

export function pointInGeometry(lon: number, lat: number, geometry: CountryGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(lon, lat, geometry.coordinates as PolygonCoords);
  return pointInMultiPolygon(lon, lat, geometry.coordinates as MultiPolygonCoords);
}

function flattenRings(geometry: CountryGeometry): Ring[] {
  return geometry.type === 'Polygon'
    ? (geometry.coordinates as PolygonCoords)
    : (geometry.coordinates as MultiPolygonCoords).flat();
}

export function computeBBox(geometry: CountryGeometry): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const ring of flattenRings(geometry)) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function inBBox(lon: number, lat: number, bbox: [number, number, number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Finds which country (if any) a lon/lat point falls inside, against a list
 * of pre-processed CountryFeature records. A bounding-box reject runs first
 * so the precise ray-casting test only ever runs against the handful of
 * candidates whose bbox could plausibly contain the point — this project's
 * source ISS ground track spends most of its time over open ocean, where
 * this returns null in one cheap bbox pass per country.
 *
 * NOTE: this deliberately does not special-case the antimeridian (a
 * country's bbox that wraps from +180 to -180, e.g. Fiji or Russia's far
 * east, can under-match near the seam) — a known, minor limitation, in the
 * same spirit as Fault-Line's coarse rectangular tectonic-region boxes.
 */
export function findCountryAt(lon: number, lat: number, countries: CountryFeature[]): string | null {
  for (const country of countries) {
    if (!inBBox(lon, lat, country.bbox)) continue;
    if (pointInGeometry(lon, lat, country.geometry)) return country.name;
  }
  return null;
}
