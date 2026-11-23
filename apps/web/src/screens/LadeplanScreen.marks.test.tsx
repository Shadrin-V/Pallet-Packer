// Различитель позиции без цвета (задача 15, условие утверждения макета): в сборке для ERP у каждой
// позиции плана — буквенный знак, одинаковый на грузе в обоих видах, на плитке «Lager», в таблице
// позиций, в «Nicht im LKW» и в картинке. Обычная сборка знаков не несёт.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, moveStack, type CargoType, type Layout, type Load } from '@shadrin-v/engine';
import type { ErpSession } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { HostProvider, type Host } from '../host/HostContext';
import type { ErpSource } from '../data/ErpSource';
import { planContextFrom, type PlanContext } from '../erp/planContext';
import { emptyPosition, toCargoList, type OrderState, type PositionState } from './setup/setupState';
import { orderColorToken } from '../lib/orderColor';
import { LadeplanScreen } from './LadeplanScreen';
import { PlanPositionsTable } from './components/PlanPositionsTable';
import { CrossSection } from './components/CrossSection';
import { sideRects } from './components/cutaway';
import { boxesIntersect, type Box } from './components/positionMark';
import { estimateTextWidth } from './components/stackLabel';
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

/** Кегль «×N» в этом кузове: 5 % ширины (CrossSection, WarehouseFloor). */
const COUNT_FONT = V.width * 0.05;
/** Прямоугольник текста по его атрибутам (ширина — той же оценкой, что у подписей стопок). */
function textBox(el: Element): Box {
  const fs = Number(el.getAttribute('font-size'));
  const w = estimateTextWidth(el.textContent ?? '', fs);
  const x = Number(el.getAttribute('x'));
  const y = Number(el.getAttribute('y'));
  const anchor = el.getAttribute('text-anchor') ?? 'start';
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const baseline = el.getAttribute('dominant-baseline');
  const topY = baseline === 'central' ? y - fs / 2 : y - fs;
  return { x: left, y: topY, w, h: fs };
}
const markOf = (el: Element) => el.closest('[data-cargo-type]')!.getAttribute('data-cargo-type')!;
const notPrintHidden = (m: Element) => {
  for (let el: Element | null = m; el; el = el.parentElement) expect(el.getAttribute('class') ?? '').not.toMatch(/print:hidden/);
};

afterEach(() => vi.restoreAllMocks());

describe('LadeplanScreen — знак позиции без цвета (сборка для ERP)', () => {
  it('рейс из 10 позиций: у каждой стопки вида сверху знак своего типа кеглем «×N», все 10 различны; вид сбоку — у каждой видимой', () => {
    const layout = calculateLayout(load10);
    renderPlanErp(load10, layout);
    const table = new Map(within(screen.getByRole('table')).getAllByTestId('position-mark').map((el) => [markOf(el), el.textContent]));
    expect([...table.values()]).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    const placedTypes = new Set(layout.placements.map((p) => p.cargoTypeId));
    expect(placedTypes.size).toBe(10); // груз подобран так, что все 10 типов на полу
    // вид сверху: ни одна стопка не закрыта — знак у каждой
    const top = document.querySelector('svg[data-cutaway="top"]')!;
    const topStacks = [...top.querySelectorAll('g[data-cargo-type]')];
    expect(new Set(topStacks.map((g) => g.getAttribute('data-cargo-type')))).toEqual(placedTypes);
    for (const g of topStacks) {
      const marks = top.querySelectorAll(`[data-mark-for="${g.getAttribute('data-stack-key')}"] [data-mark]`);
      expect(marks).toHaveLength(1); // у каждой стопки ровно один знак
      expect(marks[0].textContent).toBe(table.get(g.getAttribute('data-cargo-type')!));
    }
    expect(new Set([...top.querySelectorAll('[data-mark]')].map((m) => m.textContent)).size).toBe(10);
    for (const m of document.querySelectorAll('svg[data-cutaway] [data-mark], [data-testid="warehouse-floor"] [data-mark]')) {
      expect(m.getAttribute('data-mark')).toBe(m.textContent);
      expect(m.getAttribute('fill')).toBe('var(--ink)');
      expect(m.getAttribute('stroke')).toBe('var(--card)');
      expect(m.getAttribute('paint-order')).toBe('stroke');
      expect(Number(m.getAttribute('font-size'))).toBe(COUNT_FONT); // кегль = кегль «×N», не меньше
    }
    // вид сбоку: знак у каждой стопки, перед которой ничего нет; нарисованный знак не залезает на ближнюю стопку
    const side = document.querySelector('svg[data-cutaway="side"]')!;
    const rects = sideRects(load10, layout, V.height);
    const keyOf = (r: (typeof rects)[number]) => `${r.cargoTypeId}@${r.x},${r.rowY}`;
    for (const r of rects) {
      const mark = side.querySelector(`[data-mark-for="${keyOf(r)}"] [data-mark]`);
      if ((r.depth ?? 0) === 0) expect(mark?.textContent).toBe(table.get(r.cargoTypeId));
      if (!mark) continue;
      const box = textBox(mark);
      for (const o of rects) if ((o.rowY ?? 0) > (r.rowY ?? 0)) expect(boxesIntersect(box, o)).toBe(false);
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

  it('вид сбоку: плита 144 мм — знак вынесен над полосой; дальняя стопка за ближней — знака нет, с выступом ≥ 1,4 кегля — есть', () => {
    const slab = (id: string, orderId: string) => ({ ...pallet(1, 4), id, name: id, orderId });
    const load: Load = { vehicle: V, cargo: [slab('rear', 'BE-1'), slab('front', 'BE-2'), slab('high', 'BE-3')] };
    const base = calculateLayout(load);
    const unit = (cargoTypeId: string, x: number, y: number, tier: number) =>
      ({ ...base.placements[0], cargoTypeId, x, y, z: (tier - 1) * 144, tier, orientation: 'lwh' as const });
    const layout: Layout = {
      ...base,
      placements: [
        // x 0: дальняя из 2 (288 мм) за ближней из 1 (144 мм) — выступ 144 мм
        unit('rear', 0, 0, 1), unit('rear', 0, 0, 2), unit('front', 0, 800, 1),
        // x 2400: дальняя из 3 (432 мм) за ближней из 1 — выступ 288 мм
        unit('high', 2400, 0, 1), unit('high', 2400, 0, 2), unit('high', 2400, 0, 3), unit('front', 2400, 800, 1),
      ],
      unplaced: [{ cargoTypeId: 'rear', count: 2 }, { cargoTypeId: 'front', count: 2 }, { cargoTypeId: 'high', count: 1 }],
    };
    renderPlanErp(load, layout);
    const side = document.querySelector('svg[data-cutaway="side"]')!;
    const markAt = (key: string) => side.querySelector(`[data-mark-for="${key}"] [data-mark]`);
    expect(markAt('rear@0,0')).toBeNull(); // закрыт — не рисуется вовсе
    expect(markAt('high@2400,0')?.textContent).toBe('C');
    const front = markAt('front@0,800')!;
    expect(front.textContent).toBe('B');
    expect(Number(front.getAttribute('font-size'))).toBe(COUNT_FONT);
    const b = textBox(front);
    expect(b.y + b.h).toBeLessThanOrEqual(V.height - 144); // над полосой
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(1200); // строго над своей стопкой
  });

  it('колонки однородны: упаковщик кладёт в колонку одну позицию, правка не ставит колонку на чужую', () => {
    // Движок: packing/orchestrator.ts, packZones — одна колонка `columnPlacements(c, …)` на место пола
    // (ADR 003: «одно напольное место = стопка одного типа»). Поэтому нижней чужой позиции в колонке
    // нет, и знака верхней достаточно.
    for (const load of [load10, load9]) {
      const typesAt = new Map<string, Set<string>>();
      for (const p of calculateLayout(load).placements) {
        const k = `${p.x}:${p.y}`;
        typesAt.set(k, (typesAt.get(k) ?? new Set()).add(p.cargoTypeId));
      }
      for (const t of typesAt.values()) expect(t.size).toBe(1);
    }
    const layout = calculateLayout(load10);
    const a = layout.placements.find((p) => p.cargoTypeId === 'p1')!;
    const b = layout.placements.find((p) => p.cargoTypeId === 'p2')!;
    const r = moveStack(load10, layout, { cargoTypeId: 'p1', x: a.x, y: a.y }, b.x, b.y);
    expect(r.error?.code).toBe('ERR_EDIT_OVERLAP');
  });

  it('вид сверху: знак не налезает на имя артикула и «×N» (следы 600×400, 800×600, 1200×800)', () => {
    for (const [l, w] of [[600, 400], [800, 600], [1200, 800]]) {
      const c: CargoType = { ...pallet(1, 6), length: l, width: w, name: 'Sonderpalette lang', rotation: 'none' };
      const load: Load = { vehicle: V, cargo: [c] };
      const { unmount } = render(
        <LocaleProvider initial="de">
          <CrossSection load={load} layout={calculateLayout(load)} view="top" label="top" marks={new Map([['p1', 'AB']])} />
        </LocaleProvider>,
      );
      const top = document.querySelector('svg[data-cutaway="top"]')!;
      const stacks = [...top.querySelectorAll('g[data-cargo-type]')];
      expect(stacks.length).toBeGreaterThan(0);
      for (const g of stacks) {
        const mark = top.querySelector(`[data-mark-for="${g.getAttribute('data-stack-key')}"] [data-mark]`)!;
        const markBox = textBox(mark);
        const labels = [...g.querySelectorAll('text')];
        expect(labels.length).toBeGreaterThan(0);
        for (const t of labels) expect(boxesIntersect(markBox, textBox(t))).toBe(false);
      }
      unmount();
    }
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
      const marks = [...s.svg.querySelectorAll('[data-mark]')];
      const shown = new Set(marks.map((m) => m.textContent));
      // сверху видна каждая стопка; сбоку — только не закрытые ближним рядом
      if (s.svg.dataset.cutaway === 'top') expect(shown).toEqual(new Set(tableMarks));
      else for (const m of shown) expect(tableMarks).toContain(m);
      expect(marks.length).toBeGreaterThan(0);
      for (const m of marks) expect(Number(m.getAttribute('font-size'))).toBe(COUNT_FONT);
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
