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

function mockIssResponse(lat = '35.6895', lon = '139.6917', timestamp = 1750000000) {
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

describe('GET /api/iss', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes Open Notify\'s string lat/lon into numbers, with an ms timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockIssResponse()));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.position).toEqual({ lat: 35.6895, lon: 139.6917, timestampMs: 1750000000000 });
  });

  it('serves a cached response on the next request without calling fetch again', async () => {
    const fetchMock = vi.fn(async () => mockIssResponse());
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    const first = await request(app).get('/api/iss');
    expect(first.body.cached).toBe(false);

    const second = await request(app).get('/api/iss');
    expect(second.body.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when the upstream feed fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('iss_unavailable');
  });

  it('returns 502 (rather than crashing) on a malformed position', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ timestamp: 1750000000, iss_position: { latitude: 'not-a-number', longitude: '10' } }),
    })));
    const app = await freshApp();

    const res = await request(app).get('/api/iss');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('iss_unavailable');
  });
});
