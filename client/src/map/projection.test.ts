import { describe, it, expect } from 'vitest';
import {
  projectEquirectangular, unprojectEquirectangular, geometryToSvgPath, pathFromTrail, computeNightMaskGrid, projectSkyPlot,
  mercatorYRad, mercatorViewHeight, projectMercator,
} from './projection';

describe('projectEquirectangular / unprojectEquirectangular', () => {
  it('round-trips a point through project then unproject', () => {
    const { x, y } = projectEquirectangular(45, 30, 1000, 500);
    const back = unprojectEquirectangular(x, y, 1000, 500);
    expect(back.lon).toBeCloseTo(45, 5);
    expect(back.lat).toBeCloseTo(30, 5);
  });

  it('maps (0,0) lon/lat to the center of the viewport', () => {
    const { x, y } = projectEquirectangular(0, 0, 1000, 500);
    expect(x).toBeCloseTo(500);
    expect(y).toBeCloseTo(250);
  });

  it('maps the top-left corner to (-180, 90)', () => {
    const { x, y } = projectEquirectangular(-180, 90, 1000, 500);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
});

describe('geometryToSvgPath', () => {
  const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, 1000, 500);

  it('builds a closed path for a Polygon', () => {
    const d = geometryToSvgPath({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }, project);
    expect(d.startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('returns an empty string for unsupported geometry types', () => {
    expect(geometryToSvgPath({ type: 'Point', coordinates: [0, 0] }, project)).toBe('');
  });
});

describe('pathFromTrail', () => {
  const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, 1000, 500);

  it('returns an empty string for no points', () => {
    expect(pathFromTrail([], project, 1000)).toBe('');
  });

  it('draws a single continuous subpath for a trail that does not cross the antimeridian', () => {
    const d = pathFromTrail(
      [
        { lat: 10, lon: 10 },
        { lat: 11, lon: 15 },
        { lat: 12, lon: 20 },
      ],
      project,
      1000,
    );
    expect(d.match(/M/g)?.length).toBe(1);
    expect(d.match(/L/g)?.length).toBe(2);
  });

  it('starts a new subpath when the projected x jumps more than half the viewport width (antimeridian wrap)', () => {
    const d = pathFromTrail(
      [
        { lat: 0, lon: 179 },
        { lat: 0, lon: -179 }, // crosses the date line
      ],
      project,
      1000,
    );
    expect(d.match(/M/g)?.length).toBe(2);
  });
});

describe('computeNightMaskGrid', () => {
  it('reads day near the subsolar point and night near its antipode', () => {
    // Northern summer solstice, ~subsolar around (23.4N, varies with time-of-day).
    const date = new Date('2026-06-21T12:00:00Z');
    const grid = computeNightMaskGrid(date, 36, 18); // 10deg cells
    // Row/col near lat=20N, lon=0 (roughly where the sun is around 12:00 UTC on the solstice).
    const dayRow = Math.floor(((90 - 20) / 180) * 18);
    const dayCol = Math.floor(((0 + 180) / 360) * 36);
    expect(grid[dayRow][dayCol]).toBe(false);

    // Antipodal cell should be night.
    const nightRow = Math.floor(((90 - -20) / 180) * 18);
    const nightCol = Math.floor(((180 + 180) / 360) * 36) % 36;
    expect(grid[nightRow][nightCol]).toBe(true);
  });

  it('produces a grid of the requested dimensions', () => {
    const grid = computeNightMaskGrid(new Date('2026-01-01T00:00:00Z'), 24, 12);
    expect(grid).toHaveLength(12);
    expect(grid[0]).toHaveLength(24);
  });
});

describe('projectSkyPlot', () => {
  it('maps the zenith (elevation 90) to the center regardless of azimuth', () => {
    const north = projectSkyPlot(0, 90, 100);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(0);
    const east = projectSkyPlot(90, 90, 100);
    expect(east.x).toBeCloseTo(0);
    expect(east.y).toBeCloseTo(0);
  });

  it('maps the horizon (elevation 0) to the outer ring', () => {
    const north = projectSkyPlot(0, 0, 100);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(-100);

    const east = projectSkyPlot(90, 0, 100);
    expect(east.x).toBeCloseTo(100);
    expect(east.y).toBeCloseTo(0);

    const south = projectSkyPlot(180, 0, 100);
    expect(south.x).toBeCloseTo(0);
    expect(south.y).toBeCloseTo(100);

    const west = projectSkyPlot(270, 0, 100);
    expect(west.x).toBeCloseTo(-100);
    expect(west.y).toBeCloseTo(0);
  });

  it('never places a point further than radius from the center', () => {
    for (let az = 0; az < 360; az += 15) {
      for (let el = 0; el <= 90; el += 10) {
        const { x, y } = projectSkyPlot(az, el, 100);
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(100.0001);
      }
    }
  });

  it('respects a custom center offset', () => {
    const p = projectSkyPlot(90, 0, 50, 20, 30);
    expect(p.x).toBeCloseTo(70);
    expect(p.y).toBeCloseTo(30);
  });

  it('clamps out-of-range elevation rather than producing a point beyond the horizon ring', () => {
    const below = projectSkyPlot(0, -5, 100);
    expect(Math.hypot(below.x, below.y)).toBeCloseTo(100);
  });
});

describe('mercatorYRad', () => {
  it('is 0 at the equator', () => {
    expect(mercatorYRad(0)).toBeCloseTo(0, 10);
  });

  it('is positive north of the equator and negative south, symmetric in magnitude', () => {
    expect(mercatorYRad(45)).toBeGreaterThan(0);
    expect(mercatorYRad(-45)).toBeLessThan(0);
    expect(mercatorYRad(45)).toBeCloseTo(-mercatorYRad(-45), 10);
  });

  it('grows without bound approaching the pole', () => {
    expect(mercatorYRad(89.9)).toBeGreaterThan(mercatorYRad(80));
    expect(mercatorYRad(80)).toBeGreaterThan(mercatorYRad(60));
  });
});

describe('mercatorViewHeight', () => {
  it('scales linearly with width', () => {
    const h1 = mercatorViewHeight(1000, 75);
    const h2 = mercatorViewHeight(2000, 75);
    expect(h2).toBeCloseTo(h1 * 2, 6);
  });

  it('is shorter for a smaller crop latitude (less of the pole-ward stretch included)', () => {
    expect(mercatorViewHeight(1000, 60)).toBeLessThan(mercatorViewHeight(1000, 80));
  });
});

describe('projectMercator', () => {
  const WIDTH = 1000;
  const MAX_LAT = 78;
  const HEIGHT = mercatorViewHeight(WIDTH, MAX_LAT);

  it('maps (0,0) lon/lat to the horizontal center, vertical center', () => {
    const { x, y } = projectMercator(0, 0, WIDTH, MAX_LAT);
    expect(x).toBeCloseTo(WIDTH / 2);
    expect(y).toBeCloseTo(HEIGHT / 2, 1);
  });

  it('maps the west edge (-180) to x=0 and the east edge (180) to x=width', () => {
    expect(projectMercator(-180, 0, WIDTH, MAX_LAT).x).toBeCloseTo(0);
    expect(projectMercator(180, 0, WIDTH, MAX_LAT).x).toBeCloseTo(WIDTH);
  });

  it('maps +maxLatDeg to the top edge (y=0) and -maxLatDeg to the bottom edge (y=height)', () => {
    expect(projectMercator(0, MAX_LAT, WIDTH, MAX_LAT).y).toBeCloseTo(0, 1);
    expect(projectMercator(0, -MAX_LAT, WIDTH, MAX_LAT).y).toBeCloseTo(HEIGHT, 1);
  });

  it('clamps latitude beyond maxLatDeg to the same edge (never renders past the crop)', () => {
    const atMax = projectMercator(0, MAX_LAT, WIDTH, MAX_LAT).y;
    const beyond = projectMercator(0, 89.9, WIDTH, MAX_LAT).y;
    expect(beyond).toBeCloseTo(atMax, 6);
  });

  it('is conformal: equal steps of latitude near the equator map to roughly equal pixel steps as equal steps of longitude', () => {
    const dxPerDegLon = (projectMercator(1, 0, WIDTH, MAX_LAT).x - projectMercator(0, 0, WIDTH, MAX_LAT).x);
    const dyPerDegLat = Math.abs(projectMercator(0, 1, WIDTH, MAX_LAT).y - projectMercator(0, 0, WIDTH, MAX_LAT).y);
    expect(dyPerDegLat).toBeCloseTo(dxPerDegLon, 2);
  });

  it('exaggerates vertical spacing at high latitude relative to the equator (the real, expected Mercator distortion)', () => {
    const dyNearEquator = Math.abs(projectMercator(0, 1, WIDTH, MAX_LAT).y - projectMercator(0, 0, WIDTH, MAX_LAT).y);
    const dyNearMaxLat = Math.abs(projectMercator(0, MAX_LAT, WIDTH, MAX_LAT).y - projectMercator(0, MAX_LAT - 1, WIDTH, MAX_LAT).y);
    expect(dyNearMaxLat).toBeGreaterThan(dyNearEquator);
  });
});
