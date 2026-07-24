import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarehouseBackdrop, WAREHOUSE_ASSET } from './WarehouseBackdrop';

const { natH, leftW, rightW } = WAREHOUSE_ASSET;

function renderBackdrop(width = 13600, height = 2430) {
  render(
    <svg>
      <WarehouseBackdrop width={width} height={height} />
    </svg>,
  );
  return document.querySelector('[data-testid="warehouse-backdrop"]')!;
}

describe('WarehouseBackdrop', () => {
  // It is scenery, never a drop target: a pointer that lands on it must fall through to the floor
  // section beneath, and a screen reader must not announce it as content.
  it('is inert decoration — aria-hidden and pointer-events none', () => {
    const g = renderBackdrop();
    expect(g).toHaveAttribute('aria-hidden', 'true');
    expect(g.getAttribute('pointer-events')).toBe('none');
  });

  // Owner's model: both docks take 100% of the floor height (scaled uniformly, so the forklift/crates
  // never distort — width follows height by the native ratio), pinned to the edges.
  it('scales both docks to 100% of the floor height, pinned to the edges', () => {
    const width = 13600;
    const height = 3000;
    const g = renderBackdrop(width, height);
    const s = height / natH;

    const left = g.querySelector('image[data-cap="left"]')!;
    expect(Number(left.getAttribute('x'))).toBe(0);
    expect(Number(left.getAttribute('height'))).toBe(height); // full height
    expect(Number(left.getAttribute('width'))).toBeCloseTo(leftW * s, 3);

    const right = g.querySelector('image[data-cap="right"]')!;
    expect(Number(right.getAttribute('height'))).toBe(height); // full height
    expect(Number(right.getAttribute('width'))).toBeCloseTo(rightW * s, 3);
    expect(Number(right.getAttribute('x'))).toBeCloseTo(width - rightW * s, 3);
  });

  // The owner's asphalt tiles across the whole floor, but its pattern cell is the FULL floor height — so
  // there is exactly one row of tiles vertically (it repeats ONLY horizontally, no vertical seam/lane).
  // An opaque asphalt base sits under it, and both paint BEFORE the caps so the docks win at the edges.
  it('tiles the owner pattern full-height, repeating only horizontally, over an opaque base', () => {
    const width = 13600;
    const height = 3000;
    const g = renderBackdrop(width, height);

    const base = g.querySelector('rect[data-floor]')!;
    expect(base.getAttribute('fill')).toBe('#d9d4ce');
    expect(Number(base.getAttribute('height'))).toBe(height);

    const asphalt = g.querySelector('rect[data-asphalt]')!;
    expect(Number(asphalt.getAttribute('width'))).toBe(width);
    expect(Number(asphalt.getAttribute('height'))).toBe(height);
    expect(asphalt.getAttribute('fill')).toMatch(/^url\(#/);

    // the pattern cell is the full floor height → one vertical tile → horizontal-only repeat
    expect(Number(g.querySelector('pattern')!.getAttribute('height'))).toBe(height);

    const kids = Array.from(g.children).filter((n) => n.tagName !== 'defs');
    const asphaltIdx = kids.indexOf(asphalt as Element);
    const leftIdx = kids.indexOf(g.querySelector('image[data-cap="left"]')! as Element);
    expect(asphaltIdx).toBeLessThan(leftIdx);
  });

  // Three distinct source images — left dock, centre asphalt tile, right dock with the forklift.
  it('wires the three distinct slice images', () => {
    const g = renderBackdrop();
    const left = g.querySelector('image[data-cap="left"]')!.getAttribute('href');
    const right = g.querySelector('image[data-cap="right"]')!.getAttribute('href');
    const tile = g.querySelector('pattern image')!.getAttribute('href');
    expect(new Set([left, right, tile]).size).toBe(3);
  });
});
