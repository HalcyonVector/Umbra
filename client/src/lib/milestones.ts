export const DISTANCE_MILESTONES_KM = [1000, 5000, 10000, 25000, 50000, 100000, 150000, 200000, 300000, 400000, 500000];
export const COUNTRY_MILESTONES = [1, 5, 10, 20, 30, 50];
export const LAP_MILESTONES = [1, 5, 10, 25, 50, 100];

/** Which thresholds a value newly crossed going from `prevValue` to `newValue` — for session-milestone toasts, so a threshold only fires once, exactly when it's passed. */
export function crossedMilestones(prevValue: number, newValue: number, thresholds: number[]): number[] {
  return thresholds.filter((t) => prevValue < t && newValue >= t);
}
