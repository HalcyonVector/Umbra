import type { MixLayer } from '../audio/AudioEngine';

const VOLUME_KEY = 'umbra:volume';
const MIX_KEY = 'umbra:mix';
const SENSITIVITY_KEY = 'umbra:sensitivity';
const ONBOARDED_KEY = 'umbra:onboarded';
const MIX_LAYERS: MixLayer[] = ['drone', 'crossing', 'beacon'];

/** Small persisted-settings helpers: local-only, best-effort, never throw. A blocked or full
 * localStorage just means the app falls back to defaults instead of crashing. */

export function loadStoredVolume(fallback: number): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // quota exceeded or storage disabled; not worth surfacing to the user
  }
}

export function loadStoredMix(fallback: Record<MixLayer, number>): Record<MixLayer, number> {
  try {
    const raw = localStorage.getItem(MIX_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const valid = MIX_LAYERS.every((layer) => typeof parsed[layer] === 'number' && Number.isFinite(parsed[layer]));
    return valid ? (parsed as Record<MixLayer, number>) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredMix(mix: Record<MixLayer, number>): void {
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch {
    // quota exceeded or storage disabled; not worth surfacing to the user
  }
}

export function loadStoredSensitivity(fallback: number): number {
  try {
    const raw = localStorage.getItem(SENSITIVITY_KEY);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 2 && value <= 15 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredSensitivity(sensitivityDeg: number): void {
  try {
    localStorage.setItem(SENSITIVITY_KEY, String(sensitivityDeg));
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
