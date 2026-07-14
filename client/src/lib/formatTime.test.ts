import { describe, it, expect } from 'vitest';
import { formatRelativeTime, formatDurationShort } from './formatTime';

describe('formatRelativeTime', () => {
  it('reads "just now" for very recent timestamps', () => {
    expect(formatRelativeTime(1000, 1000)).toBe('just now');
    expect(formatRelativeTime(0, 5000)).toBe('just now');
  });

  it('reads seconds for under a minute', () => {
    expect(formatRelativeTime(0, 30_000)).toBe('30s ago');
  });

  it('reads minutes for under an hour', () => {
    expect(formatRelativeTime(0, 5 * 60_000)).toBe('5m ago');
  });

  it('reads hours for under a day', () => {
    expect(formatRelativeTime(0, 3 * 3_600_000)).toBe('3h ago');
  });

  it('reads days beyond that', () => {
    expect(formatRelativeTime(0, 2 * 86_400_000)).toBe('2d ago');
  });

  it('never goes negative for a timestamp in the future', () => {
    expect(formatRelativeTime(10_000, 0)).toBe('just now');
  });
});

describe('formatDurationShort', () => {
  it('reads whole seconds under a minute', () => {
    expect(formatDurationShort(42_000)).toBe('42s');
  });

  it('reads minutes and seconds under an hour', () => {
    expect(formatDurationShort(12 * 60_000 + 5000)).toBe('12m 05s');
  });

  it('omits seconds when exactly on the minute', () => {
    expect(formatDurationShort(12 * 60_000)).toBe('12m');
  });

  it('reads hours and minutes beyond that', () => {
    expect(formatDurationShort(65 * 60_000)).toBe('1h 05m');
  });

  it('clamps negative durations to 0', () => {
    expect(formatDurationShort(-5000)).toBe('0s');
  });
});
