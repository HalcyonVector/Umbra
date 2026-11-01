import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

// The iss route keeps its cache in module-level state, so each test gets a
// fresh module instance (vi.resetModules + dynamic import) rather than
// sharing one cache across unrelated assertions.
async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

function mockOpenNotifyResponse(lat = '35.6895', lon = '139.6917', timestamp = 1750000000) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      timestamp,
      iss_position: { latitude: lat, longitude: lon },
      message: 'success',
    }),
  };
}

function mockPrimaryResponse(lat = 12.3, lon = 45.6, timestamp = 1750000500) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ latitude: lat, longitude: lon, timestamp, name: 'iss', altitude: 418.2, velocity: 27580.1, visibility: 'daylight' }),
  };
}

describe('GET /api/iss', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes wheretheiss.at into a position with real altitude and velocity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockPrimaryResponse()));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.position).toEqual({
      lat: 12.3, lon: 45.6, timestampMs: 1750000500000,
      altitudeKm: 418.2, velocityKmh: 27580.1, visibility: 'daylight', source: 'wheretheiss.at',
    });
  });

  it('falls back to Open Notify when wheretheiss.at is unreachable', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('wheretheiss unreachable');
      })
      .mockImplementationOnce(async () => mockOpenNotifyResponse());
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(200);
    expect(res.body.position).toEqual({
      lat: 35.6895, lon: 139.6917, timestampMs: 1750000000000,
      altitudeKm: null, velocityKmh: null, visibility: null, source: 'open-notify',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when both feeds are unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('iss_unavailable');
  });

  it('serves a cached response on the next request without calling fetch again', async () => {
    const fetchMock = vi.fn(async () => mockPrimaryResponse());
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    const first = await request(app).get('/api/iss');
    expect(first.body.cached).toBe(false);

    const second = await request(app).get('/api/iss');
    expect(second.body.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when both upstream feeds respond with errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('iss_unavailable');
  });

  it('returns 502 (rather than crashing) when every feed returns a malformed position', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ latitude: 'nope', timestamp: 1750000000, iss_position: { latitude: 'not-a-number', longitude: '10' } }),
    })));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('iss_unavailable');
  });
});
