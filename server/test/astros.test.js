import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

function mockAstrosResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      number: 7,
      people: [
        { name: 'Test Astronaut One', craft: 'ISS' },
        { name: 'Test Astronaut Two', craft: 'ISS' },
      ],
      message: 'success',
    }),
  };
}

describe('GET /api/astros', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes the crew census', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockAstrosResponse()));
    const app = await freshApp();

    const res = await request(app).get('/api/astros');
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.count).toBe(7);
    expect(res.body.people).toHaveLength(2);
    expect(res.body.people[0]).toEqual({ name: 'Test Astronaut One', craft: 'ISS' });
  });

  it('serves a cached response on the next request without calling fetch again', async () => {
    const fetchMock = vi.fn(async () => mockAstrosResponse());
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    await request(app).get('/api/astros');
    const second = await request(app).get('/api/astros');
    expect(second.body.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when the upstream feed fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    const app = await freshApp();

    const res = await request(app).get('/api/astros');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('astros_unavailable');
  });
});
