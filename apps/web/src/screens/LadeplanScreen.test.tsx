import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { LadeplanScreen, mergeBayOrder } from './LadeplanScreen';
import { installSvgGeometry } from './components/svgTestGeometry';
import * as exportPlan from '../lib/exportPlan';

const V = { id: 'v1', name: 'LKW', length: 2000, width: 2000, height: 2000 };
const load: Load = {
  vehicle: V,
  cargo: [
    {
      id: 'c1',
      name: 'Box',
      length: 1000,
      width: 1000,
      height: 1000,
      quantity: 8,
      rotation: 'none',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const layout = calculateLayout(load);

function renderLadeplan() {
  return render(
    <LocaleProvider initial="de">
      <LadeplanScreen load={load} layout={layout} />
    </LocaleProvider>,
  );
}

describe('LadeplanScreen', () => {
  it('renders the brand kicker, vehicle-name heading and both cutaways', () => {
    renderLadeplan();
    expect(screen.getByText('Ladeplan · Ladungsplaner')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('LKW');
    expect(screen.getByRole('group', { name: 'Draufsicht' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Seitenansicht' })).toBeInTheDocument();
  });

  it('shows the meta band with inner vehicle dimensions and figure labels', () => {
    renderLadeplan();
    expect(screen.getByText('Fahrzeug (innen)')).toBeInTheDocument();
    // de grouping: 2000 → "2.000"; unit once at the end
    expect(screen.getByText('2.000 × 2.000 × 2.000 mm')).toBeInTheDocument();
    // Figure labels. The band is now the only place they appear (D1), hence getByText — and
    // "Bodenauslastung" rather than a bare "Auslastung", which is ambiguous next to the volume.
    expect(screen.getByText('Paletten')).toBeInTheDocument();
    expect(screen.getByText('Stellplätze')).toBeInTheDocument();
    expect(screen.getByText('Bodenauslastung')).toBeInTheDocument();
  });

  it('legend breaks the order down by position (name × placed)', () => {
    renderLadeplan();
    // order id appears (legend + meta band)
    expect(screen.getAllByText('SO-1').length).toBeGreaterThan(0);
    // the single position "Box" placed ×8 (8 cubes fill the 2×2×2 hold exactly).
    // Запрос сужен до самой легенды: с ayg имя артикула стоит ещё и на каждой стопке разреза,
    // и общестраничный getByText(/Box/) стал неоднозначным — это про охват запроса, не про легенду.
    const legend = within(screen.getByRole('region', { name: 'Legende' }));
    expect(legend.getByText(/Box/)).toBeInTheDocument();
    expect(legend.getByText('×8')).toBeInTheDocument();
  });

  it('makes top-view stacks draggable (onMoveStack wired)', () => {
    const { container } = renderLadeplan();
    expect(container.querySelector('g[style*="grab"]')).toBeInTheDocument();
  });

  it('holds the geometry invariant (0 violations) — both directly and via the DOM flag', () => {
    expect(findGeometryViolations(load, layout)).toEqual([]);
    const { container } = renderLadeplan();
    expect(container.querySelector('[data-violations]')?.getAttribute('data-violations')).toBe('0');
  });
});

// Export (qrd.15): PDF via the print dialog, PNG rasterised client-side, JSON verbatim per contract.
// The plan's worst news must sit with the summary figures, not only in the legend far below (rgv.7).
describe('LadeplanScreen — unplaced figure', () => {
  it('omits the unplaced figure when everything fits', () => {
    renderLadeplan(); // 8 cubes fill the 2×2×2 hold exactly
    expect(screen.queryByTestId('fig-unplaced')).not.toBeInTheDocument();
  });

  it('shows the unplaced count with the figures when some units did not fit', () => {
    const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
      </LocaleProvider>,
    );
    const fig = screen.getByTestId('fig-unplaced');
    expect(fig).toHaveTextContent('3'); // 11 requested − 8 placed
    expect(fig).toHaveTextContent('Nicht platziert');
  });

  // LKWkalk-x7e, решение владельца: печатный лист говорит только о том, что погружено. Это ОТМЕНА
  // прежнего решения rgv.7 («худшая новость плана едет со сводкой»), поэтому проверяются оба места,
  // где неразмещённое просачивалось в печать: показатель в сводной ленте и приписки в легенде. На
  // экране оба остаются — прячет их только @media print, а в jsdom раскладки нет, так что честно
  // проверить можно лишь СЦЕПКУ: крючок `print:hidden` стоит на тех самых элементах.
  describe('печать не показывает неразмещённое (x7e)', () => {
    const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };
    const renderOverloaded = () =>
      render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
        </LocaleProvider>,
      );

    it('показатель «Не размещено» несёт крючок печати и остаётся виден на экране', () => {
      renderOverloaded();
      const fig = screen.getByTestId('fig-unplaced');
      expect(fig).toBeInTheDocument(); // на экране — как было
      expect(fig.className).toContain('print:hidden');
    });

    it('приписки «N не размещено» в легенде несут тот же крючок', () => {
      renderOverloaded();
      const notes = document.querySelectorAll('[data-testid="legend-unplaced"]');
      expect(notes.length).toBeGreaterThan(0); // приписка есть — груз действительно не влез
      for (const n of notes) expect(n.className).toContain('print:hidden');
    });

    it('остальная легенда крючок печати НЕ несёт — на листе остаётся то, что погружено', () => {
      renderOverloaded();
      const placed = document.querySelector('[data-testid="legend-placed"]')!;
      expect(placed.className).not.toContain('print:hidden');
    });
  });
});

// LKWkalk-7i6, замечание владельца: в панели раскладки нужно уметь отключить отображение грузовика,
// сверху и снизу. Решения владельца: ОДИН тумблер на оба вида; контрол живёт в панели раскладки (там
// же, где экспорт), а не в липкой шапке; выбор действует и на экран, и на вывод — печать с PNG берут
// то же состояние, потому что рисуют те же самые svg.
describe('LadeplanScreen — показ грузовика (7i6)', () => {
  const label = 'LKW anzeigen';
  afterEach(() => globalThis.localStorage?.clear());

  it('по умолчанию грузовик показан в обоих разрезах', () => {
    const { container } = renderLadeplan();
    expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    expect(container.querySelectorAll('[data-truck-chrome]').length).toBe(2);
  });

  it('снятый флажок убирает обвес сразу в обоих разрезах', async () => {
    const { container } = renderLadeplan();
    await userEvent.click(screen.getByRole('checkbox', { name: label }));
    expect(container.querySelectorAll('[data-truck-chrome]').length).toBe(0);
  });

  // Тумблер не должен уносить измерительную часть: рамки кузова остаются в обоих разрезах.
  it('без грузовика рамки кузова на месте', async () => {
    const { container } = renderLadeplan();
    await userEvent.click(screen.getByRole('checkbox', { name: label }));
    expect(container.querySelectorAll('rect[stroke="var(--truck)"]').length).toBe(2);
  });

  it('выбор переживает перезагрузку — как и режим двора', async () => {
    const { unmount } = renderLadeplan();
    await userEvent.click(screen.getByRole('checkbox', { name: label }));
    unmount();

    const { container } = renderLadeplan();
    expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked();
    expect(container.querySelectorAll('[data-truck-chrome]').length).toBe(0);
  });
});

// The buffer (dwc.3): what is NOT in the hold. This describe block only checks wiring and the
// states reachable by clicking, without a real pointer drag. Drag geometry itself (createSVGPoint,
// getScreenCTM, a non-zero bounding rect — none of which jsdom implements) is supplied by
// `svgTestGeometry.ts` and exercised below, in "group selection".
describe('LadeplanScreen — warehouse floor', () => {
  /** 11 cubes into a hold that takes 8 → 3 left over for the warehouse. */
  const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };
  const renderOverloaded = () =>
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
      </LocaleProvider>,
    );
  /** The tile's footprint, read off the shape itself — there is no card to read it from. */
  const footprint = (tile: HTMLElement) => {
    const r = tile.querySelector('rect')!;
    return `${r.getAttribute('width')}×${r.getAttribute('height')}`;
  };

  it('offers the unplaced units as draggable stacks, not as a bare number', () => {
    renderOverloaded();
    expect(screen.getByTestId('warehouse-floor')).toBeInTheDocument();
    expect(screen.getByTestId('warehouse-count')).toHaveTextContent('3 nicht platziert');
    // Tiles are STACKS, not units: the hold takes two cubes per column, so 3 leftovers arrive as a
    // full stack of 2 plus a remainder of 1 — that is what the user actually drags.
    const tiles = screen.getAllByTestId('warehouse-tile');
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.textContent)).toEqual([
      expect.stringContaining('×2'),
      expect.stringContaining('×1'),
    ]);
  });

  it('says the warehouse is empty when everything is in the hold', () => {
    renderLadeplan(); // 8 cubes fill the hold exactly
    expect(screen.getByTestId('warehouse-floor')).toHaveTextContent('Alles platziert');
    expect(screen.queryAllByTestId('warehouse-tile')).toHaveLength(0);
  });

  it('turns a stack on the floor, so it can be dropped in the other way round', async () => {
    const pallets: Load = {
      vehicle: { id: 'v', name: 'LKW', length: 1200, width: 800, height: 1000 },
      cargo: [{ ...load.cargo[0], id: 'p', name: 'Pal', length: 1200, width: 800, height: 900, quantity: 2, rotation: 'yawOnly' }],
    };
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={pallets} layout={calculateLayout(pallets)} />
      </LocaleProvider>,
    );
    expect(footprint(screen.getByTestId('warehouse-tile'))).toBe('1200×800');

    // No ⟳ button any more: click selects the stack, the handle turns it — the hold's own gesture.
    await userEvent.click(screen.getByTestId('warehouse-tile'));
    await userEvent.click(screen.getByRole('button', { name: /Stapel im Lager drehen/ }));
    expect(footprint(screen.getByTestId('warehouse-tile'))).toBe('800×1200'); // yaw flipped
  });

  // Orientation is per TILE (owner: rotate one, not the whole article), keyed by cargo type + its
  // occurrence in the deterministic buffer order — turning one leaves the others of its type as they
  // were, the same as a stack in the hold.
  it('turns a single warehouse stack, leaving the others of its type as they were', async () => {
    const two: Load = {
      vehicle: { id: 'v', name: 'LKW', length: 1200, width: 800, height: 1000 },
      cargo: [
        { ...load.cargo[0], id: 'a', name: 'A', length: 1200, width: 800, height: 900, quantity: 3, rotation: 'yawOnly' },
      ],
    };
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={two} layout={calculateLayout(two)} />
      </LocaleProvider>,
    );
    // one position in the hold, two stacks left over → both tiles are the same type
    expect(screen.getAllByTestId('warehouse-tile')).toHaveLength(2);

    await userEvent.click(screen.getAllByTestId('warehouse-tile')[0]);
    await userEvent.click(screen.getByRole('button', { name: /Stapel im Lager drehen/ }));

    // only the turned tile flips; its neighbour of the same type keeps the original footprint
    const [first, second] = screen.getAllByTestId('warehouse-tile');
    expect(footprint(first)).toBe('800×1200');
    expect(footprint(second)).toBe('1200×800');
  });

  it('offers no rotation for cargo whose rule forbids it', async () => {
    renderOverloaded(); // the cube type is rotation: 'none'
    await userEvent.click(screen.getAllByTestId('warehouse-tile')[0]);
    expect(screen.queryByRole('button', { name: /Stapel im Lager drehen/ })).not.toBeInTheDocument();
  });

  it('carries a ghost of the stack while it is being dragged', () => {
    renderOverloaded();
    expect(screen.queryByTestId('drag-ghost')).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Box ×2' }), { clientX: 10, clientY: 10 });
    expect(screen.getByTestId('drag-ghost')).toHaveTextContent('Box ×2');
  });

  // LKWkalk-zyc: жест переноса стопки со склада вёлся ЛЮБЫМ указателем — второй палец (мультитач)
  // завершал чужой жест своим pointerup, а pointercancel (жест ОС, переключение приложения) вообще
  // не слушался: слушатели оставались, призрак висел до следующего клика. Загон (36f) от этого же
  // класса вылечен в WarehouseFloor — здесь тот же приём: pointerId фиксируется при подъёме и
  // дальше только сверяется, cancel завершает жест без броска.
  describe('перенос стопки фильтрует pointerId и слушает pointercancel (zyc)', () => {
    /** Без installSvgGeometry jsdom не знает PointerEvent, Testing Library падает на голый Event —
     *  и pointerId с координатами молча пропадают: фильтр сравнивал бы undefined с undefined и
     *  тесты были бы вакуумно зелёными. Полифилл живёт в svgTestGeometry (тот же, под которым
     *  работают одноимённые тесты загона в WarehouseFloor.test.tsx). */
    const withPointerEvents = (run: () => void) => {
      const restore = installSvgGeometry();
      try {
        run();
      } finally {
        restore();
      }
    };

    it('чужие pointermove/pointerup (второй палец) не ведут и не завершают жест', () => {
      withPointerEvents(() => {
        renderOverloaded();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Box ×2' }), { clientX: 10, clientY: 10, pointerId: 1 });
        expect(screen.getByTestId('drag-ghost')).toBeInTheDocument();

        // Второй палец: ни его движение, ни его отпускание не завершают чужой жест.
        fireEvent.pointerMove(window, { clientX: 300, clientY: 300, pointerId: 2 });
        fireEvent.pointerUp(window, { clientX: 300, clientY: 300, pointerId: 2 });
        expect(screen.getByTestId('drag-ghost')).toBeInTheDocument();

        // Свой указатель завершает как обычно.
        fireEvent.pointerUp(window, { clientX: 300, clientY: 300, pointerId: 1 });
        expect(screen.queryByTestId('drag-ghost')).not.toBeInTheDocument();
      });
    });

    it('pointercancel завершает перенос без броска — призрак не залипает', () => {
      withPointerEvents(() => {
        renderOverloaded();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Box ×2' }), { clientX: 10, clientY: 10, pointerId: 1 });
        expect(screen.getByTestId('drag-ghost')).toBeInTheDocument();

        // Отмена чужого указателя жест не трогает…
        fireEvent.pointerCancel(window, { clientX: 10, clientY: 10, pointerId: 2 });
        expect(screen.getByTestId('drag-ghost')).toBeInTheDocument();

        // …а своя — завершает.
        fireEvent.pointerCancel(window, { clientX: 10, clientY: 10, pointerId: 1 });
        expect(screen.queryByTestId('drag-ghost')).not.toBeInTheDocument();
      });
    });
  });

  // LKWkalk-fyk. Measured in a real browser: the grabbed yard tile is ~109×73 px, the ghost that
  // followed the cursor was a 78×26 px text chip, and the source tile stayed in its slot at
  // opacity 0.3 — so "did I even pick it up?" was a fair question. The opposite direction never had
  // to answer it: a stack carried out of the hold keeps a full-size shape under the cursor inside
  // the cutaway svg the whole way. These two tests pin the symmetric answer for this direction.
  describe('the carried stack is visible as itself (LKWkalk-fyk)', () => {
    /** Identity geometry: one client px per mm, so the yard's own mm→px scale is 1 and the ghost's
     *  expected pixel size is the cube's 1000×1000 footprint verbatim. */
    const withGeometry = (run: () => void) => {
      const restore = installSvgGeometry();
      try {
        run();
      } finally {
        restore();
      }
    };

    it('carries a picture of the stack at the yard scale, not only a label', () => {
      withGeometry(() => {
        renderOverloaded();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Box ×2' }), { clientX: 100, clientY: 200 });

        const shape = screen.getByTestId('drag-ghost-shape');
        expect(shape.getAttribute('width')).toBe('1000');
        expect(shape.getAttribute('height')).toBe('1000');
        // still says what it is — the picture adds to the label, it does not replace it
        expect(screen.getByTestId('drag-ghost')).toHaveTextContent('Box ×2');
      });
    });

    // Not cosmetics: `tileAim` resolves the drop from the pointer as the stack's MIDDLE
    // (`snap(at.x - dx / 2)`). A ghost drawn down-right of the cursor therefore promises a landing
    // spot that is not the one the release computes.
    it('centres the carried stack on the cursor, where the drop actually resolves', () => {
      withGeometry(() => {
        renderOverloaded();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Box ×2' }), { clientX: 100, clientY: 200 });

        const ghost = screen.getByTestId('drag-ghost');
        expect(ghost.style.left).toBe('-400px'); // 100 − 1000/2
        expect(ghost.style.top).toBe('-300px'); //  200 − 1000/2
      });
    });
  });
});

// 77g: загоны 41e.2 из умолчания стали режимом — владелец после прода сказал «без неё удобнее».
// Выбор режима — настройка ВИДА двора, не часть Load: в контракт и в сохранённый план не лезет и
// пересчёта не запускает, поэтому живёт своим ключом в localStorage.
describe('LadeplanScreen — режим группировки двора (LKWkalk-77g)', () => {
  const twoOrders: Load = {
    vehicle: V,
    cargo: [
      { ...load.cargo[0], quantity: 11 },
      { ...load.cargo[0], id: 'c2', name: 'Kiste', quantity: 4, orderId: 'SO-2' },
    ],
  };
  const renderTwo = () =>
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={twoOrders} layout={calculateLayout(twoOrders)} />
      </LocaleProvider>,
    );

  it('по умолчанию двор не разбит на загоны, а переключатель выключен', () => {
    renderTwo();
    expect(document.querySelectorAll('[data-testid="warehouse-bay"]')).toHaveLength(0);
    const toggle = screen.getByRole('checkbox', { name: 'Nach Auftrag gruppieren' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('включение открывает загоны и переживает перезагрузку своим ключом', async () => {
    const { unmount } = renderTwo();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Nach Auftrag gruppieren' }));

    expect(document.querySelectorAll('[data-testid="warehouse-bay"]').length).toBeGreaterThan(1);
    expect(localStorage.getItem('ladungsplaner.yardGrouping')).toBe('true');
    // и это НЕ часть плана: сохранённый Load переключателем не трогается
    expect(localStorage.getItem('ladungsplaner.load')).toBeNull();

    unmount();
    renderTwo();
    const toggle = screen.getByRole('checkbox', { name: 'Nach Auftrag gruppieren' }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(document.querySelectorAll('[data-testid="warehouse-bay"]').length).toBeGreaterThan(1);
  });
});

// Group edits (dwc.6): the whole selection travels as one, and one edit puts it all in the buffer.
describe('LadeplanScreen — group selection', () => {
  /** Stub the geometry jsdom lacks, plus a buffer strip just below the cutaway, so a release at
   *  y=2600 is outside the hold AND over the strip. Restores both, whatever the body does. */
  const withStubbedGeometry = (
    svgRect: { left: number; top: number; width: number; height: number },
    run: () => void,
  ) => {
    const restoreSvg = installSvgGeometry(svgRect);
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return {
        left: 0, top: 2400, right: 4000, bottom: 3000,
        width: 4000, height: 600, x: 0, y: 2400, toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      run();
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  };

  /** Rubber-band everything along y=0, then drag the stack at the origin to (toX, toY) client px. */
  const bandThenDrag = (container: HTMLElement, ref: string, toX: number, toY: number) => {
    // The pointer handlers moved to the nested cargo svg (Task 5 nested-svg wrap); events on the
    // outer chrome svg would not reach them. data-stack-ref g's are still descendants of it.
    const svg = container.querySelector('svg[data-hold="top"]')!;
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });

    fireEvent.pointerDown(svg.querySelector(`[data-stack-ref="${ref}"]`)!, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: toX, clientY: toY });
    fireEvent.pointerUp(svg, { clientX: toX, clientY: toY });
    return svg;
  };

  it('sends a whole group to the buffer in one gesture', () => {
    // The 2×2 m hold holds four columns of two cubes; the band catches the two along y=0.
    withStubbedGeometry({ left: 0, top: 0, width: 2000, height: 2000 }, () => {
      const { container } = renderLadeplan();
      expect(screen.queryByTestId('warehouse-count')).not.toBeInTheDocument(); // 8 of 8 placed

      bandThenDrag(container, 'c1@0,0', 500, 2600); // released below the cutaway, over the strip

      // Both stacks of the group are unplaced, i.e. all four cubes they carried — not just one stack.
      expect(screen.getByTestId('warehouse-count')).toHaveTextContent('4 nicht platziert');
    });
  });

  it('moves a whole group inside the hold with a single edit', () => {
    // A 3 m single-file hold with two cubes at x=0 and x=1000 — room to shift the pair along.
    const row: Load = {
      vehicle: { id: 'v3', name: 'LKW', length: 3000, width: 1000, height: 1000 },
      cargo: [{ ...load.cargo[0], quantity: 2, stacking: { stackable: false } }],
    };
    withStubbedGeometry({ left: 0, top: 0, width: 3000, height: 1000 }, () => {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={row} layout={calculateLayout(row)} />
        </LocaleProvider>,
      );
      const svg = bandThenDrag(container, 'c1@0,0', 1500, 500); // one metre along the length

      // The block landed as a block — nothing left at x=0, both members one cell further on — and
      // the geometry invariant still holds, which is what a group move must never break.
      expect(svg.querySelector('[data-stack-ref="c1@0,0"]')).toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@1000,0"]')).not.toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@2000,0"]')).not.toBeNull();
      expect(container.querySelector('[data-violations]')).toHaveAttribute('data-violations', '0');
      expect(screen.queryByTestId('edit-error')).not.toBeInTheDocument();
    });
  });

  it('shows edit-error and leaves the block in place when a group move is refused', () => {
    // Three single-file cubes at x=0/1000/2000 in a 4 m hold, spelled out by hand — the packer's own
    // answer for three 1x1x1 cubes here is an L (0,0 / 0,1000 / 1000,0), not a row (see the group
    // selection fixture in CrossSection.test.tsx for the same note). Band-select the first two and
    // drag them one cell further — straight onto the third, UNSELECTED cube. That is an overlap
    // refusal that never leaves the cutaway's own client rect, so it cannot be mistaken for a drop
    // outside the hold (unlike aiming past the outer wall, where the svg's box and the vehicle's box
    // coincide in these tests and the two situations become impossible to tell apart).
    const threeInRow: Load = {
      vehicle: { id: 'v4', name: 'LKW', length: 4000, width: 2000, height: 1000 },
      cargo: [{ ...load.cargo[0], quantity: 3, stacking: { stackable: false } }],
    };
    const cubeAt = (x: number, y: number): Layout['placements'][number] => ({
      cargoTypeId: 'c1', x, y, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt',
    });
    const threeInRowLayout: Layout = {
      placements: [cubeAt(0, 0), cubeAt(1000, 0), cubeAt(2000, 0)],
      unplaced: [],
      metrics: { totalPlaced: 3, usedFloorPositions: 3, floorFillPercent: 0, volumeFillPercent: 0 },
      contractVersion: '0.14.0',
    };
    withStubbedGeometry({ left: 0, top: 0, width: 4000, height: 2000 }, () => {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={threeInRow} layout={threeInRowLayout} />
        </LocaleProvider>,
      );
      const svg = bandThenDrag(container, 'c1@0,0', 1500, 500); // one cell right — into the third cube

      // the block never moved — none of the three cubes shifted
      expect(svg.querySelector('[data-stack-ref="c1@0,0"]')).not.toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@1000,0"]')).not.toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@2000,0"]')).not.toBeNull();
      // the selection survives the refusal, and this time the reason is shown to the user
      expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
      expect(screen.getByTestId('edit-error')).toBeVisible();
    });
  });

  it('drops a stale selection when a fresh plan is computed', () => {
    // A selection is a list of floor coordinates. A recompute (loading mode, order grouping) repacks
    // the hold underneath it, so those coordinates stop meaning the stacks the user picked — the
    // frame would span one stack while the label still said two, and a later nudge would move
    // whatever now stands there.
    withStubbedGeometry({ left: 0, top: 0, width: 2000, height: 2000 }, () => {
      const { container, rerender } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={load} layout={layout} />
        </LocaleProvider>,
      );
      const svg = container.querySelector('svg[data-hold="top"]')!; // nested cargo svg holds the handlers
      fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
      fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
      fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });
      expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');

      // The repacked plan keeps only one of the two selected columns.
      const repacked: Layout = {
        ...layout,
        placements: layout.placements.filter((p) => p.x === 0 && p.y === 0),
      };
      rerender(
        <LocaleProvider initial="de">
          <LadeplanScreen load={load} layout={repacked} />
        </LocaleProvider>,
      );

      expect(screen.queryByTestId('group-count')).toBeNull();
      expect(screen.queryByTestId('group-frame')).toBeNull();
      expect(container.querySelector('[stroke-dasharray="6 4"]')).toBeNull();
    });
  });

  it('keeps the block selected through its own move — an edit is not a recompute', () => {
    // The counterpart of the test above: manual edits never touch the `layout` prop, so the top view
    // is NOT reset by them and the block can be nudged again without re-drawing the marquee.
    const row: Load = {
      vehicle: { id: 'v3', name: 'LKW', length: 3000, width: 1000, height: 1000 },
      cargo: [{ ...load.cargo[0], quantity: 2, stacking: { stackable: false } }],
    };
    withStubbedGeometry({ left: 0, top: 0, width: 3000, height: 1000 }, () => {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={row} layout={calculateLayout(row)} />
        </LocaleProvider>,
      );
      bandThenDrag(container, 'c1@0,0', 1500, 500); // one metre along the length

      expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
      // and it follows the block to where it now stands, rather than staying behind
      expect(screen.getByTestId('group-frame')).toHaveAttribute('x', '1000');
    });
  });

  // The buffer verdict (dwc.6): `onDropOutside`'s return tells CrossSection whether the release
  // actually took the stacks off the floor — only then may it drop the selection. Nothing here pins
  // the `true` branch itself: round-trip a group through the buffer and back, onto the exact cell it
  // vacated, and check the returning stack does NOT inherit the stale selection.
  it('does not resurrect a stale selection on a stack returned to a vacated cell (buffer verdict)', () => {
    // If `onDropOutside` did not clear the selection on a genuine buffer hit, the stale refs would
    // still name (0,0)/(1000,0) — and a stack later placed back at (0,0) would silently render as
    // part of a group the user never selected. `groupBBox` matches no drawn rect right after the
    // drop, which is exactly why no existing assertion catches it — this test checks the return trip.
    withStubbedGeometry({ left: 0, top: 0, width: 2000, height: 2000 }, () => {
      const { container } = renderLadeplan(); // 8 cubes fill the hold exactly
      const svg = bandThenDrag(container, 'c1@0,0', 500, 2600); // group → buffer strip
      expect(screen.getByTestId('warehouse-count')).toHaveTextContent('4 nicht platziert');

      // Drag the first buffered tile back onto the cell the group just vacated. The identity geometry
      // stub makes client px == hold mm, and a tile is held by its centre, so aiming at (500, 500)
      // resolves a 1000×1000 stack to (0, 0) — the exact ref the stale selection would still hold.
      fireEvent.pointerDown(screen.getAllByTestId('warehouse-tile')[0], { clientX: 10, clientY: 10 });
      fireEvent.pointerUp(window, { clientX: 500, clientY: 500 });

      const returned = svg.querySelector('[data-stack-ref="c1@0,0"]');
      expect(returned).not.toBeNull();
      // Not selected: no dashed outline on the returning stack, and no group label anywhere. Coerced
      // to boolean before the assertion — jsdom elements crash chai's failure-message pretty-printer
      // (unrelated bug, unrelated to what we're pinning), which would otherwise mask a real failure
      // here behind an opaque "Cannot read properties of undefined (reading 'name')".
      expect(Boolean(returned!.querySelector('[stroke-dasharray="6 4"]'))).toBe(false);
      expect(Boolean(screen.queryByTestId('group-count'))).toBe(false);
    });
  });
});

// The symmetric direction (T3): a stack carried OUT of the hold toward the warehouse strip. Its own
// visual lives inside the top-view cutaway svg and is clipped the instant the cursor leaves it — this
// page-level ghost is what stays visible for the whole trip, the counterpart of `drag-ghost` above.
describe('LadeplanScreen — hold-drag ghost (page-level, T3)', () => {
  it('shows a page-level ghost while a stack is dragged out of the hold, and clears it on release', () => {
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 2000, height: 2000 });
    try {
      const { container } = renderLadeplan(); // 8 Box cubes fill the 2×2×2 hold
      const svg = container.querySelector('svg[data-hold="top"]')!;
      expect(screen.queryByTestId('hold-drag-ghost')).not.toBeInTheDocument();

      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c1@0,0"]')!, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(svg, { clientX: 400, clientY: 2600 }); // toward the warehouse, below the hold

      const ghost = screen.getByTestId('hold-drag-ghost');
      expect(ghost.textContent).toMatch(/^Box ×\d+$/);

      fireEvent.pointerUp(svg, { clientX: 400, clientY: 2600 });
      expect(screen.queryByTestId('hold-drag-ghost')).not.toBeInTheDocument();
    } finally {
      restoreSvg();
    }
  });

  it('clears the ghost on pointercancel too, not only on release', () => {
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 2000, height: 2000 });
    try {
      const { container } = renderLadeplan();
      const svg = container.querySelector('svg[data-hold="top"]')!;

      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c1@0,0"]')!, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(svg, { clientX: 400, clientY: 2600 });
      expect(screen.getByTestId('hold-drag-ghost')).toBeInTheDocument();

      fireEvent.pointerCancel(svg, { clientX: 400, clientY: 2600 });
      expect(screen.queryByTestId('hold-drag-ghost')).not.toBeInTheDocument();
    } finally {
      restoreSvg();
    }
  });
});

// The explicit buffer order (B): a stack dragged out of the hold lands where the user actually
// released it — reflowing neighbours aside — rather than snapping to wherever `stackBuffer`'s own
// (Load.cargo-order) recompute would put it. That default recompute is exactly what makes this fixture
// worth being fussy about: `stackBuffer` always emits in cargo-array order (A, B, C — see
// packages/engine/src/packing/edit.ts), so if "C" is dragged out with the feature absent it would
// reappear LAST regardless of where it was released. Both cases below are chosen to land C somewhere
// other than last, so a regression to "ignore the release point" is guaranteed to fail them rather
// than pass by coincidence.
// The layout is hand-built (as the "shows edit-error…" case above does), not `calculateLayout`'d: it
// only needs A and B already unplaced and C sitting alone in the hold, and building it directly keeps
// that independent of which type the packer would actually prioritise onto the floor.
describe('LadeplanScreen — drop lands at the release point (bufferOrder, B)', () => {
  const dropLoad: Load = {
    // width: 50 — deliberately far too thin for its own cargo. This is what lets a release that is
    // genuinely BETWEEN two warehouse tiles (so within both the hold's and the warehouse's shared
    // x-range) still read as "outside the hold": CrossSection's own outside test is an OR of x- and
    // y-range, and shrinking spanY (=vehicle.width for the top view) to near-nothing means almost any
    // y at all clears it, freeing x to do the one job this fixture actually needs from it — landing
    // between the two buffer tiles' centres. Nothing here is drawn against real vehicle bounds (this
    // Layout is hand-built, not `calculateLayout`'d), so the mismatch is inert.
    vehicle: { id: 'v5', name: 'LKW', length: 4000, width: 50, height: 1000 },
    cargo: [
      { id: 'a', name: 'A', length: 500, width: 500, height: 500, quantity: 1, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-1' },
      { id: 'b', name: 'B', length: 500, width: 500, height: 500, quantity: 1, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-1' },
      { id: 'c', name: 'C', length: 1000, width: 1000, height: 1000, quantity: 1, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-1' },
    ],
  };
  const dropLayout: Layout = {
    placements: [{ cargoTypeId: 'c', x: 0, y: 0, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt' }],
    unplaced: [{ cargoTypeId: 'a', count: 1 }, { cargoTypeId: 'b', count: 1 }],
    metrics: { totalPlaced: 1, usedFloorPositions: 1, floorFillPercent: 25, volumeFillPercent: 25 },
    contractVersion: '0.14.0',
  };
  // A (500×500) opens the warehouse row at x=200 (centre 450, PAD/GAP=200); B follows at x=900
  // (centre 1150). Both share the row band y=200..700 (rowH = the taller of the two, here both 500).

  const withDropRig = (
    run: (container: HTMLElement, rerender: (ui: Parameters<typeof render>[0]) => void) => void,
  ) => {
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 4000, top: 0, bottom: 2000, width: 4000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container, rerender } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={dropLoad} layout={dropLayout} />
        </LocaleProvider>,
      );
      run(container, rerender);
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  };

  /** Press the sole hold stack ("c@0,0") and carry it to (toX, toY), releasing there. Both svgs use
   *  the identity CTM installed above, so client px double as mm in whichever frame the point falls
   *  in — any y past the hold's own (tiny) spanY=50 is what CrossSection reads as "outside". */
  const dropStackAt = (container: HTMLElement, toX: number, toY: number) => {
    const svg = container.querySelector('svg[data-hold="top"]')!;
    fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: toX, clientY: toY });
    fireEvent.pointerUp(svg, { clientX: toX, clientY: toY });
  };

  it('previews the drop with a dashed phantom slot before release (live gap)', () => {
    withDropRig((container) => {
      const svg = container.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      // x=700 falls between A's and B's centres (450 and 1150), y=400 within their shared row —
      // `onCarry` fires on every move, not just past the hold's own edge, so the preview appears
      // without needing a release at all.
      fireEvent.pointerMove(svg, { clientX: 700, clientY: 400 });
      expect(screen.getByTestId('warehouse-phantom')).toBeInTheDocument();
      fireEvent.pointerUp(svg, { clientX: 700, clientY: 400 });
    });
  });

  it('drop before the first tile lands the stack there, not last (the stale-order default)', () => {
    withDropRig((container) => {
      // y=100 is above A's row (which opens at y=200) — insertionIndexAt's row-not-started-yet rule
      // returns index 0 regardless of x. Without this feature, `stackBuffer`'s own recompute would
      // always place a newly-unplaced C last (cargo array order A, B, C) — this pins the release
      // point winning instead.
      dropStackAt(container, 100, 100);
      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('C'),
        expect.stringContaining('A'),
        expect.stringContaining('B'),
      ]);
    });
  });

  it('drop between two existing tiles lands the stack between them', () => {
    withDropRig((container) => {
      // x=700 is between A's and B's centres (450 and 1150); y=400 is within their row — also picked
      // to exceed the hold's own spanY=50, which is what makes this release count as "outside" despite
      // sharing its x-range with the hold.
      dropStackAt(container, 700, 400);
      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('A'),
        expect.stringContaining('C'),
        expect.stringContaining('B'),
      ]);
    });
  });

  // Final-review fix: bufferOrder must follow the same discard logic as `edited` (the useEffect at
  // ~line 125 that resets both on a fresh `layout` prop) — a strategy/layout recompute must not keep
  // replaying a stale release order from the plan it replaces.
  it('resets bufferOrder to the default order when a fresh layout arrives', () => {
    withDropRig((container, rerender) => {
      // Establish a non-default bufferOrder: drop C before the first tile, landing it first — the
      // released order becomes [C, A, B], not the cargo-array default [A, B, C].
      dropStackAt(container, 100, 100);
      expect(screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'))).toEqual([
        expect.stringContaining('C'),
        expect.stringContaining('A'),
        expect.stringContaining('B'),
      ]);

      // A fresh `layout` prop arrives (a NEW object reference), as a strategy switch or recompute
      // would produce — here with nothing placed at all, so all three types sit in the buffer.
      // Per spec the buffer order must fall back to the default cargo-array order (A, B, C), the
      // same way `edited` falls back to this fresh layout instead of keeping the old one.
      const freshLayout: Layout = {
        placements: [],
        unplaced: [
          { cargoTypeId: 'a', count: 1 },
          { cargoTypeId: 'b', count: 1 },
          { cargoTypeId: 'c', count: 1 },
        ],
        metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
        contractVersion: '0.14.0',
      };
      rerender(
        <LocaleProvider initial="de">
          <LadeplanScreen load={dropLoad} layout={freshLayout} />
        </LocaleProvider>,
      );

      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('A'),
        expect.stringContaining('B'),
        expect.stringContaining('C'),
      ]);
    });
  });

  it('после броска стопки чужого заказа два загона рисуются, а плитки группируются по заказу', () => {
    // Загоны — режим, а не умолчание (77g): этот тест про них, значит режим надо включить.
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    // C — единственный груз заказа SO-2; A и B (уже в буфере) — SO-1. Бросаем C в точку внутри
    // загона SO-1 (это ЧУЖОЙ для неё загон) и проверяем итоговую КАРТИНУ: два загона (SO-1, SO-2) и
    // плитки, сгруппированные по заказу (A, B, затем C), а не порядок, в котором C была брошена.
    //
    // Это НЕ тест магнита: в момент вычисления индекса в буфере присутствует только один заказ
    // (A и B — оба SO-1; C ещё не разложена), поэтому `insertionIndexAt` рано выходит по
    // `bays.length === 0` независимо от переданного `orderId` — магнит здесь физически не может
    // сработать. Итоговый порядок плиток одинаков что с магнитом, что без него: группировка по
    // заказу (`groupByOrder` в warehouseLayout.ts, задача 41e.2/4) перестраивает плоский список для
    // отображения уже ПОСЛЕ вставки, независимо от того, куда именно внутри буфера попала C. Этот
    // тест закрепляет именно этот сквозной сценарий (сгруппированный конечный результат), а не
    // магнит — магнит пришпилен соседним тестом ниже
    // ('уводит стопку в конец своего уже существующего загона...'), где два загона уже стоят ДО
    // броска и `insertionIndexAt` реально доходит до своей per-bay ветки.
    const bayLoad: Load = {
      ...dropLoad,
      cargo: dropLoad.cargo.map((c) => (c.id === 'c' ? { ...c, orderId: 'SO-2' } : c)),
    };
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 4000, top: 0, bottom: 2000, width: 4000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={bayLoad} layout={dropLayout} />
        </LocaleProvider>,
      );
      const svg = container.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      // Точка внутри загона SO-1 (левый верхний угол двора) — ЧУЖОГО для C загона; куда именно
      // внутри буфера легла C, здесь не проверяется (см. комментарий выше теста), важен только
      // сгруппированный конечный вид.
      fireEvent.pointerMove(svg, { clientX: 500, clientY: 400 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 400 });
      // Два загона на экране, а плитки сгруппированы по заказу: A, B (оба SO-1), затем C (SO-2).
      const bays = [...document.querySelectorAll('[data-testid="warehouse-bay"]')];
      expect(bays.map((b) => b.getAttribute('data-order'))).toEqual(['SO-1', 'SO-2']);
      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('A'),
        expect.stringContaining('B'),
        expect.stringContaining('C'),
      ]);
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  });

  // Addition beyond the brief (dwc): the case above cannot actually distinguish orderId-aware from
  // orderId-blind code — at drop time the yard holds only ONE order (A, B — both SO-1), so
  // `insertionIndexAt`'s own `bays.length === 0` guard already forces the plain flow-index path
  // regardless of `orderId`, and `groupByOrder` then renormalizes any raw interleaving back into
  // per-order clusters for display, so both codepaths render `[A, B, C]`. This test instead starts
  // with TWO bays already standing (A/SO-1 and B/SO-2 both already in the buffer, one order each), so
  // `insertionIndexAt` actually reaches its per-bay branch.
  // A — SO-1, B — SO-2, оба уже в буфере: два загона стоят ДО того, как C покидает кузов. C — SO-1,
  // единственный груз в кузове. Точка (100,100) лежит ВЫШЕ обоих загонов (они открываются в pad=200):
  // без учёта заказа общий поток читает её как «перед самой первой плиткой».
  const twoBaysLoad: Load = {
    vehicle: { id: 'v5', name: 'LKW', length: 4000, width: 50, height: 1000 },
    cargo: [
      { id: 'a', name: 'A', length: 500, width: 500, height: 500, quantity: 1, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-1' },
      { id: 'b', name: 'B', length: 500, width: 500, height: 500, quantity: 1, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-2' },
      { id: 'c', name: 'C', length: 1000, width: 1000, height: 1000, quantity: 1, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-1' },
    ],
  };
  const twoBaysLayout: Layout = {
    placements: [{ cargoTypeId: 'c', x: 0, y: 0, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt' }],
    unplaced: [{ cargoTypeId: 'a', count: 1 }, { cargoTypeId: 'b', count: 1 }],
    metrics: { totalPlaced: 1, usedFloorPositions: 1, floorFillPercent: 25, volumeFillPercent: 25 },
    contractVersion: '0.14.0',
  };
  const withTwoBaysRig = (run: (container: HTMLElement) => void) => {
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 4000, top: 0, bottom: 2000, width: 4000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={twoBaysLoad} layout={twoBaysLayout} />
        </LocaleProvider>,
      );
      run(container);
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  };

  /** Тянет бирку загона `orderId` в точку (мм = client px под installSvgGeometry). События движения
   *  шлются на сам двор и всплывают к глобальным слушателям — как в тестах переноса стопки. */
  const dragBayTo = (orderId: string, x: number, y: number) => {
    const grip = document.querySelector(`[data-testid="warehouse-bay"][data-order="${orderId}"] [data-tag-grip]`)!;
    const yard = document.querySelector('svg[data-warehouse]')!;
    fireEvent.pointerDown(grip, { clientX: 2400, clientY: 300 });
    fireEvent.pointerMove(yard, { clientX: x, clientY: y });
    fireEvent.pointerUp(yard, { clientX: x, clientY: y });
  };

  it('уводит стопку в конец своего уже существующего загона, а не туда, куда воткнул бы общий поток', () => {
    // Загоны — режим, а не умолчание (77g): этот тест про них, значит режим надо включить.
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    // Магнит обязан запарковать C в КОНЦЕ её собственного загона SO-1 (после A) — точка вне всех
    // границ загона всегда садится в его хвост (warehouseLayout.ts, insertionIndexAt).
    withTwoBaysRig((container) => {
      const svg = container.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 });
      fireEvent.pointerUp(svg, { clientX: 100, clientY: 100 });
      const bays = [...document.querySelectorAll('[data-testid="warehouse-bay"]')];
      expect(bays.map((b) => b.getAttribute('data-order'))).toEqual(['SO-1', 'SO-2']);
      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('A'),
        expect.stringContaining('C'),
        expect.stringContaining('B'),
      ]);
    });
  });

  // Превью — видимая половина магнита, и до сих пор ни один тест не проверял, что `phantomAt` вообще
  // передаёт свой `orderId`: единственная проверка фантома была `toBeInTheDocument()` в стенде с одним
  // заказом, а оба теста магнита смотрят состояние ПОСЛЕ отпускания, то есть через `onDropOutside`.
  // Здесь фантом проверяется ДО отпускания и по позиции: убери аргумент `orderId` у `phantomAt` —
  // общий поток вернёт 0 и фантом встанет ПЕРЕД A, слева от неё.
  it('превью фантома магнитится в загон своего заказа ещё до отпускания', () => {
    // Загоны — режим, а не умолчание (77g): этот тест про них, значит режим надо включить.
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    withTwoBaysRig((container) => {
      const svg = container.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 });

      const phantomX = Number(screen.getByTestId('warehouse-phantom').getAttribute('x'));
      const aTile = screen.getAllByTestId('warehouse-tile').find((t) => t.getAttribute('aria-label')!.startsWith('A'))!;
      const aX = Number(aTile.querySelector('rect')!.getAttribute('x'));
      // Фантом — в хвосте загона SO-1, то есть ПРАВЕЕ уже стоящей там A.
      expect(phantomX).toBeGreaterThan(aX);
      // И он внутри разметки именно своего загона, а не чужого.
      const own = document.querySelector('[data-testid="warehouse-bay"][data-order="SO-1"] [data-outline]')!;
      const bx = Number(own.getAttribute('x'));
      expect(phantomX).toBeGreaterThanOrEqual(bx);
      expect(phantomX).toBeLessThanOrEqual(bx + Number(own.getAttribute('width')));

      fireEvent.pointerUp(svg, { clientX: 100, clientY: 100 });
    });
  });

  // Грабли 77g (находка №4), теперь втроём: `warehouseFloor` в этом экране вызывается ТРИЖДЫ —
  // отрисовка (внутри WarehouseFloor), `phantomAt` и `onDropOutside`. Забудь `bayOrder` в любом из
  // них — и магнит будет целиться в загоны, которых на экране нет. Точка броска (300, 600) лежит
  // внутри ПЕРВОГО загона двора: после переноса это чужой для C загон SO-2, и C обязана уйти в
  // хвост своего; без `bayOrder` тот же расчёт считает первым загоном SO-1 и втыкает C перед A.
  it('после переноса загонов бросок целится в НОВУЮ расстановку, а не в порядок по умолчанию', () => {
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    withTwoBaysRig((container) => {
      dragBayTo('SO-2', 300, 600);
      expect([...document.querySelectorAll('[data-testid="warehouse-bay"]')].map((b) => b.getAttribute('data-order'))).toEqual(['SO-2', 'SO-1']);

      const svg = container.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(svg, { clientX: 300, clientY: 600 });
      fireEvent.pointerUp(svg, { clientX: 300, clientY: 600 });

      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('B'),
        expect.stringContaining('A'),
        expect.stringContaining('C'),
      ]);
    });
  });

  it('превью фантома тоже знает о переносе загонов', () => {
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    withTwoBaysRig((container) => {
      dragBayTo('SO-2', 300, 600);
      const own = document.querySelector('[data-testid="warehouse-bay"][data-order="SO-1"] [data-outline]')!;
      const bx = Number(own.getAttribute('x'));

      const svg = container.querySelector('svg[data-hold="top"]')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(svg, { clientX: 300, clientY: 600 });

      // Фантом — внутри переехавшего загона SO-1, а не там, где тот стоял по умолчанию.
      const phantomX = Number(screen.getByTestId('warehouse-phantom').getAttribute('x'));
      expect(phantomX).toBeGreaterThanOrEqual(bx);
      expect(phantomX).toBeLessThanOrEqual(bx + Number(own.getAttribute('width')));
      // И именно ПРАВЕЕ уже стоящей там A — то есть в хвосте своего загона. Это и есть
      // различающая проверка: забудь `bayOrder` в `phantomAt`, и точка (300, 600) прочтётся как
      // «внутри загона SO-1, левее центра A», а фантом встанет ПЕРЕД A. Одной только рамкой
      // загона эти два исхода не различить — она в обоих случаях та же.
      const aX = Number(
        screen
          .getAllByTestId('warehouse-tile')
          .find((t) => t.getAttribute('aria-label')!.startsWith('A'))!
          .querySelector('rect')!
          .getAttribute('x'),
      );
      expect(phantomX).toBeGreaterThan(aX);

      fireEvent.pointerUp(svg, { clientX: 300, clientY: 600 });
    });
  });

  // Порядок загонов говорил о ПРЕЖНЕМ плане: новый пересчёт может не содержать этих заказов вовсе.
  it('новый layout сбрасывает порядок загонов вместе с bufferOrder', () => {
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 4000, top: 0, bottom: 2000, width: 4000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { rerender } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={twoBaysLoad} layout={twoBaysLayout} />
        </LocaleProvider>,
      );
      const grip = document.querySelector('[data-testid="warehouse-bay"][data-order="SO-2"] [data-tag-grip]')!;
      const yard = document.querySelector('svg[data-warehouse]')!;
      fireEvent.pointerDown(grip, { clientX: 2400, clientY: 300 });
      fireEvent.pointerMove(yard, { clientX: 300, clientY: 600 });
      fireEvent.pointerUp(yard, { clientX: 300, clientY: 600 });
      expect([...document.querySelectorAll('[data-testid="warehouse-bay"]')].map((b) => b.getAttribute('data-order'))).toEqual(['SO-2', 'SO-1']);

      // Свежий объект раскладки — тот самый сигнал «план пересчитан».
      rerender(
        <LocaleProvider initial="de">
          <LadeplanScreen load={twoBaysLoad} layout={{ ...twoBaysLayout }} />
        </LocaleProvider>,
      );
      expect([...document.querySelectorAll('[data-testid="warehouse-bay"]')].map((b) => b.getAttribute('data-order'))).toEqual(['SO-1', 'SO-2']);
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  });
});

// Спека §3, решение 7. Жест знает только про загоны, которые СЕЙЧАС во дворе, а `bayOrder` помнит и
// те заказы, чьи стопки временно уехали в кузов, — поэтому фиксируется слияние, а не замена.
//
// Почему это проверяется на самом правиле, а не броском через двор: одинокий «забытый» заказ в
// отрисовке неразличим. Слияние дописывает его В КОНЕЦ, а `groupByOrder` при замене дописывает
// неупомянутые тоже в конец — обе ветки дадут один и тот же двор. Различить их можно только двумя
// отсутствующими заказами, чей взаимный порядок разошёлся с заявкой, то есть четырьмя заказами и
// четырьмя рейсами стопок в кузов и обратно — стенд, который проверял бы транспорт, а не правило.
describe('LadeplanScreen — mergeBayOrder (порядок загонов сливается, а не заменяется)', () => {
  it('заказ, которого нет в списке жеста, переживает фиксацию', () => {
    expect(mergeBayOrder(['SO-2', 'SO-1'], ['SO-3', 'SO-1', 'SO-2'])).toEqual(['SO-2', 'SO-1', 'SO-3']);
  });

  it('уцелевшие сохраняют свой прежний относительный порядок', () => {
    expect(mergeBayOrder(['SO-1'], ['SO-4', 'SO-3', 'SO-1'])).toEqual(['SO-1', 'SO-4', 'SO-3']);
  });

  it('первый жест поверх пустого порядка — это просто список жеста', () => {
    expect(mergeBayOrder(['SO-2', 'SO-1'], [])).toEqual(['SO-2', 'SO-1']);
  });
});

// А это — сама ПРОВОДКА: `setBayOrder(prev => mergeBayOrder(next, prev))`. Правило выше её не
// закрепляет: замени слияние на голое `setBayOrder(next)`, и все тесты остаются зелёными, потому
// что каждый из них сливает в ПУСТОЙ прежний порядок.
//
// Различить слияние и замену можно только двумя «забытыми» заказами, чей взаимный порядок разошёлся
// с заявкой: одинокий забытый заказ обе ветки дописывают в конец (слияние — в `bayOrder`, замена —
// уже в `groupByOrder`, как неупомянутого), и двор выходит один и тот же. Отсюда четыре заказа и
// рейс двух стопок в кузов и обратно — стенд дорогой, но дешевле его этой проводки не поймать.
describe('LadeplanScreen — bayOrder помнит заказ, уехавший в кузов между жестами', () => {
  // Кузов нарочно неглубокий (600 мм): бросок «наружу» разрез считает по СВОИМ границам
  // (0,0)–(length, width), и в широком кузове точка над двором оказалась бы всё ещё внутри него.
  const V4 = { id: 'v4', name: 'LKW', length: 13600, width: 600, height: 1000 };
  const box = (id: string, name: string, orderId: string) => ({
    id,
    name,
    length: 500,
    width: 500,
    height: 500,
    quantity: 1,
    rotation: 'none' as const,
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt' as const,
    orderId,
  });
  const fourLoad: Load = {
    vehicle: V4,
    cargo: [box('a', 'A', 'SO-1'), box('b', 'B', 'SO-2'), box('c', 'C', 'SO-3'), box('d', 'D', 'SO-4')],
  };
  // Кузов пуст, все четыре стопки во дворе: четыре загона в одну строку (по 1600 мм, проход 400).
  const fourLayout: Layout = {
    placements: [],
    unplaced: [
      { cargoTypeId: 'a', count: 1 },
      { cargoTypeId: 'b', count: 1 },
      { cargoTypeId: 'c', count: 1 },
      { cargoTypeId: 'd', count: 1 },
    ],
    metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.14.0',
  };

  const bays = () =>
    [...document.querySelectorAll('[data-testid="warehouse-bay"]')].map((b) => b.getAttribute('data-order'));
  const yardSvg = () => document.querySelector('svg[data-warehouse]')!;
  const holdSvg = (container: HTMLElement) => container.querySelector('svg[data-hold="top"]')!;
  const dragBayTo = (orderId: string, x: number, y: number) => {
    const grip = document.querySelector(`[data-testid="warehouse-bay"][data-order="${orderId}"] [data-tag-grip]`)!;
    fireEvent.pointerDown(grip, { clientX: 2400, clientY: 300 });
    fireEvent.pointerMove(yardSvg(), { clientX: x, clientY: y });
    fireEvent.pointerUp(yardSvg(), { clientX: x, clientY: y });
  };
  /** Стопку двора — в кузов: нажатие на плитку, движение и отпускание над видом сверху. */
  const carryToHold = (container: HTMLElement, name: string, x: number, y: number) => {
    const tile = screen
      .getAllByTestId('warehouse-tile')
      .find((t) => t.getAttribute('aria-label')!.startsWith(name))!;
    fireEvent.pointerDown(tile, { clientX: 300, clientY: 600 });
    fireEvent.pointerMove(holdSvg(container), { clientX: x, clientY: y });
    fireEvent.pointerUp(holdSvg(container), { clientX: x, clientY: y });
  };
  /** И обратно: стопку кузова — во двор. */
  const carryToYard = (container: HTMLElement, cargoTypeId: string) => {
    const svg = holdSvg(container);
    fireEvent.pointerDown(svg.querySelector(`[data-stack-ref^="${cargoTypeId}@"]`)!, { clientX: 600, clientY: 300 });
    // Отпускание НИЖЕ кузова (глубина 600) и над двором — это и есть «наружу».
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 1500 });
  };

  it('второй жест не стирает порядок, зафиксированный первым, для отсутствующих заказов', () => {
    localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 4000, top: 0, bottom: 2000, width: 4000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={fourLoad} layout={fourLayout} />
        </LocaleProvider>,
      );
      expect(bays()).toEqual(['SO-1', 'SO-2', 'SO-3', 'SO-4']);

      // Жест 1: SO-4 — в левую половину SO-3 (центр 5000). Взаимный порядок SO-4 и SO-3 теперь
      // ОБРАТЕН заявке — только этим их и различить, когда оба выпадут из списка жеста.
      dragBayTo('SO-4', 4500, 600);
      expect(bays()).toEqual(['SO-1', 'SO-2', 'SO-4', 'SO-3']);

      // Оба уезжают в кузов: их загоны исчезают, и следующий жест о них уже не знает.
      carryToHold(container, 'C', 600, 300);
      carryToHold(container, 'D', 1600, 300);
      expect(bays()).toEqual(['SO-1', 'SO-2']);

      // Жест 2: SO-2 в начало. Его список — только ['SO-2', 'SO-1'].
      dragBayTo('SO-2', 400, 600);
      expect(bays()).toEqual(['SO-2', 'SO-1']);

      // Стопки возвращаются во двор — и с ними должен вернуться порядок, заданный жестом 1.
      carryToYard(container, 'c');
      carryToYard(container, 'd');
      // Замена вместо слияния дала бы ['SO-2', 'SO-1', 'SO-3', 'SO-4']: забытые заказы встали бы по
      // заявке, а не так, как их поставил пользователь.
      expect(bays()).toEqual(['SO-2', 'SO-1', 'SO-4', 'SO-3']);
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  });
});

// Task 6 (2026-08-03 UI batch): releasing a yard stack anywhere other than over the hold used to be a
// silent no-op. Over the yard, with grouping off, it now reorders the flow — the same magnet and the
// same `insertionIndexAt` that already drives the hold→yard drop, only with the yard itself as the
// source. Grouping on: the gesture stays a no-op, same as before this task (bays.tsx still moves
// order tags, not stacks).
describe('LadeplanScreen — перестановка стопок во дворе (Task 6)', () => {
  afterEach(() => globalThis.localStorage?.clear());

  const yardVehicle = { id: 'vY', name: 'LKW', length: 4000, width: 2000, height: 1700 };
  const box = (id: string, name: string, quantity: number, extra: Partial<Load['cargo'][number]> = {}) => ({
    id,
    name,
    length: 500,
    width: 500,
    height: 500,
    quantity,
    rotation: 'none' as const,
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt' as const,
    orderId: 'SO-1',
    ...extra,
  });

  /** Three distinguishable single-unit tiles: p1, p2, p3. Fix round 1 (Finding 2): p3 carries a
   *  DIFFERENT orderId than p1/p2, so this fixture has two real bays once grouping is on —
   *  `warehouseFloor` only produces bays for 2+ distinct orders, regardless of the `grouped` flag, so a
   *  single-order fixture could never actually exercise "grouping is really in effect," only the raw
   *  (and now insufficient) `yardGrouped` flag. */
  const threeTypesLoad: Load = {
    vehicle: yardVehicle,
    cargo: [box('p1', 'P1', 1), box('p2', 'P2', 1), box('p3', 'P3', 1, { orderId: 'SO-2' })],
  };
  const threeTypesLayout: Layout = {
    placements: [],
    unplaced: [
      { cargoTypeId: 'p1', count: 1 },
      { cargoTypeId: 'p2', count: 1 },
      { cargoTypeId: 'p3', count: 1 },
    ],
    metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.14.0',
  };

  /** Двор из двух плиток ОДНОГО типа и одной чужой: p3 даёт полную стопку из 17 (height 100,
   *  maxTiers 17, высота кузова 1700) плюс остаток 12, поэтому порядок `stackBuffer` —
   *  [p3×17, p3×12, p1×1].
   *
   *  Прежде эта фикстура пиннила ограничение «порядок — список `cargoTypeId`, плитки одного типа не
   *  переставляются». Ограничение снято в 72g: порядок хранится ключами «количество : тип», и
   *  ×17 с ×12 теперь различимы — что и доказывает тест «плитки одного типа с разным количеством
   *  переставляются» ниже. Неразличимыми остаются лишь плитки одного типа И одного количества
   *  (фикстура `twinsLoad`). */
  const sameTypeLoad: Load = {
    vehicle: yardVehicle,
    cargo: [
      box('p3', 'P3', 29, { height: 100, stacking: { stackable: true, maxTiers: 17 } }),
      box('p1', 'P1', 1),
    ],
  };
  const sameTypeLayout: Layout = {
    placements: [],
    unplaced: [
      { cargoTypeId: 'p3', count: 29 },
      { cargoTypeId: 'p1', count: 1 },
    ],
    metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.14.0',
  };

  /** Двор из двух ПОЛНОСТЬЮ одинаковых плиток: 34 единицы p3 при полной стопке 17 дают [×17, ×17],
   *  плюс чужая p1×1. Такие плитки неразличимы и на экране (та же подпись, та же геометрия), и в
   *  ключе порядка — их перестановка остаётся пустым жестом намеренно (решение владельца,
   *  2026-08-03: «если они идентичны — зачем их переставлять»). */
  const twinsLoad: Load = {
    vehicle: yardVehicle,
    cargo: [box('p3', 'P3', 34, { height: 100, stacking: { stackable: true, maxTiers: 17 } }), box('p1', 'P1', 1)],
  };
  const twinsLayout: Layout = {
    placements: [],
    unplaced: [{ cargoTypeId: 'p3', count: 34 }, { cargoTypeId: 'p1', count: 1 }],
    metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.14.0',
  };

  /** Запасная фаза реконсиляции (72g): p3 стоит в кузове колонной из 5 единиц при полной стопке в
   *  17, поэтому бросок её во двор превращает 24 неразмещённых p3 в 29 — и буфер, нарезанный
   *  [×17, ×7], становится [×17, ×12]. Ключи, записанные в момент броска (`5:p3` для брошенной,
   *  `7:p3` для остатка), не совпадают ни с одной плиткой; порядок обязан удержаться на запасной
   *  фазе (любая плитка своего типа), иначе брошенная стопка сядет на место по умолчанию. */
  const fallbackLoad: Load = {
    // width: 50 — по образцу `dropLoad` в describe «drop lands at the release point». `CrossSection`
    // считает «отпущено ВНЕ кузова» не по `getBoundingClientRect` (его `withYardGeometry` и уводит в
    // отрицательные Y), а по углам собственного viewBox — (0,0)–(length, spanY) через `getScreenCTM`.
    // При spanY = width = 2000 центры дворовых плиток (y ≈ 450) попадают внутрь этого прямоугольника,
    // и релиз читается как «уронил обратно на пол», до `onDropOutside` дело не доходит вовсе. Узкий
    // кузов освобождает y: любой y > 50 — уже снаружи. На высоту стопки (17 ярусов при height 100 и
    // height кузова 1700) ширина не влияет, а раскладка здесь собрана руками, не упаковщиком.
    vehicle: { ...yardVehicle, width: 50 },
    cargo: [box('p1', 'P1', 1), box('p3', 'P3', 29, { height: 100, stacking: { stackable: true, maxTiers: 17 } })],
  };
  const fallbackLayout: Layout = {
    placements: Array.from({ length: 5 }, (_, i) => ({
      cargoTypeId: 'p3', x: 0, y: 0, z: i * 100, orientation: 'lwh' as const, tier: i + 1, state: 'entschachtelt' as const,
    })),
    unplaced: [{ cargoTypeId: 'p1', count: 1 }, { cargoTypeId: 'p3', count: 24 }],
    metrics: { totalPlaced: 5, usedFloorPositions: 1, floorFillPercent: 3, volumeFillPercent: 3 },
    contractVersion: '0.14.0',
  };

  /** Точная фаза для БРОСКА (72g): p3 стоит в кузове колонной из 5 при общем количестве 22 и полной
   *  стопке в 17, так что во дворе до жеста ровно одна плитка ×17, а возврат колонны нарезает буфер
   *  в [×17, ×5] — и ключ `5:p3`, записанный в момент броска, совпадает с остатком ТОЧНО. Именно
   *  количество здесь и решает: со старым ключом (`p3`, без количества) точного совпадения нет
   *  вовсе, работает запасная фаза, она снимает первую попавшуюся плитку своего типа — полную ×17 —
   *  и стопка, брошенная ПЕРЕД единственной плиткой двора, садится позади неё. */
  const unitsKeyLoad: Load = {
    vehicle: { ...yardVehicle, width: 50 }, // тот же узкий кузов и по той же причине, что в `fallbackLoad`
    cargo: [box('p3', 'P3', 22, { height: 100, stacking: { stackable: true, maxTiers: 17 } })],
  };
  const unitsKeyLayout: Layout = {
    placements: Array.from({ length: 5 }, (_, i) => ({
      cargoTypeId: 'p3', x: 0, y: 0, z: i * 100, orientation: 'lwh' as const, tier: i + 1, state: 'entschachtelt' as const,
    })),
    unplaced: [{ cargoTypeId: 'p3', count: 17 }],
    metrics: { totalPlaced: 5, usedFloorPositions: 1, floorFillPercent: 3, volumeFillPercent: 3 },
    contractVersion: '0.14.0',
  };

  function renderPlanWithYard({ grouped, sameType = false }: { grouped: boolean; sameType?: boolean }) {
    if (grouped) localStorage.setItem('ladungsplaner.yardGrouping', 'true');
    const l = sameType ? sameTypeLoad : threeTypesLoad;
    const ly = sameType ? sameTypeLayout : threeTypesLayout;
    return render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={l} layout={ly} />
      </LocaleProvider>,
    );
  }

  /** `installSvgGeometry` gives every svg the SAME identity CTM and, unless told otherwise, the SAME
   *  bounding rect — which is enough for the hold→yard tests elsewhere in this file (they never need
   *  `toHoldMm` to say "no" for a point that is genuinely over the yard). This gesture's own code DOES
   *  need that: `dropTileAt` asks `tileAim`/`toHoldMm` first, and only falls through to the yard when
   *  it says no. On a real screen the two svgs simply occupy different screen regions; here the two
   *  boxes are given explicitly and kept disjoint in Y — the hold's box sits entirely in negative Y,
   *  where no realistic yard coordinate (0..~1000 for this fixture) will ever land — so "released over
   *  the yard, not the hold" is exercised honestly rather than by a box that happens to agree. */
  // `async`, and AWAITS `run()`: every caller's body carries an `await dragFromTo(...)`, and a
  // `try { run() } finally { restore() }` without awaiting would restore the shared prototype before
  // that continuation — which reads `data-cargo-type`/`data-units` off the DOM, not off the geometry,
  // so it would still pass by luck, but the next test file sharing this worker would inherit a
  // half-restored prototype the moment two of these tests raced. Awaiting closes that gap for good.
  async function withYardGeometry(run: () => void | Promise<void>) {
    const restore = installSvgGeometry({ left: 0, top: 0, width: 10000, height: 4000 });
    const proto = SVGSVGElement.prototype as unknown as { getBoundingClientRect: (this: SVGSVGElement) => DOMRect };
    const shared = proto.getBoundingClientRect;
    const rectAt = (top: number, bottom: number): DOMRect =>
      ({ left: 0, right: 10000, top, bottom, width: 10000, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    proto.getBoundingClientRect = function (this: SVGSVGElement) {
      if (this.hasAttribute('data-warehouse')) return rectAt(0, 4000);
      if (this.getAttribute('data-hold') === 'top') return rectAt(-2000, -1500);
      return shared.call(this);
    };
    try {
      await run();
    } finally {
      proto.getBoundingClientRect = shared;
      restore();
    }
  }

  /** The yard's tiles, in DOM (= flow) order. Plain `querySelectorAll`, not RTL's `within(...)`: that
   *  helper's `element` parameter is typed `HTMLElement`, and the yard is an `<svg>` — an `Element`,
   *  never an `HTMLElement` in the DOM lib's type hierarchy, even though jsdom queries it identically
   *  either way. */
  const yardTiles = (yard: Element): Element[] => [...yard.querySelectorAll('[data-testid="warehouse-tile"]')];

  /** The centre of an element's own backing `<rect>`, in mm — unscaled: `StackShape`'s coordinates ARE
   *  the caller's mm, so this is also the client point under the identity CTM `withYardGeometry`
   *  installs. */
  const centreOf = (el: Element): { x: number; y: number } => {
    const r = el.querySelector('rect')!;
    return {
      x: Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2,
      y: Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2,
    };
  };

  /** Press `fromEl` at ITS OWN position, then carry the pointer to `toEl`'s footprint and release
   *  there. Fix round 1 (Finding 1): pressing and releasing at the SAME point must be zero travel — a
   *  press-then-move at `toEl`'s coordinates for BOTH events would make `dragTile`'s `downX/downY`
   *  equal its first move, always reading as "travelled," and could never catch a regression to the
   *  no-travel-gate bug this round fixed. Events go through `window`, same as the pointerId-filter
   *  tests above: the drag's own listeners in `LadeplanScreen` are global (the gesture starts on a yard
   *  tile and can end anywhere on the page). */
  async function dragFromTo(fromEl: Element, toEl: Element) {
    const down = centreOf(fromEl);
    const { x: clientX, y: clientY } = centreOf(toEl);
    fireEvent.pointerDown(fromEl, { clientX: down.x, clientY: down.y, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX, clientY, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX, clientY, pointerId: 1 });
  }

  /** Прямоугольник обёртки `bufferRef` — это обычный `HTMLDivElement`, для которого jsdom отдаёт
   *  нули, а `onDropOutside` начинается ровно с него: без подмены `overBuffer` никогда не станет
   *  `true` и ни один бросок из кузова не дойдёт до двора. Перестановкам ВНУТРИ двора он не нужен —
   *  они идут другим путём (`dropTileAt`), поэтому подменяется только там, где нужен. */
  async function withBufferBox(run: () => void | Promise<void>) {
    const orig = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 10000, top: 0, bottom: 4000, width: 10000, height: 4000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      await run();
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = orig;
    }
  }

  /** Взять колонну `ref` в виде сверху и отпустить её в точке `to` двора.
   *
   *  Нажатие в (500, 25) — ВНУТРИ кузова: под единичной CTM, которую ставит `installSvgGeometry`,
   *  клиентский прямоугольник узкого кузова этих фикстур — (0,0)–(4000, 50). Именно по этим углам
   *  собственного viewBox `CrossSection.onUp` и решает «отпущено снаружи», а не по
   *  `getBoundingClientRect` — тот у вложенного svg разрастается вокруг переносимого призрака.
   *  События идут через сам svg с `data-hold="top"`: слушатели переноса внутри кузова висят на нём
   *  (в отличие от дворового драга, чьи слушатели глобальны). */
  function dropColumnOnYard(ref: string, to: { x: number; y: number }) {
    const hold = document.querySelector('svg[data-hold="top"]')!;
    fireEvent.pointerDown(hold.querySelector(`[data-stack-ref="${ref}"]`)!, { clientX: 500, clientY: 25, pointerId: 2 });
    fireEvent.pointerMove(hold, { clientX: to.x, clientY: to.y, pointerId: 2 });
    fireEvent.pointerUp(hold, { clientX: to.x, clientY: to.y, pointerId: 2 });
  }

  it('при выключенной группировке бросок стопки над двором меняет её место в потоке', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: false });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const first = yardTiles(yard)[0];
      const third = yardTiles(yard)[2];
      await dragFromTo(first, third);

      const after = yardTiles(yard).map((el) => el.getAttribute('data-cargo-type'));
      expect(after[0]).not.toBe('p1'); // первая уехала
      expect(after).toContain('p1'); // но осталась во дворе
    });
  });

  it('при включённой группировке тот же жест ничего не меняет', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: true });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const before = yardTiles(yard).map((el) => el.getAttribute('data-cargo-type'));
      const tiles = yardTiles(yard);
      await dragFromTo(tiles[0], tiles[2]);
      const after = yardTiles(yard).map((el) => el.getAttribute('data-cargo-type'));
      expect(after).toEqual(before);
    });
  });

  // 72g: порядок двора хранится парами «количество : тип», поэтому остаток (p3×12) отличим от
  // полной стопки (p3×17) и переставляется. Драг нацелен на ТРЕТЬЮ плитку, а не на соседнюю:
  // перенос на позицию непосредственно следующей плитки — тождество для ЛЮБОЙ модели порядка
  // (вставка «перед следующим» после изъятия себя же возвращает на своё место, см. off-by-one в
  // `reorderYard`), и потому проверял бы арифметику вставки, а не различимость плиток.
  it('плитки одного типа с разным количеством переставляются (72g)', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: false, sameType: true });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      expect(tiles.map((el) => el.getAttribute('data-units'))).toEqual(['17', '12', '1']);
      await dragFromTo(tiles[0], tiles[2]);
      const after = yardTiles(yard).map((el) => el.getAttribute('data-units'));
      expect(after).toEqual(['12', '17', '1']);
    });
  });

  // Обратная сторона 72g, и она намеренная: у плиток одного типа И одного количества ключ общий,
  // перестановка даёт тот же список, `sameOrder` в `reorderYard` признаёт жест пустым и НИЧЕГО не
  // пишет в состояние — иначе жест, ничего не изменивший, заморозил бы неявный порядок по умолчанию
  // в явный пользовательский. Тест держит это свойство явным: увидев его падение, правщик должен
  // понимать, что сменилась модель порядка, а не «сломался тест». Здесь же проходит и известное
  // ограничение: ориентация в ключ не входит, поэтому повёрнутую плитку среди её близнецов тоже не
  // переставить, хотя на экране она отличается.
  it('плитки одного типа и одного количества между собой не переставляются (граница 72g)', async () => {
    await withYardGeometry(async () => {
      render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={twinsLoad} layout={twinsLayout} />
        </LocaleProvider>,
      );
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      expect(tiles.map((el) => el.getAttribute('data-units'))).toEqual(['17', '17', '1']);
      await dragFromTo(tiles[0], tiles[2]);
      expect(yardTiles(yard).map((el) => el.getAttribute('data-units'))).toEqual(['17', '17', '1']);
    });
  });

  // 72g, ведущий тест задачи 3: снимок порядка, который бросок из кузова записывает в `bufferOrder`,
  // обязан нести КОЛИЧЕСТВО. Здесь количество единственное, что решает: `5:p3` совпадает с остатком
  // ×5 точно и ставит брошенную стопку туда, куда её отпустили, — перед единственной плиткой двора.
  // Старый снимок (голые `cargoTypeId`) точного совпадения не даёт вовсе, уходит в запасную фазу, а
  // та снимает первую попавшуюся плитку своего типа — полную ×17 — и стопка садится позади неё.
  it('бросок из кузова записывает ключ с количеством и садится в точку броска (72g)', async () => {
    await withBufferBox(() =>
      withYardGeometry(() => {
        render(
          <LocaleProvider initial="de">
            <LadeplanScreen load={unitsKeyLoad} layout={unitsKeyLayout} />
          </LocaleProvider>,
        );
        const yard = document.querySelector('svg[data-warehouse]')!;
        // 17 неразмещённых при полной стопке в 17 — ровно одна плитка; 5 единиц стоят в кузове.
        expect(yardTiles(yard).map((el) => el.getAttribute('data-units'))).toEqual(['17']);

        dropColumnOnYard('p3@0,0', centreOf(yardTiles(yard)[0]));

        // 22 неразмещённых p3 → буфер [×17, ×5]; брошенная стопка отпущена ПЕРЕД плиткой ×17.
        expect(yardTiles(yard).map((el) => el.getAttribute('data-units'))).toEqual(['5', '17']);
      }),
    );
  });

  // Регрессия на запасную фазу (72g). Ключи, записанные броском (`5:p3`), и старые ключи двора
  // (`7:p3`) здесь не совпадают НИ С ОДНОЙ плиткой: `stackBuffer` перенарезает буфер под новое
  // количество. Порядок обязан удержаться на запасной фазе — снять любую плитку своего типа;
  // выбросьте её из `reconcileYardOrder`, и брошенная стопка сядет на место по умолчанию
  // (['1','17','12']), то есть эта задача починила бы остаток и сломала бы уже работающий бросок.
  it('бросок из кузова садится в точку броска, даже когда буфер перенарезан (запасная фаза, 72g)', async () => {
    await withBufferBox(() =>
      withYardGeometry(() => {
        render(
          <LocaleProvider initial="de">
            <LadeplanScreen load={fallbackLoad} layout={fallbackLayout} />
          </LocaleProvider>,
        );
        const yard = document.querySelector('svg[data-warehouse]')!;
        expect(yardTiles(yard).map((el) => el.getAttribute('data-units'))).toEqual(['1', '17', '7']);

        dropColumnOnYard('p3@0,0', centreOf(yardTiles(yard)[0]));

        // Стопка вернулась во двор целиком: 29 неразмещённых p3 → ×17 и ×12.
        expect(yardTiles(yard).map((el) => el.getAttribute('data-units'))).toEqual(['17', '1', '12']);
      }),
    );
  });

  // Finding 6 (fix round 1): both tests above assert only that NOTHING changed — a drag rig that
  // silently does nothing at all (e.g. a broken pointerId, a geometry box that always fails the "over
  // the yard" check) would make them pass vacuously. This one uses the SAME `sameType` fixture but
  // drags the other way — p1 (tiles[2], a DIFFERENT type from both p3 tiles) to the very front — where
  // the model has no excuse to no-op: the resulting list is genuinely different from every other tile's
  // perspective, not just the two interchangeable p3 strings. If this fails, the rig itself is broken,
  // not the limitation.
  it('позитивный контроль: перенос p1 в начало действительно меняет порядок (гарантия не-вакуумности пина)', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: false, sameType: true });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      const before = tiles.map((el) => el.getAttribute('data-units'));
      expect(before).toEqual(['17', '12', '1']); // p3×17, p3×12, p1×1 — see sameTypeLoad's own comment
      await dragFromTo(tiles[2], tiles[0]);
      const after = yardTiles(yard).map((el) => el.getAttribute('data-units'));
      expect(after).not.toEqual(before);
      expect(after).toEqual(['1', '17', '12']);
    });
  });

  // Fix round 2, item 1: the scenario Finding 2 was actually raised about — `yardGrouped` stuck `true`
  // from an earlier multi-order plan, carried into a plan with only ONE order, where `warehouseFloor`
  // never produces bays and there is no checkbox left on screen to un-stick the flag — had, after the
  // round-1 fixture change, no test of its own. `threeTypesLoad` picked up a second order (p3 → SO-2)
  // to make ITS "grouped" test meaningful, which means that test now exercises TWO REAL bays and would
  // stay green even if the guard regressed from `floor.bays.length > 0` back to the raw `yardGrouped`
  // flag. `sameTypeLoad` is single-order by construction (both cargo default to `orderId: 'SO-1'`), so
  // it is the one fixture that can still tell the two guards apart: with `grouped: true` here, the OLD
  // (flag-based) guard would block every reorder outright, while the FIXED (bays-based) guard sees
  // `floor.bays.length === 0` (one order, no bays) and lets it through — which is exactly the user-facing
  // promise the finding was about ("stuck grouping flag must not brick a single-order plan's yard").
  it('группировка застряла включённой, но заказ в плане один — перестановка всё равно работает (Finding 2 pin)', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: true, sameType: true });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      const before = tiles.map((el) => el.getAttribute('data-units'));
      expect(before).toEqual(['17', '12', '1']); // p3×17, p3×12, p1×1 — see sameTypeLoad's own comment
      await dragFromTo(tiles[2], tiles[0]); // non-adjacent: p1 to the very front
      const after = yardTiles(yard).map((el) => el.getAttribute('data-units'));
      expect(after).not.toEqual(before);
      expect(after).toEqual(['1', '17', '12']);
    });
  });

  // Finding 5 (fix round 1): Step 4 of the brief (reuse the magnet's phantom for this direction too)
  // had no test at all. These three assertions in one gesture cover: no phantom on a bare press (the
  // regression Finding 1 fixed — a press alone must leave the yard completely still), the phantom
  // appearing once the pointer has actually travelled over the yard with grouping off, and the SAME
  // magnet staying silent once grouping is really in effect (this fixture's p3 sits in its own SO-2
  // bay, so `grouped: true` here means real bays, not just the flag — Finding 2).
  it('перенос стопки над двором открывает щель-фантом — тот же магнит, что у броска из кузова', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: false });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      const down = centreOf(tiles[0]);
      const target = centreOf(tiles[2]);

      fireEvent.pointerDown(tiles[0], { clientX: down.x, clientY: down.y, pointerId: 1 });
      // Finding 1: a press that has not moved yet must show nothing — no gap, no reflow.
      expect(screen.queryByTestId('warehouse-phantom')).not.toBeInTheDocument();

      fireEvent.pointerMove(window, { clientX: target.x, clientY: target.y, pointerId: 1 });
      expect(screen.getByTestId('warehouse-phantom')).toBeInTheDocument();

      fireEvent.pointerUp(window, { clientX: target.x, clientY: target.y, pointerId: 1 });
    });
  });

  it('при включённой (реально действующей) группировке перенос стопки над двором фантом не показывает', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: true }); // threeTypesLoad: p1/p2 SO-1, p3 SO-2 — two real bays
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      const down = centreOf(tiles[0]);
      const target = centreOf(tiles[2]);

      fireEvent.pointerDown(tiles[0], { clientX: down.x, clientY: down.y, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: target.x, clientY: target.y, pointerId: 1 });
      expect(screen.queryByTestId('warehouse-phantom')).not.toBeInTheDocument();

      fireEvent.pointerUp(window, { clientX: target.x, clientY: target.y, pointerId: 1 });
    });
  });
});

describe('LadeplanScreen — figures (D1 + D3)', () => {
  const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };

  // The meta band and the old Metrics row repeated four of five numbers; "not placed" was said three
  // times (figure, legend, metrics). One band, one place.
  it('carries every number once, in the meta band', () => {
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
      </LocaleProvider>,
    );
    for (const label of ['Paletten', 'Stellplätze', 'Bodenauslastung', 'Volumenauslastung', 'Nicht platziert']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  it('drops the unplaced figure when there is no bad news to tell', () => {
    renderLadeplan(); // 8 cubes fill the hold exactly
    expect(screen.queryByText('Nicht platziert')).not.toBeInTheDocument();
    expect(screen.getByText('Volumenauslastung')).toBeInTheDocument();
  });
});

describe('LadeplanScreen — section order', () => {
  // Owner's batch: side view on top, then the top view, then the warehouse it feeds.
  it('reads side view → top view → warehouse', () => {
    const { container } = renderLadeplan();
    const marks = [...container.querySelectorAll('svg[data-cutaway], [data-testid="warehouse-floor"]')];
    expect(marks.map((el) => el.getAttribute('data-cutaway') ?? 'warehouse')).toEqual([
      'side',
      'top',
      'warehouse',
    ]);
  });

  // Both cutaways share the x axis, so one pair of markers under the TOP view labels them both.
  it('keeps Vorne / Hinten under the top view once the side view moves above it', () => {
    renderLadeplan();
    expect(screen.getAllByText('Vorne')).toHaveLength(1);
    expect(screen.getAllByText('Hinten')).toHaveLength(1);
  });
});

describe('LadeplanScreen — action bar groups', () => {
  // Раньше тест проверял ДВЕ именованные группы, стратегию и вывод (rgv.3). Стратегия уехала в
  // шапку «Настройки» (5nb этап 2, решение владельца 2): два контрола с одним именем на одной
  // странице были лишними и для скринридера, и для глаза. Осталась группа вывода — и проверка, что
  // стратегии здесь больше нет.
  it('keeps the named export group and no longer carries the strategy controls', () => {
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={load} layout={layout} />
      </LocaleProvider>,
    );
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Belademodus' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toBeNull();
  });
});

describe('LadeplanScreen — export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers all three exports', () => {
    renderLadeplan();
    for (const name of ['PDF', 'PNG', 'JSON']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  // The PNG composes exactly the two cutaways. Selecting them by role="img" once swept in the
  // legend swatches too (square aspect → a metres-tall sheet), hence the explicit marker.
  it('marks exactly the two projections as cutaways, side before top', () => {
    const { container } = renderLadeplan();
    const cutaways = [...container.querySelectorAll('svg[data-cutaway]')];
    expect(cutaways.map((el) => el.getAttribute('data-cutaway'))).toEqual(['side', 'top']);
    expect(container.querySelectorAll('svg[role="img"]').length).toBeGreaterThan(cutaways.length);
  });

  // The captions used to be a hard-coded array indexed by DOM position, so reordering the sections
  // would have swapped them silently. They now come from the svg that is actually being exported.
  it('captions each PNG section from its own data-cutaway, not from its position', async () => {
    const spy = vi.spyOn(exportPlan, 'exportPlanPng').mockResolvedValue(undefined);
    renderLadeplan();
    await userEvent.click(screen.getByRole('button', { name: 'PNG' }));

    const sections = spy.mock.calls[0][1].sections;
    expect(
      sections.map((s: { caption: string; svg: SVGSVGElement }) => [
        s.svg.dataset.cutaway,
        s.caption,
      ]),
    ).toEqual([
      ['side', 'Seitenansicht'],
      ['top', 'Draufsicht'],
    ]);
  });

  // 7i6, решение владельца: выключенный грузовик уезжает и из вывода тоже. Держится это не отдельной
  // веткой в экспорте, а тем, что PNG отдаёт наружу ЖИВЫЕ svg листа — те же, что на экране. Тест
  // пинует именно это свойство: сломай его подменой на перерисовку — и картинка снова разойдётся с
  // экраном, молча.
  it('PNG уносит выключенный грузовик вместе с экраном (7i6)', async () => {
    const spy = vi.spyOn(exportPlan, 'exportPlanPng').mockResolvedValue(undefined);
    renderLadeplan();
    await userEvent.click(screen.getByRole('checkbox', { name: 'LKW anzeigen' }));
    await userEvent.click(screen.getByRole('button', { name: 'PNG' }));

    const sections = spy.mock.calls[0][1].sections;
    expect(sections).toHaveLength(2);
    for (const s of sections as { svg: SVGSVGElement }[]) {
      expect(s.svg.querySelector('[data-truck-chrome]')).toBeNull();
    }
  });

  it('PDF opens the print dialog (browser "save as PDF")', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderLadeplan();
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });

  // Вписывание в одну страницу A4 живёт в @media print (theme.css) и держится на двух крючках в
  // разметке: лист и блок разрезов. В jsdom раскладки нет, поэтому проверить можно только СЦЕПКУ —
  // что крючки на месте и на тех самых элементах; сама одна страница проверяется счётчиком страниц
  // в Page.printToPDF на настоящем Chrome (LKWkalk-7hx).
  it('печать: лист и блок разрезов несут крючки, от которых зависит вписывание в A4', () => {
    renderLadeplan();
    const sheet = document.querySelector('.plan-sheet');
    expect(sheet).not.toBeNull();
    // Блок разрезов — ПОТОМОК листа: печатная колонка отдаёт ему остаток страницы, и вне листа
    // правило не сработало бы.
    const figures = sheet!.querySelector('.plan-figures');
    expect(figures).not.toBeNull();
    // Оба разреза лежат в нём — их и сжимает остаток страницы.
    expect(figures!.querySelectorAll('.cut svg[data-cutaway]').length).toBe(2);
  });

  it('JSON downloads load + layout under a dated filename', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderLadeplan();
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^ladungsplaner-lkw-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

// Ручные правки раскладки живут в этом компоненте, а выбрасывает их «Рассчитать» на другом экране
// (5nb этап 2: переключатели стратегии отсюда убраны и больше ничего не пересчитывают). Значит,
// экран обязан сообщать наверх, есть ли что терять — предупреждает тот, кто теряет.
const editable: Load = {
  vehicle: { id: 'v2', name: 'LKW', length: 3000, width: 2000, height: 2000 },
  cargo: [
    {
      id: 'p1',
      name: 'Pal',
      length: 1200,
      width: 800,
      height: 900,
      quantity: 2,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};

function renderEditable(onManualEditsChange = vi.fn()) {
  const { unmount } = render(
    <LocaleProvider initial="de">
      <LadeplanScreen
        load={editable}
        layout={calculateLayout(editable)}
        onManualEditsChange={onManualEditsChange}
      />
    </LocaleProvider>,
  );
  return { onManualEditsChange, unmount };
}

describe('LadeplanScreen — сообщает наверх о ручных правках', () => {
  it('свежий план правок не имеет', () => {
    const { onManualEditsChange } = renderEditable();
    expect(onManualEditsChange).toHaveBeenCalledWith(false);
    expect(onManualEditsChange).not.toHaveBeenCalledWith(true);
  });

  it('поворот стопки объявляется как ручная правка', async () => {
    const { onManualEditsChange } = renderEditable();
    await userEvent.click(screen.getAllByText('×2')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Stapel drehen' }));
    expect(onManualEditsChange).toHaveBeenLastCalledWith(true);
  });

  it('снятый со страницы план ничего не теряет — флаг гаснет', async () => {
    const { onManualEditsChange, unmount } = renderEditable();
    await userEvent.click(screen.getAllByText('×2')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Stapel drehen' }));
    unmount();
    expect(onManualEditsChange).toHaveBeenLastCalledWith(false);
  });
});
