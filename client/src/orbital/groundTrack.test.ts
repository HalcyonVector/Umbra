import { describe, it, expect } from 'vitest';
import { computeGroundSpeedKmh, computeBearingDeg, pruneTrail, type TrackPoint } from './groundTrack';

describe('computeGroundSpeedKmh', () => {
  it('computes a plausible speed for a realistic ISS-like sample pair', () => {
    const prev: TrackPoint = { lat: 0, lon: 0, timeMs: 0 };
    const curr: TrackPoint = { lat: 0.35, lon: 0, timeMs: 5000 }; // ~39km north in 5s, ~28,000 km/h
    const speed = computeGroundSpeedKmh(prev, curr);
    expect(speed).not.toBeNull();
    expect(speed!).toBeGreaterThan(10_000);
    expect(speed!).toBeLessThan(40_000);
  });

  it('rejects a pair with too small a time gap', () => {
    const prev: TrackPoint = { lat: 0, lon: 0, timeMs: 0 };
    const curr: TrackPoint = { lat: 0.01, lon: 0, timeMs: 100 };
    expect(computeGroundSpeedKmh(prev, curr)).toBeNull();
  });

  it('rejects a pair with too large a time gap (stale/reconnect)', () => {
    const prev: TrackPoint = { lat: 0, lon: 0, timeMs: 0 };
    const curr: TrackPoint = { lat: 10, lon: 0, timeMs: 300_000 };
    expect(computeGroundSpeedKmh(prev, curr)).toBeNull();
  });

  it('rejects an implausible teleport within a normal time gap', () => {
    const prev: TrackPoint = { lat: 0, lon: 0, timeMs: 0 };
    const curr: TrackPoint = { lat: 80, lon: 179, timeMs: 5000 };
    expect(computeGroundSpeedKmh(prev, curr)).toBeNull();
  });

  it('is 0 for two identical points', () => {
    const p: TrackPoint = { lat: 12, lon: 34, timeMs: 0 };
    expect(computeGroundSpeedKmh(p, { ...p, timeMs: 5000 })).toBe(0);
  });
});

describe('computeBearingDeg', () => {
  it('returns null for identical points', () => {
    const p: TrackPoint = { lat: 12, lon: 34, timeMs: 0 };
    expect(computeBearingDeg(p, { ...p, timeMs: 5000 })).toBeNull();
  });

  it('returns ~0 (north) for due-north movement', () => {
    const prev: TrackPoint = { lat: 0, lon: 0, timeMs: 0 };
    const curr: TrackPoint = { lat: 5, lon: 0, timeMs: 5000 };
    expect(computeBearingDeg(prev, curr)).toBeCloseTo(0, 6);
  });
});

describe('pruneTrail', () => {
  it('drops points older than maxAgeMs relative to atMs', () => {
    const points: TrackPoint[] = [
      { lat: 0, lon: 0, timeMs: 0 },
      { lat: 1, lon: 1, timeMs: 5000 },
      { lat: 2, lon: 2, timeMs: 10_000 },
    ];
    const pruned = pruneTrail(points, 10_000, 6000);
    expect(pruned).toHaveLength(2);
    expect(pruned.map((p) => p.timeMs)).toEqual([5000, 10_000]);
  });

  it('keeps everything when nothing is old enough to drop', () => {
    const points: TrackPoint[] = [{ lat: 0, lon: 0, timeMs: 9000 }];
    expect(pruneTrail(points, 10_000, 60_000)).toHaveLength(1);
  });
});
