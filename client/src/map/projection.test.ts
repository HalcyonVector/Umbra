import { describe, it, expect } from 'vitest';
import { projectSkyPlot } from './projection';

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
