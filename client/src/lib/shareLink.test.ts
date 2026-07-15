import { describe, it, expect } from 'vitest';
import { encodeShareParams, decodeShareParams } from './shareLink';

describe('encodeShareParams / decodeShareParams', () => {
  it('round-trips a valid config', () => {
    const config = { lat: 51.5074, lon: -0.1278, minElevationDeg: 15 };
    expect(decodeShareParams(encodeShareParams(config))).toEqual(config);
  });

  it('rejects garbage input without throwing', () => {
    expect(decodeShareParams('not-valid-base64!!!')).toBeNull();
  });

  it('rejects a decoded value missing the expected shape', () => {
    expect(decodeShareParams(encodeURIComponent(btoa(JSON.stringify({ foo: 'bar' }))))).toBeNull();
  });

  it('rejects an out-of-range latitude', () => {
    expect(decodeShareParams(encodeURIComponent(btoa(JSON.stringify({ lat: 999, lon: 0, minElevationDeg: 10 }))))).toBeNull();
  });
});
