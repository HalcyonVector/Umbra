import type { TrackPoint } from '../orbital/groundTrack';

const TRAIL_KEY = 'umbra:trail';
const MAX_TRAIL_POINTS = 4000;
const MAX_TRAIL_AGE_MS = 24 * 60 * 60_000;

function isTrackPoint(value: unknown): value is TrackPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.lat === 'number' && Number.isFinite(p.lat) && typeof p.lon === 'number' && Number.isFinite(p.lon) && typeof p.timeMs === 'number' && Number.isFinite(p.timeMs);
}

/**
 * The ground-track trail is the "living cartography" — it's meant to keep
 * growing the longer you've had Umbra open across sessions, not reset on
 * every reload. Persisted to localStorage, capped by both age and count so
 * it can't grow unbounded; best-effort and never throws, same convention
 * as lib/localSettings.ts.
 */
export function loadTrail(nowMs: number = Date.now()): TrackPoint[] {
  try {
    const raw = localStorage.getItem(TRAIL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cutoff = nowMs - MAX_TRAIL_AGE_MS;
    return parsed.filter((p) => isTrackPoint(p) && p.timeMs >= cutoff) as TrackPoint[];
  } catch {
    return [];
  }
}

export function saveTrail(points: TrackPoint[]): void {
  try {
    const capped = points.length > MAX_TRAIL_POINTS ? points.slice(points.length - MAX_TRAIL_POINTS) : points;
    localStorage.setItem(TRAIL_KEY, JSON.stringify(capped));
  } catch {
    // quota exceeded or storage disabled — the weave just stops growing across reloads, not fatal
  }
}

export function clearTrail(): void {
  try {
    localStorage.removeItem(TRAIL_KEY);
  } catch {
    // ignore
  }
}
