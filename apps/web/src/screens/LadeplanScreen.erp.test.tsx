// Экран плана в сборке для ERP (макет, блок 4): действия, таблица позиций, «Platz für …», «Nicht im LKW».
// Всё, что показывает числа и состав, считается от ТЕКУЩЕЙ раскладки — включая ручные правки.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, type CargoType, type Layout, type Load } from '@shadrin-v/engine';
import type { ErpSession } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { HostProvider, type Host } from '../host/HostContext';
import type { ErpSource } from '../data/ErpSource';
import type { PlanContext } from '../erp/planContext';
import { LadeplanScreen } from './LadeplanScreen';
import { installSvgGeometry } from './components/svgTestGeometry';
import * as exportPlanModule from '../lib/exportPlan';

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' };
const ERP_HOST: Host = { kind: 'erp', session: SESSION, source: {} as ErpSource };

const V = { id: 'v1', name: 'LKW Standard', length: 2000, width: 2000, height: 2000 };
const cube = (id: string, quantity: number, orderId: string, name = 'Box'): CargoType => ({
  id,
  name,
  length: 1000,
  width: 1000,
  height: 1000,
  quantity,
  rotation: 'none',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
  orderId,
});
/** 1 позиция, 3 куба; в пустой кузов 2×2×2 м входит 8. Раскладка: стопка из 2 в (0,0) и из 1 в (0,1000). */
const oneLoad: Load = { vehicle: V, cargo: [cube('c1', 3, 'BE-40371')] };
/** 10 кубов при максимуме 8: 2 не влезают (одной стопкой из 2). */
const overLoad: Load = { vehicle: V, cargo: [cube('c1', 10, 'BE-40371')] };
/** Смешанный рейс: 2 заказа, 3 позиции; у последней 2 куба не влезают. */
const mixLoad: Load = {
  vehicle: V,
  cargo: [cube('a', 2, 'BE-40371', 'Alpha'), cube('b', 2, 'BE-40371', 'Beta'), cube('c', 6, 'BE-40397', 'Gamma')],
};

const ctxFor = (load: Load, unplaceable: PlanContext['unplaceable'] = []): PlanContext => ({
  trip: { tripId: 'LKW-12866', loadingDate: '2026-11-24' },
  orders: { 'BE-40371': { partner: 'Beispiel Paletten SIA' }, 'BE-40397': { partner: 'Muster Holz Sp. z o.o.', customer: 'AB-41990' } },
  items: Object.fromEntries(load.cargo.map((c) => [c.id, { itemCode: 'EUR101' }])),
  positionOrder: [...load.cargo.map((c) => c.id), ...unplaceable.map((u) => u.positionId)],
  unplaceable,
});
const m3Line: PlanContext['unplaceable'][number] = {
  positionId: 'pos-m3',
  orderId: 'BE-40397',
  itemCode: 'SCH205',
  itemName: 'Bretter 22x100x1200 mm frisch',
  uom: 'Cubic Meter',
  sourceQuantity: 12.4,
  reason: 'ERR_LINE_UNIT_NOT_PIECES',
};
const { sourceQuantity: _q, ...m3LineNoQty } = m3Line;
const ctx = ctxFor(oneLoad);

function renderPlanErp(load: Load, layout: Layout, context?: PlanContext) {
  return render(
    <HostProvider value={ERP_HOST}>
      <LocaleProvider initial="de">
        <LadeplanScreen load={load} layout={layout} context={context} />
      </LocaleProvider>
    </HostProvider>,
  );
}
function renderPlan(load: Load, layout: Layout) {
  return render(
    <LocaleProvider initial="de">
      <LadeplanScreen load={load} layout={layout} />
    </LocaleProvider>,
  );
}

/** Снять одну стопку кузова в «Lager» тем же жестом, что в LadeplanScreen.test.tsx: нажать на стопку
 *  вида сверху и отпустить ниже кузова, над полосой склада. Геометрия — тождественная (px = мм), а
 *  прямоугольник полосы склада (div) подменён на весь лист. */
function withYardRig(run: () => void) {
  const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 2000, height: 2000 });
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function () {
    return { left: 0, right: 4000, top: 0, bottom: 4000, width: 4000, height: 4000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  try {
    run();
  } finally {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    restoreSvg();
  }
}
function dragStackToYard(ref: string, at: { x: number; y: number }) {
  const svg = document.querySelector('svg[data-hold="top"]')!;
  fireEvent.pointerDown(svg.querySelector(`[data-stack-ref="${ref}"]`)!, { clientX: at.x, clientY: at.y });
  fireEvent.pointerMove(svg, { clientX: at.x, clientY: 2600 });
  fireEvent.pointerUp(svg, { clientX: at.x, clientY: 2600 });
}

afterEach(() => vi.restoreAllMocks());

describe('LadeplanScreen — сборка для ERP (макет, блок 4)', () => {
  it('действия по макету: LKW anzeigen, Als Bild speichern, Drucken; PDF и JSON нет', () => {
    renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
    expect(screen.getByRole('checkbox', { name: 'LKW anzeigen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Als Bild speichern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drucken' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'JSON' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PDF' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PNG' })).toBeNull();
    expect(screen.getByText('Reise LKW-12866 · Verladung 24.11.2026')).toBeInTheDocument();
    expect(screen.queryByTestId('warehouse-floor')).toBeNull(); // всё поместилось — пустого поля «Lager» нет
    expect(screen.getByTestId('warehouse-all-placed')).toHaveTextContent('alles platziert');
    expect(screen.getByTestId('warehouse-all-placed')).toHaveTextContent('Lager');
  });

  it('рейс без даты погрузки: «Reise {tripId}» без даты', () => {
    renderPlanErp(oneLoad, calculateLayout(oneLoad), { ...ctx, trip: { tripId: 'LKW-12866' } });
    expect(screen.getByText('Reise LKW-12866')).toBeInTheDocument();
  });

  it('«Drucken» открывает диалог печати', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
    await userEvent.click(screen.getByRole('button', { name: 'Drucken' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('таблица позиций: колонки макета, числа; «max» не в печать, «nicht im LKW» в печать', () => {
    renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Bestellung',
      'Artikel',
      'Menge',
      'im LKW',
      'nicht im LKW',
      'max. in diesen LKW',
    ]);
    expect(within(table).getByText('EUR101')).toBeInTheDocument();
    expect(within(table).getByText('BE-40371')).toBeInTheDocument();
    expect(within(table).getByText('Beispiel Paletten SIA')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'max. in diesen LKW' }).className).toContain('print:hidden');
    expect(within(table).getByRole('columnheader', { name: 'nicht im LKW' }).className).not.toContain('print:hidden');
    const row = within(table).getAllByRole('row')[1];
    expect(row.getAttribute('data-cargo-type')).toBe('c1');
    const cells = within(row).getAllByRole('cell');
    expect(cells.map((c) => c.textContent).slice(2)).toEqual(['3', '3', '0', '8']);
    expect(cells[5].className).toContain('print:hidden');
    expect(cells[1]).toHaveTextContent('1.000 × 1.000 × 1.000 mm');
    expect(screen.queryByTestId('legend-capacity')).toBeNull(); // легенда обычной сборки не рисуется
    expect(screen.queryByRole('region', { name: 'Legende' })).toBeNull();
  });

  it('прямая поставка: в строке заказа «direkt an {customer}»', () => {
    renderPlanErp(mixLoad, calculateLayout(mixLoad), ctxFor(mixLoad));
    expect(within(screen.getByRole('table')).getByText('direkt an AB-41990')).toBeInTheDocument();
  });

  it('рейс из одной позиции: «Platz für N weitere Stück», оба блока не в печать', () => {
    renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
    const title = screen.getByText('Platz für 5 weitere Stück');
    expect(screen.getByText(/In diesen LKW passen 8 Stück Box\. Geladen sind 3\./)).toBeInTheDocument();
    const note = screen.getByText(/so viele Stück dieses Artikels passen in einen leeren LKW Standard/);
    for (const el of [title, note]) expect(el.closest('[class*="print:hidden"]')).not.toBeNull();
  });

  it('места нет (в машине максимум) — строки «Platz für …» нет, отрицательного числа тоже', () => {
    renderPlanErp(overLoad, calculateLayout(overLoad), ctxFor(overLoad));
    expect(screen.queryByText(/Platz für/)).toBeNull();
    expect(screen.queryByText(/(^|\s)[-−]\d/)).toBeNull();
  });

  it('в машине больше «максимума одного артикула» (ручная правка) — строки «Platz für …» нет', () => {
    // 9 единиц при максимуме 8: девятая положена руками поверх (раскладка построена вручную).
    const base = calculateLayout(overLoad);
    const extra = { ...base.placements[0], x: 1000, y: 1000, z: 2000, tier: 3 };
    const edited: Layout = { ...base, placements: [...base.placements, extra], unplaced: [{ cargoTypeId: 'c1', count: 1 }] };
    renderPlanErp(overLoad, edited, ctxFor(overLoad));
    expect(screen.queryByText(/Platz für/)).toBeNull();
    expect(screen.queryByText(/In diesen LKW passen/)).toBeNull();
    expect(screen.queryByText(/(^|\s)[-−]\d/)).toBeNull();
    const cells = within(within(screen.getByRole('table')).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells.map((c) => c.textContent).slice(2)).toEqual(['10', '9', '1 nicht im LKW', '8']);
  });

  it('смешанный рейс — строки «Platz für …» нет', () => {
    renderPlanErp(mixLoad, calculateLayout(mixLoad), ctxFor(mixLoad));
    expect(screen.queryByText(/Platz für/)).toBeNull();
    // сноска о «max.» остаётся — колонка есть всегда
    expect(screen.getByText(/so viele Stück dieses Artikels/)).toBeInTheDocument();
  });

  it('«Nicht im LKW»: непоместившееся со стопками и причиной, строка в м³ с причиной; печатается', () => {
    const ctxM3 = ctxFor(overLoad, [m3Line]);
    renderPlanErp(overLoad, calculateLayout(overLoad), ctxM3);
    const list = screen.getByTestId('not-in-truck');
    expect(within(list).getByText('Nicht im LKW')).toBeInTheDocument();
    expect(within(list).getByText('kein Platz')).toBeInTheDocument();
    expect(within(list).getByText(/Stapel zu/)).toHaveTextContent('EUR101 Box · 1 Stapel zu 2');
    expect(within(list).getByText('2 Stk')).toBeInTheDocument();
    expect(within(list).getByText('in m³: nicht planbar')).toBeInTheDocument();
    expect(within(list).getByText('12,4 m³')).toBeInTheDocument();
    expect(within(list).getByText('SCH205 Bretter 22x100x1200 mm frisch')).toBeInTheDocument();
    expect(within(list).getByText('BE-40397 · Muster Holz Sp. z o.o. · direkt an AB-41990')).toBeInTheDocument();
    expect(list.textContent).not.toMatch(/[{}]/); // ни одного сырого шаблона
    const rows = list.querySelectorAll('[data-position-id]');
    expect([...rows].map((r) => r.getAttribute('data-position-id'))).toEqual(['c1', 'pos-m3']);
    expect(rows[0].getAttribute('data-cargo-type')).toBe('c1');
    for (let el: Element | null = list; el; el = el.parentElement) expect(el.getAttribute('class') ?? '').not.toMatch(/print:hidden/);
    // в таблице: «nicht im LKW» красным, с подписью
    const cells = within(within(screen.getByRole('table')).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[4]).toHaveTextContent('2 nicht im LKW');
    expect(cells[4].querySelector('.text-danger')).not.toBeNull();
  });

  it('«Nicht im LKW»: строка в м³ без sourceQuantity — без количества, причина остаётся', () => {
    const ctxNoQty = ctxFor(oneLoad, [m3LineNoQty]);
    renderPlanErp(oneLoad, calculateLayout(oneLoad), ctxNoQty);
    const list = screen.getByTestId('not-in-truck');
    expect(within(list).queryByText(/m³$/)).toBeNull();
    expect(within(list).getByText('in m³: nicht planbar')).toBeInTheDocument();
  });

  it('всё поместилось и неразмещаемых нет — списка «Nicht im LKW» нет', () => {
    renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
    expect(screen.queryByTestId('not-in-truck')).toBeNull();
  });

  it('без контекста (старый сохранённый план) экран ERP работает: таблица без кода артикула и рейса', () => {
    renderPlanErp(oneLoad, calculateLayout(oneLoad));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/Reise/)).toBeNull();
    expect(screen.getByText('Platz für 5 weitere Stück')).toBeInTheDocument();
  });

  it('обычная сборка без изменений: легенда, PDF и JSON на месте, таблицы и «Nicht im LKW» нет', () => {
    renderPlan(overLoad, calculateLayout(overLoad));
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PNG' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Legende' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('not-in-truck')).toBeNull();
    expect(screen.queryByText(/Platz für/)).toBeNull();
    expect(screen.queryByTestId('warehouse-all-placed')).toBeNull();
  });

  it('снять стопку в «Lager» → таблица, «Platz für …», «Nicht im LKW» и показатели пересчитаны по текущей раскладке', () => {
    withYardRig(() => {
      renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
      expect(screen.getByText('Platz für 5 weitere Stück')).toBeInTheDocument();
      dragStackToYard('c1@0,1000', { x: 500, y: 1500 }); // стопка из 1 куба
      const row = within(screen.getByRole('table')).getAllByRole('row')[1];
      const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
      // Menge / im LKW / nicht im LKW / max
      expect(cells.slice(2)).toEqual(['3', '2', '1 nicht im LKW', '8']);
      expect(screen.getByText('Platz für 6 weitere Stück')).toBeInTheDocument();
      expect(screen.getByText(/Geladen sind 2\./)).toBeInTheDocument();
      expect(within(screen.getByTestId('not-in-truck')).getByText(/^1 Stk/)).toBeInTheDocument();
      expect(screen.getByTestId('fig-unplaced')).toHaveTextContent('1');
      expect(screen.queryByTestId('warehouse-all-placed')).toBeNull();
      expect(screen.getByTestId('warehouse-floor')).toBeInTheDocument();
    });
  });

  it('всё поместилось: пока стопку несут из кузова, поле «Lager» возвращается как цель броска', () => {
    withYardRig(() => {
      renderPlanErp(oneLoad, calculateLayout(oneLoad), ctx);
      const svg = document.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c1@0,1000"]')!, { clientX: 500, clientY: 1500 });
      fireEvent.pointerMove(svg, { clientX: 500, clientY: 2600 });
      expect(screen.getByTestId('warehouse-floor')).toBeInTheDocument();
      expect(screen.queryByTestId('warehouse-all-placed')).toBeNull();
      fireEvent.pointerCancel(svg, { clientX: 500, clientY: 2600 });
      expect(screen.getByTestId('warehouse-all-placed')).toBeInTheDocument();
    });
  });

  it('картинка смешанного рейса: неразмещённое после правки, строка в м³ и заметка о весе', async () => {
    const spy = vi.spyOn(exportPlanModule, 'exportPlanPng').mockResolvedValue();
    const layout = calculateLayout(mixLoad);
    const before = layout.unplaced.reduce((n, u) => n + u.count, 0);
    const moved = layout.placements.filter((p) => p.cargoTypeId === 'a' && p.x === 0 && p.y === 0).length;
    const unplacedAfterEdit = before + moved;
    expect(moved).toBeGreaterThan(0);
    withYardRig(() => {
      renderPlanErp(mixLoad, layout, ctxFor(mixLoad, [m3Line]));
      dragStackToYard('a@0,0', { x: 500, y: 500 });
    });
    // клик — уже вне подмены геометрии: она нужна только жесту
    await userEvent.click(screen.getByRole('button', { name: 'Als Bild speichern' }));
    expect(spy).toHaveBeenCalledTimes(1);
    const opts = spy.mock.calls[0][1];
    expect(opts.legend).toHaveLength(3); // по строке на позицию; знаки добавляет задача 15
    expect(opts.legend[0].label).toBe(`BE-40371 — EUR101 Alpha ×0 (${moved} nicht im LKW)`);
    expect(opts.legend[2].label).toBe('BE-40397 — EUR101 Gamma ×4 (2 nicht im LKW)');
    const notes = opts.notes!.flatMap((n) => [n.title, ...n.lines]).join('\n');
    expect(notes).toContain('Nicht im LKW');
    expect(notes).toContain('12,4 m³');
    expect(notes).toContain('kein Platz');
    expect(notes).toContain('in m³: nicht planbar');
    expect(notes).toContain('Gewicht wird nicht geprüft');
    expect(notes).toContain('Der Ladungsplaner rechnet nur mit Maßen.');
    expect(notes).not.toMatch(/[{}]/);
    expect(opts.figures.find((f) => f.label === 'Nicht platziert')?.value).toBe(String(unplacedAfterEdit));
    expect(opts.meta).toContain('Reise LKW-12866 · Verladung 24.11.2026');
  });
});
