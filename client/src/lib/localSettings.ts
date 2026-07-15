const MIN_ELEVATION_KEY = 'umbra:minElevation';
const OBSERVER_KEY = 'umbra:observer';
const ONBOARDED_KEY = 'umbra:onboarded';

/** Small persisted-settings helpers: local-only, best-effort, never throw. A blocked or full
 * localStorage just means the app falls back to defaults instead of crashing. */

export function loadStoredMinElevation(fallback: number): number {
  try {
    const raw = localStorage.getItem(MIN_ELEVATION_KEY);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 90 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredMinElevation(deg: number): void {
  try {
    localStorage.setItem(MIN_ELEVATION_KEY, String(deg));
  } catch {
    // quota exceeded or storage disabled; not worth surfacing to the user
  }
}

export interface StoredObserver {
  lat: number;
  lon: number;
}

export function loadStoredObserver(): StoredObserver | null {
  try {
    const raw = localStorage.getItem(OBSERVER_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lat = parsed.lat;
    const lon = parsed.lon;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

export function saveStoredObserver(observer: StoredObserver | null): void {
  try {
    if (observer === null) localStorage.removeItem(OBSERVER_KEY);
    else localStorage.setItem(OBSERVER_KEY, JSON.stringify(observer));
  } catch {
    // quota exceeded or storage disabled; not worth surfacing to the user
  }
}

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, 'true');
  } catch {
    // quota exceeded or storage disabled; the hint just reappears next visit
  }
}
