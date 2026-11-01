import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

function mockPrimaryResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      number: 2,
      iss_expedition: 73,
      people: [
        { name: 'Test Astronaut One', agency: 'NASA', position: 'Commander', spacecraft: 'Crew Dragon', iss: true, country: 'United States' },
        { name: 'Test Astronaut Two', agency: 'CMSA', position: 'Flight Engineer', iss: false, country: 'China' },
      ],
    }),
  };
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

  it('normalizes the detailed roster from the primary feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockPrimaryResponse()));
    const app = await freshApp();

    const res = await request(app).get('/api/astros');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.expedition).toBe(73);
    expect(res.body.source).toBe('people-in-space');
    expect(res.body.people[0]).toEqual({ name: 'Test Astronaut One', craft: 'Crew Dragon', agency: 'NASA', role: 'Commander', country: 'United States' });
    expect(res.body.people[1].craft).toBe('Unknown');
  });

  it('falls back to Open Notify when the primary roster is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => ({ ok: false, status: 404 }))
      .mockImplementationOnce(async () => mockAstrosResponse());
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    const res = await request(app).get('/api/astros');
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.count).toBe(7);
    expect(res.body.people).toHaveLength(2);
    expect(res.body.people[0]).toEqual({ name: 'Test Astronaut One', craft: 'ISS', agency: null, role: null, country: null });
    expect(res.body.source).toBe('open-notify');
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
