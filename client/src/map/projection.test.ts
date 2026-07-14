import { describe, it, expect } from 'vitest';
import { projectEquirectangular, unprojectEquirectangular, geometryToSvgPath, pathFromTrail, computeNightMaskGrid } from './projection';

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
