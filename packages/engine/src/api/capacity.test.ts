import { describe, it, expect } from 'vitest';
import type { CargoType, Load, Vehicle } from '../model/index';
import { calculateLayout, computeStack } from './api';
import { unplaceStack } from '../packing/edit';
import { maxUnitsInVehicle, roomLeft } from './capacity';

const cube: CargoType = {
  id: 'cube',
  name: 'cube',
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: 1,
  rotation: 'none',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
};

const hold: Vehicle = { id: 'v', name: 'v', length: 2000, width: 2000, height: 2000 };

describe('maxUnitsInVehicle', () => {
  it('кузов 2×2×2, груз 1×1×1 → ровно 8', () => expect(maxUnitsInVehicle(cube, hold)).toBe(8));

  it('лимит ярусов 1 → 4', () =>
    expect(maxUnitsInVehicle({ ...cube, stacking: { stackable: true, maxTiers: 1 } }, hold)).toBe(4));

  it('quantity и orderId не влияют', () =>
    expect(maxUnitsInVehicle({ ...cube, quantity: 3, orderId: 'PUR-ORD-1' }, hold)).toBe(8));

  it('не влезает ни в одной ориентации → 0', () =>
    expect(maxUnitsInVehicle({ ...cube, length: 3000 }, hold)).toBe(0));

  it('одно место на полу → столько, сколько в одном штабеле (вложение учтено)', () => {
    const v: Vehicle = { id: 'p', name: 'p', length: 1200, width: 800, height: 2700 };
    const pallet: CargoType = {
      ...cube,
      length: 1200,
      width: 800,
      height: 144,
      state: 'verschachtelt' as const,
      nesting: { nestable: true, stepHeight: 22, nestingMode: 'pairwise' as const },
    };
    expect(maxUnitsInVehicle(pallet, v)).toBe(computeStack(pallet, v).count);
  });

  it('не мутирует вход', () => {
    const c = structuredClone(cube);
    maxUnitsInVehicle(c, hold);
    expect(c).toEqual(cube);
  });
});

describe('roomLeft', () => {
  it('roomLeft: одна позиция — место ещё на max − placed; по отредактированной раскладке', () => {
    const one: Load = { vehicle: hold, cargo: [{ ...cube, quantity: 3 }] };
    const layout = calculateLayout(one);
    expect(roomLeft(one, layout)).toEqual({ cargoTypeId: cube.id, max: 8, placed: 3, free: 5 });
    const s = layout.placements[0];
    const edited = unplaceStack(one, layout, { cargoTypeId: s.cargoTypeId, x: s.x, y: s.y });
    expect(roomLeft(one, edited.layout)?.placed).toBeLessThan(3);
  });

  it('roomLeft: места нет или типов больше одного → null', () => {
    const full: Load = { vehicle: hold, cargo: [{ ...cube, quantity: 8 }] };
    expect(roomLeft(full, calculateLayout(full))).toBeNull();
    const two: Load = {
      vehicle: hold,
      cargo: [
        { ...cube, quantity: 1 },
        { ...cube, id: 'c2', quantity: 1 },
      ],
    };
    expect(roomLeft(two, calculateLayout(two))).toBeNull();
  });
});
