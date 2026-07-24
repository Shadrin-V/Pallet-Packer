import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarehouseBackdrop, WAREHOUSE_ASSET } from './WarehouseBackdrop';

const { natH, leftW, rightW } = WAREHOUSE_ASSET;
const YARD = 2430; // sceneryDepth used across these tests (a standard truck width)

function renderBackdrop(width = 13600, height = 2430, sceneryDepth = YARD) {
  render(
    <svg>
      <WarehouseBackdrop width={width} height={height} sceneryDepth={sceneryDepth} />
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

  // The owner's call (41e.5): the docks/forklift stay a FIXED size and do not balloon as the buffer
  // floor grows deeper. On a floor deeper than the yard depth, the caps are scaled to sceneryDepth —
  // NOT the floor height — and pinned to the top (the truck side).
  it('holds the caps at the fixed yard depth on a deep floor, not the floor height', () => {
    const width = 13600;
    const height = 4000; // deeper than YARD
    const g = renderBackdrop(width, height, YARD);
    const s = YARD / natH; // fixed scale — independent of floor height

    const left = g.querySelector('image[data-cap="left"]')!;
    expect(Number(left.getAttribute('x'))).toBe(0);
    expect(Number(left.getAttribute('height'))).toBe(YARD); // NOT 4000
    expect(Number(left.getAttribute('width'))).toBeCloseTo(leftW * s, 3);

    const right = g.querySelector('image[data-cap="right"]')!;
    expect(Number(right.getAttribute('height'))).toBe(YARD);
    expect(Number(right.getAttribute('width'))).toBeCloseTo(rightW * s, 3);
    expect(Number(right.getAttribute('x'))).toBeCloseTo(width - rightW * s, 3);
  });

  // A shallow one-row floor is thinner than the yard depth: the caps shrink to fit it rather than
  // overflowing past the surface — they only ever shrink, never balloon.
  it('shrinks the caps to fit a floor shallower than the yard depth', () => {
    const height = 1600; // shallower than YARD
    const g = renderBackdrop(13600, height, YARD);
    const left = g.querySelector('image[data-cap="left"]')!;
    expect(Number(left.getAttribute('height'))).toBe(height);
    expect(Number(left.getAttribute('width'))).toBeCloseTo(leftW * (height / natH), 3);
  });

  // No height limit (owner feedback): the owner's asphalt pattern tiles across the WHOLE floor at any
  // depth — not a flat fill, not a band capped at the yard depth. An opaque asphalt base sits under it
  // (seam guard + header match), and both are painted BEFORE the caps so the docks win at the edges.
  it('tiles the owner pattern across the whole floor depth, over an opaque base, caps last', () => {
    const width = 13600;
    const height = 4000; // deeper than YARD — the pattern is not capped at YARD
    const g = renderBackdrop(width, height, YARD);

    const base = g.querySelector('rect[data-floor]')!;
    expect(base.getAttribute('fill')).toBe('#d9d4ce');
    expect(Number(base.getAttribute('height'))).toBe(height);

    const asphalt = g.querySelector('rect[data-asphalt]')!;
    expect(Number(asphalt.getAttribute('x'))).toBe(0);
    expect(Number(asphalt.getAttribute('width'))).toBe(width);
    expect(Number(asphalt.getAttribute('height'))).toBe(height); // full depth, not YARD
    expect(asphalt.getAttribute('fill')).toMatch(/^url\(#/);
    // the pattern tile is the owner's centre slice, sized to the yard unit on both axes
    const tile = g.querySelector('pattern image')!;
    expect(Number(g.querySelector('pattern')!.getAttribute('height'))).toBe(YARD);
    expect(tile.getAttribute('href')).toBeTruthy();

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
