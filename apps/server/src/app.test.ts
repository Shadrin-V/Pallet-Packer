import { describe, it, expect } from 'vitest';
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
});
