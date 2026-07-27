import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarehouseBay } from './WarehouseBay';
import type { PlacedBay } from './warehouseLayout';

const bay: PlacedBay = {
  orderId: 'SO-1042',
  x: 200,
  y: 200,
  w: 3000,
  h: 1530,
  units: 18,
  startIndex: 0,
  count: 3,
};

const draw = (b: PlacedBay = bay, label = b.orderId) =>
  render(
    <svg>
      <WarehouseBay bay={b} series={2} label={label} />
    </svg>,
  ).container;

describe('WarehouseBay', () => {
  it('обводит площадку пунктиром складской разметки', () => {
    const c = draw();
    const outline = c.querySelector('[data-testid="warehouse-bay"] [data-outline]')!;
    expect(outline.getAttribute('stroke')).toBe('var(--yard-mark)');
    expect(outline.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(Number(outline.getAttribute('width'))).toBe(3000);
  });

  it('бирка красится цветом заказа и называет номер и число единиц', () => {
    const c = draw();
    expect(c.querySelector('[data-tag]')!.getAttribute('fill')).toBe('var(--s2)');
    expect(c.textContent).toContain('SO-1042');
    expect(c.textContent).toContain('×18');
  });

  it('ничего не перехватывает у указателя — под стопками лежит инертная разметка', () => {
    const c = draw();
    expect(c.querySelector('[data-testid="warehouse-bay"]')!.getAttribute('pointer-events')).toBe(
      'none',
    );
  });

  it('показывает переданный ярлык, когда номера заказа нет', () => {
    const c = draw({ ...bay, orderId: '' }, 'Ohne Auftrag');
    expect(c.textContent).toContain('Ohne Auftrag');
  });

  it('бирка уже загона, но узкий загон её обрезает', () => {
    expect(Number(draw().querySelector('[data-tag]')!.getAttribute('width'))).toBe(2200);
    const narrow = draw({ ...bay, w: 900 });
    expect(Number(narrow.querySelector('[data-tag]')!.getAttribute('width'))).toBe(900);
  });
});
