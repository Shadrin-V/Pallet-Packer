// Точка входа обычной сборки (`main.tsx`) импортируется как есть: сеть — заглушка `fetch`, DOM —
// `<div id="root">` из `index.html`. Каждый тест — в своём модульном окружении (`vi.resetModules`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Root } from 'react-dom/client';

const probe = vi.hoisted(() => ({ roots: [] as Root[] }));

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  const createRoot: typeof actual.createRoot = (...args) => {
    const root = actual.createRoot(...args);
    probe.roots.push(root);
    return root;
  };
  return { ...actual, default: { ...actual, createRoot }, createRoot };
});

const okRaw = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Route = (init: RequestInit) => Response | Promise<Response>;

/** `fetch` по пути запроса; неизвестный адрес — 404. */
function stubFetch(routes: Record<string, Route>) {
  const f = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const route = routes[String(input)];
    return Promise.resolve(route ? route(init) : new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => {
  vi.resetModules();
  probe.roots.length = 0;
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  act(() => {
    for (const root of probe.roots) root.unmount();
  });
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('main — точка входа обычной сборки', () => {
  it('сквозной сценарий обычной сборки: ?order= → импорт через HttpDataProvider → «Berechnen» → план с легендой, переключатели на месте', async () => {
    history.replaceState(null, '', '/?order=SO-1234');
    stubFetch({ '/api/orders/SO-1234': () => okRaw({ orderId: 'SO-1234', positions: [{ itemCode: 'ABB101', itemName: 'Einwegpalette', quantity: 12, length: 800, width: 600, height: 144, dimensionsSource: 'erpnext-field' }] }) });
    await import('./main');
    expect(await screen.findByDisplayValue('SO-1234')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[0]);
    expect(await screen.findByRole('region', { name: 'Legende' })).toBeInTheDocument();
    expect(screen.getByTestId('hero-controls')).toBeInTheDocument();
    expect(Object.keys(localStorage).some((k) => k.startsWith('ladungsplaner.u.'))).toBe(false);
  });

  it('сохранённая тема обычной сборки применяется до первого рендера', async () => {
    localStorage.setItem('ladungsplaner.theme', 'warm');
    stubFetch({});
    await import('./main');
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
  });
});
