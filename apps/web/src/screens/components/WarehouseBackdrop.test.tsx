import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarehouseBackdrop, WAREHOUSE_ASSET, FLOOR } from './WarehouseBackdrop';

function renderBackdrop(width = 13600, height = 2430, dockHeight = height) {
  render(
    <svg>
      <WarehouseBackdrop width={width} height={height} dockHeight={dockHeight} />
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

  // LKWkalk-jen: сценерия перестала расти вместе с буфером. Высота доков ограничена постоянной мерой
  // (`dockHeight` — минимальная глубина двора, ширина кузова), и лишнюю глубину они не занимают:
  // прижаты к верхнему краю, ниже них — просто асфальт.
  it('доки не растут вместе с глубиной двора: высота ограничена, доки прижаты к верху', () => {
    const dockHeight = 2430;
    const g = renderBackdrop(13600, 9000, dockHeight);

    for (const cap of ['left', 'right'] as const) {
      const img = g.querySelector(`image[data-cap="${cap}"]`)!;
      expect(Number(img.getAttribute('height'))).toBe(dockHeight);
      expect(Number(img.getAttribute('y'))).toBe(0);
      // Пропорция считается от ОГРАНИЧЕННОЙ высоты — картинка не растягивается и не съезжает с края.
      const a = WAREHOUSE_ASSET[cap];
      expect(Number(img.getAttribute('width'))).toBeCloseTo((a.w / a.h) * dockHeight, 3);
    }
    const right = g.querySelector('image[data-cap="right"]')!;
    const capR = (WAREHOUSE_ASSET.right.w / WAREHOUSE_ASSET.right.h) * dockHeight;
    expect(Number(right.getAttribute('x'))).toBeCloseTo(13600 - capR, 3);
  });

  // Обратная сторона того же правила: ограничение не может СДЕЛАТЬ док выше двора — иначе сценерия
  // вылезет за асфальт на мелком дворе.
  it('док не выше самого двора, даже если разрешённая высота больше', () => {
    const g = renderBackdrop(13600, 1500, 2430);
    expect(Number(g.querySelector('image[data-cap="left"]')!.getAttribute('height'))).toBe(1500);
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
