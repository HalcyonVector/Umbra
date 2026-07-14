import { isDaylight } from '../orbital/solarTerminator';

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface LatLonLike {
  lat: number;
  lon: number;
}

/** Plain equirectangular (plate carree) projection: lon/lat -> pixel space for a `width`x`height` viewport. Same convention as Fault-Line's map/projection.ts. */
export function projectEquirectangular(lon: number, lat: number, width: number, height: number): ProjectedPoint {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

export function unprojectEquirectangular(x: number, y: number, width: number, height: number): { lon: number; lat: number } {
  const lon = (x / width) * 360 - 180;
  const lat = 90 - (y / height) * 180;
  return { lon, lat };
}

/**
 * A GeoJSON Polygon/MultiPolygon ring walker: projects every [lon, lat]
 * coordinate through `project` and joins the result into an SVG path `d`
 * string. Used to render the world-atlas land silhouette.
 */
export function geometryToSvgPath(
  geometry: { type: string; coordinates: unknown },
  project: (lon: number, lat: number) => ProjectedPoint,
): string {
  function ringToPath(ring: [number, number][]): string {
    return (
      ring
        .map(([lon, lat], i) => {
          const { x, y } = project(lon, lat);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ') + ' Z'
    );
  }

  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as [number, number][][]).map(ringToPath).join(' ');
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as [number, number][][][]).map((rings) => rings.map(ringToPath).join(' ')).join(' ');
  }
  return '';
}

/**
 * Builds an open SVG path from a chronological sequence of lat/lon points
 * (the ISS ground-track trail). Under an equirectangular projection, a
 * point sequence that crosses the antimeridian (the ISS does, roughly every
 * orbit) would otherwise draw a spurious line clear across the map — this
 * starts a fresh subpath instead whenever consecutive points jump by more
 * than half the viewport width.
 */
export function pathFromTrail(points: LatLonLike[], project: (lon: number, lat: number) => ProjectedPoint, width: number): string {
  if (points.length === 0) return '';
  const segments: string[] = [];
  let prevX: number | null = null;

  points.forEach((p, i) => {
    const { x, y } = project(p.lon, p.lat);
    const wrapped = prevX !== null && Math.abs(x - prevX) > width / 2;
    segments.push(`${i === 0 || wrapped ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
    prevX = x;
  });

  return segments.join(' ');
}

/**
 * A coarse boolean night-mask grid (true = night) sampled directly from
 * solar elevation, rather than constructing an exact terminator polygon.
 * This sidesteps antimeridian/polar-day edge cases entirely — every cell is
 * an independent, correct isDaylight() lookup — at the cost of a soft/blocky
 * edge, which MapScene smooths visually with a coarse-but-blurred canvas
 * fill. Deliberately cheap: a 120x60 grid is 7200 solarElevationDeg calls,
 * sub-millisecond in practice, and the terminator moves slowly enough
 * (~0.25deg/minute) that callers only need to recompute this on the order
 * of once a minute, not every render tick.
 */
export function computeNightMaskGrid(date: Date, cols: number, rows: number): boolean[][] {
  const grid: boolean[][] = [];
  for (let row = 0; row < rows; row++) {
    const lat = 90 - ((row + 0.5) / rows) * 180;
    const line: boolean[] = [];
    for (let col = 0; col < cols; col++) {
      const lon = -180 + ((col + 0.5) / cols) * 360;
      line.push(!isDaylight(lat, lon, date));
    }
    grid.push(line);
  }
  return grid;
}
