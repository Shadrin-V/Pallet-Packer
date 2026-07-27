import { describe, expect, it } from 'vitest';
import type { Load } from '@shadrin-v/engine';
import { warehouseFloor, insertionIndexAt } from './warehouseLayout';
import type { BufferTile } from './warehouseLayout';

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
  it('is as wide as the hold — the scale is shared by construction', () => {
    expect(warehouseFloor(load, []).width).toBe(V.length);
  });

  it('lays tiles left to right at their real size, separated by the gap', () => {
    const { tiles } = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(tiles[0]).toMatchObject({ x: 200, y: 200, dx: 1200, dy: 800 });
    expect(tiles[1]).toMatchObject({ x: 1600, y: 200 }); // 200 + 1200 + 200
  });

  it('wraps to a new row when the next tile would leave the floor', () => {
    const narrow: Load = { ...load, vehicle: { ...V, length: 3000 } };
    const { tiles } = warehouseFloor(narrow, [tile('a'), tile('a'), tile('a')], {
      gap: 200,
      pad: 200,
    });
    expect(tiles[2].y).toBeGreaterThan(tiles[0].y);
    expect(tiles[2].x).toBe(200); // новый ряд начинается слева
  });

  it('a row is as tall as its tallest tile', () => {
    const narrow: Load = { ...load, vehicle: { ...V, length: 2200 } };
    const { tiles } = warehouseFloor(narrow, [tile('a'), tile('b')], { gap: 200, pad: 200 });
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

  it('один заказ — загонов нет, раскладка ровно сегодняшняя', () => {
    const fl = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(fl.bays).toEqual([]);
    expect(fl.tiles[0]).toMatchObject({ x: 200, y: 200 });
    expect(fl.tiles[1]).toMatchObject({ x: 1600, y: 200 });
  });

  it('два заказа — по загону на заказ, плитки сгруппированы', () => {
    // Порядок плиток нарочно чередует заказы: группировка должна их развести.
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')], { gap: 200, pad: 200 });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-2']);
    expect(fl.bays[0]).toMatchObject({ startIndex: 0, count: 2, units: 2 });
    expect(fl.bays[1]).toMatchObject({ startIndex: 2, count: 1, units: 1 });
    // Первый загон: x=pad=200, y=pad=200; контент 2×'a' = 1200+200+1200 = 2600 → w = 2600+2*200 = 3000;
    // h = 800 + TAG_H(330) + 2*BAY_PAD(400) = 1530.
    expect(fl.bays[0]).toMatchObject({ x: 200, y: 200, w: 3000, h: 1530 });
    // Второй встаёт правее: 200 + 3000 + BAY_GAP(400) = 3600. Контент 600 → w = max(1000, BAY_MIN_W) = 2400.
    expect(fl.bays[1]).toMatchObject({ x: 3600, y: 200, w: 2400, h: 1130 });
  });

  it('плитки смещены внутрь своего загона — под бирку и поля', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    // 200 (bay.x) + 200 (BAY_PAD) = 400 по x; 200 (bay.y) + 330 (TAG_H) + 200 (BAY_PAD) = 730 по y.
    expect(fl.tiles[0]).toMatchObject({ x: 400, y: 730 });
  });

  it('загоны переносятся на новую строку, когда следующий не влезает', () => {
    const narrow: Load = { ...twoOrders, vehicle: { ...V, length: 6000 } };
    const fl = warehouseFloor(narrow, [tile('a'), tile('a'), tile('b')], { gap: 200, pad: 200 });
    // Загон SO-1 занял x=200..3200; SO-2 (w=2400) с x=3600 упёрся бы в 6000 > 6000-200.
    expect(fl.bays[1].x).toBe(200);
    expect(fl.bays[1].y).toBe(200 + fl.bays[0].h + 400); // строка + BAY_GAP
  });

  it('грузы без номера заказа собираются в загон, который идёт последним', () => {
    const mixed: Load = {
      vehicle: V,
      cargo: [cargo('a', 1200, 800, ''), cargo('b', 600, 400, 'SO-2')],
    };
    const fl = warehouseFloor(mixed, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-2', '']);
  });

  it('bayOrder выводит названный заказ вперёд, неизвестный id игнорирует', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], {
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
      { gap: 200, pad: 200 },
    );
    expect(fl.bays[0].units).toBe(1);
    expect(fl.bays[0].count).toBe(2); // но место в раскладке фантом занимает
  });

  it('высота двора покрывает самую высокую строку загонов', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    expect(fl.height).toBe(200 + 1530 + 200);
  });

  it('детерминирована', () => {
    const build = () => warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')]);
    expect(build()).toEqual(build());
  });
});
