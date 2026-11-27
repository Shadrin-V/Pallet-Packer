import { describe, it, expect } from 'vitest';
import type { CargoType, Load } from '@shadrin-v/engine';
import { capacityMap } from './capacity';

const cube = (id: string, over: Partial<CargoType> = {}): CargoType => ({
  id,
  name: id,
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: 1,
  rotation: 'none',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
  ...over,
});

describe('capacityMap', () => {
  it('карта вместимости — по каждой позиции, правила учтены', () => {
    const load: Load = {
      vehicle: { id: 'v', name: 'Test', length: 2000, width: 2000, height: 2000 },
      cargo: [cube('a', { quantity: 3 }), cube('b', { quantity: 1, stacking: { stackable: true, maxTiers: 1 } })],
    };
    expect([...capacityMap(load)]).toEqual([
      ['a', 8],
      ['b', 4],
    ]);
  });
});
