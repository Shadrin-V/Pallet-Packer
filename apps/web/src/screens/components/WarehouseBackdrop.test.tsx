import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarehouseBackdrop, WAREHOUSE_ASSET, FLOOR } from './WarehouseBackdrop';

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

  // The floor is a single flat tone filling the whole surface — seamless at any width or depth (no
  // tiled pattern, no distortable full-scene image). Painted before the docks so they win at the edges.
  it('fills the whole surface with one flat floor tone, behind the docks', () => {
    const width = 13600;
    const height = 3000;
    const g = renderBackdrop(width, height);

    const floor = g.querySelector('rect[data-floor]')!;
    expect(floor.getAttribute('fill')).toBe(FLOOR);
    expect(Number(floor.getAttribute('width'))).toBe(width);
    expect(Number(floor.getAttribute('height'))).toBe(height);
    expect(g.querySelector('pattern')).toBeNull(); // no tiling — nothing to seam

    const kids = Array.from(g.children);
    const floorIdx = kids.indexOf(floor as Element);
    const leftIdx = kids.indexOf(g.querySelector('image[data-cap="left"]')! as Element);
    expect(floorIdx).toBeLessThan(leftIdx);
  });

  // Each dock spans 100% of the floor height (owner's model), scaled by its OWN native ratio so it never
  // distorts — width follows height — and pinned to its edge.
  it('scales each dock to full height by its own ratio, pinned to the edges', () => {
    const width = 13600;
    const height = 3000;
    const g = renderBackdrop(width, height);

    const left = g.querySelector('image[data-cap="left"]')!;
    expect(Number(left.getAttribute('x'))).toBe(0);
    expect(Number(left.getAttribute('height'))).toBe(height);
    expect(Number(left.getAttribute('width'))).toBeCloseTo(
      (WAREHOUSE_ASSET.left.w / WAREHOUSE_ASSET.left.h) * height,
      3,
    );

    const right = g.querySelector('image[data-cap="right"]')!;
    const capR = (WAREHOUSE_ASSET.right.w / WAREHOUSE_ASSET.right.h) * height;
    expect(Number(right.getAttribute('height'))).toBe(height);
    expect(Number(right.getAttribute('width'))).toBeCloseTo(capR, 3);
    expect(Number(right.getAttribute('x'))).toBeCloseTo(width - capR, 3);
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
