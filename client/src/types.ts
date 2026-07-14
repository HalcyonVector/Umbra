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

/** The continuous, fully-resolved drone/background synthesis parameters — the orbital analog of Fault-Line's SeismicParams. */
export interface OrbitalParams {
  droneDensity: number; // 0..1, overall thickness of the drone layer
  layerCount: number; // 1..6, one active oscillator layer per crew member currently in space
  brightness: number; // 0..1, 1 = full day, 0 = full night, continuous across the terminator band
  filterCutoffHz: number;
  filterResonance: number; // Q
  driftRate: number; // Hz, slow LFO rate tied to ground-track speed
  rootSemitone: number; // slow-breathing harmonic root offset, cycles once per real ISS orbit
  warmth: number; // 0..1, grounded/over-land vs airy/over-ocean
  vignette: number; // 0..1, visual darkening as night deepens — mirrors (1 - brightness)
  state: SolarState;
  orbitalPhase: number; // 0..1, passed through so AudioEngine can select the chord palette (see audio/orbitalTheory.ts)
}

/** Synthesis parameters for the discrete swell fired exactly at a predicted/detected terminator crossing. */
export interface CrossingTriggerParams {
  amplitude: number; // 0..1
  direction: 'sunrise' | 'sunset';
  toneHz: number; // sunrise reads brighter/higher, sunset lower/darker
}

/** Resolved orbital inputs for a given instant — what StatusPanel reads and what mapping/parameterMapping.ts consumes. */
export interface OrbitalTelemetry {
  altitudeKm: number;
  groundSpeedKmh: number | null;
  orbitalSpeedKmS: number | null;
  bearingDeg: number | null;
  elevationDeg: number;
  terminatorProximity: number;
  isDaylight: boolean;
  state: SolarState;
  country: string | null;
  crewCount: number;
  orbitalPhase: number; // 0..1
  nextCrossing: { deltaMs: number; direction: 'sunrise' | 'sunset' } | null;
}

export interface EngineConfig {
  crossingSensitivityDeg: number; // 2..15 — width of the solar-elevation band that counts as "crossing the terminator"
}

export interface Preset {
  name: string;
  params: EngineConfig;
  savedAt: string;
}
