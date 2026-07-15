import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { listLocations, saveLocation, deleteLocation } from './presetsStore';

describe('presetsStore (offline fallback)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network unavailable');
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to localStorage when the server is unreachable, and says so', async () => {
    const saved = await saveLocation('Home', { lat: 40.7128, lon: -74.006 });
    expect(saved.source).toBe('local');
    expect(saved.location.name).toBe('Home');

    const listed = await listLocations();
    expect(listed.source).toBe('local');
    expect(listed.locations).toHaveLength(1);
    expect(listed.locations[0].params).toEqual({ lat: 40.7128, lon: -74.006 });
  });

  it('deletes from the local fallback store', async () => {
    await saveLocation('To Delete', { lat: 0, lon: 0 });
    const del = await deleteLocation('To Delete');
    expect(del.source).toBe('local');

    const listed = await listLocations();
    expect(listed.locations).toHaveLength(0);
  });
});
