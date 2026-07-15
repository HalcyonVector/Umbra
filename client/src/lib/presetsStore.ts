import type { LocationParams, LocationPreset } from '../types';

const LOCAL_KEY = 'umbra:locations';

export type LocationSource = 'server' | 'local';

function readLocal(): LocationPreset[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocationPreset[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(locations: LocationPreset[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(locations));
  } catch {
    // Quota exceeded or storage disabled — saved locations are a nice-to-have, not critical state.
  }
}

/**
 * Saved locations normally live on the backend, but this is meant to work
 * as a client-only tool too: any network failure (backend down, offline, no
 * server at all) transparently falls back to localStorage instead of
 * losing the save. Callers get told which source served the request so the
 * UI can be honest about it.
 */
export async function listLocations(): Promise<{ locations: LocationPreset[]; source: LocationSource }> {
  try {
    const res = await fetch('/api/presets');
    if (!res.ok) throw new Error(`presets API ${res.status}`);
    return { locations: (await res.json()) as LocationPreset[], source: 'server' };
  } catch {
    return { locations: readLocal(), source: 'local' };
  }
}

export async function saveLocation(name: string, params: LocationParams): Promise<{ location: LocationPreset; source: LocationSource }> {
  try {
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, params }),
    });
    if (!res.ok) throw new Error(`presets API ${res.status}`);
    return { location: (await res.json()) as LocationPreset, source: 'server' };
  } catch {
    const locations = readLocal().filter((p) => p.name !== name);
    const entry: LocationPreset = { name, params, savedAt: new Date().toISOString() };
    locations.push(entry);
    writeLocal(locations);
    return { location: entry, source: 'local' };
  }
}

export async function deleteLocation(name: string): Promise<{ source: LocationSource }> {
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`presets API ${res.status}`);
    return { source: 'server' };
  } catch {
    writeLocal(readLocal().filter((p) => p.name !== name));
    return { source: 'local' };
  }
}
