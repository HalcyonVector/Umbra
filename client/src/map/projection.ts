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
 * The "radians" form of the Web Mercator y-coordinate: ln(tan(pi/4 + lat/2)).
 * Grows without bound toward the poles — callers clamp latitude first.
 */
export function mercatorYRad(latDeg: number): number {
  const latRad = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

/**
 * The viewBox height a Mercator projection needs for a given `width` (which
 * spans the full 360deg of longitude) so that latitude `maxLatDeg` lands
 * exactly on the top/bottom edge — i.e. the height that makes the
 * projection conformal (no stretching) at the chosen crop latitude.
 */
export function mercatorViewHeight(width: number, maxLatDeg: number): number {
  return (width * mercatorYRad(maxLatDeg)) / Math.PI;
}

/**
 * Web Mercator: the projection literally everyone recognizes as "a world
 * map" (Google Maps, weather apps, flight trackers) — unlike equirectangular,
 * it's conformal (shapes near a point look locally correct), at the cost of
 * exaggerating area near the poles. Latitude is clamped to +-maxLatDeg
 * before projecting (Mercator y diverges at +-90) — the ISS never exceeds
 * +-51.6deg of latitude, so a `maxLatDeg` around 75-80 comfortably shows
 * every populated landmass without ever needing to render the poles.
 */
export function projectMercator(lon: number, lat: number, width: number, maxLatDeg: number): ProjectedPoint {
  const clampedLat = Math.max(-maxLatDeg, Math.min(maxLatDeg, lat));
  const x = ((lon + 180) / 360) * width;
  const yMaxRad = mercatorYRad(maxLatDeg);
  const yRad = mercatorYRad(clampedLat);
  const height = mercatorViewHeight(width, maxLatDeg);
  const y = (height * (yMaxRad - yRad)) / (2 * yMaxRad);
  return { x, y };
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
 * Projects a look-angle (azimuth/elevation) pair onto a polar sky-plot: the
 * chart real satellite-tracking software uses to show which direction to
 * point. Elevation 90 (zenith) maps to the plot's center; elevation 0 (the
 * horizon) maps to the outer ring at `radius`; azimuth 0/90/180/270
 * (N/E/S/W) map to up/right/down/left, matching how a sky-plot is read
 * facing outward from the center of the circle.
 */
export function projectSkyPlot(azimuthDeg: number, elevationDeg: number, radius: number, centerX = 0, centerY = 0): ProjectedPoint {
  const clampedElevation = Math.max(0, Math.min(90, elevationDeg));
  const r = radius * (1 - clampedElevation / 90);
  const azRad = (azimuthDeg * Math.PI) / 180;
  return {
    x: centerX + r * Math.sin(azRad),
    y: centerY - r * Math.cos(azRad),
  };
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
