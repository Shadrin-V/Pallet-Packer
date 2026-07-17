import { describe, it, expect } from 'vitest';
import { calculateLayout, type Layout, type Load } from '@shadrin-v/engine';
import { topRects, sideRects, orderIndexMap } from './cutaway';
import { orderColorToken } from '../../lib/orderColor';

// 2×2×2 m hold, 1×1×1 m boxes → 8 placed (2×2 floor × 2 tiers).
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

describe('crossSection geometry', () => {
  it('places 8 units (sanity)', () => {
    expect(layout.metrics.totalPlaced).toBe(8);
  });

  it('top view collapses each floor stack to one footprint rect with count', () => {
    const rects = topRects(load, layout);
    expect(rects).toHaveLength(4); // 2×2 floor positions
    for (const r of rects) {
      expect(r.w).toBe(1000);
      expect(r.h).toBe(1000);
      expect(r.count).toBe(2); // 2 tiers per stack
    }
  });

  it('side view yields one silhouette per floor stack with a front/back depth rank', () => {
    const rects = sideRects(load, layout, V.height);
    // 2×2 floor stacks → 4 silhouettes, each 2 tiers of 1000 → top = 2000
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.y).toBe(0); // stack top at 2000 → y = 2000 − 2000 = 0
      expect(r.h).toBe(2000);
      expect(r.w).toBe(1000);
    }
    // two rows across width → depths 0 (front) and 1 (back) present
    expect(new Set(rects.map((r) => r.depth))).toEqual(new Set([0, 1]));
  });

  it('side view depth: the row nearest the viewer (largest floor y) is the front row (T2)', () => {
    const rects = sideRects(load, layout, V.height);
    // Convention: viewer stands at y = width looking towards y = 0 → largest y is nearest → depth 0.
    for (const x of new Set(rects.map((r) => r.x))) {
      const col = rects.filter((r) => r.x === x);
      const maxRowY = Math.max(...col.map((r) => r.rowY!));
      const front = col.find((r) => r.depth === 0)!;
      expect(front.rowY).toBe(maxRowY);
      // and the back row(s) sit at smaller y with a higher depth
      for (const r of col.filter((r) => r !== front)) {
        expect(r.rowY!).toBeLessThan(maxRowY);
        expect(r.depth!).toBeGreaterThan(0);
      }
    }
  });

  it('orderIndexMap assigns palette indices by first appearance', () => {
    const m = orderIndexMap(load);
    expect(m.get('SO-1')).toBe(0);
  });
});

describe('stable order colours override appearance order (QA #2)', () => {
  const twoOrders: Load = {
    vehicle: V,
    cargo: [
      { id: 'a', name: 'A', length: 1000, width: 1000, height: 1000, quantity: 4, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-1' },
      { id: 'b', name: 'B', length: 1000, width: 1000, height: 1000, quantity: 4, rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId: 'SO-2' },
    ],
  };
  const l = calculateLayout(twoOrders);
  // swap the palette slots relative to appearance order (SO-1→slot1, SO-2→slot0)
  const colors = new Map([['SO-1', 1], ['SO-2', 0]]);

  it('topRects colours by the provided map, not first appearance', () => {
    const rects = topRects(twoOrders, l, colors);
    expect(rects.find((r) => r.cargoTypeId === 'a')!.series).toBe(orderColorToken(1).series);
    expect(rects.find((r) => r.cargoTypeId === 'b')!.series).toBe(orderColorToken(0).series);
  });

  it('sideRects colours by the provided map too', () => {
    const rects = sideRects(twoOrders, l, V.height, colors);
    expect(rects.find((r) => r.cargoTypeId === 'a')!.series).toBe(orderColorToken(1).series);
    expect(rects.find((r) => r.cargoTypeId === 'b')!.series).toBe(orderColorToken(0).series);
  });
});

// Стопки в РАЗНЫХ рядах, чьи x не совпадают, но проекции на бок перекрываются. Раскладка собрана
// руками: упаковщик такую расстановку на однородном грузе не даёт, а sideRects — чистая функция
// от Layout, так что это честный юнит-тест её правила.
const mixedV = { id: 'v2', name: 'LKW', length: 4000, width: 2400, height: 2000 };
const mixed: Load = {
  vehicle: mixedV,
  cargo: ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    length: 1200,
    width: 800,
    height: 1000,
    quantity: 1,
    rotation: 'none' as const,
    stacking: { stackable: false },
    nesting: { nestable: false },
    state: 'entschachtelt' as const,
    orderId: 'SO-1',
  })),
};
const mixedLayout = (placements: Layout['placements']): Layout => ({
  placements,
  unplaced: [],
  metrics: {
    totalPlaced: placements.length,
    usedFloorPositions: placements.length,
    floorFillPercent: 0,
    volumeFillPercent: 0,
  },
  contractVersion: '0.12.0',
});
const at = (cargoTypeId: string, x: number, y: number): Layout['placements'][number] => ({
  cargoTypeId,
  x,
  y,
  z: 0,
  orientation: 'lwh',
  tier: 1,
  state: 'entschachtelt',
});

describe('side view depth ranks by projection overlap, not by equal x', () => {
  it('ranks the rear stack behind the near one even when their x differ', () => {
    // a: x 0…1200 в дальнем ряду (y=0); b: x 600…1800 в ближнем (y=1600). Перекрываются по длине.
    const rects = sideRects(mixed, mixedLayout([at('a', 0, 0), at('b', 600, 1600)]), mixedV.height);
    const rear = rects.find((r) => r.rowY === 0)!;
    const near = rects.find((r) => r.rowY === 1600)!;
    expect({ rearDepth: rear.depth, nearDepth: near.depth }).toEqual({ rearDepth: 1, nearDepth: 0 });
  });

  it('does not dim a rear stack that nothing actually hides', () => {
    // Одиночная стопка в дальнем ряду и стопка в ближнем, но ДАЛЕКО по длине (не перекрываются).
    const rects = sideRects(mixed, mixedLayout([at('a', 0, 0), at('b', 2500, 1600)]), mixedV.height);
    expect(rects.map((r) => r.depth)).toEqual([0, 0]);
  });

  it('is deterministic for the same input', () => {
    const build = () =>
      sideRects(mixed, mixedLayout([at('a', 0, 0), at('b', 600, 1600)]), mixedV.height);
    expect(build()).toEqual(build());
  });
});
