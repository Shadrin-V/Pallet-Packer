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
    // Форма из §1 утверждённого дизайна — `{orderId} · ×{units}`, со средней точкой.
    expect(c.textContent).toContain('SO-1042 · ×18');
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

  it('бирка уже загона', () => {
    expect(Number(draw().querySelector('[data-tag]')!.getAttribute('width'))).toBe(2200);
  });

  // Номера заказов приходят из ERPNext (`SAL-ORD-2026-00001`) и из свободного поля в настройках — на
  // длину никто не ограничивает. Плашка при этом фиксированной ширины, текст белый по серому асфальту:
  // вылезший ярлык не просто торчит, он становится нечитаемым и залезает в соседний загон.
  const plate = (c: HTMLElement) => c.querySelector('[data-tag]')!;
  const tagText = (c: HTMLElement) => c.querySelector('[data-testid="warehouse-bay"] text')!;
  const fontSizeOf = (c: HTMLElement) => Number(tagText(c).getAttribute('font-size'));
  /** Та же оценка средней ширины знака жирного гротеска, что и в компоненте (0.62 em). Дублируется
   *  здесь намеренно: тест утверждает геометрию — «строка помещается в плашку», — а не реализацию;
   *  замерить текст в jsdom нельзя, и в проде SVG тоже рисуется без DOM-замеров. */
  const CHAR_EM = 0.62;
  const fitsInPlate = (c: HTMLElement) => {
    const t = tagText(c);
    const padLeft = Number(t.getAttribute('x')) - Number(plate(c).getAttribute('x'));
    const run = fontSizeOf(c) * t.textContent!.length * CHAR_EM;
    return run + 2 * padLeft <= Number(plate(c).getAttribute('width'));
  };

  it('длинный номер заказа не вылезает за плашку — кегль ужимается', () => {
    const short = draw();
    expect(fitsInPlate(short)).toBe(true);

    const longId = 'SAL-ORD-2026-00001';
    const long = draw({ ...bay, orderId: longId, units: 186 }, longId);
    expect(long.textContent).toContain(longId);
    expect(fitsInPlate(long)).toBe(true);
    // Ужался именно кегль, а не «повезло с длиной»; плашка при этом не растянулась — она и есть граница.
    expect(fontSizeOf(long)).toBeLessThan(fontSizeOf(short));
    expect(Number(plate(long).getAttribute('width'))).toBe(2200);
  });

  it('патологически длинный ярлык дополнительно обрезается по плашке', () => {
    const c = draw({ ...bay, orderId: 'X'.repeat(400) }, 'X'.repeat(400));
    // Ниже читаемого минимума кегль не проваливается — за этой границей работает обрезка.
    expect(fontSizeOf(c)).toBeGreaterThanOrEqual(99);
    expect(tagText(c).getAttribute('clip-path')).toBeTruthy();
  });
});
