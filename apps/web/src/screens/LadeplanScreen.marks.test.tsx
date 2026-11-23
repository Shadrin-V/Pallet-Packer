// Различитель позиции без цвета (задача 15, условие утверждения макета): в сборке для ERP у каждой
// позиции плана — буквенный знак, одинаковый на грузе в обоих видах, на плитке «Lager», в таблице
// позиций, в «Nicht im LKW» и в картинке. Обычная сборка знаков не несёт.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, type CargoType, type Layout, type Load } from '@shadrin-v/engine';
import type { ErpSession } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { HostProvider, type Host } from '../host/HostContext';
import type { ErpSource } from '../data/ErpSource';
import { planContextFrom, type PlanContext } from '../erp/planContext';
import { emptyPosition, toCargoList, type OrderState, type PositionState } from './setup/setupState';
import { orderColorToken } from '../lib/orderColor';
import { LadeplanScreen } from './LadeplanScreen';
import { PlanPositionsTable } from './components/PlanPositionsTable';
import { capacityMap } from './components/capacity';
import * as exportPlanModule from '../lib/exportPlan';

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' };
const ERP_HOST: Host = { kind: 'erp', session: SESSION, source: {} as ErpSource };
const V = { id: 'v1', name: 'LKW Standard', length: 13600, width: 2450, height: 2700 };

const pallet = (i: number, quantity = 2): CargoType => ({
  id: `p${i}`,
  name: `Palette ${i}`,
  length: 1200,
  width: 800,
  height: 144,
  quantity,
  rotation: 'yawOnly',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
  orderId: `BE-${Math.floor((i - 1) / 2) + 1}`,
});
/** 10 позиций в 5 заказах (BE-1…BE-5 по 2); у десятой 2000 штук — часть уходит в «Lager». */
const load10: Load = {
  vehicle: V,
  cargo: Array.from({ length: 10 }, (_, k) => pallet(k + 1, k === 9 ? 2000 : 2)),
};

/** 9 размещаемых позиций в 4 заказах + строка в м³ третьей по порядку показа. */
const pos = (id: string, patch: Partial<PositionState> = {}): PositionState => ({
  ...emptyPosition(),
  id,
  name: `Palette ${id}`,
  length: 1200,
  width: 800,
  height: 144,
  quantity: 2,
  ...patch,
});
const m3 = pos('m3', {
  name: 'Bretter 22x100x1200 mm frisch',
  articleCode: 'SCH205',
  uom: 'Cubic Meter',
  sourceQuantity: 12.4,
  unplaceable: 'ERR_LINE_UNIT_NOT_PIECES',
});
const orders: OrderState[] = [
  { key: 'k1', orderId: 'BE-1', colorIndex: 0, positions: [pos('q1'), pos('q2'), m3] },
  { key: 'k2', orderId: 'BE-2', colorIndex: 1, positions: [pos('q4'), pos('q5')] },
  { key: 'k3', orderId: 'BE-3', colorIndex: 2, positions: [pos('q6'), pos('q7')] },
  { key: 'k4', orderId: 'BE-4', colorIndex: 3, positions: [pos('q8'), pos('q9'), pos('q10')] },
];
const ctx10: PlanContext = planContextFrom(orders);
const load9: Load = { vehicle: V, cargo: toCargoList(orders).cargo };

function renderPlanErp(load: Load, layout: Layout, context?: PlanContext) {
  return render(
    <HostProvider value={ERP_HOST}>
      <LocaleProvider initial="de">
        <LadeplanScreen load={load} layout={layout} context={context} />
      </LocaleProvider>
    </HostProvider>,
  );
}
function renderPlanStandalone(load: Load, layout: Layout) {
  return render(
    <LocaleProvider initial="de">
      <LadeplanScreen load={load} layout={layout} />
    </LocaleProvider>,
  );
}

const markOf = (el: Element) => el.closest('[data-cargo-type]')!.getAttribute('data-cargo-type')!;
const notPrintHidden = (m: Element) => {
  for (let el: Element | null = m; el; el = el.parentElement) expect(el.getAttribute('class') ?? '').not.toMatch(/print:hidden/);
};

afterEach(() => vi.restoreAllMocks());

describe('LadeplanScreen — знак позиции без цвета (сборка для ERP)', () => {
  it('рейс из 10 позиций: КАЖДАЯ видимая стопка обоих видов несёт знак своего типа, все 10 типов видны и различны', () => {
    const layout = calculateLayout(load10);
    renderPlanErp(load10, layout);
    const table = new Map(within(screen.getByRole('table')).getAllByTestId('position-mark').map((el) => [markOf(el), el.textContent]));
    expect([...table.values()]).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    const placedTypes = new Set(layout.placements.map((p) => p.cargoTypeId));
    expect(placedTypes.size).toBe(10); // груз подобран так, что все 10 типов на полу
    for (const view of ['top', 'side']) {
      const stacks = [...document.querySelectorAll(`svg[data-cutaway="${view}"] g[data-cargo-type]`)];
      expect(new Set(stacks.map((g) => g.getAttribute('data-cargo-type')))).toEqual(placedTypes);
      for (const g of stacks) {
        const marks = g.querySelectorAll(':scope > [data-mark], :scope > * > [data-mark]');
        expect(marks).toHaveLength(1); // у каждой стопки ровно один знак
        expect(marks[0].textContent).toBe(table.get(g.getAttribute('data-cargo-type')!));
        expect(marks[0].getAttribute('data-mark')).toBe(marks[0].textContent);
        expect(marks[0].getAttribute('fill')).toBe('var(--ink)');
        expect(marks[0].getAttribute('stroke')).toBe('var(--card)');
        expect(marks[0].getAttribute('paint-order')).toBe('stroke');
        expect(Number(marks[0].getAttribute('font-size'))).toBeGreaterThan(0);
      }
      expect(new Set(stacks.map((g) => g.querySelector('[data-mark]')!.textContent)).size).toBe(10);
    }
    // печатное представление: ни знак на грузе, ни знак в таблице не спрятан от печати
    for (const m of document.querySelectorAll('svg[data-cutaway] [data-mark], table [data-testid="position-mark"]')) notPrintHidden(m);
    const tenth = load10.cargo[9].id;
    const tile = document.querySelector(`[data-testid="warehouse-floor"] [data-cargo-type="${tenth}"]`)!;
    expect(tile.querySelector('[data-mark]')?.textContent).toBe('J');
    // текстовый эквивалент: имя плитки называет позицию
    expect(tile.getAttribute('aria-label')).toMatch(/^Position J · /);
    const notIn = within(screen.getByTestId('not-in-truck')).getByTestId('position-mark');
    expect(notIn).toHaveTextContent('J');
    // в строке «Nicht im LKW» знак стоит прямо перед количеством
    expect(notIn.nextElementSibling?.textContent).toMatch(/^\d[\d.]* Stk$/);
  });

  it('рейс из 10 позиций, одна из них в м³: десять разных знаков, у строки в м³ знак есть в «Nicht im LKW», в печати и в картинке', async () => {
    const spy = vi.spyOn(exportPlanModule, 'exportPlanPng').mockResolvedValue();
    renderPlanErp(load9, calculateLayout(load9), ctx10);
    const tableMarks = within(screen.getByRole('table')).getAllByTestId('position-mark').map((e) => e.textContent);
    const m3Row = within(screen.getByTestId('not-in-truck')).getByText('in m³: nicht planbar').closest('[data-position-id]')!;
    const m3Mark = within(m3Row as HTMLElement).getByTestId('position-mark');
    expect(m3Mark.textContent).toBe('C'); // по порядку показа, а не по Load
    expect(m3Mark.nextElementSibling?.textContent).toBe('12,4 m³'); // знак — перед количеством
    expect(within(m3Row as HTMLElement).getByText('Position C')).toBeInTheDocument(); // для экранного чтения
    expect(new Set([...tableMarks, m3Mark.textContent]).size).toBe(10);
    expect(tableMarks).toEqual(['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    notPrintHidden(m3Row);
    await userEvent.click(screen.getByRole('button', { name: 'Als Bild speichern' }));
    const opts = spy.mock.calls[0][1];
    expect(opts.legend.map((l) => l.label.split(' ')[0])).toEqual(tableMarks);
    expect(opts.notes!.flatMap((n) => n.lines).some((line) => line.startsWith('C ') && line.includes('12,4 m³'))).toBe(true);
    // картинка несёт те же разрезы, что экран, — с теми же знаками
    for (const s of opts.sections) {
      const marks = new Set([...s.svg.querySelectorAll('[data-mark]')].map((m) => m.textContent));
      expect(marks).toEqual(new Set(tableMarks));
    }
  });

  it('цвета после третьего заказа повторяются, штриховка и знак — нет', () => {
    expect(orderColorToken(3).hatchId).not.toBe(orderColorToken(0).hatchId);
    // --s4 === --s1 в палитре schaefer закреплено в palette.test.ts (задача 10)
    renderPlanErp(load10, calculateLayout(load10));
    const marks = within(screen.getByRole('table')).getAllByTestId('position-mark').map((e) => e.textContent);
    expect(new Set(marks).size).toBe(10);
  });

  it('обычная сборка: знаков нет', () => {
    renderPlanStandalone(load10, calculateLayout(load10));
    expect(document.querySelector('[data-mark]')).toBeNull();
    expect(screen.queryAllByTestId('position-mark')).toHaveLength(0);
    expect(screen.queryByText(/^Position [A-Z]+$/)).toBeNull();
  });
});

describe('PlanPositionsTable — знак и доступное имя', () => {
  const load: Load = { vehicle: V, cargo: [pallet(1), pallet(2), pallet(3)] };
  const layout = calculateLayout(load);
  const renderTable = (marks?: ReadonlyMap<string, string>) =>
    render(
      <LocaleProvider initial="de">
        <PlanPositionsTable load={load} layout={layout} capacity={capacityMap(load)} marks={marks} />
      </LocaleProvider>,
    );

  it('у таблицы есть доступное имя', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Positionen' })).toBeInTheDocument();
  });

  it('знак первым в ячейке артикула своей строки, с текстом для экранного чтения', () => {
    renderTable(new Map([['p1', 'A'], ['p2', 'B'], ['p3', 'C']]));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-cargo-type'))).toEqual(['p1', 'p2', 'p3']);
    rows.forEach((r, i) => {
      const mark = within(r).getByTestId('position-mark');
      expect(mark).toHaveTextContent(['A', 'B', 'C'][i]);
      expect(mark.nextElementSibling).toHaveTextContent(`Palette ${i + 1}`);
      expect(within(r).getByText(`Position ${['A', 'B', 'C'][i]}`)).toBeInTheDocument();
    });
  });

  it('без карты знаков знака нет', () => {
    renderTable();
    expect(screen.queryAllByTestId('position-mark')).toHaveLength(0);
  });
});
