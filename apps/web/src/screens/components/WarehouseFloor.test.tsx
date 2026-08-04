import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { WarehouseFloor } from './WarehouseFloor';
import type { BufferTile } from './warehouseLayout';
import { truckFrame } from './truckFrame';
import { installSvgGeometry } from './svgTestGeometry';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
const load: Load = {
  vehicle: V,
  cargo: [
    {
      id: 'p',
      name: 'EPAL 3',
      length: 1000,
      width: 1200,
      height: 144,
      quantity: 40,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
    {
      id: 'fixed',
      name: 'Fix',
      length: 800,
      width: 600,
      height: 144,
      quantity: 2,
      rotation: 'none',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const tiles: BufferTile[] = [{ cargoTypeId: 'p', units: 18, orientation: 'lwh' }];

function renderFloor(t: BufferTile[] = tiles, onRotate = vi.fn(), dropTarget = false) {
  render(
    <LocaleProvider initial="de">
      <WarehouseFloor
        load={load}
        tiles={t}
        onRotate={onRotate}
        onPickUp={vi.fn()}
        dragging={null}
        dropTarget={dropTarget}
      />
    </LocaleProvider>,
  );
  return onRotate;
}

describe('WarehouseFloor', () => {
  // Если эти ширины разойдутся, масштаб разойдётся молча: оба svg рисуются width:100% в одной
  // колонке, поэтому равенство viewBox по ширине — и есть весь механизм 1:1. Сравнивать надо с
  // рамкой разреза, а не с длиной кузова: рамка шире на поле под кабину (LKWkalk-6n4).
  it('is exactly as wide as the cutaway frame — that IS the 1:1 scale', () => {
    renderFloor();
    const svg = document.querySelector('[data-testid="warehouse-floor"] svg')!;
    const [, , w] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(w).toBe(truckFrame(V, 'top').outerW);
  });

  // Растровая сценерия (доки + погрузчик) снята (2026-08-03, владелец): двор упрощён до пунктирной
  // зоны, PNG больше не рисуется, и боковые поля вернулись к общему PAD (см. блок ниже).
  it('двор — пунктирная зона: растровой сценерии нет', () => {
    renderFloor();
    expect(screen.queryByTestId('warehouse-backdrop')).not.toBeInTheDocument();
    expect(document.querySelectorAll('image')).toHaveLength(0);
  });

  // `outline`, not `border` (review round 1, finding 1): a border would eat into this div's own
  // width and narrow the svg inside it, breaking pixel-exact scale with the hold even though
  // `holdYardScale.test.tsx`'s viewBox comparison would stay green. An outline paints outside the
  // box model and takes no layout space.
  it('зона обведена пунктиром — outline, не border (иначе сужает svg двора)', () => {
    renderFloor();
    const zone = screen.getByTestId('warehouse-zone');
    expect(zone.className).toContain('outline-dashed');
    const classes = zone.className.split(/\s+/);
    expect(classes).not.toContain('border');
    expect(classes).not.toContain('border-dashed');
  });

  // Контраст рамки зоны к фону — 1.3:1 в forest и 1.5:1 в warm, а WCAG 1.4.11 ждёт 3:1 от границы
  // УПРАВЛЯЮЩЕГО элемента. Двор — зона броска, то есть управляющий элемент, но лишь в тот момент,
  // когда стопку несут: владелец (2026-08-04) выбрал усиливать рамку на время переноса, а не
  // всегда, чтобы в покое чертёж не пестрил. В покое рамка остаётся тихой --line-strong.
  it('в покое рамка тихая, а на время переноса зона броска выходит на контрастный токен', () => {
    renderFloor();
    expect(screen.getByTestId('warehouse-zone').className).toContain('outline-line-strong');

    document.body.innerHTML = '';
    renderFloor(tiles, vi.fn(), true);
    const zone = screen.getByTestId('warehouse-zone');
    expect(zone.className).toContain('outline-brand');
    expect(zone.className).not.toContain('outline-line-strong');
    // Пунктир остаётся пунктиром: меняется цвет, а не природа рамки.
    expect(zone.className).toContain('outline-dashed');
  });

  // Review round 1, finding 2: the previous version of this test called `warehouseFloor` directly
  // with no options, so it never exercised the dock-derived padding in the first place and was
  // trivially green before AND after this change. What actually changed is that `WarehouseFloor`
  // the COMPONENT stopped passing `padLeft`/`padRight` — so the test has to render the component
  // and read the rendered tile position, not call the pure layout function on its own.
  it('боковые поля двора вернулись к общему PAD — первая стопка стоит в 200 мм, не под доком (~328 мм)', () => {
    renderFloor();
    const tile = document.querySelector('[data-testid="warehouse-tile"] rect')!;
    expect(Number(tile.getAttribute('x'))).toBe(200);
  });

  it('draws each stack at its real footprint with the unit count', () => {
    renderFloor();
    expect(screen.getByText('×18')).toBeInTheDocument();
    const shape = document.querySelector('[data-testid="warehouse-tile"] rect')!;
    expect(Number(shape.getAttribute('width'))).toBe(1000);
    expect(Number(shape.getAttribute('height'))).toBe(1200);
  });

  it('names the cargo type in a title rather than on a card', () => {
    renderFloor();
    expect(document.querySelector('[data-testid="warehouse-tile"] title')!.textContent).toContain(
      'EPAL 3',
    );
  });

  it('is not a projection of the plan — the PNG export must not pick it up', () => {
    renderFloor();
    expect(document.querySelector('[data-testid="warehouse-floor"] svg[data-cutaway]')).toBeNull();
  });

  // Кнопка ⟳ ушла — поворот переехал на выделение. Если плитка не фокусируется, поворот с клавиатуры
  // пропал вместе с кнопкой.
  it('keeps rotation reachable from the keyboard after the ⟳ button is gone', async () => {
    const onRotate = renderFloor();
    const tile = screen.getByRole('button', { name: /EPAL 3/ });
    expect(tile).toHaveAttribute('tabindex', '0');

    tile.focus();
    await userEvent.keyboard('{Enter}');
    const handle = screen.getByRole('button', { name: 'Stapel im Lager drehen' });
    await userEvent.click(handle);
    expect(onRotate).toHaveBeenCalledWith(0);
  });

  it('offers no rotation for fixed-orientation cargo', async () => {
    renderFloor([{ cargoTypeId: 'fixed', units: 1, orientation: 'lwh' }]);
    const tile = screen.getByRole('button', { name: /Fix/ });
    tile.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Stapel im Lager drehen' })).not.toBeInTheDocument();
  });

  // Even empty, the floor must stay a drop target (8fy): otherwise the first stack pulled out of the
  // hold has nowhere to land — the buffer only ever grew from the packer, never from the user.
  it('still offers a drop zone when empty, so a stack can be pulled out of the hold', () => {
    renderFloor([]);
    expect(screen.getByText('Alles platziert — das Lager ist leer.')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="warehouse-floor"] svg')).not.toBeNull();
    expect(screen.getByTestId('warehouse-dropzone')).toBeInTheDocument();
    expect(screen.queryByTestId('warehouse-tile')).toBeNull();
  });

  // The live gap preview (B): while a stack is carried in from the hold, the parent hands down where
  // it would land as `phantomAt`, spliced into the same flow `warehouseFloor` lays real tiles out in
  // — so a tile already sitting at that index is pushed aside exactly the way a real drop would push
  // it, not just have something drawn on top of it.
  it('opens a dashed phantom slot at phantomAt.index and pushes the tile there aside', () => {
    const twoTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    ];
    const phantomTile: BufferTile = { cargoTypeId: 'fixed', units: 1, orientation: 'lwh' };
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={load}
          tiles={twoTiles}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          phantomAt={{ index: 1, tile: phantomTile }}
        />
      </LocaleProvider>,
    );
    const phantom = screen.getByTestId('warehouse-phantom');
    expect(phantom.tagName.toLowerCase()).toBe('rect');
    expect(phantom).toHaveAttribute('fill', 'none');
    expect(phantom).not.toHaveAttribute('pointer-events', 'auto');

    // Ряд открывается от левого поля двора — общего PAD=200 (доки сняты, 2026-08-03). Тест держит
    // ПОРЯДОК и шаг, а не координату начала: числа ниже отсчитываются от него. GAP=200: 'p'
    // (1000×1200) открывает ряд, фантом занимает следующий слот своей плиткой (fixed, lwh — 800×600),
    // а настоящая 'fixed' сдвинута фантомом ещё на один слот вправо — туда, где без фантома стояла бы
    // сама.
    const x0 = 200;
    const [pTile, fixedTile] = screen.getAllByTestId('warehouse-tile');
    expect(Number(pTile.querySelector('rect')!.getAttribute('x'))).toBeCloseTo(x0, 6);
    expect(Number(phantom.getAttribute('x'))).toBeCloseTo(x0 + 1000 + 200, 6);
    expect(Number(fixedTile.querySelector('rect')!.getAttribute('x'))).toBeCloseTo(
      x0 + 1000 + 200 + 800 + 200,
      6,
    );
  });

  // dwc.11: the map index runs over floor.tiles, which INCLUDES the spliced phantom, but the parent's
  // onPickUp/onRotate index its `tiles` array WITHOUT the phantom. For any tile rendered after the
  // phantom the two diverge by one — so a pick-up/rotate reaches the wrong buffer stack. Reachable only
  // with a second pointer (multitouch) mid-carry, when phantomAt is live and a buffer tile is pressed.
  it('reports the phantom-free tile index to onPickUp, not the render index', () => {
    const twoTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'p', units: 5, orientation: 'lwh' },
    ];
    const onPickUp = vi.fn();
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={load}
          tiles={twoTiles}
          onRotate={vi.fn()}
          onPickUp={onPickUp}
          dragging={null}
          // Phantom spliced BEFORE both tiles: render order is [phantom, tileA, tileB], so tileB sits
          // at render index 2 but is tiles[1].
          phantomAt={{ index: 0, tile: { cargoTypeId: 'p', units: 1, orientation: 'lwh' } }}
        />
      </LocaleProvider>,
    );
    const secondTile = screen.getAllByTestId('warehouse-tile')[1];
    fireEvent.pointerDown(secondTile);
    expect(onPickUp).toHaveBeenCalledWith(1, expect.anything());
  });

  it('reports the phantom-free tile index to onRotate, not the render index', async () => {
    const twoTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'p', units: 5, orientation: 'lwh' },
    ];
    const onRotate = vi.fn();
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={load}
          tiles={twoTiles}
          onRotate={onRotate}
          onPickUp={vi.fn()}
          dragging={null}
          phantomAt={{ index: 0, tile: { cargoTypeId: 'p', units: 1, orientation: 'lwh' } }}
        />
      </LocaleProvider>,
    );
    const secondTile = screen.getAllByTestId('warehouse-tile')[1];
    secondTile.focus();
    await userEvent.keyboard('{Enter}'); // select → reveals the rotate handle
    await userEvent.click(screen.getByRole('button', { name: 'Stapel im Lager drehen' }));
    expect(onRotate).toHaveBeenCalledWith(1);
  });
});

describe('WarehouseFloor — загоны по заказу', () => {
  const twoOrders: Load = {
    vehicle: V,
    cargo: [
      { ...load.cargo[0], orderId: 'SO-1' },
      { ...load.cargo[1], orderId: 'SO-2' },
    ],
  };
  const render2 = (t: BufferTile[], props: Partial<{ grouped: boolean; onGroupedChange: (v: boolean) => void }> = {}) =>
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={twoOrders}
          tiles={t}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          grouped
          {...props}
        />
      </LocaleProvider>,
    );

  const bothOrders: BufferTile[] = [
    { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
    { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
  ];

  // 77g: владелец после прода — «без неё удобнее». Загоны 41e.2 из умолчания стали режимом.
  describe('группировка — режим, а не умолчание (LKWkalk-77g)', () => {
    it('без флага загонов нет даже при двух заказах', () => {
      render2(bothOrders, { grouped: false });
      expect(document.querySelectorAll('[data-testid="warehouse-bay"]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-testid="warehouse-tile"]')).toHaveLength(2);
    });

    it('переключатель стоит в шапке двора и сообщает о переключении', async () => {
      const onGroupedChange = vi.fn();
      render2(bothOrders, { grouped: false, onGroupedChange });

      const toggle = screen.getByRole('checkbox', { name: 'Nach Auftrag gruppieren' });
      expect((toggle as HTMLInputElement).checked).toBe(false);
      await userEvent.click(toggle);
      expect(onGroupedChange).toHaveBeenCalledWith(true);
    });

    // Группировать нечего: один заказ идёт тем же потоком с загонами и без, поэтому переключатель
    // был бы заведомо мёртвым — а мёртвый переключатель хуже отсутствующего.
    it('при одном заказе во дворе переключателя нет', () => {
      render(
        <LocaleProvider initial="de">
          <WarehouseFloor
            load={load}
            tiles={tiles}
            onRotate={vi.fn()}
            onPickUp={vi.fn()}
            dragging={null}
            grouped={false}
            onGroupedChange={vi.fn()}
          />
        </LocaleProvider>,
      );
      expect(screen.queryByRole('checkbox', { name: 'Nach Auftrag gruppieren' })).not.toBeInTheDocument();
    });
  });

  it('рисует по загону на заказ с номером и числом единиц', () => {
    render2([
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    ]);
    const bays = document.querySelectorAll('[data-testid="warehouse-bay"]');
    expect(bays).toHaveLength(2);
    expect([...bays].map((b) => b.getAttribute('data-order'))).toEqual(['SO-1', 'SO-2']);
    expect(screen.getByText(/SO-1 · ×18/)).toBeInTheDocument();
  });

  it('один заказ — разметки нет, двор как раньше', () => {
    renderFloor();
    expect(document.querySelectorAll('[data-testid="warehouse-bay"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid="warehouse-tile"]')).toHaveLength(1);
  });

  it('загон без номера заказа подписан локализованным ярлыком', () => {
    const anon: Load = {
      vehicle: V,
      cargo: [{ ...load.cargo[0], orderId: undefined }, { ...load.cargo[1], orderId: 'SO-2' }],
    };
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={anon}
          tiles={[
            { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
            { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
          ]}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          grouped
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(/Ohne Auftrag/)).toBeInTheDocument();
  });

  // Тот же разрыв систем координат, что и в `insertionIndexAt` (финальное ревью, находка 1), но со
  // стороны отрисовки: `floor.tiles` — СГРУППИРОВАННЫЙ список, а `onPickUp`/`onRotate`/`dragging`
  // родителя индексируют его собственный проп `tiles`. Как только группировка переставляет плитки
  // (здесь заказы чередуются во входе), позиция в отрисовке перестаёт совпадать с позицией во входе.
  it('сообщает родителю индекс во ВХОДНОМ массиве, а не позицию в сгруппированной отрисовке', () => {
    const interleaved: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' }, // SO-1, вход 0
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' }, // SO-2, вход 1
      { cargoTypeId: 'p', units: 5, orientation: 'lwh' }, // SO-1, вход 2
    ];
    const onPickUp = vi.fn();
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor load={twoOrders} tiles={interleaved} onRotate={vi.fn()} onPickUp={onPickUp} dragging={null} grouped />
      </LocaleProvider>,
    );
    // Группировка рисует [p×18, p×5, Fix×2]: вторая нарисованная плитка — это вход 2, не вход 1.
    const rendered = screen.getAllByTestId('warehouse-tile');
    expect(rendered.map((t) => t.getAttribute('aria-label'))).toEqual([
      'EPAL 3 ×18',
      'EPAL 3 ×5',
      'Fix ×2',
    ]);
    fireEvent.pointerDown(rendered[1]);
    expect(onPickUp).toHaveBeenCalledWith(2, expect.anything());
  });

  it('разметка лежит под стопками — стопку по-прежнему можно взять', () => {
    render2([
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    ]);
    const svg = document.querySelector('[data-testid="warehouse-floor"] svg')!;
    const nodes = [...svg.querySelectorAll('[data-testid="warehouse-bay"], [data-testid="warehouse-tile"]')];
    expect(nodes[0].getAttribute('data-testid')).toBe('warehouse-bay');
    expect(nodes.at(-1)!.getAttribute('data-testid')).toBe('warehouse-tile');
  });
});

describe('WarehouseFloor — перенос загонов (LKWkalk-36f)', () => {
  const threeOrders: Load = {
    vehicle: V,
    cargo: [
      { ...load.cargo[0], id: 'p', orderId: 'SO-1' },
      { ...load.cargo[1], id: 'fixed', orderId: 'SO-2' },
      { ...load.cargo[1], id: 'third', name: 'Third', orderId: 'SO-3' },
    ],
  };
  const threeTiles: BufferTile[] = [
    { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
    { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    { cargoTypeId: 'third', units: 3, orientation: 'lwh' },
  ];
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });
  const renderYard = (onBayOrderChange = vi.fn()) => {
    restore = installSvgGeometry({ left: 0, top: 0, width: 14000, height: 4000 });
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={threeOrders}
          tiles={threeTiles}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          grouped
          onBayOrderChange={onBayOrderChange}
        />
      </LocaleProvider>,
    );
    return onBayOrderChange;
  };
  const bayOrders = () =>
    [...document.querySelectorAll('[data-testid="warehouse-bay"]')].map((b) => b.getAttribute('data-order'));
  const grip = (orderId: string) =>
    document.querySelector(`[data-testid="warehouse-bay"][data-order="${orderId}"] [data-tag-grip]`)!;
  /** Слушатели жеста глобальные; события шлём на сам двор и даём им всплыть — так же, как это
   *  делают тесты переноса стопки. `fireEvent` на `window` в этом репозитории не используется. */
  const yard = () => document.querySelector('svg[data-warehouse]')!;

  it('двор перекомпоновывается ЕЩЁ ДО отпускания — видно результат, а не курсор', () => {
    const onBayOrderChange = renderYard();
    expect(bayOrders()).toEqual(['SO-1', 'SO-2', 'SO-3']);

    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    // Левая половина первого загона (он открывается в x = 200): SO-3 встаёт перед SO-1.
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });

    expect(bayOrders()).toEqual(['SO-3', 'SO-1', 'SO-2']);
    // Порядок ещё провизорный: родителю о нём не сообщают на каждый кадр.
    expect(onBayOrderChange).not.toHaveBeenCalled();
  });

  it('отпускание сообщает родителю итоговый порядок', () => {
    const onBayOrderChange = renderYard();
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600 });
    expect(onBayOrderChange).toHaveBeenCalledWith(['SO-3', 'SO-1', 'SO-2']);
  });

  // Браузер вправе слить движения и отпустить указатель там, где ни одного pointermove не пришло.
  // Порядок обязан считаться от точки ОТПУСКАНИЯ; иначе фиксируется предпоследний слот.
  it('отпускание в точке, о которой не было движения, считает порядок по ней же', () => {
    const onBayOrderChange = renderYard();
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    // Единственное движение — в середину двора, где порядок ещё не меняется (правее центра SO-1).
    fireEvent.pointerMove(yard(), { clientX: 3000, clientY: 600 });
    // А отпускание — сразу в левой половине SO-1, без промежуточного pointermove.
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600 });
    expect(onBayOrderChange).toHaveBeenCalledWith(['SO-3', 'SO-1', 'SO-2']);
  });

  // Спека §3, решение 6: клик по бирке — это pointerdown + pointerup без движения, и он НЕ должен
  // превращать порядок по умолчанию в явный пользовательский. Иначе после случайного клика
  // перестановка грузов на экране «Настройка» перестала бы двигать загоны, а причину этого никто
  // бы не связал с кликом.
  it('клик по бирке без движения не фиксирует ничего', () => {
    const onBayOrderChange = renderYard();
    // Точка — сама бирка загона SO-3: под installSvgGeometry мм и client-px совпадают.
    const tag = grip('SO-3').querySelector('[data-tag]')!;
    const at = { clientX: Number(tag.getAttribute('x')) + 10, clientY: Number(tag.getAttribute('y')) + 10 };
    fireEvent.pointerDown(grip('SO-3'), at);
    fireEvent.pointerUp(yard(), at);
    expect(onBayOrderChange).not.toHaveBeenCalled();
    expect(bayOrders()).toEqual(['SO-1', 'SO-2', 'SO-3']);
  });

  it('pointercancel бросает жест: порядок не фиксируется и двор возвращается к пропу', () => {
    const onBayOrderChange = renderYard();
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    expect(bayOrders()).toEqual(['SO-3', 'SO-1', 'SO-2']); // провизорный порядок на экране

    fireEvent.pointerCancel(yard(), { clientX: 400, clientY: 600 });
    expect(onBayOrderChange).not.toHaveBeenCalled();
    expect(bayOrders()).toEqual(['SO-1', 'SO-2', 'SO-3']);
  });

  // Отмена — такая же часть жеста, как движение и отпускание, и сверка pointerId ей нужна ровно так
  // же: систему, забравшую ВТОРОЙ палец, этот перенос не касается. Без проверки набор оставался
  // зелёным — «свою» отмену пришпиливал тест выше, чужую не пришпиливал никто.
  it('чужой указатель жеста не бросает', () => {
    const onBayOrderChange = renderYard();
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600, pointerId: 1 });
    expect(bayOrders()).toEqual(['SO-3', 'SO-1', 'SO-2']);

    fireEvent.pointerCancel(yard(), { clientX: 400, clientY: 600, pointerId: 2 });
    expect(bayOrders()).toEqual(['SO-3', 'SO-1', 'SO-2']); // жест жив

    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600, pointerId: 1 });
    expect(onBayOrderChange).toHaveBeenCalledWith(['SO-3', 'SO-1', 'SO-2']);
  });

  it('чужой указатель жеста не ведёт и не завершает', () => {
    const onBayOrderChange = renderYard();
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300, pointerId: 1 });
    // Второй палец: ни его движение, ни его отпускание к этому переносу отношения не имеют.
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600, pointerId: 2 });
    expect(bayOrders()).toEqual(['SO-1', 'SO-2', 'SO-3']);
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600, pointerId: 2 });
    expect(onBayOrderChange).not.toHaveBeenCalled();

    // А свой — ведёт.
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600, pointerId: 1 });
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600, pointerId: 1 });
    expect(onBayOrderChange).toHaveBeenCalledWith(['SO-3', 'SO-1', 'SO-2']);
  });

  // Спека §3, решение 1: правило «группа без номера всегда последняя» — это умолчание, а не запрет.
  it('загон без номера заказа тянется как любой другой', () => {
    restore = installSvgGeometry({ left: 0, top: 0, width: 14000, height: 4000 });
    const onBayOrderChange = vi.fn();
    const anon: Load = {
      vehicle: V,
      cargo: [threeOrders.cargo[0], { ...threeOrders.cargo[1], orderId: undefined }],
    };
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={anon}
          tiles={threeTiles.slice(0, 2)}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          grouped
          onBayOrderChange={onBayOrderChange}
        />
      </LocaleProvider>,
    );
    expect(bayOrders()).toEqual(['SO-1', '']); // безномерный по умолчанию последний
    fireEvent.pointerDown(grip(''), { clientX: 2400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600 });
    expect(onBayOrderChange).toHaveBeenCalledWith(['', 'SO-1']);
  });

  it('на время жеста курсор смыкается — и только у того загона, который тянут', () => {
    renderYard();
    const cursorOf = (orderId: string) => (grip(orderId) as SVGElement).style.cursor;
    expect(cursorOf('SO-3')).toBe('grab');

    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    expect(cursorOf('SO-3')).toBe('grabbing');
    expect(cursorOf('SO-1')).toBe('grab');

    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600 });
    expect(cursorOf('SO-3')).toBe('grab');
  });

  it('загон едет вместе со своими стопками, а не одной биркой', () => {
    renderYard();
    const tileX = (label: string) =>
      Number(
        screen
          .getAllByTestId('warehouse-tile')
          .find((t) => t.getAttribute('aria-label')!.startsWith(label))!
          .querySelector('rect')!
          .getAttribute('x'),
      );
    const before = tileX('Third');
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    expect(tileX('Third')).toBeLessThan(before);
  });

  // Внутри загона жест принадлежит стопке: нажатие на площадку не должно уводить загон.
  // jsdom не считает `pointer-events`, поэтому тест проверяет разводку обработчиков (на периметре
  // его нет), а не браузерный хит-тест; сам `pointer-events` пришпилен в WarehouseBay.test.tsx.
  it('нажатие на площадку загона переноса не начинает', () => {
    const onBayOrderChange = renderYard();
    const outline = document.querySelector('[data-testid="warehouse-bay"][data-order="SO-3"] [data-outline]')!;
    fireEvent.pointerDown(outline, { clientX: 4400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600 });
    expect(onBayOrderChange).not.toHaveBeenCalled();
    expect(bayOrders()).toEqual(['SO-1', 'SO-2', 'SO-3']);
  });

  it('без onBayOrderChange бирки инертны — двор без переноса загонов', () => {
    restore = installSvgGeometry({ left: 0, top: 0, width: 14000, height: 4000 });
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor load={threeOrders} tiles={threeTiles} onRotate={vi.fn()} onPickUp={vi.fn()} dragging={null} grouped />
      </LocaleProvider>,
    );
    expect(grip('SO-3').getAttribute('pointer-events')).toBeNull();
  });

  // Финальное ревью 36f, находка 1: выделение хранилось позицией в отрисовке, а перенос загона
  // переставляет `floor.tiles`, не меняя набор плиток, — кольцо оставалось на слоте и оказывалось уже
  // на ЧУЖОЙ стопке, а ⟳ поворачивал её. Та же дырка достижима и одним флажком группировки.
  it('выделение держится за свою стопку, а не за слот: перенос загонов его не перевешивает', async () => {
    restore = installSvgGeometry({ left: 0, top: 0, width: 14000, height: 4000 });
    // Все три типа поворотные: иначе у выделенной стопки не будет ручки ⟳, а именно ею проверяется,
    // КАКУЮ стопку повернёт нажатие.
    const rotatable: Load = {
      vehicle: V,
      cargo: [
        { ...load.cargo[0], id: 'p', name: 'Erst', orderId: 'SO-1' },
        { ...load.cargo[0], id: 'second', name: 'Zweit', orderId: 'SO-2' },
        { ...load.cargo[0], id: 'third', name: 'Dritt', orderId: 'SO-3' },
      ],
    };
    const rotatableTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'second', units: 2, orientation: 'lwh' },
      { cargoTypeId: 'third', units: 3, orientation: 'lwh' },
    ];
    const onRotate = vi.fn();
    // Двор с ЗАПОМИНАЮЩИМСЯ порядком: в приложении `bayOrder` держит родитель, и после отпускания
    // расстановка остаётся новой. Без этого жест откатился бы к пропу, и проверять было бы нечего.
    function ControlledYard() {
      const [order, setOrder] = useState<string[]>([]);
      return (
        <WarehouseFloor
          load={rotatable}
          tiles={rotatableTiles}
          onRotate={onRotate}
          onPickUp={vi.fn()}
          dragging={null}
          grouped
          bayOrder={order}
          onBayOrderChange={setOrder}
        />
      );
    }
    render(
      <LocaleProvider initial="de">
        <ControlledYard />
      </LocaleProvider>,
    );

    // Выделяем стопку заказа SO-2 — вход 1, вторая и в отрисовке.
    const picked = screen.getByRole('button', { name: /Zweit/ });
    picked.focus();
    await userEvent.keyboard('{Enter}');
    const ring = (tile: Element) => tile.querySelector('rect[stroke-dasharray="6 4"]');
    expect(ring(picked)).not.toBeNull();

    // Тянем бирку SO-3 в начало двора: набор плиток тот же, порядок отрисовки другой.
    fireEvent.pointerDown(grip('SO-3'), { clientX: 4400, clientY: 300 });
    fireEvent.pointerMove(yard(), { clientX: 400, clientY: 600 });
    fireEvent.pointerUp(yard(), { clientX: 400, clientY: 600 });
    expect(bayOrders()).toEqual(['SO-3', 'SO-1', 'SO-2']);

    // Кольцо — на той же стопке, и больше ни на одной.
    const tilesNow = screen.getAllByTestId('warehouse-tile');
    const ringed = tilesNow.filter((t) => ring(t));
    expect(ringed).toHaveLength(1);
    expect(ringed[0].getAttribute('aria-label')).toBe('Zweit ×2');

    // И ⟳ поворачивает именно её — вход 1, хотя рисуется она теперь последней.
    await userEvent.click(screen.getByRole('button', { name: 'Stapel im Lager drehen' }));
    expect(onRotate).toHaveBeenCalledWith(1);
  });

  it('порядок из пропа bayOrder рисуется, пока никто ничего не тянет', () => {
    restore = installSvgGeometry({ left: 0, top: 0, width: 14000, height: 4000 });
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={threeOrders}
          tiles={threeTiles}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          grouped
          bayOrder={['SO-2']}
          onBayOrderChange={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(bayOrders()).toEqual(['SO-2', 'SO-1', 'SO-3']);
  });
});

// Подпись артикула на стопке склада (LKWkalk-ayg) — та же пара «имя + ×N», что и в виде сверху.
describe('article name on warehouse stacks', () => {
  it('names the article above the unit count', () => {
    renderFloor();
    const tile = screen.getByTestId('warehouse-tile');
    const texts = [...tile.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('EPAL 3');
    expect(texts).toContain('×18');
  });
});
