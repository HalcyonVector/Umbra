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

describe('presets API', () => {
  it('starts empty', async () => {
    const res = await request(app).get('/api/presets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates and lists a preset', async () => {
    const create = await request(app)
      .post('/api/presets')
      .send({ name: 'wide-band', params: { crossingSensitivityDeg: 10 } });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe('wide-band');

    const list = await request(app).get('/api/presets');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('wide-band');
  });

  it('overwrites a preset saved again under the same name', async () => {
    await request(app).post('/api/presets').send({ name: 'wide-band', params: { crossingSensitivityDeg: 12 } });
    const list = await request(app).get('/api/presets');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].params.crossingSensitivityDeg).toBe(12);
  });

  it('rejects an invalid body', async () => {
    const res = await request(app).post('/api/presets').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('deletes a preset', async () => {
    const del = await request(app).delete('/api/presets/wide-band');
    expect(del.status).toBe(204);
    const list = await request(app).get('/api/presets');
    expect(list.body).toEqual([]);
  });

  it('404s deleting a preset that does not exist', async () => {
    const res = await request(app).delete('/api/presets/does-not-exist');
    expect(res.status).toBe(404);
  });
});
