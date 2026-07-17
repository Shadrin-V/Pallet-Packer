import { describe, expect, it } from 'vitest';
import type { Load } from '@shadrin-v/engine';
import { warehouseFloor } from './warehouseLayout';

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
