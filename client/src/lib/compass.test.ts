import { describe, it, expect } from 'vitest';
import { compassLabel } from './compass';

describe('compassLabel', () => {
  it('maps cardinal and intercardinal azimuths', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(90)).toBe('E');
    expect(compassLabel(225)).toBe('SW');
    expect(compassLabel(337.5)).toBe('NNW');
  });

  it('wraps out-of-range and negative values', () => {
    expect(compassLabel(360)).toBe('N');
    expect(compassLabel(-90)).toBe('W');
    expect(compassLabel(725)).toBe('N');
  });
});
