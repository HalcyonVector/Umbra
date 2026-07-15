import { describe, it, expect, beforeEach } from 'vitest';
import { loadTrail, saveTrail, clearTrail } from './trailStore';

describe('trailStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips saved points', () => {
    const points = [
      { lat: 1, lon: 2, timeMs: 1000 },
      { lat: 3, lon: 4, timeMs: 2000 },
    ];
    saveTrail(points);
    expect(loadTrail(2000)).toEqual(points);
  });

  it('returns an empty array when nothing is saved', () => {
    expect(loadTrail()).toEqual([]);
  });

  it('filters out points older than 24 hours relative to the given now', () => {
    const points = [
      { lat: 1, lon: 1, timeMs: 0 },
      { lat: 2, lon: 2, timeMs: 25 * 60 * 60_000 },
    ];
    saveTrail(points);
    const loaded = loadTrail(25 * 60 * 60_000);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].timeMs).toBe(25 * 60 * 60_000);
  });

  it('ignores malformed stored data rather than throwing', () => {
    localStorage.setItem('umbra:trail', 'not json');
    expect(loadTrail()).toEqual([]);
    localStorage.setItem('umbra:trail', JSON.stringify([{ lat: 'nope' }, { lat: 1, lon: 2, timeMs: 100 }]));
    expect(loadTrail(100)).toEqual([{ lat: 1, lon: 2, timeMs: 100 }]);
  });

  it('caps stored points to the most recent MAX_TRAIL_POINTS', () => {
    const many = Array.from({ length: 4500 }, (_, i) => ({ lat: 0, lon: 0, timeMs: i }));
    saveTrail(many);
    const loaded = loadTrail(4500);
    expect(loaded.length).toBe(4000);
    expect(loaded[loaded.length - 1].timeMs).toBe(4499);
  });

  it('clearTrail empties the store', () => {
    saveTrail([{ lat: 1, lon: 1, timeMs: 1 }]);
    clearTrail();
    expect(loadTrail()).toEqual([]);
  });
});
