import { describe, it, expect } from 'vitest';
import { crossedMilestones } from './milestones';

describe('crossedMilestones', () => {
  it('returns thresholds strictly between the previous and new value', () => {
    expect(crossedMilestones(0, 1500, [1000, 5000, 10000])).toEqual([1000]);
  });

  it('returns multiple thresholds when several are crossed at once', () => {
    expect(crossedMilestones(500, 12000, [1000, 5000, 10000])).toEqual([1000, 5000, 10000]);
  });

  it('returns nothing when no threshold is crossed', () => {
    expect(crossedMilestones(200, 800, [1000, 5000])).toEqual([]);
  });

  it('does not re-fire a threshold already passed before prevValue', () => {
    expect(crossedMilestones(1500, 2000, [1000, 5000])).toEqual([]);
  });

  it('a threshold exactly equal to newValue counts as crossed', () => {
    expect(crossedMilestones(500, 1000, [1000])).toEqual([1000]);
  });

  it('a threshold exactly equal to prevValue does not re-fire', () => {
    expect(crossedMilestones(1000, 1500, [1000])).toEqual([]);
  });
});
