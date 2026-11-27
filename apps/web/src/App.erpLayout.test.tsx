// Оболочка экранов сборки для ERP по макету: полоса шагов, пустое состояние, без Demo и ручного
// номера заказа, подписи макета. Обычная сборка остаётся прежней.
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ErpSession } from '@shadrin-v/contracts';
import { App } from './App';
import { HostProvider } from './host/HostContext';
import type { ErpSource } from './data/ErpSource';
import { bindDraftsToUser, unbindDrafts, writeStored } from './lib/draftStorage';
import { emptyOrder, emptyPosition } from './screens/setup/setupState';

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' };
const VEHICLE = { id: 'v', name: 'LKW Standard', length: 2000, width: 2000, height: 2000 };

let fake: Mocked<ErpSource>;

beforeEach(() => {
  fake = {
    session: vi.fn(),
    loadTrip: vi.fn(),
    listOpenLines: vi.fn().mockResolvedValue([]),
    importLines: vi.fn(),
  };
  bindDraftsToUser(SESSION.user);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  unbindDrafts();
});

/** Черновик с одним заказом из ERP; `complete` — у позиции есть все размеры. */
function draftWithOrder(orderId: string, opts: { complete?: boolean } = {}) {
  const dims = opts.complete ? { length: 1000, width: 1000, height: 1000 } : {};
  return {
    vehicle: VEHICLE,
    orders: [{ ...emptyOrder(1), orderId, positions: [{ ...emptyPosition(), id: 'p1', name: 'Box', quantity: 3, ...dims }] }],
  };
}

function renderAppErp(opts: { draft?: unknown } = {}) {
  if (opts.draft !== undefined) writeStored('ladungsplaner.setup', JSON.stringify(opts.draft));
  return render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake }}><App /></HostProvider>);
}

describe('App: оболочка экранов сборки для ERP', () => {
  it('пустой черновик: пустое состояние макета, кнопка ведёт к полю рейса', async () => {
    renderAppErp();
    expect(screen.getByText('Noch keine Positionen im LKW')).toBeInTheDocument();
    expect(screen.getByText('Lade eine Reise oder wähle offene Bestellpositionen.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Positionen wählen' }));
    expect(document.activeElement?.id).toBe('lp-trip-input');
    // Нетронутая заготовка — не позиция: текущий шаг — выбор позиций.
    expect(screen.getByRole('link', { name: /Positionen wählen/ })).toHaveAttribute('aria-current', 'step');
  });

  it('подсказка пустого плана в ERP называет кнопку «Ladeplan berechnen» и «Positionen»', () => {
    renderAppErp();
    const empty = screen.getByTestId('empty-plan');
    expect(empty).toHaveTextContent('Positionen wählen, Maße prüfen und «Ladeplan berechnen» drücken.');
    expect(empty).not.toHaveTextContent('Aufträge');
  });

  it('в ERP нет Demo и ручного номера заказа; подписи макета', async () => {
    renderAppErp({ draft: draftWithOrder('BE-40388') });
    expect(screen.queryByRole('button', { name: 'Demo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Auftrag hinzufügen/ })).toBeNull();
    expect(screen.getByDisplayValue('BE-40388')).toHaveAttribute('readonly');
    expect(screen.getAllByRole('button', { name: 'Ladeplan berechnen' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Positionen ändern' })).toBeInTheDocument();
    expect(screen.getAllByText('Bestellungen').length).toBeGreaterThan(0);
    expect(screen.queryByText('Aufträge')).toBeNull();
    // Черновик с позицией — не пустое состояние.
    expect(screen.queryByText('Noch keine Positionen im LKW')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Positionen ändern' }));
    expect(document.activeElement?.id).toBe('lp-trip-input');
  });

  it('полоса шагов в верхней полосе следует за черновиком и планом', async () => {
    renderAppErp({ draft: draftWithOrder('BE-40388', { complete: true }) });
    const nav = screen.getByRole('navigation', { name: 'ERP-Navigation' });
    expect(within(nav).getByRole('link', { name: /Einrichten/ })).toHaveAttribute('aria-current', 'step');
    expect(within(nav).getByRole('link', { name: /Positionen wählen/ })).toHaveAttribute('data-done');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ladeplan berechnen' })[0]);
    expect(screen.getByRole('link', { name: /Ladeplan/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: /Einrichten/ })).toHaveAttribute('data-done');
    // Якоря шагов есть на странице.
    expect(document.getElementById('lp-select')).not.toBeNull();
    expect(document.getElementById('lp-setup')).not.toBeNull();
    expect(document.getElementById('lp-plan')).not.toBeNull();
  });

  it('сквозной: рейс только из строки в м³ → строка в неразмещаемом с количеством, расчёт недоступен с причиной, экран плана не открывается', async () => {
    const onlyM3 = { tripId: 'LKW-12999', loadingDate: '2026-11-25', zones: [{ orderId: 'BE-40397', partner: 'Muster Holz Sp. z o.o.', positions: [
      { itemCode: 'SCH205', itemName: 'Bretter 22x100x1200 mm frisch', quantity: 0, uom: 'Cubic Meter', lineRef: 'm1',
        dimensionsSource: 'manual' as const, unplaceable: 'ERR_LINE_UNIT_NOT_PIECES' as const, sourceQuantity: 12.4 }] }] };
    fake.loadTrip.mockResolvedValue(onlyM3);
    renderAppErp();
    await userEvent.type(screen.getByLabelText('Reise'), 'LKW-12999');
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    const list = await screen.findByTestId('unplaceable-list');
    expect(within(list).getByText('12,4 m³')).toBeInTheDocument();
    expect(within(list).getByText('in m³: nicht planbar')).toBeInTheDocument();
    const calc = screen.getAllByRole('button', { name: 'Ladeplan berechnen' })[0];
    expect(calc).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Noch nicht berechenbar: keine Position in Stück.')).toBeInTheDocument();
    await userEvent.click(calc);
    // Таблица выбора строк в шаге выбора груза есть всегда — таблицы плана нет.
    expect(within(document.getElementById('lp-plan')!).queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('not-in-truck')).toBeNull();                 // экран плана не открылся
    expect(screen.getByRole('link', { name: /Ladeplan/ })).not.toHaveAttribute('aria-current', 'step');
  });

  it('обычная сборка без изменений', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Demo' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'ERP-Navigation' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Auftrag hinzufügen/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aufträge').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Berechnen' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Noch keine Positionen im LKW')).toBeNull();
    expect(screen.getByTestId('empty-plan')).toHaveTextContent('Aufträge ausfüllen und «Berechnen» drücken');
    expect(screen.getByLabelText('Auftrags-ID')).not.toHaveAttribute('readonly');
  });
});
