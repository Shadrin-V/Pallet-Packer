import { describe, it, expect } from 'vitest';
import { normalizeRect, stacksInRect, refKey, hasRef, toggleRef, groupBBox } from './marquee';
import type { CutRect } from './cutaway';

const rect = (x: number, y: number, w = 1000, h = 1000, cargoTypeId = 'c'): CutRect => ({
  x,
  y,
  w,
  h,
  series: 0,
  cargoTypeId,
});

/** Two stacks: one at the origin, one a cell away diagonally. */
const rects: CutRect[] = [rect(0, 0), rect(2000, 1000)];

describe('normalizeRect', () => {
  it('accepts corners in any order', () => {
    expect(normalizeRect(10, 20, 110, 220)).toEqual({ x: 10, y: 20, w: 100, h: 200 });
    // dragged right-to-left and bottom-to-top
    expect(normalizeRect(110, 220, 10, 20)).toEqual({ x: 10, y: 20, w: 100, h: 200 });
  });
});

describe('stacksInRect', () => {
  it('selects a stack the marquee only clips at the corner', () => {
    // covers just the bottom-right 100×100 mm of the stack at (0,0)
    const hit = stacksInRect(rects, { x: 900, y: 900, w: 200, h: 200 });
    expect(hit).toEqual([{ cargoTypeId: 'c', x: 0, y: 0 }]);
  });

  it('selects every stack it touches, not just the first', () => {
    const hit = stacksInRect(rects, { x: 0, y: 0, w: 4000, h: 2000 });
    expect(hit).toHaveLength(2);
  });

  it('does not select a stack it merely abuts — touching edges do not overlap', () => {
    // the marquee's right edge sits exactly on the stack's left edge
    expect(stacksInRect(rects, { x: 1000, y: 0, w: 500, h: 500 })).toEqual([]);
  });

  it('selects nothing for a zero-area marquee', () => {
    expect(stacksInRect(rects, { x: 500, y: 500, w: 0, h: 0 })).toEqual([]);
    expect(stacksInRect(rects, { x: 500, y: 500, w: 0, h: 300 })).toEqual([]);
  });
});

describe('selection set helpers', () => {
  const a = { cargoTypeId: 'c', x: 0, y: 0 };
  const b = { cargoTypeId: 'c', x: 2000, y: 1000 };
  const sameSpotOtherType = { cargoTypeId: 'd', x: 0, y: 0 };

  it('identifies a stack by type AND position', () => {
    expect(refKey(a)).not.toBe(refKey(sameSpotOtherType));
    expect(hasRef([a], { ...a })).toBe(true);
    expect(hasRef([a], sameSpotOtherType)).toBe(false);
  });

  it('toggles membership without touching the rest', () => {
    expect(toggleRef([a], b)).toEqual([a, b]);
    expect(toggleRef([a, b], a)).toEqual([b]);
  });
});

describe('groupBBox', () => {
  it('spans every selected stack', () => {
    const box = groupBBox(rects, [
      { cargoTypeId: 'c', x: 0, y: 0 },
      { cargoTypeId: 'c', x: 2000, y: 1000 },
    ]);
    expect(box).toEqual({ x: 0, y: 0, w: 3000, h: 2000 });
  });

  it('is null when nothing is selected or the selection is stale', () => {
    expect(groupBBox(rects, [])).toBeNull();
    expect(groupBBox(rects, [{ cargoTypeId: 'c', x: 99999, y: 0 }])).toBeNull();
  });
});
