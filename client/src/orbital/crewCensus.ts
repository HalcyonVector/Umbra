const MAX_CREW_LAYERS = 6;

/**
 * How many aboard right now (from GET /api/astros, not limited to the ISS —
 * see the README's Honest Limitations section) maps directly to how many
 * simultaneous drone voices are active: a literal sonic census. Clamped to
 * at least 1 (the drone never goes fully silent from a feed hiccup) and at
 * most MAX_CREW_LAYERS (the engine's oscillator pool size).
 */
export function crewCountToLayers(crewCount: number): number {
  if (!Number.isFinite(crewCount)) return 1;
  return Math.max(1, Math.min(MAX_CREW_LAYERS, Math.round(crewCount)));
}

/** More people aboard reads as a fuller, warmer choir-like texture; scales 0..1 across the plausible crew-size range. */
export function crewWarmth(crewCount: number, maxExpectedCrew: number = MAX_CREW_LAYERS): number {
  if (!Number.isFinite(crewCount) || maxExpectedCrew <= 0) return 0.3;
  return Math.max(0, Math.min(1, crewCount / maxExpectedCrew));
}
