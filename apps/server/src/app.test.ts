import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app';

describe('server app', () => {
  it('answers GET /api/health with ok + contract version', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    expect(typeof res.json().contract).toBe('string');
    await app.close();
  });

  it('serves index.html for a non-API route when staticDir is configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ladungsplaner</title>');
    const app = buildApp({ staticDir: dir });
    const res = await app.inject({ method: 'GET', url: '/some/client/route' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Ladungsplaner');
    await app.close();
  });

  it('returns JSON 404 for unknown /api routes when staticDir is configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ladungsplaner</title>');
    const app = buildApp({ staticDir: dir });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
    await app.close();
  });
});
