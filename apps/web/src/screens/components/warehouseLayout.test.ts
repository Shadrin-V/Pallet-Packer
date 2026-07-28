import { describe, expect, it } from 'vitest';
import type { Load } from '@shadrin-v/engine';
import { warehouseFloor, insertionIndexAt, reorderBaysAt } from './warehouseLayout';
import type { BufferTile } from './warehouseLayout';
import { truckFrame } from './truckFrame';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
const cargo = (id: string, length: number, width: number, orderId = 'SO-1') => ({
  id,
  name: id,
  length,
  width,
  height: 144,
  quantity: 10,
  rotation: 'yawOnly' as const,
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt' as const,
  orderId,
});
const load: Load = { vehicle: V, cargo: [cargo('a', 1200, 800), cargo('b', 600, 400)] };
const tile = (cargoTypeId: string, units = 1) => ({
  cargoTypeId,
  units,
  orientation: 'lwh' as const,
});

describe('warehouseFloor', () => {
  // Не «шириной с кузов»: рамка разреза шире кузова на поле под кабину, и масштаб держится равенством
  // ИМЕННО рамок (LKWkalk-6n4). Полосу под кабиной двор занимает стопками — решение владельца.
  it('is as wide as the cutaway frame — the scale is shared by construction', () => {
    expect(warehouseFloor(load, []).width).toBe(truckFrame(V, 'top').outerW);
  });

  it('lays tiles left to right at their real size, separated by the gap', () => {
    const { tiles } = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(tiles[0]).toMatchObject({ x: 200, y: 200, dx: 1200, dy: 800 });
    expect(tiles[1]).toMatchObject({ x: 1600, y: 200 }); // 200 + 1200 + 200
  });

  it('wraps to a new row when the next tile would leave the floor', () => {
    // Ширина задана явно: тест про перенос строки, а не про рамку разреза.
    const { tiles } = warehouseFloor(load, [tile('a'), tile('a'), tile('a')], {
      width: 3000,
      gap: 200,
      pad: 200,
    });
    expect(tiles[2].y).toBeGreaterThan(tiles[0].y);
    expect(tiles[2].x).toBe(200); // новый ряд начинается слева
  });

  it('a row is as tall as its tallest tile', () => {
    const { tiles } = warehouseFloor(load, [tile('a'), tile('b')], {
      width: 2200,
      gap: 200,
      pad: 200,
    });
    expect(tiles[1].y).toBe(1200); // 200 + 800 (высота ряда по 'a') + 200
  });

  it('height covers the content plus padding', () => {
    const { height } = warehouseFloor(load, [tile('a')], { gap: 200, pad: 200 });
    expect(height).toBe(1200); // 200 + 800 + 200
  });

  it('respects each tile orientation', () => {
    const { tiles } = warehouseFloor(load, [{ cargoTypeId: 'a', units: 1, orientation: 'wlh' }]);
    expect(tiles[0]).toMatchObject({ dx: 800, dy: 1200 });
  });

  it('handles an empty buffer', () => {
    expect(warehouseFloor(load, [])).toMatchObject({ tiles: [], height: 0 });
  });

  it('is deterministic', () => {
    const build = () => warehouseFloor(load, [tile('a'), tile('b'), tile('a')]);
    expect(build()).toEqual(build());
  });
});

describe('insertionIndexAt', () => {
  const load = {
    vehicle: { length: 13600, width: 2480, height: 2650 },
    cargo: [{ id: 'eur', name: 'EUR', length: 1200, width: 800, height: 1000, rotation: 'yaw' }],
  } as unknown as Load;
  const tile = (): BufferTile => ({ cargoTypeId: 'eur', units: 1, orientation: 'lwh' });

  it('insertion index in the middle of a row', () => {
    const tiles = [tile(), tile(), tile()];
    const fl = warehouseFloor(load, tiles);
    // centre of the 2nd tile:
    const t1 = fl.tiles[1];
    const idx = insertionIndexAt(fl, { x: t1.x + t1.dx / 2, y: t1.y + t1.dy / 2 });
    expect(idx).toBe(1);
  });

  it('before the first tile → 0', () => {
    const tiles = [tile(), tile()];
    const fl = warehouseFloor(load, tiles);
    expect(insertionIndexAt(fl, { x: 0, y: fl.tiles[0].y })).toBe(0);
  });

  it('past the last tile → length', () => {
    const tiles = [tile(), tile()];
    const fl = warehouseFloor(load, tiles);
    expect(insertionIndexAt(fl, { x: load.vehicle.length, y: fl.tiles[1].y })).toBe(2);
  });

  it('empty floor → 0', () => {
    const fl = warehouseFloor(load, []);
    expect(insertionIndexAt(fl, { x: 500, y: 500 })).toBe(0);
  });

  it('point in the second row lands after the first row', () => {
    // Enough tiles to wrap to a second row at this vehicle length.
    const tiles = Array.from({ length: 14 }, tile);
    const fl = warehouseFloor(load, tiles);
    const secondRow = fl.tiles.find((t) => t.y > fl.tiles[0].y);
    expect(secondRow).toBeTruthy();
    const idx = insertionIndexAt(fl, { x: secondRow!.x - 1, y: secondRow!.y + 1 });
    const firstRowCount = fl.tiles.filter((t) => t.y === fl.tiles[0].y).length;
    expect(idx).toBe(firstRowCount);
  });

  it('mixed-height row: uses the row height, not a tile\'s own, to tell its row apart', () => {
    // A row can mix cargo heights (the buffer holds several types at once): tall, short, tall.
    const mixedCargo = [
      { id: 'tall', name: 'tall', length: 1200, width: 800, height: 1000, rotation: 'yaw' },
      { id: 'short', name: 'short', length: 800, width: 500, height: 1000, rotation: 'yaw' },
    ];
    const mixedLoad = {
      vehicle: { length: 13600, width: 2480, height: 2650 },
      cargo: mixedCargo,
    } as unknown as Load;
    const tallTile = (): BufferTile => ({ cargoTypeId: 'tall', units: 1, orientation: 'lwh' });
    const shortTile = (): BufferTile => ({ cargoTypeId: 'short', units: 1, orientation: 'lwh' });
    const fl = warehouseFloor(mixedLoad, [tallTile(), shortTile(), tallTile()]);
    const [a, b, c] = fl.tiles;
    // Sanity: all three land in one row, and the middle tile really is shorter than the row.
    expect(a.y).toBe(b.y);
    expect(b.y).toBe(c.y);
    expect(b.dy).toBeLessThan(a.dy);

    // A point in the short tile's column, left of its centre, but below its OWN height — still
    // inside the row (bounded by the tall neighbours). Must insert before it (index 1), not skip
    // past it to the next tall tile (index 2).
    const point = { x: b.x + b.dx / 4, y: b.y + b.dy + (a.dy - b.dy) / 2 };
    expect(insertionIndexAt(fl, point)).toBe(1);
  });
});

describe('insertionIndexAt — магнит к своему загону', () => {
  const V2 = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
  const two: Load = {
    vehicle: V2,
    cargo: [cargo('a', 1200, 800, 'SO-1'), cargo('b', 600, 400, 'SO-2')],
  };
  const fl = () => warehouseFloor(two, [tile('a'), tile('a'), tile('b')], { gap: 200, pad: 200, grouped: true });

  it('точка в чужом загоне — стопка всё равно уходит в конец своего', () => {
    const layout = fl();
    const foreign = layout.bays[0]; // SO-1
    const point = { x: foreign.x + 10, y: foreign.y + 10 };
    // Несём стопку заказа SO-2: его загон — второй, плитки [2..3).
    expect(insertionIndexAt(layout, point, { orderId: 'SO-2' })).toBe(3);
  });

  it('точка в своём загоне задаёт позицию внутри него', () => {
    const layout = fl();
    const own = layout.bays[0]; // SO-1, плитки 0 и 1
    const first = layout.tiles[0];
    // Левее центра первой плитки своего загона → перед ней.
    expect(insertionIndexAt(layout, { x: own.x + 1, y: first.y }, { orderId: 'SO-1' })).toBe(0);
    // Правее центра первой, левее центра второй → между ними.
    const between = { x: first.x + first.dx + 10, y: first.y };
    expect(insertionIndexAt(layout, between, { orderId: 'SO-1' })).toBe(1);
  });

  it('у заказа ещё нет загона — новый открывается в конце', () => {
    const layout = fl();
    expect(insertionIndexAt(layout, { x: 300, y: 300 }, { orderId: 'SO-77' })).toBe(
      layout.tiles.length,
    );
  });

  it('без целевого заказа поведение прежнее', () => {
    const layout = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200, grouped: true });
    expect(insertionIndexAt(layout, { x: 0, y: layout.tiles[0].y })).toBe(0);
  });

  // Индекс возвращается в системе координат ВХОДНОГО массива `tiles` (его сплайсят оба вызывающих:
  // `onDropOutside` — в `orderedTiles`, `WarehouseFloor` — в свой проп `tiles`), а не в системе
  // сгруппированного `layout.tiles`. Две системы совпадают, только пока группировка не переставляет
  // группы; она это делает уже сегодня (загон без номера уходит в конец) и будет делать системно,
  // когда придёт `bayOrder`.
  it('точка внутри загона → индекс во ВХОДНОМ массиве, даже когда группировка переставила загоны', () => {
    const mixed: Load = {
      vehicle: V,
      cargo: [cargo('a', 1200, 800, ''), cargo('b', 600, 400, 'SO-2')],
    };
    // Вход [a, b]; загон без номера уходит ПОСЛЕ SO-2 → в layout.tiles плитка 'a' стоит второй.
    const layout = warehouseFloor(mixed, [tile('a'), tile('b')], { gap: 200, pad: 200, grouped: true });
    expect(layout.bays.map((b) => b.orderId)).toEqual(['SO-2', '']);
    const blank = layout.bays[1];
    const aTile = layout.tiles[blank.startIndex];
    expect(aTile.x).toBe(blank.x + 200); // sanity: это действительно плитка загона без номера
    // Точка внутри пустого загона, левее центра 'a' → вставка ПЕРЕД ней. Во входном массиве
    // [a, b] это индекс 0; её позиция в сгруппированном списке — 1, и вернуть 1 значило бы
    // сплайснуть фантом ПОСЛЕ 'a'.
    expect(insertionIndexAt(layout, { x: aTile.x + 1, y: aTile.y + 1 }, { orderId: '' })).toBe(0);
  });

  it('точка вне своего загона → индекс сразу за последней его плиткой во ВХОДНОМ массиве', () => {
    const two: Load = {
      vehicle: V,
      cargo: [cargo('a', 1200, 800, 'SO-1'), cargo('b', 600, 400, 'SO-2')],
    };
    // Вход [a, b, a] — заказы чередуются; в layout.tiles они разведены в [a, a, b].
    const layout = warehouseFloor(two, [tile('a'), tile('b'), tile('a')], { gap: 200, pad: 200, grouped: true });
    expect(layout.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-2']);
    // (0,0) — вне обоих загонов (они начинаются в pad=200): стопка SO-1 садится в хвост своего
    // загона. Последняя плитка SO-1 во входном массиве — индекс 2, значит вставка на 3.
    expect(insertionIndexAt(layout, { x: 0, y: 0 }, { orderId: 'SO-1' })).toBe(3);
    // А хвост SO-2 — сразу за его единственной плиткой, входной индекс 1 → вставка на 2.
    expect(insertionIndexAt(layout, { x: 0, y: 0 }, { orderId: 'SO-2' })).toBe(2);
  });
});

describe('warehouseFloor — phantom slot', () => {
  const load = {
    vehicle: { length: 13600, width: 2480, height: 2650 },
    cargo: [{ id: 'eur', name: 'EUR', length: 1200, width: 800, height: 1000, rotation: 'yaw' }],
  } as unknown as Load;
  const tile = (): BufferTile => ({ cargoTypeId: 'eur', units: 1, orientation: 'lwh' });

  it('a phantom tile shifts the tiles after it and is flagged', () => {
    const tiles = [tile(), tile(), tile()];
    const withPhantom: BufferTile[] = [
      tiles[0],
      { ...tile(), phantom: true } as BufferTile & { phantom?: true },
      tiles[1],
      tiles[2],
    ];
    const base = warehouseFloor(load, tiles);
    const fl = warehouseFloor(load, withPhantom);
    // The tile that was 2nd is now pushed right by one slot (a tile + gap).
    expect(fl.tiles[2].x).toBeGreaterThan(base.tiles[1].x);
    expect((fl.tiles[1] as { phantom?: true }).phantom).toBe(true);
  });
});

describe('warehouseFloor — загоны по заказу', () => {
  // 'a' 1200×800 в SO-1, 'b' 600×400 в SO-2 — два различимых заказа.
  const twoOrders: Load = {
    vehicle: V,
    cargo: [cargo('a', 1200, 800, 'SO-1'), cargo('b', 600, 400, 'SO-2')],
  };

  // 77g: владелец после прода — «без неё удобнее». Загоны из умолчания становятся режимом: двор
  // по умолчанию снова сплошной поток, и разбить его на загоны надо попросить явно.
  it('по умолчанию загонов нет даже при двух заказах — группировка включается флагом', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')], { gap: 200, pad: 200 });
    expect(fl.bays).toEqual([]);
    // и это ровно тот же поток, что до 41e.2: порядок входа сохранён, плитки идут подряд
    expect(fl.tiles.map((t) => t.srcIndex)).toEqual([0, 1, 2]);
    expect(fl.tiles[0]).toMatchObject({ x: 200, y: 200 });
    expect(fl.tiles[1]).toMatchObject({ x: 1600, y: 200 });
  });

  it('grouped: true — загоны открываются', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')], {
      gap: 200,
      pad: 200,
      grouped: true,
    });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-2']);
  });

  it('один заказ — загонов нет, раскладка ровно сегодняшняя', () => {
    const fl = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(fl.bays).toEqual([]);
    expect(fl.tiles[0]).toMatchObject({ x: 200, y: 200 });
    expect(fl.tiles[1]).toMatchObject({ x: 1600, y: 200 });
  });

  it('два заказа — по загону на заказ, плитки сгруппированы', () => {
    // Порядок плиток нарочно чередует заказы: группировка должна их развести.
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')], { gap: 200, pad: 200, grouped: true });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-2']);
    expect(fl.bays[0]).toMatchObject({ startIndex: 0, count: 2, units: 2 });
    expect(fl.bays[1]).toMatchObject({ startIndex: 2, count: 1, units: 1 });
    // Первый загон: x=pad=200, y=pad=200; контент 2×'a' = 1200+200+1200 = 2600 → w = 2600+2*200 = 3000;
    // h = 800 + TAG_H(180) + 2*BAY_PAD(400) = 1380.
    expect(fl.bays[0]).toMatchObject({ x: 200, y: 200, w: 3000, h: 1380 });
    // Второй встаёт правее: 200 + 3000 + BAY_GAP(400) = 3600. Контент 600 → w = max(1000, BAY_MIN_W) = 1600.
    expect(fl.bays[1]).toMatchObject({ x: 3600, y: 200, w: 1600, h: 980 });
  });

  it('плитки смещены внутрь своего загона — под бирку и поля', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200, grouped: true });
    // 200 (bay.x) + 200 (BAY_PAD) = 400 по x; 200 (bay.y) + 180 (TAG_H) + 200 (BAY_PAD) = 580 по y.
    expect(fl.tiles[0]).toMatchObject({ x: 400, y: 580 });
  });

  it('загоны переносятся на новую строку, когда следующий не влезает', () => {
    // Ширина задана явно: тест про перенос загонов, а не про рамку разреза.
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('a'), tile('b')], {
      grouped: true,
      width: 5000,
      gap: 200,
      pad: 200,
    });
    // Загон SO-1 занял x=200..3200; SO-2 (w=1600) с x=3600 упёрся бы в 5200 > 5000-200.
    expect(fl.bays[1].x).toBe(200);
    expect(fl.bays[1].y).toBe(200 + fl.bays[0].h + 400); // строка + BAY_GAP
  });

  // LKWkalk-8z2: очерёдность загонов задаёт ЗАЯВКА (порядок `load.cargo`, он же порядок строк на
  // экране «Настройка»), а не порядок плиток во дворе — тот переставляют ручные броски.
  it('порядок загонов следует заявке, а не порядку плиток во дворе', () => {
    const threeOrders: Load = {
      vehicle: V,
      cargo: [
        cargo('a', 1200, 800, 'SO-1'),
        cargo('b', 600, 400, 'SO-2'),
        cargo('c', 600, 400, 'SO-3'),
      ],
    };
    // Плитки перетасованы броском: первой во дворе лежит стопка последнего заказа заявки.
    const fl = warehouseFloor(threeOrders, [tile('c'), tile('b'), tile('a')], {
      grouped: true,
      gap: 200,
      pad: 200,
    });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-2', 'SO-3']);
    // Плитки внутри загона по-прежнему в своём дворовом порядке — заявка задаёт порядок ЗАГОНОВ.
    expect(fl.tiles.map((t) => t.srcIndex)).toEqual([2, 1, 0]);
  });

  it('заказ без стопок во дворе загона не открывает', () => {
    const withEmptyOrder: Load = {
      vehicle: V,
      cargo: [cargo('a', 1200, 800, 'SO-1'), cargo('b', 600, 400, 'SO-2'), cargo('c', 600, 400, 'SO-3')],
    };
    const fl = warehouseFloor(withEmptyOrder, [tile('c'), tile('a')], {
      grouped: true,
      gap: 200,
      pad: 200,
    });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-3']);
  });

  it('грузы без номера заказа собираются в загон, который идёт последним', () => {
    const mixed: Load = {
      vehicle: V,
      cargo: [cargo('a', 1200, 800, ''), cargo('b', 600, 400, 'SO-2')],
    };
    const fl = warehouseFloor(mixed, [tile('a'), tile('b')], { gap: 200, pad: 200, grouped: true });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-2', '']);
  });

  it('bayOrder выводит названный заказ вперёд, неизвестный id игнорирует', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], {
      grouped: true,
      gap: 200,
      pad: 200,
      bayOrder: ['SO-9', 'SO-2'],
    });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-2', 'SO-1']);
  });

  it('фантом не попадает в ×N бирки — счёт показывает то, что уже лежит', () => {
    const fl = warehouseFloor(
      twoOrders,
      [tile('a'), { ...tile('a'), phantom: true }, tile('b')],
      { gap: 200, pad: 200, grouped: true },
    );
    expect(fl.bays[0].units).toBe(1);
    expect(fl.bays[0].count).toBe(2); // но место в раскладке фантом занимает
  });

  it('высота двора покрывает самую высокую строку загонов', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200, grouped: true });
    expect(fl.height).toBe(200 + 1380 + 200);
  });

  it('детерминирована', () => {
    const build = () => warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')], { grouped: true });
    expect(build()).toEqual(build());
  });

  // Строка загонов смешивает высоты: у низкого загона своя `h` обрывает полосу раньше строки, и
  // точка под ним уезжала бы к следующему загону. Та же болезнь, что `rowH` лечит у плиток.
  it('rowH загона — высота его СТРОКИ, а не его собственная', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200, grouped: true });
    expect(fl.bays[0]).toMatchObject({ h: 1380, rowH: 1380 });
    // SO-2 ниже (h = 400 + 180 + 2*200 = 980), но стоит в той же строке.
    expect(fl.bays[1]).toMatchObject({ h: 980, rowH: 1380 });
  });

  it('у новой строки загонов свой rowH', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('a'), tile('b')], {
      grouped: true,
      width: 5000,
      gap: 200,
      pad: 200,
    });
    expect(fl.bays[1].y).toBeGreaterThan(fl.bays[0].y); // перенос состоялся
    expect(fl.bays[0].rowH).toBe(1380);
    expect(fl.bays[1].rowH).toBe(980);
  });
});

describe('reorderBaysAt', () => {
  const threeOrders: Load = {
    vehicle: V,
    cargo: [
      cargo('a', 1200, 800, 'SO-1'),
      cargo('b', 600, 400, 'SO-2'),
      cargo('c', 600, 400, 'SO-3'),
    ],
  };
  /** Три загона в одну строку: SO-1 (x 200..1800, центр 1000, h 1380), SO-2 (x 2200..3800,
   *  центр 3000, h 980), SO-3 (x 4200..5800, центр 5000, h 980). rowH у всех — 1380. */
  const floor3 = () =>
    warehouseFloor(threeOrders, [tile('a'), tile('b'), tile('c')], {
      grouped: true,
      gap: 200,
      pad: 200,
    });

  it('переносит загон назад — точка левее центра чужого загона', () => {
    // Точка в левой половине SO-1 → SO-3 встаёт перед ним.
    expect(reorderBaysAt(floor3(), 'SO-3', { x: 500, y: 600 })).toEqual(['SO-3', 'SO-1', 'SO-2']);
  });

  it('переносит загон вперёд — индекс вставки поправлен на изъятие', () => {
    // Точка правее центра SO-2 (3000): без поправки на изъятие SO-1 перенос «на один слот вправо»
    // оказался бы тождественным.
    expect(reorderBaysAt(floor3(), 'SO-1', { x: 3500, y: 600 })).toEqual(['SO-2', 'SO-1', 'SO-3']);
  });

  it('точка правее всех загонов уводит загон в конец', () => {
    expect(reorderBaysAt(floor3(), 'SO-1', { x: 9000, y: 600 })).toEqual(['SO-2', 'SO-3', 'SO-1']);
  });

  // Ровно то, ради чего заведён rowH: точка ниже собственной высоты низкого загона, но внутри его
  // СТРОКИ. Без rowH обе низкие площадки читались бы как «строка уже позади», и загон уехал бы в
  // конец вместо места перед SO-2.
  it('читает строку по rowH, а не по высоте самого загона', () => {
    expect(reorderBaysAt(floor3(), 'SO-3', { x: 2500, y: 1300 })).toEqual(['SO-1', 'SO-3', 'SO-2']);
  });

  it('неизвестный загон порядка не меняет', () => {
    expect(reorderBaysAt(floor3(), 'SO-9', { x: 500, y: 600 })).toEqual(['SO-1', 'SO-2', 'SO-3']);
  });

  it('без загонов возвращает пустой порядок', () => {
    const flat = warehouseFloor(threeOrders, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    expect(reorderBaysAt(flat, 'SO-1', { x: 500, y: 600 })).toEqual([]);
  });

  // ИНВАРИАНТ ЖИВОЙ ПЕРЕКОМПОНОВКИ (спека §3.5). Кросс-модельное ревью назвало живой отсчёт
  // блокером: якобы перестановка меняет геометрию так, что та же точка гонит загон обратно, и от
  // дрожания курсора двор мерцает. Численно не воспроизвелось (200 тыс. конфигураций + 300 тыс. пар
  // соседних точек — ноль циклов), и вот почему: смещаются только загоны МЕЖДУ старым и новым
  // местом, и смещаются ВПРАВО, а значит их центры только растут — условие «центр ≥ точки» не
  // переворачивается. Здесь этот инвариант закреплён на самом опасном случае: разные ширины плюс
  // перенос строк.
  it('идемпотентна: тот же кадр с тем же курсором порядка больше не меняет', () => {
    const wide: Load = {
      vehicle: V,
      cargo: [
        cargo('a', 1200, 800, 'SO-1'),
        cargo('b', 600, 400, 'SO-2'),
        cargo('c', 600, 400, 'SO-3'),
      ],
    };
    // Двор нарочно узкий: три загона не влезают в строку, и перестановка меняет ПЕРЕНОС СТРОК —
    // ровно та геометрия, на которой живой отсчёт подозревали.
    const opts = { grouped: true, gap: 200, pad: 200, width: 5000 };
    const tiles = [tile('a'), tile('a'), tile('b'), tile('c')];
    const point = { x: 2500, y: 1300 };
    const first = reorderBaysAt(warehouseFloor(wide, tiles, opts), 'SO-3', point);
    const second = reorderBaysAt(
      warehouseFloor(wide, tiles, { ...opts, bayOrder: first }),
      'SO-3',
      point,
    );
    expect(second).toEqual(first);
  });

  // Замыкание круга: результат функции подаётся обратно как `bayOrder` и должен давать именно тот
  // порядок загонов — иначе жест и раскладка понимают список по-разному.
  it('результат, поданный как bayOrder, даёт тот же порядок загонов', () => {
    const next = reorderBaysAt(floor3(), 'SO-3', { x: 500, y: 600 });
    const fl = warehouseFloor(threeOrders, [tile('a'), tile('b'), tile('c')], {
      grouped: true,
      gap: 200,
      pad: 200,
      bayOrder: next,
    });
    expect(fl.bays.map((b) => b.orderId)).toEqual(next);
  });
});
