import { describe, expect, it } from 'vitest';
import type { Load } from '@shadrin-v/engine';
import { warehouseFloor, insertionIndexAt } from './warehouseLayout';
import type { BufferTile } from './warehouseLayout';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
const cargo = (id: string, length: number, width: number) => ({
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
  orderId: 'SO-1',
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
});
