import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { validateLoad, type Vehicle } from '@shadrin-v/engine';
import { ERP_API_PREFIX, FrappeDataProvider, toApiError } from './FrappeDataProvider';
import { erpErrorKey } from '../erp/erpErrors';
import { orderStateFromZone, toCargo } from '../screens/setup/setupState';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts/fixtures/erp-v1');
const readFixture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));

const ok = (message: unknown, status = 200) => new Response(JSON.stringify({ message }), { status });
const bare = (status: number, body = '{"exc_type":"PermissionError"}') => new Response(body, { status });
const SESSION = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 'tok-1', appVersion: '0.21.567' };
const API = '/api/method/schaefer_erp.ladungsplaner.api.';

describe('FrappeDataProvider — транспорт (контракт §1)', () => {
  it('адресный префикс — ровно тот, что в контракте §1 и §7', () => {
    expect(ERP_API_PREFIX).toBe(API);
  });

  it('session: точный адрес и same-origin', async () => {
    const f = vi.fn().mockResolvedValue(ok(SESSION));
    await new FrappeDataProvider({ fetchImpl: f }).session();
    expect(f).toHaveBeenCalledWith(API + 'sitzung', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('GET: метод, Accept, без тела и без CSRF', async () => {
    const f = vi.fn().mockResolvedValue(ok(SESSION));
    await new FrappeDataProvider({ fetchImpl: f }).session();
    const [, init] = f.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.headers['X-Frappe-CSRF-Token']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('session: язык вне de/ru → de; кривой ответ → ERR_BAD_RESPONSE', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ ...SESSION, language: 'pl' })).mockResolvedValueOnce(ok({ user: 'x' }));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await expect(dp.session()).resolves.toMatchObject({ language: 'de', user: 'anna@firma.de' });
    await expect(dp.session()).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
  });

  it('loadTrip отдаёт образец контракта', async () => {
    const fx = readFixture('reise-LKW-2026-00412.json');
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fx)));
    await expect(new FrappeDataProvider({ fetchImpl: f }).loadTrip(' LKW-2026-00412 ')).resolves.toEqual(fx.message);
    expect(f.mock.calls[0][0]).toBe(API + 'reise?name=LKW-2026-00412');
  });

  it('loadTrip кодирует имя строкой запроса', async () => {
    const fx = readFixture('reise-LKW-2026-00412.json');
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fx)));
    await new FrappeDataProvider({ fetchImpl: f }).loadTrip('LKW 1&x=2');
    const u = new URL(f.mock.calls[0][0], 'http://x');
    expect(u.pathname).toBe(API + 'reise');
    expect([...u.searchParams.entries()]).toEqual([['name', 'LKW 1&x=2']]);
  });

  // Ответ сервера — свежий Response на каждый вызов: тело читается один раз.
  it('importLines: тело {lineRefs}, CSRF из sitzung, второй POST без нового sitzung, токена нет в хранилищах', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockImplementation(() => Promise.resolve(ok([])));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await dp.importLines(['a1b2c3d4e5']); await dp.importLines(['f6g7h8i9j0']);
    expect(f).toHaveBeenCalledTimes(3);
    const [url, init] = f.mock.calls[1];
    expect(url).toBe(API + 'positionen');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Frappe-CSRF-Token']).toBe('tok-1');
    expect(JSON.parse(init.body)).toEqual({ lineRefs: ['a1b2c3d4e5'] });
    expect(f.mock.calls[2][1].headers['X-Frappe-CSRF-Token']).toBe('tok-1');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('tok-1');
  });

  it('токен из явного session() используется POST-ом без лишнего sitzung', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok([]));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await dp.session();
    await dp.importLines(['a1']);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][1].headers['X-Frappe-CSRF-Token']).toBe('tok-1');
  });
});

describe('FrappeDataProvider — сессия и отказы (контракт §1, §5)', () => {
  it('403 с кодом из образца → отказ по правам, без перепроверки сессии', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(readFixture('fehler-ERR_FORBIDDEN.json')), { status: 403 }));
    await expect(new FrappeDataProvider({ fetchImpl: f }).loadTrip('X')).rejects.toEqual({ code: 'ERR_FORBIDDEN', details: { doctype: 'Purchase Order' } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('403 без кода, sitzung 401 → сессия истекла, onSessionExpired один раз', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(bare(403)).mockResolvedValueOnce(new Response(JSON.stringify({ message: { code: 'ERR_NOT_LOGGED_IN' } }), { status: 401 }));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).listOpenLines()).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f.mock.calls[1][0]).toBe(API + 'sitzung');
    expect(f).toHaveBeenCalledTimes(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('403 без кода, sitzung живой → общий отказ, не «сессия истекла»', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(bare(403)).mockResolvedValueOnce(ok(SESSION));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).listOpenLines()).rejects.toEqual({ code: 'ERR_HTTP', details: { status: 403 } });
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('403 без кода, sitzung сам не ответил → общий отказ', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(bare(403)).mockResolvedValueOnce(bare(502, '<html>'));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).loadTrip('X')).rejects.toEqual({ code: 'ERR_HTTP', details: { status: 403 } });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('403 без кода на POST → та же перепроверка сессии', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockResolvedValueOnce(bare(403))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).importLines(['a1'])).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f.mock.calls[2][0]).toBe(API + 'sitzung');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('403 без кода от самого sitzung → общий отказ, без второго sitzung', async () => {
    const f = vi.fn().mockResolvedValueOnce(bare(403));
    await expect(new FrappeDataProvider({ fetchImpl: f }).session()).rejects.toEqual({ code: 'ERR_HTTP', details: { status: 403 } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('устаревший CSRF: 400 без кода → новый sitzung, один повтор с новым токеном', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockResolvedValueOnce(bare(400, '{"exc_type":"CSRFTokenError"}'))
      .mockResolvedValueOnce(ok({ ...SESSION, csrfToken: 'tok-2' }))
      .mockResolvedValueOnce(ok([]));
    await expect(new FrappeDataProvider({ fetchImpl: f }).importLines(['a1'])).resolves.toEqual([]);
    expect(f.mock.calls[2][0]).toBe(API + 'sitzung');
    expect(f.mock.calls[3][0]).toBe(API + 'positionen');
    expect(f.mock.calls[3][1].headers['X-Frappe-CSRF-Token']).toBe('tok-2');
    expect(JSON.parse(f.mock.calls[3][1].body)).toEqual({ lineRefs: ['a1'] });
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('устаревший CSRF дважды → общий сбой, третьей попытки нет', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(bare(400)).mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(bare(400));
    await expect(new FrappeDataProvider({ fetchImpl: f }).importLines(['a1'])).rejects.toEqual({ code: 'ERR_HTTP', details: { status: 400 } });
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('устаревший CSRF, а sitzung за новым токеном ответил 401 → сессия истекла, повтора нет', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockResolvedValueOnce(bare(400))
      .mockResolvedValueOnce(new Response('<html>', { status: 401 }));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).importLines(['a1'])).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f).toHaveBeenCalledTimes(3);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('400 С кодом на POST — отказ по вводу, без повтора', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { code: 'ERR_VALIDATION', details: { field: 'lineRefs' } } }), { status: 400 }));
    await expect(new FrappeDataProvider({ fetchImpl: f }).importLines(['a1'])).rejects.toEqual({ code: 'ERR_VALIDATION', details: { field: 'lineRefs' } });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('400 без кода на GET — не CSRF: общий сбой без повтора', async () => {
    const f = vi.fn().mockResolvedValueOnce(bare(400));
    await expect(new FrappeDataProvider({ fetchImpl: f }).loadTrip('X')).rejects.toEqual({ code: 'ERR_HTTP', details: { status: 400 } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('POST без токена, а sitzung ответил 401 → сессия истекла, POST не отправлен', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).importLines(['a1'])).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('401 с HTML → ERR_NOT_LOGGED_IN и один вызов onSessionExpired', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValue(new Response('<html>', { status: 401 }));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).session()).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('401 на любом методе → ERR_NOT_LOGGED_IN без перепроверки', async () => {
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(new FrappeDataProvider({ fetchImpl: f, onSessionExpired }).loadTrip('X')).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('502 HTML → ERR_HTTP; кривой 200 → ERR_BAD_RESPONSE', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(bare(502, '<html>Bad Gateway</html>'))
      .mockResolvedValueOnce(ok({ tripId: 5, zones: [] }))
      .mockResolvedValueOnce(new Response('{"data": {}}'))
      .mockResolvedValueOnce(new Response('<html>'))
      .mockResolvedValueOnce(ok([{ lineRef: 'a1' }]))
      .mockResolvedValueOnce(ok({ zones: 'x' }));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await expect(dp.loadTrip('X')).rejects.toEqual({ code: 'ERR_HTTP', details: { status: 502 } });
    await expect(dp.loadTrip('X')).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
    await expect(dp.loadTrip('X')).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
    await expect(dp.loadTrip('X')).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
    await expect(dp.listOpenLines()).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
    await expect(dp.listOpenLines()).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
  });

  it('неизвестный код в настоящем ответе → общий текст по erpErrorKey, следующий запрос проходит', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { code: 'ERR_SOMETHING_NEW', details: {} } }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(readFixture('reise-LKW-2026-00412.json'))));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    const err = await dp.loadTrip('X').catch((e) => e);
    expect(err).toEqual({ code: 'ERR_SOMETHING_NEW', details: {} });
    expect(erpErrorKey(err)).toBe('erp.error.generic');
    await expect(dp.loadTrip('LKW-2026-00412')).resolves.toMatchObject({ tripId: 'LKW-2026-00412' });
  });
});

describe('toApiError — чистое отображение ответа', () => {
  it('401 при любом теле; код из message; иначе ERR_HTTP со статусом', () => {
    expect(toApiError(401, undefined)).toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(toApiError(401, { message: { code: 'ERR_FORBIDDEN' } })).toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(toApiError(404, { message: { code: 'ERR_TRIP_NOT_FOUND', details: {} } })).toEqual({ code: 'ERR_TRIP_NOT_FOUND', details: {} });
    expect(toApiError(404, { message: { code: 'ERR_LINE_NOT_FOUND' } })).toEqual({ code: 'ERR_LINE_NOT_FOUND' });
    expect(toApiError(403, { message: { code: 'ERR_FORBIDDEN', details: 'x' } })).toEqual({ code: 'ERR_FORBIDDEN' });
    expect(toApiError(403, { exc_type: 'PermissionError' })).toEqual({ code: 'ERR_HTTP', details: { status: 403 } });
    expect(toApiError(500, { message: 'Internal' })).toEqual({ code: 'ERR_HTTP', details: { status: 500 } });
    expect(toApiError(500, { message: { code: 7 } })).toEqual({ code: 'ERR_HTTP', details: { status: 500 } });
    expect(toApiError(502, null)).toEqual({ code: 'ERR_HTTP', details: { status: 502 } });
  });
});

describe('FrappeDataProvider — данные (контракт §2–§4)', () => {
  it('sourceQuantity: null в ответе reise нормализуется в отсутствие, дробное число и quantity — как пришли', async () => {
    const trip = { tripId: 'LKW-1', zones: [{ orderId: 'PUR-ORD-1', positions: [
      { itemCode: 'M', itemName: 'M', quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES', sourceQuantity: null },
      { itemCode: 'P', itemName: 'P', quantity: 2598, uom: 'Nos', dimensionsSource: 'manual', sourceQuantity: 2597.361 } ] }] };
    const f = vi.fn().mockResolvedValue(ok(trip));
    const got = await new FrappeDataProvider({ fetchImpl: f }).loadTrip('LKW-1');
    expect('sourceQuantity' in got.zones[0].positions[0]).toBe(false);
    expect(got.zones[0].positions[1]).toMatchObject({ quantity: 2598, sourceQuantity: 2597.361, uom: 'Nos' });
  });

  it('positionen: зоны прошли проверку и нормализацию', async () => {
    const zones = [{ orderId: 'PUR-ORD-1', partner: 'Muster', positions: [
      { itemCode: 'M', itemName: 'M', quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES', sourceQuantity: null, lineRef: 'a1' } ] }];
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok(zones)).mockResolvedValueOnce(ok([{ orderId: '' , positions: [] }]));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    const got = await dp.importLines(['a1']);
    expect(got).toEqual([{ orderId: 'PUR-ORD-1', partner: 'Muster', positions: [
      { itemCode: 'M', itemName: 'M', quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES', lineRef: 'a1' } ] }]);
    await expect(dp.importLines(['a1'])).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
  });

  it('bestellpositionen: строки отдаются как пришли', async () => {
    const lines = [
      { lineRef: 'a1', orderId: 'PUR-ORD-1', itemCode: 'H', itemName: 'H', openQuantity: 12.4, uom: 'Cubic Meter', placeable: false, reason: 'ERR_LINE_UNIT_NOT_PIECES' },
      { lineRef: 'a2', orderId: 'PUR-ORD-1', itemCode: 'P', itemName: 'P', openQuantity: null, uom: 'Nos', placeable: false, reason: 'ERR_LINE_QTY_UNKNOWN' },
    ];
    const f = vi.fn().mockResolvedValue(ok(lines));
    await expect(new FrappeDataProvider({ fetchImpl: f }).listOpenLines()).resolves.toEqual(lines);
    expect(f.mock.calls[0][0]).toBe(API + 'bestellpositionen');
  });

  // Правила упаковки с позицией сторожа пакета contracts проверяют только как объект. Провайдер
  // оставляет из них лишь допустимые значения: кривое правило не роняет страницу и не даёт груза,
  // который движок отклонит без понятного сообщения.
  it('кривые правила и шаги позиции отбрасываются поштучно, допустимые остаются', async () => {
    const trip = { tripId: 'LKW-1', zones: [{ orderId: 'PUR-ORD-1', positions: [
      { itemCode: 'P', itemName: 'P', quantity: 10, uom: 'Nos', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog',
        nestStepPairwise: '22', nestStepSequential: 40,
        rules: { state: 'kaputt', nestingMode: 'pairwise', rotation: 42, maxTiers: '5', maxNested: 3, allowUnpairedTop: 'yes',
          forkAccess: 'twoSides', forkAxis: 'diagonal', extra: { a: 1 } } },
      { itemCode: 'Q', itemName: 'Q', quantity: 4, uom: 'Nos', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog',
        nestStepPairwise: -3, rules: { state: null, maxTiers: 0, maxNested: 2.5 } },
      { itemCode: 'R', itemName: 'R', quantity: 4, uom: 'Nos', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog',
        rules: { state: 'verschachtelt', nestingMode: 'sequential', rotation: 'full', maxTiers: 4, allowUnpairedTop: false, forkAxis: 'width' } },
    ] }] };
    const f = vi.fn().mockResolvedValue(ok(trip));
    const got = await new FrappeDataProvider({ fetchImpl: f }).loadTrip('LKW-1');
    const [p, q, r] = got.zones[0].positions;
    expect(p.rules).toEqual({ nestingMode: 'pairwise', maxNested: 3, forkAccess: 'twoSides' });
    expect('nestStepPairwise' in p).toBe(false);
    expect(p.nestStepSequential).toBe(40);
    expect('rules' in q).toBe(false);
    expect('nestStepPairwise' in q).toBe(false);
    expect(r.rules).toEqual({ state: 'verschachtelt', nestingMode: 'sequential', rotation: 'full', maxTiers: 4, allowUnpairedTop: false, forkAxis: 'width' });

    // Сквозная проверка: после экранной адаптации груз принимается движком без ошибок.
    const vehicle: Vehicle = { id: 'v', name: 'LKW', length: 13600, width: 2480, height: 2700 };
    const order = orderStateFromZone(got.zones[0], 0);
    const cargo = order.positions.map((pos) => toCargo(pos, order.orderId));
    expect(validateLoad({ vehicle, cargo })).toEqual([]);
  });

  it('rules не объект → ERR_BAD_RESPONSE (сторож контракта), страница не падает', async () => {
    const trip = { tripId: 'LKW-1', zones: [{ orderId: 'PUR-ORD-1', positions: [
      { itemCode: 'P', itemName: 'P', quantity: 1, dimensionsSource: 'manual', rules: 'pairwise' } ] }] };
    const f = vi.fn().mockResolvedValue(ok(trip));
    await expect(new FrappeDataProvider({ fetchImpl: f }).loadTrip('LKW-1')).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
  });
});

describe('FrappeDataProvider — границы ввода (контракт §4 п. 7–8)', () => {
  it('границы ввода: пустой, длинный и с повтором список; длинный запрос; кривая дата; большой limit', async () => {
    const f = vi.fn().mockResolvedValue(ok([]));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await expect(dp.importLines([])).rejects.toMatchObject({ code: 'ERR_VALIDATION', details: { field: 'lineRefs' } });
    await expect(dp.importLines(Array.from({ length: 201 }, (_, i) => `l${i}`))).rejects.toMatchObject({ code: 'ERR_VALIDATION' });
    await expect(dp.importLines(['a1', 'a1'])).rejects.toMatchObject({ code: 'ERR_VALIDATION', details: { field: 'lineRefs' } });
    await expect(dp.listOpenLines({ dueBefore: '25.11.2026' })).rejects.toMatchObject({ code: 'ERR_VALIDATION', details: { field: 'dueBefore' } });
    expect(f).not.toHaveBeenCalled();
    await dp.listOpenLines({ query: 'x'.repeat(200), dueBefore: '2026-11-25', limit: 999 });
    const u = new URL(f.mock.calls[0][0], 'http://x');
    expect(u.searchParams.get('query')).toHaveLength(140);
    expect(u.searchParams.get('dueBefore')).toBe('2026-11-25');
    expect(u.searchParams.get('limit')).toBe('200');
  });

  it('loadTrip с пустым именем → ERR_VALIDATION name, без запроса', async () => {
    const f = vi.fn();
    await expect(new FrappeDataProvider({ fetchImpl: f }).loadTrip('   ')).rejects.toEqual({ code: 'ERR_VALIDATION', details: { field: 'name' } });
    expect(f).not.toHaveBeenCalled();
  });

  it('listOpenLines: пустые query/dueBefore и отсутствующий limit не передаются; limit снизу — 1; 200 строк — можно', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(ok([])));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await dp.listOpenLines({ query: '   ', dueBefore: '' });
    expect(f.mock.calls[0][0]).toBe(API + 'bestellpositionen');
    await dp.listOpenLines({ query: '  PUR-ORD ', limit: 0 });
    const u = new URL(f.mock.calls[1][0], 'http://x');
    expect([...u.searchParams.entries()]).toEqual([['query', 'PUR-ORD'], ['limit', '1']]);
    await dp.listOpenLines({ dueBefore: '2026-1-25' }).catch(() => undefined);
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok([]));
    await expect(new FrappeDataProvider({ fetchImpl: g }).importLines(Array.from({ length: 200 }, (_, i) => `l${i}`))).resolves.toEqual([]);
    expect(JSON.parse(g.mock.calls[1][1].body).lineRefs).toHaveLength(200);
  });
});

describe('FrappeDataProvider — каталог и неподдерживаемое', () => {
  const ARTICLE = {
    itemCode: 'HAN0412', name: 'Einwegpalette 1200x800', length: 1200, width: 800, height: 144,
    rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    source: 'erp', updatedAt: '2026-11-22T10:00:00Z', erpFields: ['name'],
  };

  it('searchArticles → artikel_suchen?query= (≤ 140)', async () => {
    const f = vi.fn().mockResolvedValue(ok([ARTICLE]));
    await expect(new FrappeDataProvider({ fetchImpl: f }).searchArticles(' ' + 'y'.repeat(150))).resolves.toEqual([ARTICLE]);
    const u = new URL(f.mock.calls[0][0], 'http://x');
    expect(u.pathname).toBe(API + 'artikel_suchen');
    expect(u.searchParams.get('query')).toBe('y'.repeat(140));
  });

  it('searchArticles: правила артикула чистятся так же; запись без itemCode → ERR_BAD_RESPONSE', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok([{ ...ARTICLE, nestStepPairwise: 0, rules: { ...ARTICLE.rules, rotation: 'sideways', maxTiers: '3' } }]))
      .mockResolvedValueOnce(ok([{ name: 'x', rules: {}, erpFields: [] }]));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    const [a] = await dp.searchArticles('HAN');
    expect(a.rules).toEqual({ state: 'entschachtelt', nestingMode: 'pairwise' });
    expect('nestStepPairwise' in a).toBe(false);
    await expect(dp.searchArticles('x')).rejects.toEqual({ code: 'ERR_BAD_RESPONSE' });
  });

  it('upsertArticle → POST artikel_speichern {article}, только поля ArticleInput', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok(ARTICLE));
    const input = {
      itemCode: 'HAN0412', name: 'Einwegpalette 1200x800', length: 1200, width: 800, height: 144, nestStepPairwise: 22,
      rules: { state: 'entschachtelt' as const, nestingMode: 'pairwise' as const, rotation: 'yawOnly' as const },
    };
    await expect(new FrappeDataProvider({ fetchImpl: f }).upsertArticle({ ...input, source: 'erp' } as typeof input)).resolves.toEqual(ARTICLE);
    const [url, init] = f.mock.calls[1];
    expect(url).toBe(API + 'artikel_speichern');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Frappe-CSRF-Token']).toBe('tok-1');
    expect(JSON.parse(init.body)).toEqual({ article: input });
  });

  it('importOrder в ERP не поддерживается и в сеть не ходит', async () => {
    const f = vi.fn();
    await expect(new FrappeDataProvider({ fetchImpl: f }).importOrder('X')).rejects.toEqual({ code: 'ERR_UNSUPPORTED' });
    expect(f).not.toHaveBeenCalled();
  });

  it('прочие методы обычной сборки — ERR_UNSUPPORTED без запроса', async () => {
    const f = vi.fn();
    const dp = new FrappeDataProvider({ fetchImpl: f });
    const vehicle = { id: 'v', name: 'LKW', length: 13600, width: 2480, height: 2700 };
    const calls = [
      () => dp.listVehicles(), () => dp.upsertVehicle(vehicle), () => dp.listLoadingPlans(),
      () => dp.getLoadingPlan('p1'), () => dp.searchOrders('x'),
      () => dp.saveLoadingPlan({} as Parameters<FrappeDataProvider['saveLoadingPlan']>[0]),
    ];
    for (const call of calls) await expect(call()).rejects.toEqual({ code: 'ERR_UNSUPPORTED' });
    expect(f).not.toHaveBeenCalled();
  });
});

// Контракт §1, «Смена пользователя»: на общем компьютере экран прежнего сотрудника не пишет в ERP
// от имени нового. Ответы — настоящие `Response`, свежие на каждый вызов.
describe('FrappeDataProvider — смена пользователя (контракт §1)', () => {
  const BORIS = { ...SESSION, user: 'boris@firma.de', fullName: 'Boris Beispiel', csrfToken: 'tok-boris' };
  const CHANGED = { code: 'ERR_SESSION_CHANGED' };

  it('устаревший CSRF, а sitzung отдал другого пользователя → второго POST нет, токен не заменён, колбэк один раз', async () => {
    const onSessionChanged = vi.fn();
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockResolvedValueOnce(bare(400, '{"exc_type":"CSRFTokenError"}'))
      .mockResolvedValueOnce(ok(BORIS))
      .mockImplementation(() => Promise.resolve(ok([])));
    const dp = new FrappeDataProvider({ fetchImpl: f, onSessionChanged });
    await dp.session();
    await expect(dp.importLines(['a1'])).rejects.toEqual(CHANGED);
    const posts = f.mock.calls.filter(([, init]) => init.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][1].headers['X-Frappe-CSRF-Token']).toBe('tok-1');
    expect(f.mock.calls.some(([, init]) => init.headers['X-Frappe-CSRF-Token'] === 'tok-boris')).toBe(false);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
  });

  it('403 без кода, перепроверка отдала другого пользователя → смена сессии, а не общий отказ', async () => {
    const onSessionChanged = vi.fn();
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(bare(403)).mockResolvedValueOnce(ok(BORIS));
    const dp = new FrappeDataProvider({ fetchImpl: f, onSessionChanged, onSessionExpired });
    await dp.session();
    await expect(dp.listOpenLines()).rejects.toEqual(CHANGED);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('явная перепроверка session() с другим пользователем → отказ, а провайдер закрыт: дальше в сеть не ходит', async () => {
    const onSessionChanged = vi.fn();
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok(BORIS)).mockImplementation(() => Promise.resolve(ok([])));
    const dp = new FrappeDataProvider({ fetchImpl: f, onSessionChanged });
    await dp.session();
    await expect(dp.session()).rejects.toEqual(CHANGED);
    await expect(dp.importLines(['a1'])).rejects.toEqual(CHANGED);
    await expect(dp.loadTrip('LKW-1')).rejects.toEqual(CHANGED);
    await expect(dp.session()).rejects.toEqual(CHANGED);
    expect(f).toHaveBeenCalledTimes(2);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
  });

  it('GET, начатый во время перепроверки сессии, при смене пользователя в сеть не уходит', async () => {
    const onSessionChanged = vi.fn();
    let answerRecheck: (r: Response) => void = () => {};
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockImplementationOnce(() => new Promise<Response>((r) => { answerRecheck = r; }))
      .mockImplementation(() => Promise.resolve(ok([])));
    const dp = new FrappeDataProvider({ fetchImpl: f, onSessionChanged });
    await dp.session();
    const recheck = dp.session(); // возврат во вкладку: sitzung ещё не ответил
    const lines = dp.listOpenLines();
    const trip = dp.loadTrip('LKW-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(f).toHaveBeenCalledTimes(2); // пока идёт перепроверка — ни одного нового запроса
    answerRecheck(ok(BORIS));
    await expect(recheck).rejects.toEqual(CHANGED);
    await expect(lines).rejects.toEqual(CHANGED);
    await expect(trip).rejects.toEqual(CHANGED);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls.map(([url]) => url)).toEqual([API + 'sitzung', API + 'sitzung']);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
  });

  it('GET, начатый во время перепроверки, при том же пользователе уходит после её ответа', async () => {
    let answerRecheck: (r: Response) => void = () => {};
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION))
      .mockImplementationOnce(() => new Promise<Response>((r) => { answerRecheck = r; }))
      .mockImplementation(() => Promise.resolve(ok([])));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await dp.session();
    const recheck = dp.session();
    const lines = dp.listOpenLines();
    await Promise.resolve();
    await Promise.resolve();
    expect(f).toHaveBeenCalledTimes(2);
    answerRecheck(ok({ ...SESSION, csrfToken: 'tok-2' }));
    await expect(recheck).resolves.toMatchObject({ user: SESSION.user });
    await expect(lines).resolves.toEqual([]);
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[2][0]).toBe(API + 'bestellpositionen');
  });

  it('тот же пользователь при перепроверке — как раньше: новый токен берётся', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(ok({ ...SESSION, csrfToken: 'tok-2' })).mockResolvedValueOnce(ok([]));
    const dp = new FrappeDataProvider({ fetchImpl: f });
    await dp.session();
    await dp.session();
    await dp.importLines(['a1']);
    expect(f.mock.calls[2][1].headers['X-Frappe-CSRF-Token']).toBe('tok-2');
  });

  it('close(): запоздавший вызов в сеть не уходит; цепочка, начатая до закрытия, не шлёт POST после него', async () => {
    let answerSitzung: (r: Response) => void = () => {};
    const onSessionExpired = vi.fn();
    const f = vi.fn().mockImplementationOnce(() => new Promise<Response>((r) => { answerSitzung = r; }));
    const dp = new FrappeDataProvider({ fetchImpl: f, onSessionExpired });
    const inFlight = dp.importLines(['a1']); // сначала sitzung за токеном, потом POST
    dp.close('expired');
    answerSitzung(ok(SESSION));
    await expect(inFlight).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    await expect(dp.listOpenLines()).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled(); // закрытие не порождает новый сигнал
  });
});
