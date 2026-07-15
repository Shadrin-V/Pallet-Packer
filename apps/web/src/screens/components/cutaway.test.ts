import { describe, it, expect } from 'vitest';
import { calculateLayout, type Load } from '@shadrin-v/engine';
import { topRects, sideRects, orderIndexMap } from './cutaway';

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

  it('orderIndexMap assigns palette indices by first appearance', () => {
    const m = orderIndexMap(load);
    expect(m.get('SO-1')).toBe(0);
  });
});
