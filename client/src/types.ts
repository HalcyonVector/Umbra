/** A single ISS position fix, as served by GET /api/iss (normalized from Open Notify's iss-now.json). */
export interface IssPosition {
  lat: number;
  lon: number;
  timestampMs: number;
}

export interface IssFeedResponse {
  position: IssPosition;
  fetchedAt: string;
  cached: boolean;
}

export interface CrewMember {
  name: string;
  craft: string;
}

/** GET /api/astros — everyone currently in space, not just aboard the ISS; see the README's Honest Limitations section. */
export interface AstrosFeedResponse {
  count: number;
  people: CrewMember[];
  fetchedAt: string;
  cached: boolean;
}

export type SolarState = 'day' | 'night' | 'twilight';

/** Resolved live orbital telemetry for the current instant — what the Mission Dashboard reads. */
export interface OrbitalTelemetry {
  altitudeKm: number;
  groundSpeedKmh: number | null;
  orbitalSpeedKmS: number | null;
  bearingDeg: number | null;
  elevationDeg: number; // solar elevation at the ISS's sub-satellite point
  isDaylight: boolean;
  country: string | null;
  crewCount: number;
  orbitalPhase: number; // 0..1 — progress through the current ~92.68-minute orbit
}

/** A saved observer location for the visibility predictor. */
export interface LocationParams {
  lat: number;
  lon: number;
}

export interface LocationPreset {
  name: string;
  params: LocationParams;
  savedAt: string;
}
