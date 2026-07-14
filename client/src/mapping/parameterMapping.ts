import type { CrossingTriggerParams, OrbitalParams, SolarState } from '../types';
import { crewCountToLayers, crewWarmth } from '../orbital/crewCensus';
import { rootSemitoneForPhase, colorForState } from '../audio/orbitalTheory';

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t);
}

const MAX_PLAUSIBLE_GROUND_SPEED_KMH = 30_000;

export interface TelemetryInput {
  isDaylight: boolean;
  terminatorProximity: number; // 0..1
  crewCount: number;
  groundSpeedKmh: number | null;
  overLand: boolean;
  orbitalPhase: number; // 0..1
}

/** A point within TERMINATOR_STATE_THRESHOLD of the terminator (by proximity) reads as "twilight" rather than a hard day/night flip. */
const TERMINATOR_STATE_THRESHOLD = 0.5;

export function resolveSolarState(isDaylight: boolean, terminatorProximity: number): SolarState {
  if (terminatorProximity >= TERMINATOR_STATE_THRESHOLD) return 'twilight';
  return isDaylight ? 'day' : 'night';
}

/**
 * Pure function: the resolved orbital telemetry in, the drone's continuous
 * synthesis parameters out — this project's analog of Fault-Line's
 * mapUnrestToParams. Every field the background layer sounds like is
 * decided here, not scattered through the audio engine.
 */
export function mapTelemetryToParams(input: TelemetryInput): OrbitalParams {
  const state = resolveSolarState(input.isDaylight, input.terminatorProximity);
  const color = colorForState(state, clamp(input.terminatorProximity));
  const speedFraction = clamp((input.groundSpeedKmh ?? 0) / MAX_PLAUSIBLE_GROUND_SPEED_KMH);

  return {
    droneDensity: clamp(0.25 + crewWarmth(input.crewCount) * 0.5 + (input.overLand ? 0.15 : 0)),
    layerCount: crewCountToLayers(input.crewCount),
    brightness: color.brightness,
    filterCutoffHz: lerp(400, 3200, color.brightness),
    filterResonance: lerp(0.7, 4, input.terminatorProximity),
    driftRate: lerp(0.05, 0.6, speedFraction),
    rootSemitone: rootSemitoneForPhase(input.orbitalPhase),
    warmth: color.warmth * (input.overLand ? 1 : 0.7),
    vignette: clamp(1 - color.brightness),
    state,
    orbitalPhase: ((input.orbitalPhase % 1) + 1) % 1,
  };
}

const SUNRISE_TONE_HZ = 523.25; // C5 — bright, rising
const SUNSET_TONE_HZ = 261.63; // C4 — an octave down, settling

/**
 * Pure function: a detected/predicted terminator crossing in, its swell
 * synthesis parameters out. Sunrise and sunset are deliberately an octave
 * apart rather than differently-voiced chords — the same event, heard from
 * opposite directions.
 */
export function mapCrossingToTriggerParams(direction: 'sunrise' | 'sunset'): CrossingTriggerParams {
  return {
    amplitude: 0.75,
    direction,
    toneHz: direction === 'sunrise' ? SUNRISE_TONE_HZ : SUNSET_TONE_HZ,
  };
}
