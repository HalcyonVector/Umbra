import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { listPresets, savePreset, deletePreset } from './presetsStore';

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
    const saved = await savePreset('low-orbit', { crossingSensitivityDeg: 4 });
    expect(saved.source).toBe('local');
    expect(saved.preset.name).toBe('low-orbit');

    const listed = await listPresets();
    expect(listed.source).toBe('local');
    expect(listed.presets).toHaveLength(1);
    expect(listed.presets[0].params.crossingSensitivityDeg).toBe(4);
  });

  it('deletes from the local fallback store', async () => {
    await savePreset('to-delete', { crossingSensitivityDeg: 5 });
    const del = await deletePreset('to-delete');
    expect(del.source).toBe('local');

    const listed = await listPresets();
    expect(listed.presets).toHaveLength(0);
  });
});
