/** A single ISS position fix, as served by GET /api/iss (normalized from Open Notify's iss-now.json). */
export interface IssPosition {
  lat: number;
  lon: number;
  timestampMs: number;
  /** Measured altitude in km, when the upstream feed reports it (wheretheiss.at does, Open Notify does not). */
  altitudeKm?: number | null;
  /** Measured orbital velocity in km/h, when reported. */
  velocityKmh?: number | null;
  /** 'daylight' | 'eclipsed' | 'visible', when reported. */
  visibility?: string | null;
  source?: string;
}

export interface IssFeedResponse {
  position: IssPosition;
  fetchedAt: string;
  cached: boolean;
}

export interface CrewMember {
  name: string;
  craft: string;
  agency?: string | null;
  role?: string | null;
  country?: string | null;
}

/** GET /api/astros, everyone currently in space, not just aboard the ISS; see the README's Honest Limitations section. */
export interface AstrosFeedResponse {
  count: number;
  expedition?: number | null;
  people: CrewMember[];
  fetchedAt: string;
  cached: boolean;
}

export type SolarState = 'day' | 'night' | 'twilight';

/** Resolved live orbital telemetry for the current instant, what the Mission Dashboard reads. */
export interface OrbitalTelemetry {
  altitudeKm: number;
  /** True when altitude/velocity came from the live feed rather than being derived or cited. */
  measured: boolean;
  /** Smoothly-propagated sub-satellite point for this instant, or null before the first fix. */
  position: { lat: number; lon: number } | null;
  groundSpeedKmh: number | null;
  orbitalSpeedKmS: number | null;
  bearingDeg: number | null;
  elevationDeg: number; // solar elevation at the ISS's sub-satellite point
  isDaylight: boolean;
  country: string | null;
  crewCount: number;
  orbitalPhase: number; // 0..1, progress through the current ~92.68-minute orbit
}

