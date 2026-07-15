import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app;
let tmpDir;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'umbra-presets-'));
  process.env.PRESETS_DATA_FILE = path.join(tmpDir, 'presets.json');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

afterAll(() => {
  delete process.env.PRESETS_DATA_FILE;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('presets API (saved observer locations)', () => {
  it('starts empty', async () => {
    const res = await request(app).get('/api/presets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates and lists a saved location', async () => {
    const create = await request(app)
      .post('/api/presets')
      .send({ name: 'Home', params: { lat: 40.7128, lon: -74.006 } });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe('Home');

    const list = await request(app).get('/api/presets');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Home');
  });

  it('overwrites a location saved again under the same name', async () => {
    await request(app).post('/api/presets').send({ name: 'Home', params: { lat: 51.5074, lon: -0.1278 } });
    const list = await request(app).get('/api/presets');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].params.lat).toBe(51.5074);
  });

  it('rejects an invalid body', async () => {
    const res = await request(app).post('/api/presets').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('deletes a saved location', async () => {
    const del = await request(app).delete('/api/presets/Home');
    expect(del.status).toBe(204);
    const list = await request(app).get('/api/presets');
    expect(list.body).toEqual([]);
  });

  it('404s deleting a location that does not exist', async () => {
    const res = await request(app).delete('/api/presets/does-not-exist');
    expect(res.status).toBe(404);
  });
});
