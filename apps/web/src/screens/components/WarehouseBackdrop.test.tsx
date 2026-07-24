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

  // No height limit, no seams (owner feedback): the open floor is ONE flat asphalt tone filling the
  // whole surface at any depth — not a tiled pattern (whose raster tiles antialiased into faint vertical
  // seams). The lane is a native dashed line at the docks' lane height, painted before the caps so the
  // docks carry it to the edges.
  it('fills the whole floor with one flat asphalt tone and a native lane, caps painted last', () => {
    const width = 13600;
    const height = 4000; // deeper than YARD — the fill is not capped at YARD
    const g = renderBackdrop(width, height, YARD);

    const floor = g.querySelector('rect[data-floor]')!;
    expect(floor.getAttribute('fill')).toBe('#d9d4ce');
    expect(Number(floor.getAttribute('width'))).toBe(width);
    expect(Number(floor.getAttribute('height'))).toBe(height);
    // no <pattern>/tiled <image> — that was the seam source
    expect(g.querySelector('pattern')).toBeNull();

    const lane = g.querySelector('line[data-lane]')!;
    expect(Number(lane.getAttribute('x1'))).toBe(0);
    expect(Number(lane.getAttribute('x2'))).toBe(width);
    expect(Number(lane.getAttribute('y1'))).toBeCloseTo(YARD * 0.22, 3); // at the docks' lane height

    const kids = Array.from(g.children);
    const floorIdx = kids.indexOf(floor as Element);
    const leftIdx = kids.indexOf(g.querySelector('image[data-cap="left"]')! as Element);
    expect(floorIdx).toBeLessThan(leftIdx);
  });

  // Two distinct dock images — left dock, and right dock with the forklift.
  it('wires the two distinct dock images', () => {
    const g = renderBackdrop();
    const left = g.querySelector('image[data-cap="left"]')!.getAttribute('href');
    const right = g.querySelector('image[data-cap="right"]')!.getAttribute('href');
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left).not.toBe(right);
  });
});
