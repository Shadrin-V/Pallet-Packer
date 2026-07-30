import { describe, it, expect, vi } from 'vitest';
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

  // LKWkalk-fvh: logger:false делал req.log.* no-op — сбой best-effort записи каталога при
  // импорте заказа (orders.ts) не оставлял на проде никакого следа. Логгер теперь настраиваемый:
  // index.ts включает настоящий pino (JSON в stdout — его читает Coolify), тесты и buildApp()
  // по умолчанию остаются тихими.
  it('writes JSON log lines to the configured stream, so req.log is not a no-op', async () => {
    const lines: string[] = [];
    const stream = { write: (s: string) => void lines.push(s) };
    const app = buildApp({ logger: { level: 'info', stream } });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
    // Fastify логирует входящий запрос сам — если поток пуст, req.log снова no-op.
    expect(lines.length).toBeGreaterThan(0);
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first).toHaveProperty('level');
    expect(first).toHaveProperty('time');
  });

  it('stays silent by default — tests and local runs are unaffected', async () => {
    const write = vi.spyOn(process.stdout, 'write');
    const app = buildApp();
    await app.inject({ method: 'GET', url: '/api/health' });
    await app.close();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
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
