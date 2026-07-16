import { propagateSubSatellitePoint, type OrbitalElements } from './groundTrackPropagator';
import { isDaylight, solarElevationDeg } from './solarTerminator';
import { evaluateVisibility, satelliteAzimuthDeg, satelliteElevationDeg, type VisibilityOptions } from './visibility';
import { destinationPoint } from './greatCircle';

export interface CrossingPrediction {
  atMs: number;
  direction: 'sunrise' | 'sunset';
  lat: number;
  lon: number;
}

const DEFAULT_CROSSING_STEP_MS = 30_000;
const DEFAULT_CROSSING_WINDOW_MS = 6 * 60 * 60_000; // ~4 orbits
const CROSSING_BISECT_ITERATIONS = 8;

/**
 * Walks the propagated ground track forward from `fromMs` for `windowMs`,
 * sampling every `stepMs`, and returns every day/night terminator crossing
 * found in that window — each refined to sub-step resolution by bisecting
 * between the straddling pair of samples. Unlike a linear ground-track
 * walk, this stays accurate across the whole window because
 * propagateSubSatellitePoint already accounts for the ground track's real
 * curvature (inclination + Earth's rotation), not just the current instant's
 * bearing and speed.
 */
export function predictTerminatorCrossings(
  elements: OrbitalElements,
  fromMs: number,
  windowMs: number = DEFAULT_CROSSING_WINDOW_MS,
  stepMs: number = DEFAULT_CROSSING_STEP_MS,
): CrossingPrediction[] {
  const crossings: CrossingPrediction[] = [];
  let prevT = 0;
  const seed = propagateSubSatellitePoint(elements, fromMs);
  let prevDay = isDaylight(seed.lat, seed.lon, new Date(fromMs));

  for (let t = stepMs; t <= windowMs; t += stepMs) {
    const pos = propagateSubSatellitePoint(elements, fromMs + t);
    const day = isDaylight(pos.lat, pos.lon, new Date(fromMs + t));

    if (day !== prevDay) {
      let lo = prevT;
      let hi = t;
      for (let iter = 0; iter < CROSSING_BISECT_ITERATIONS; iter++) {
        const mid = (lo + hi) / 2;
        const midPos = propagateSubSatellitePoint(elements, fromMs + mid);
        const midDay = isDaylight(midPos.lat, midPos.lon, new Date(fromMs + mid));
        if (midDay === prevDay) lo = mid;
        else hi = mid;
      }
      const crossPos = propagateSubSatellitePoint(elements, fromMs + hi);
      crossings.push({ atMs: fromMs + hi, direction: day ? 'sunrise' : 'sunset', lat: crossPos.lat, lon: crossPos.lon });
    }

    prevT = t;
    prevDay = day;
  }

  return crossings;
}

/** One sampled point along a pass's rise-to-set arc, in look-angle (azimuth/elevation) terms — what the sky-plot renders. */
export interface PassTrackPoint {
  atMs: number;
  azimuthDeg: number;
  elevationDeg: number;
}

export interface PassPrediction {
  startMs: number;
  peakMs: number;
  endMs: number;
  peakElevationDeg: number;
  startAzimuthDeg: number;
  endAzimuthDeg: number;
  track: PassTrackPoint[];
}

const DEFAULT_PASS_STEP_MS = 15_000;
const DEFAULT_PASS_WINDOW_MS = 24 * 60 * 60_000;

interface OpenPass {
  startMs: number;
  peakMs: number;
  peakElevationDeg: number;
  track: PassTrackPoint[];
}

function finalizePass(open: OpenPass, endMs: number): PassPrediction {
  const track = open.track;
  return {
    startMs: open.startMs,
    peakMs: open.peakMs,
    endMs,
    peakElevationDeg: open.peakElevationDeg,
    startAzimuthDeg: track[0]?.azimuthDeg ?? 0,
    endAzimuthDeg: track[track.length - 1]?.azimuthDeg ?? 0,
    track,
  };
}

/**
 * Walks the propagated ground track forward, evaluating visibility from
 * (observerLat, observerLon) at every step, and groups contiguous visible
 * stretches into discrete pass windows — each carrying the full rise-to-set
 * azimuth/elevation track a sky-plot needs to actually show which direction
 * to look, not just how long until it's worth going outside.
 */
export function predictVisiblePasses(
  elements: OrbitalElements,
  observerLat: number,
  observerLon: number,
  altitudeKm: number,
  fromMs: number,
  windowMs: number = DEFAULT_PASS_WINDOW_MS,
  options: VisibilityOptions = {},
  stepMs: number = DEFAULT_PASS_STEP_MS,
): PassPrediction[] {
  const passes: PassPrediction[] = [];
  let current: OpenPass | null = null;

  for (let t = 0; t <= windowMs; t += stepMs) {
    const atMs = fromMs + t;
    const pos = propagateSubSatellitePoint(elements, atMs);
    const result = evaluateVisibility(observerLat, observerLon, pos.lat, pos.lon, altitudeKm, new Date(atMs), options);

    if (result.visible) {
      const azimuthDeg = satelliteAzimuthDeg(observerLat, observerLon, pos.lat, pos.lon);
      if (!current) {
        current = { startMs: atMs, peakMs: atMs, peakElevationDeg: result.elevationDeg, track: [] };
      } else if (result.elevationDeg > current.peakElevationDeg) {
        current.peakMs = atMs;
        current.peakElevationDeg = result.elevationDeg;
      }
      current.track.push({ atMs, azimuthDeg, elevationDeg: result.elevationDeg });
    } else if (current) {
      passes.push(finalizePass(current, atMs));
      current = null;
    }
  }

  if (current) {
    passes.push(finalizePass(current, fromMs + windowMs));
  }

  return passes;
}

export interface LocalTwilightTransition {
  atMs: number;
  /** true = the observer's sky is about to get dark enough to matter (sunset-ish); false = about to get too bright (sunrise-ish). */
  becomingDark: boolean;
}

const DEFAULT_TWILIGHT_STEP_MS = 5 * 60_000;
const DEFAULT_TWILIGHT_WINDOW_MS = 24 * 60 * 60_000;
const TWILIGHT_BISECT_ITERATIONS = 10;

/**
 * When will the observer's OWN local sky next cross the darkness threshold
 * used elsewhere for visibility (default 6deg below the horizon, civil
 * twilight)? This is deliberately distinct from the ISS's terminator
 * crossings above — a location can be in broad daylight while the ISS
 * itself is crossing into night on the far side of the planet, and knowing
 * "when will it be dark enough here to actually look up" is what the
 * visibility predictor's own darkness gate depends on. Since the observer's
 * lat/lon is fixed (unlike the moving sub-satellite point), this only needs
 * to walk solarElevationDeg forward at one location, refined by bisection.
 */
export function predictLocalTwilightTransition(
  lat: number,
  lon: number,
  fromMs: number,
  windowMs: number = DEFAULT_TWILIGHT_WINDOW_MS,
  thresholdDeg: number = 6,
  stepMs: number = DEFAULT_TWILIGHT_STEP_MS,
): LocalTwilightTransition | null {
  let prevDark = solarElevationDeg(lat, lon, new Date(fromMs)) <= -thresholdDeg;

  for (let t = stepMs; t <= windowMs; t += stepMs) {
    const dark = solarElevationDeg(lat, lon, new Date(fromMs + t)) <= -thresholdDeg;
    if (dark !== prevDark) {
      let lo = t - stepMs;
      let hi = t;
      for (let iter = 0; iter < TWILIGHT_BISECT_ITERATIONS; iter++) {
        const mid = (lo + hi) / 2;
        const midDark = solarElevationDeg(lat, lon, new Date(fromMs + mid)) <= -thresholdDeg;
        if (midDark === prevDark) lo = mid;
        else hi = mid;
      }
      return { atMs: fromMs + hi, becomingDark: dark };
    }
    prevDark = dark;
  }

  return null;
}

export interface GoldenWindowSpot {
  lat: number;
  lon: number;
  solarElevationDeg: number;
  satelliteElevationDeg: number;
}

const GOLDEN_WINDOW_RING_DISTANCE_KM = 1200;
const GOLDEN_WINDOW_RING_SAMPLES = 24;
const GOLDEN_WINDOW_DARKNESS_THRESHOLD_DEG = 6;
const GOLDEN_WINDOW_MIN_ELEVATION_DEG = 10;

/**
 * Scans a ring of candidate points around the ISS's current sub-satellite
 * point for the single best real place on Earth to look up right now — not
 * just at the observer's own set location. The ISS must be sunlit (it has
 * no lights of its own — this is the same constraint the pass predictor
 * uses), a candidate spot must be far enough below its own horizon to
 * matter (past civil twilight) and see the ISS at a real look-angle
 * (>=10deg, not skimming the horizon), and among everywhere that qualifies,
 * the darkest sky wins — the strongest contrast against a lit satellite.
 * Returns null when nothing on the ring qualifies (most commonly: the ISS
 * itself is currently in Earth's shadow) rather than forcing a pick — an
 * honest "no exceptional window right now," not a fabricated one.
 */
export function findBestViewingSpotNow(subLat: number, subLon: number, altitudeKm: number, date: Date): GoldenWindowSpot | null {
  if (!isDaylight(subLat, subLon, date)) return null;

  let best: GoldenWindowSpot | null = null;
  for (let i = 0; i < GOLDEN_WINDOW_RING_SAMPLES; i++) {
    const bearing = (360 / GOLDEN_WINDOW_RING_SAMPLES) * i;
    const candidate = destinationPoint(subLat, subLon, bearing, GOLDEN_WINDOW_RING_DISTANCE_KM);
    const sunElevation = solarElevationDeg(candidate.lat, candidate.lon, date);
    if (sunElevation > -GOLDEN_WINDOW_DARKNESS_THRESHOLD_DEG) continue;

    const satElevation = satelliteElevationDeg(candidate.lat, candidate.lon, subLat, subLon, altitudeKm);
    if (satElevation < GOLDEN_WINDOW_MIN_ELEVATION_DEG) continue;

    if (!best || sunElevation < best.solarElevationDeg) {
      best = { lat: candidate.lat, lon: candidate.lon, solarElevationDeg: sunElevation, satelliteElevationDeg: satElevation };
    }
  }
  return best;
}
