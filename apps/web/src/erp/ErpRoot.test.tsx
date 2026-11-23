import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ErpSession } from '@shadrin-v/contracts';
import { ErpRoot } from './ErpRoot';
import { sessionExpiredSignal, sessionSignal } from './sessionSignal';
import { deskUrl, loginUrl } from './erpUrls';
import { writeStored } from '../lib/draftStorage';
import { emptyOrder } from '../screens/setup/setupState';
import { VEHICLE_PRESETS, vehicleFromPreset } from '../data/presets';
import type { DataProvider } from '../data/DataProvider';
import type { ErpSource } from '../data/ErpSource';
import { FrappeDataProvider } from '../data/FrappeDataProvider';

const SESSION: ErpSession = {
  user: 'anna@firma.de',
  fullName: 'Anna Muster',
  language: 'de',
  csrfToken: 'csrf-geheim-123',
  appVersion: '0.21.570',
};
const anyPresetVehicle = vehicleFromPreset(VEHICLE_PRESETS[0]);

type Closable = { close(reason: 'expired' | 'changed'): void };
type FakeSource = { [K in keyof (DataProvider & ErpSource & Closable)]: ReturnType<typeof vi.fn> } & DataProvider & ErpSource & Closable;

function fakeSource(): FakeSource {
  return {
    session: vi.fn(),
    loadTrip: vi.fn(),
    listOpenLines: vi.fn(),
    importLines: vi.fn(),
    listVehicles: vi.fn(),
    upsertVehicle: vi.fn(),
    saveLoadingPlan: vi.fn(),
    listLoadingPlans: vi.fn(),
    getLoadingPlan: vi.fn(),
    importOrder: vi.fn(),
    searchOrders: vi.fn(),
    searchArticles: vi.fn(),
    upsertArticle: vi.fn(),
    close: vi.fn(),
  } as unknown as FakeSource;
}

let source: FakeSource;
let signal: ReturnType<typeof sessionExpiredSignal>;
let changed: ReturnType<typeof sessionSignal>;

beforeEach(() => {
  source = fakeSource();
  signal = sessionExpiredSignal();
  changed = sessionSignal();
});

const renderRoot = () => render(<ErpRoot source={source} subscribeExpired={signal.subscribe} subscribeChanged={changed.subscribe} />);
/** Признак смонтированной программы: кнопка расчёта в шапке «Настройки». */
const appMounted = () => screen.queryAllByRole('button', { name: 'Berechnen' }).length > 0;
const ladungsplanerKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('ladungsplaner.'));

describe('ErpRoot', () => {
  it('сессия ru: интерфейс по-русски, полоса с именем и ссылкой, без баннера и переключателей', async () => {
    source.session.mockResolvedValue({ ...SESSION, language: 'ru' });
    renderRoot();
    expect(await screen.findByRole('link', { name: 'Назад в ERP' })).toHaveAttribute('href', deskUrl(location.origin));
    expect(screen.getByText('Anna Muster')).toBeInTheDocument();
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-controls')).toBeNull();
    expect(document.documentElement.lang).toBe('ru');
  });

  it('язык берётся из сессии, а не из сохранённого', async () => {
    localStorage.setItem('ladungsplaner.locale', 'ru');
    source.session.mockResolvedValue(SESSION); // de
    renderRoot();
    expect(await screen.findByRole('link', { name: 'Zurück zum ERP' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de');
  });

  it('всё хранение — под ключом пользователя (контракт §7)', async () => {
    source.session.mockResolvedValue(SESSION);
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    const keys = ladungsplanerKeys();
    expect(keys.length).toBeGreaterThan(0); // черновик уже сохранён эффектом SetupScreen
    expect(keys.every((k) => k.startsWith('ladungsplaner.u.anna%40firma.de.'))).toBe(true);
    expect(localStorage.getItem('ladungsplaner.theme')).toBeNull();
  });

  it('до ответа сессии в хранилище ничего не пишется', async () => {
    let resolve: (s: ErpSession) => void = () => {};
    source.session.mockReturnValue(new Promise<ErpSession>((r) => { resolve = r; }));
    renderRoot();
    expect(screen.getByText('ERP-Sitzung wird geprüft …')).toBeInTheDocument();
    writeStored('ladungsplaner.setup', '{"vor":1}'); // заблудшая запись до входа
    expect(ladungsplanerKeys()).toEqual([]);
    resolve(SESSION);
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    expect(ladungsplanerKeys().every((k) => k.startsWith('ladungsplaner.u.anna%40firma.de.'))).toBe(true);
  });

  it('токен CSRF не попадает ни в хранилище, ни в разметку, ни в адрес', async () => {
    source.session.mockResolvedValue(SESSION);
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    const noToken = () => {
      for (const k of Object.keys(localStorage)) expect(localStorage.getItem(k)).not.toContain(SESSION.csrfToken);
      expect(document.documentElement.outerHTML).not.toContain(SESSION.csrfToken);
      expect(location.href).not.toContain(SESSION.csrfToken);
    };
    expect(appMounted()).toBe(true);
    noToken(); // разметка работающей программы
    act(() => signal.notify());
    noToken(); // и экрана после выхода
  });

  it('сессия истекла посреди работы: экран со ссылкой на вход, черновик цел', async () => {
    history.replaceState(null, '', '/ladungsplaner');
    source.session.mockResolvedValue(SESSION);
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    writeStored('ladungsplaner.setup', '{"x":1}');
    act(() => signal.notify());
    expect(screen.getByText('Deine Anmeldung im ERP ist abgelaufen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neu anmelden' })).toHaveAttribute('href', loginUrl(location.origin, '/ladungsplaner'));
    // Полоса макета (блок 5): логотип и «Zurück zum ERP», но без имени и аватара — сессии уже нет.
    expect(screen.getByRole('link', { name: 'Zurück zum ERP' })).toHaveAttribute('href', deskUrl(location.origin));
    expect(screen.queryByText('Anna Muster')).toBeNull();
    expect(screen.queryByText('AM')).toBeNull();
    expect(appMounted()).toBe(false); // настройка и план размонтированы
    expect(source.close).toHaveBeenCalledWith('expired');
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBe('{"x":1}');
    writeStored('ladungsplaner.setup', '{"x":"late"}'); // запоздалая запись размонтированного экрана
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBe('{"x":1}');
  });

  it('сессии нет уже при входе: экран «Anmeldung abgelaufen»', async () => {
    source.session.mockRejectedValue({ code: 'ERR_NOT_LOGGED_IN' });
    renderRoot();
    expect(await screen.findByText('Deine Anmeldung im ERP ist abgelaufen')).toBeInTheDocument();
    expect(ladungsplanerKeys()).toEqual([]);
  });

  it('смена учётки во второй вкладке: фокус окна → «другой пользователь», App размонтирован', async () => {
    source.session.mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ ...SESSION, user: 'boris@firma.de', fullName: 'Boris' });
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    fireEvent.focus(window);
    expect(await screen.findByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
    expect(screen.queryByText('Anna Muster')).toBeNull();
    expect(screen.getByRole('link', { name: 'Zurück zum ERP' })).toBeInTheDocument();
    expect(appMounted()).toBe(false);
    expect(source.close).toHaveBeenCalledWith('changed');
    // Запоздалое сохранение экрана Анны после смены учётки не ложится ни под какой ключ.
    writeStored('ladungsplaner.setup', '{"anna":"late"}');
    for (const k of Object.keys(localStorage)) expect(localStorage.getItem(k)).not.toContain('late');
  });

  it('фокус с тем же пользователем ничего не меняет; иная ошибка проверки игнорируется', async () => {
    source.session
      .mockResolvedValueOnce(SESSION)
      .mockResolvedValueOnce(SESSION)
      .mockRejectedValueOnce({ code: 'ERR_HTTP', details: { status: 502 } });
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    fireEvent.focus(window);
    fireEvent.focus(window);
    await act(async () => {});
    expect(source.session).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('link', { name: 'Zurück zum ERP' })).toBeInTheDocument();
  });

  it('фокус при истёкшей сессии → экран входа', async () => {
    source.session.mockResolvedValueOnce(SESSION).mockRejectedValueOnce({ code: 'ERR_NOT_LOGGED_IN' });
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    fireEvent.focus(window);
    expect(await screen.findByRole('link', { name: 'Neu anmelden' })).toBeInTheDocument();
  });

  it('две страницы: Борис вошёл во второй вкладке → у Анны план и настройка размонтированы сразу, её старый черновик больше не пишется', async () => {
    source.session.mockResolvedValue(SESSION);
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    // вторая страница — отдельная копия модуля хранения, как в другой вкладке
    vi.resetModules();
    const page2 = await import('../lib/draftStorage');
    page2.bindDraftsToUser('boris@firma.de'); // удаляет ключи Анны, как вход Бориса
    page2.writeStored('ladungsplaner.setup', '{"boris":1}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'ladungsplaner.u.boris%40firma.de.setup', newValue: '{"boris":1}' }));
    expect(screen.getByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument(); // без ожидания: синхронно
    expect(screen.queryByText('Anna Muster')).toBeNull();
    expect(appMounted()).toBe(false); // App (настройка и план) размонтирован
    writeStored('ladungsplaner.setup', '{"anna":"late"}'); // запоздалая запись страницы Анны (первая копия модуля)
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.u.boris%40firma.de.setup')).toBe('{"boris":1}');
    page2.unbindDrafts();
  });

  it('событие storage о своём или безымянном ключе смену учётки не объявляет', async () => {
    source.session.mockResolvedValue(SESSION);
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'ladungsplaner.u.anna%40firma.de.setup' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'ladungsplaner.setup' }));
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(screen.getByRole('link', { name: 'Zurück zum ERP' })).toBeInTheDocument();
  });

  it('возврат на вкладку (visibilitychange) тоже сверяет пользователя', async () => {
    source.session.mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ ...SESSION, user: 'boris@firma.de' });
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
  });

  it('вход Бориса через ErpRoot удаляет безымянный и чужой черновики и показывает пустой экран', async () => {
    localStorage.setItem('ladungsplaner.setup', JSON.stringify({ vehicle: anyPresetVehicle, orders: [{ ...emptyOrder(1), orderId: 'PUR-ORD-ANON' }] }));
    localStorage.setItem('ladungsplaner.u.anna%40firma.de.setup', JSON.stringify({ vehicle: anyPresetVehicle, orders: [{ ...emptyOrder(1), orderId: 'PUR-ORD-ANNA' }] }));
    source.session.mockResolvedValue({ ...SESSION, user: 'boris@firma.de', fullName: 'Boris Beispiel' });
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    expect(screen.queryByDisplayValue('PUR-ORD-ANNA')).toBeNull();
    expect(screen.queryByDisplayValue('PUR-ORD-ANON')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.setup')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBeNull();
  });

  it('неизвестная ошибка при входе: общий текст и повтор', async () => {
    source.session.mockRejectedValueOnce({ code: 'ERR_WEIRD' }).mockResolvedValueOnce(SESSION);
    renderRoot();
    await userEvent.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('link', { name: 'Zurück zum ERP' })).toBeInTheDocument();
  });

  it('сигнал «сессия сменилась» от провайдера → экран «другой пользователь», провайдер закрыт', async () => {
    source.session.mockResolvedValue(SESSION);
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    act(() => changed.notify());
    expect(screen.getByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
    expect(appMounted()).toBe(false);
    expect(source.close).toHaveBeenCalledWith('changed');
  });

  it('перепроверка при фокусе отклонена кодом смены сессии → экран «другой пользователь»', async () => {
    source.session.mockResolvedValueOnce(SESSION).mockRejectedValueOnce({ code: 'ERR_SESSION_CHANGED' });
    renderRoot();
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    fireEvent.focus(window);
    expect(await screen.findByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
  });

  it('обратный адрес входа не уводит на другой хост', async () => {
    history.replaceState(null, '', '/a/..//evil.example/x?y=1');
    expect(location.pathname).toBe('//evil.example/x');
    source.session.mockRejectedValue({ code: 'ERR_NOT_LOGGED_IN' });
    renderRoot();
    const href = (await screen.findByRole('link', { name: 'Neu anmelden' })).getAttribute('href') ?? '';
    expect(new URL(href).searchParams.get('redirect-to')).toBe('/evil.example/x?y=1');
    history.replaceState(null, '', '/ladungsplaner');
  });
});

// Тот же сценарий на настоящем провайдере и настоящих `Response` (контракт §1, «Смена пользователя»).
describe('ErpRoot + FrappeDataProvider: другой пользователь вошёл в этом браузере', () => {
  const ok = (message: unknown, status = 200) => new Response(JSON.stringify({ message }), { status });
  const bare = (status: number) => new Response('{"exc_type":"CSRFTokenError"}', { status });
  const BORIS = { ...SESSION, user: 'boris@firma.de', fullName: 'Boris Beispiel', csrfToken: 'tok-boris' };

  function mount(f: ReturnType<typeof vi.fn>) {
    const expired = sessionSignal();
    const changedSig = sessionSignal();
    const dp = new FrappeDataProvider({ fetchImpl: f as unknown as typeof fetch, onSessionExpired: expired.notify, onSessionChanged: changedSig.notify });
    render(<ErpRoot source={dp} subscribeExpired={expired.subscribe} subscribeChanged={changedSig.subscribe} />);
    return dp;
  }
  const posts = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([, init]) => init.method === 'POST');

  it('POST → 400 без кода → sitzung Бориса: второго POST нет, токен Бориса не используется, экран «другой пользователь»', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok(SESSION)) // вход
      .mockResolvedValueOnce(bare(400)) // POST с токеном Анны
      .mockResolvedValueOnce(ok(BORIS)) // за новым токеном — а там Борис
      .mockImplementation(() => Promise.resolve(ok([])));
    const dp = mount(f);
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    await act(async () => {
      await expect(dp.importLines(['a1'])).rejects.toEqual({ code: 'ERR_SESSION_CHANGED' });
    });
    expect(screen.getByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
    expect(appMounted()).toBe(false);
    expect(posts(f)).toHaveLength(1);
    expect(posts(f)[0][1].headers['X-Frappe-CSRF-Token']).toBe(SESSION.csrfToken);
    // запоздавший вызов размонтированного экрана Анны в сеть не уходит
    const calls = f.mock.calls.length;
    await expect(dp.upsertArticle({ itemCode: 'A', name: 'A', rules: { state: 'ent', nestingMode: 'pairwise', rotation: 'none' } } as never)).rejects.toEqual({ code: 'ERR_SESSION_CHANGED' });
    expect(f.mock.calls.length).toBe(calls);
  });

  it('403 без кода → перепроверка отдала Бориса: экран «другой пользователь», дальше в сеть не ходим', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(new Response('{}', { status: 403 })).mockResolvedValueOnce(ok(BORIS));
    const dp = mount(f);
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    await act(async () => {
      await expect(dp.listOpenLines()).rejects.toEqual({ code: 'ERR_SESSION_CHANGED' });
    });
    expect(screen.getByRole('button', { name: 'Seite neu laden' })).toBeInTheDocument();
    await expect(dp.loadTrip('LKW-1')).rejects.toEqual({ code: 'ERR_SESSION_CHANGED' });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('после истечения сессии провайдер закрыт: запоздавший вызов в сеть не уходит', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(SESSION)).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const dp = mount(f);
    await screen.findByRole('link', { name: 'Zurück zum ERP' });
    await act(async () => {
      await expect(dp.loadTrip('LKW-1')).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    });
    expect(screen.getByRole('link', { name: 'Neu anmelden' })).toBeInTheDocument();
    await expect(dp.importLines(['a1'])).rejects.toEqual({ code: 'ERR_NOT_LOGGED_IN' });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
