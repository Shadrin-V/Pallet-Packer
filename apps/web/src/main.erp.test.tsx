// Точка входа сборки для ERP (`main.erp.tsx`, бид lp-erp-build) импортируется как есть: сеть —
// заглушка `fetch`, DOM — то, что даёт оболочка ERP (контракт §7: `<html data-theme="schaefer">` и
// `<div id="root">`). Каждый тест — в своём модульном окружении (`vi.resetModules`), поэтому
// состояние модулей (привязка хранения, палитра хоста, провайдер) не перетекает между тестами.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Root } from 'react-dom/client';

// Журнал порядка событий точки входа и захваченные экземпляры: корни (чтобы размонтировать после
// теста) и провайдеры (чтобы убедиться, что он один и с обоими колбэками).
const probe = vi.hoisted(() => ({
  log: [] as string[],
  roots: [] as Root[],
  providers: [] as { opts: Record<string, unknown>; instance: unknown }[],
}));

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  const createRoot: typeof actual.createRoot = (...args) => {
    const root = actual.createRoot(...args);
    probe.roots.push(root);
    const render = root.render.bind(root);
    root.render = (children) => {
      probe.log.push('render');
      render(children);
    };
    return root;
  };
  return { ...actual, default: { ...actual, createRoot }, createRoot };
});

vi.mock('./lib/draftStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/draftStorage')>();
  return {
    ...actual,
    lockDrafts: () => {
      probe.log.push('lockDrafts');
      actual.lockDrafts();
    },
  };
});

vi.mock('./theme/useTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./theme/useTheme')>();
  return {
    ...actual,
    applyHostPalette: (name: Parameters<typeof actual.applyHostPalette>[0]) => {
      probe.log.push(`applyHostPalette:${name}`);
      actual.applyHostPalette(name);
    },
    initTheme: () => {
      probe.log.push('initTheme');
      actual.initTheme();
    },
  };
});

vi.mock('./data/FrappeDataProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/FrappeDataProvider')>();
  class CountedFrappeDataProvider extends actual.FrappeDataProvider {
    constructor(opts: ConstructorParameters<typeof actual.FrappeDataProvider>[0] = {}) {
      super(opts);
      probe.providers.push({ opts: { ...opts }, instance: this });
    }
  }
  return { ...actual, FrappeDataProvider: CountedFrappeDataProvider };
});

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/contracts/fixtures/erp-v1');
const readFixture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));

const API = '/api/method/schaefer_erp.ladungsplaner.api.';
const SESSION = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 'csrf-geheim-123', appVersion: '0.21.570' };
const BORIS = { ...SESSION, user: 'boris@firma.de', fullName: 'Boris Beispiel', csrfToken: 'csrf-boris-456' };

const ok = (message: unknown, status = 200) => new Response(JSON.stringify({ message }), { status });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Route = (init: RequestInit) => Response | Promise<Response>;

/** `fetch` по имени метода ERP (`sitzung`, `reise` …); неизвестный адрес — 404 без кода. Каждый вызов
 *  получает свою копию ответа: под `StrictMode` один отложенный ответ читают два запроса сессии. */
function stubFetch(routes: Record<string, Route>) {
  const f = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = url.startsWith(API) ? url.slice(API.length).split('?')[0] : url;
    const route = routes[method];
    return route ? (await route(init)).clone() : new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

/** Действия провайдера, которые точка входа передала в конструктор. */
const theProvider = () => probe.providers[0].instance as import('./data/FrappeDataProvider').FrappeDataProvider;

beforeEach(() => {
  vi.resetModules();
  probe.log.length = 0;
  probe.roots.length = 0;
  probe.providers.length = 0;
  document.documentElement.setAttribute('data-theme', 'schaefer');
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  act(() => {
    for (const root of probe.roots) root.unmount();
  });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('main.erp — точка входа сборки для ERP', () => {
  it('холодный запуск ERP при сохранённой теме: до сессии в хранилище ничего не пишется, после — только ключи пользователя', async () => {
    localStorage.setItem('ladungsplaner.theme', 'warm');
    const before = Object.keys(localStorage).sort();
    const session = deferred<Response>();
    stubFetch({ sitzung: () => session.promise, reise: () => ok(readFixture('reise-LKW-2026-00412.json').message), bestellpositionen: () => ok([]) });
    await import('./main.erp');
    expect(Object.keys(localStorage).sort()).toEqual(before);
    expect(localStorage.getItem('ladungsplaner.theme')).toBe('warm');
    expect(document.documentElement.getAttribute('data-theme')).toBe('schaefer');
    session.resolve(ok(SESSION));
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    const added = Object.keys(localStorage).filter((k) => !before.includes(k));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((k) => k.startsWith('ladungsplaner.u.anna%40firma.de.'))).toBe(true);
    expect(localStorage.getItem('ladungsplaner.theme')).toBe('warm');
  });

  it('до первого рендера: хранение заперто и стоит палитра хоста; выбор темы обычной сборки не читается', async () => {
    stubFetch({ sitzung: () => deferred<Response>().promise });
    await import('./main.erp');
    const render = probe.log.indexOf('render');
    expect(render).toBeGreaterThan(-1);
    expect(probe.log.indexOf('lockDrafts')).toBeGreaterThan(-1);
    expect(probe.log.indexOf('lockDrafts')).toBeLessThan(render);
    expect(probe.log.indexOf('applyHostPalette:schaefer')).toBeGreaterThan(-1);
    expect(probe.log.indexOf('applyHostPalette:schaefer')).toBeLessThan(render);
    expect(probe.log).not.toContain('initTheme');
    // заблудшая запись до входа (тот же экземпляр модуля хранения, что у точки входа) не ложится никуда
    const storage = await import('./lib/draftStorage');
    storage.writeStored('ladungsplaner.setup', '{"vor":1}');
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('StrictMode: один провайдер на страницу с обоими колбэками; двойной монтаж не снимает привязку хранения', async () => {
    const f = stubFetch({ sitzung: () => ok(SESSION), bestellpositionen: () => ok([]) });
    await import('./main.erp');
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    expect(probe.providers).toHaveLength(1);
    expect(probe.providers[0].opts.onSessionExpired).toEqual(expect.any(Function));
    expect(probe.providers[0].opts.onSessionChanged).toEqual(expect.any(Function));
    expect(probe.roots).toHaveLength(1);
    // все запросы сессии ушли через этот единственный провайдер, и он помнит Анну
    expect(f.mock.calls.every(([url]) => String(url).startsWith(API))).toBe(true);
    const storage = await import('./lib/draftStorage');
    expect(storage.boundUser()).toBe('anna@firma.de');
    storage.writeStored('ladungsplaner.setup', '{"nach":1}');
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBe('{"nach":1}');
  });

  it('сигнал «сессия истекла» провайдера доходит до корня: экран входа', async () => {
    stubFetch({ sitzung: () => ok(SESSION), bestellpositionen: () => ok([]), reise: () => new Response('{}', { status: 401 }) });
    await import('./main.erp');
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    await act(async () => {
      await expect(theProvider().loadTrip('LKW-2026-00412')).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    });
    expect(screen.getByRole('link', { name: 'Neu anmelden' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Berechnen' })).toHaveLength(0);
  });

  it('сигнал «вошёл другой пользователь» провайдера доходит до корня: экран перезагрузки', async () => {
    let current = SESSION;
    const f = stubFetch({
      sitzung: () => ok(current),
      bestellpositionen: () => ok([]),
      positionen: () => new Response('{"exc_type":"CSRFTokenError"}', { status: 400 }),
    });
    await import('./main.erp');
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    current = BORIS; // Борис вошёл в этом браузере; POST Анны с её токеном → 400 → за новым токеном
    await act(async () => {
      await expect(theProvider().importLines(['a1b2c3d4e5'])).rejects.toEqual({ code: 'ERR_SESSION_CHANGED' });
    });
    expect(screen.getByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
    const posts = f.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
  });

  it('токен CSRF не попадает ни в хранилище, ни в адрес, ни в лог', async () => {
    const logged: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      });
    }
    const rules = { state: 'ent', nestingMode: 'pairwise', rotation: 'none' };
    const f = stubFetch({
      sitzung: () => ok(SESSION),
      bestellpositionen: () => ok([]),
      artikel_speichern: () => ok({ itemCode: 'A', name: 'A', rules, erpFields: [] }),
    });
    await import('./main.erp');
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    // запись несёт токен в заголовке — и только там; ошибка записи не глотается
    await act(async () => {
      await expect(theProvider().upsertArticle({ itemCode: 'A', name: 'A', rules } as never)).resolves.toMatchObject({ itemCode: 'A' });
    });
    fireEvent.focus(window);
    await act(async () => {});
    const posts = f.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const [postUrl, postInit] = posts[0];
    expect(postUrl).toBe(API + 'artikel_speichern');
    expect((postInit?.headers as Record<string, string>)['X-Frappe-CSRF-Token']).toBe(SESSION.csrfToken);
    expect(String(postInit?.body)).not.toContain(SESSION.csrfToken);
    for (const [url] of f.mock.calls) expect(String(url)).not.toContain(SESSION.csrfToken);
    for (const k of Object.keys(localStorage)) expect(localStorage.getItem(k)).not.toContain(SESSION.csrfToken);
    for (const k of Object.keys(sessionStorage)) expect(sessionStorage.getItem(k)).not.toContain(SESSION.csrfToken);
    expect(document.cookie).not.toContain(SESSION.csrfToken);
    expect(location.href).not.toContain(SESSION.csrfToken);
    expect(document.documentElement.outerHTML).not.toContain(SESSION.csrfToken);
    expect(logged.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : String(x))).join('\n')).not.toContain(SESSION.csrfToken);
  });

  // Включается после задач 11, 16, 17: экраны «Reise laden», высоты позиции и «Nicht im LKW» в этой
  // рабочей копии ещё не написаны (решение контролёра о порядке задач).
  it.skip('сквозной сценарий ERP: рейс → высота → «Ladeplan berechnen» → таблица и «Nicht im LKW» с 12,4 m³', async () => {
    stubFetch({ sitzung: () => ok(SESSION), reise: () => ok(readFixture('reise-LKW-2026-00412.json').message), bestellpositionen: () => ok([]) });
    await import('./main.erp');
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    // после входа: ввести рейс LKW-2026-00412, «Reise laden», ввести высоту 144 у HAN0412, нажать «Ladeplan berechnen»
    const trip = screen.getByRole('textbox', { name: 'Reise' });
    await userEvent.clear(trip);
    await userEvent.type(trip, 'LKW-2026-00412');
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    const row = (await screen.findByText('HAN0412')).closest('[data-testid="position-row"]') as HTMLElement;
    const height = within(row).getByRole('textbox', { name: 'Höhe' });
    await userEvent.clear(height);
    await userEvent.type(height, '144');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ladeplan berechnen' })[0]);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(within(screen.getByTestId('not-in-truck')).getByText('12,4 m³')).toBeInTheDocument();
  });
});
