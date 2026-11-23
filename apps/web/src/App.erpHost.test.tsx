// Шаг выбора груза — только в сборке для ERP: обычная сборка (без хоста) его не рисует.
import { describe, expect, it, vi, type Mocked } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import type { ErpSession } from '@shadrin-v/contracts';
import { App } from './App';
import { HostProvider } from './host/HostContext';
import type { ErpSource } from './data/ErpSource';
import { bindDraftsToUser, readStored, storageKey, unbindDrafts, writeStored } from './lib/draftStorage';
import type { PlanContext } from './erp/planContext';
import { emptyOrder, emptyPosition } from './screens/setup/setupState';

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' };

describe('App: шаг выбора груза', () => {
  it('шаг выбора груза есть только при хосте ERP', async () => {
    const fake: Mocked<ErpSource> = {
      session: vi.fn(),
      loadTrip: vi.fn(),
      listOpenLines: vi.fn().mockResolvedValue([]),
      importLines: vi.fn(),
    };
    render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake }}><App /></HostProvider>);
    expect(screen.getByRole('region', { name: 'Positionen wählen' })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(fake.listOpenLines).toHaveBeenCalledTimes(1);
    cleanup();
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Positionen wählen' })).toBeNull();
  });
});

describe('App: контекст плана (сборка для ERP)', () => {
  const load: Load = {
    vehicle: { id: 'v', name: 'LKW Standard', length: 2000, width: 2000, height: 2000 },
    cargo: [
      { id: 'p1', name: 'Box', length: 1000, width: 1000, height: 1000, quantity: 3, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'BE-1' },
    ],
  };
  const context: PlanContext = {
    trip: { tripId: 'LKW-12866', loadingDate: '2026-11-24' },
    orders: { 'BE-1': { partner: 'Beispiel Paletten SIA' } },
    items: { p1: { itemCode: 'EUR101' } },
    positionOrder: ['p1'],
    unplaceable: [],
  };
  const fake = (): Mocked<ErpSource> => ({
    session: vi.fn(),
    loadTrip: vi.fn(),
    listOpenLines: vi.fn().mockResolvedValue([]),
    importLines: vi.fn(),
  });

  it('переживает перезагрузку под ключом пользователя, испорченный не доезжает, «Zurücksetzen» его убирает', async () => {
    bindDraftsToUser(SESSION.user);
    try {
      writeStored('ladungsplaner.load', JSON.stringify(load));
      writeStored('ladungsplaner.planContext', JSON.stringify(context));
      expect(storageKey('ladungsplaner.planContext')).toBe('ladungsplaner.u.anna%40firma.de.planContext');
      render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake() }}><App /></HostProvider>);
      expect(screen.getByText('Reise LKW-12866 · Verladung 24.11.2026')).toBeInTheDocument();
      expect(screen.getByText('EUR101')).toBeInTheDocument();
      cleanup();

      // Испорченная запись: план есть, контекста нет — без рейса и кода артикула, но не падает.
      writeStored('ladungsplaner.planContext', JSON.stringify({ ...context, positionOrder: 'p1' }));
      render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake() }}><App /></HostProvider>);
      expect(screen.queryByText(/Reise LKW-12866/)).toBeNull();
      expect(screen.getByText('Platz für 5 weitere Stück')).toBeInTheDocument();
      cleanup();

      writeStored('ladungsplaner.planContext', JSON.stringify(context));
      render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake() }}><App /></HostProvider>);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
      expect(screen.queryByText(/Reise LKW-12866/)).toBeNull();
      expect(readStored('ladungsplaner.planContext')).toBeNull();
      expect(readStored('ladungsplaner.load')).toBeNull();
    } finally {
      vi.restoreAllMocks();
      cleanup();
      localStorage.clear();
      unbindDrafts();
    }
  });

  it('«Berechnen» передаёт плану контекст черновика: рейс и код артикула на плане, контекст сохранён', async () => {
    bindDraftsToUser(SESSION.user);
    try {
      const order = {
        ...emptyOrder(1),
        orderId: 'BE-1',
        partner: 'Beispiel Paletten SIA',
        positions: [{ ...emptyPosition(), id: 'p1', name: 'Box', length: 1000, width: 1000, height: 1000, quantity: 3, articleCode: 'EUR101', fromTrip: 'LKW-12866' }],
      };
      writeStored('ladungsplaner.setup', JSON.stringify({ vehicle: load.vehicle, orders: [order], trip: context.trip }));
      render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake() }}><App /></HostProvider>);
      expect(screen.queryByText('Reise LKW-12866 · Verladung 24.11.2026')).toBeNull();
      await userEvent.click(screen.getAllByRole('button', { name: 'Ladeplan berechnen' })[0]);
      expect(screen.getByText('Reise LKW-12866 · Verladung 24.11.2026')).toBeInTheDocument();
      expect(within(screen.getAllByRole('table').at(-1)!).getByText('EUR101')).toBeInTheDocument();
      const stored: unknown = JSON.parse(readStored('ladungsplaner.planContext') ?? 'null');
      expect(stored).toMatchObject({ trip: context.trip, orders: { 'BE-1': { partner: 'Beispiel Paletten SIA' } }, items: { p1: { itemCode: 'EUR101' } } });
    } finally {
      cleanup();
      localStorage.clear();
      unbindDrafts();
    }
  });

  // Итоговое ревью, P1: смешанный план (два рейса) и черновик старого вида рейсом не подписываются —
  // ни в заголовке плана, ни в сохранённом контексте (из него же экспорт-картинка и печать).
  it.each([
    ['позиции двух рейсов', ['LKW-12800', 'LKW-12866']],
    ['черновик старого вида: у позиций нет происхождения', [undefined, undefined]],
  ])('«Berechnen»: %s → номера рейса на плане нет', async (_label, origins) => {
    bindDraftsToUser(SESSION.user);
    try {
      const box = (id: string, fromTrip: string | undefined) => ({
        ...emptyPosition(), id, name: 'Box', length: 1000, width: 1000, height: 1000, quantity: 1,
        ...(fromTrip ? { fromTrip } : {}),
      });
      const order = { ...emptyOrder(1), orderId: 'BE-1', positions: [box('p1', origins[0]), box('p2', origins[1])] };
      writeStored('ladungsplaner.setup', JSON.stringify({ vehicle: load.vehicle, orders: [order], trip: context.trip }));
      render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake() }}><App /></HostProvider>);
      await userEvent.click(screen.getAllByRole('button', { name: 'Ladeplan berechnen' })[0]);
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
      expect(screen.queryByText(/LKW-12866/)).toBeNull();
      const stored = JSON.parse(readStored('ladungsplaner.planContext') ?? 'null') as PlanContext;
      expect(stored).not.toBeNull();
      expect(stored).not.toHaveProperty('trip');
    } finally {
      cleanup();
      localStorage.clear();
      unbindDrafts();
    }
  });
});
