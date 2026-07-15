const QUERY_KEY = 'watch';

export interface ShareableConfig {
  lat: number;
  lon: number;
  minElevationDeg: number;
}

function isValidConfig(value: unknown): value is ShareableConfig {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.lat === 'number' && Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90 &&
    typeof p.lon === 'number' && Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180 &&
    typeof p.minElevationDeg === 'number' && Number.isFinite(p.minElevationDeg) && p.minElevationDeg >= 0 && p.minElevationDeg <= 90
  );
}

/** Resolved observer location + elevation threshold -> URL-safe encoded string. Round-trips through decodeShareParams. */
export function encodeShareParams(params: ShareableConfig): string {
  return encodeURIComponent(btoa(JSON.stringify(params)));
}

/** Untrusted URL input -> ShareableConfig, or null if malformed/tampered/incomplete. Never throws. */
export function decodeShareParams(encoded: string): ShareableConfig | null {
  try {
    const parsed = JSON.parse(atob(decodeURIComponent(encoded)));
    return isValidConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Current page URL with the resolved location + threshold encoded into a `watch` query param, everything else stripped. */
export function buildShareUrl(params: ShareableConfig): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(QUERY_KEY, encodeShareParams(params));
  return url.toString();
}

/** Reads and decodes the `watch` param from the current page URL, if present and valid. */
export function readShareParamsFromLocation(): ShareableConfig | null {
  const value = new URLSearchParams(window.location.search).get(QUERY_KEY);
  return value ? decodeShareParams(value) : null;
}
