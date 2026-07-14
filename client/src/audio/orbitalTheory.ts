import type { SolarState } from '../types';

/**
 * Semitone intervals (from a shared drone root) for the current position in
 * the orbit. Unlike Fault-Line's tension-driven palette, this isn't reacting
 * to anything alarming — it's a slow four-stage modal wander that completes
 * once per real ISS orbit (see orbital/orbitalMechanics.ts's orbitalPhase),
 * giving the piece an actual musical arc tied to a real ~92.68-minute cycle
 * instead of looping arbitrarily.
 */
export function intervalPaletteForPhase(phase: number): number[] {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.25) return [0, 7, 12, 16]; // open: root, fifth, octave, major tenth
  if (p < 0.5) return [0, 5, 12, 17]; // drifting: a fourth creeps in
  if (p < 0.75) return [0, 3, 7, 12]; // cooler: minor third replaces the major color
  return [0, 7, 10, 12]; // resolving: a flat seventh pulls back toward the root
}

/**
 * A slow, continuous +-2.5 semitone breathing drift in the drone root,
 * completing one full cycle per orbit. Deliberately a smooth sine (not a
 * stepped function like intervalPaletteForPhase) so layered against the
 * four-stage palette it reads as one voice slowly bending under a chord that
 * changes underneath it, rather than two things moving in lockstep.
 */
export function rootSemitoneForPhase(phase: number): number {
  return 2.5 * Math.sin(2 * Math.PI * phase);
}

export interface StateColor {
  brightness: number; // 0..1
  warmth: number; // 0..1
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * How strongly the current day/night/twilight state should tint the drone:
 * daylight reads brighter and warmer, night reads dim and cool, and both
 * fold toward a neutral in-between the closer terminatorProximity gets to 1
 * — so the color itself starts shifting before the state label flips.
 */
export function colorForState(state: SolarState, terminatorProximity: number): StateColor {
  const p = clamp(terminatorProximity);
  switch (state) {
    case 'day':
      return { brightness: clamp(0.85 - p * 0.15), warmth: clamp(0.75 - p * 0.1) };
    case 'night':
      return { brightness: clamp(0.15 + p * 0.15), warmth: clamp(0.35 + p * 0.1) };
    case 'twilight':
    default:
      return { brightness: 0.5, warmth: 0.55 };
  }
}
