import { propagateSubSatellitePoint, type OrbitalElements } from './groundTrackPropagator';
import { isDaylight } from './solarTerminator';
import { evaluateVisibility, type VisibilityOptions } from './visibility';

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

export interface PassPrediction {
  startMs: number;
  peakMs: number;
  endMs: number;
  peakElevationDeg: number;
}

const DEFAULT_PASS_STEP_MS = 15_000;
const DEFAULT_PASS_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Walks the propagated ground track forward, evaluating visibility from
 * (observerLat, observerLon) at every step, and groups contiguous visible
 * stretches into discrete pass windows with a peak elevation and time.
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
  let current: { startMs: number; peakMs: number; peakElevationDeg: number } | null = null;

  for (let t = 0; t <= windowMs; t += stepMs) {
    const atMs = fromMs + t;
    const pos = propagateSubSatellitePoint(elements, atMs);
    const result = evaluateVisibility(observerLat, observerLon, pos.lat, pos.lon, altitudeKm, new Date(atMs), options);

    if (result.visible) {
      if (!current) {
        current = { startMs: atMs, peakMs: atMs, peakElevationDeg: result.elevationDeg };
      } else if (result.elevationDeg > current.peakElevationDeg) {
        current.peakMs = atMs;
        current.peakElevationDeg = result.elevationDeg;
      }
    } else if (current) {
      passes.push({ ...current, endMs: atMs });
      current = null;
    }
  }

  if (current) {
    passes.push({ ...current, endMs: fromMs + windowMs });
  }

  return passes;
}
