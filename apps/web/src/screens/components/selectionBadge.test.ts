import { describe, it, expect } from 'vitest';
import { selectionBadge } from './selectionBadge';
import { estimateTextWidth } from './stackLabel';

// LKWkalk-5tg. Подпись «N стопок выделено» рисовалась голым текстом цвета --brand над рамкой
// выделения: поверх зелёной штриховки соседнего ряда она не читалась, а у выделения в первом ряду
// (box.y = 0) уезжала за переднюю стенку кузова. Геометрия плашки — чистая функция, чтобы оба
// условия («читаемо» = есть подложка нужной ширины, «внутри» = не вылезает за кузов) проверялись
// без браузера.
//
// Каждое утверждение ниже держит РАЗМЕР плашки, а не только её края: проверка вида «0 ≤ y» одна
// прошла бы и на вырожденной плашке 0×0, то есть на отсутствующей подложке.

const HOLD = { width: 4000, height: 2000 };
const FONT = 100;
const TEXT = '2 Stapel ausgewählt';
const TEXT_W = estimateTextWidth(TEXT, FONT);

describe('selectionBadge', () => {
  it('ставит плашку вплотную над рамкой, когда сверху есть место', () => {
    const box = { x: 1000, y: 800, w: 1000, h: 500 };
    const b = selectionBadge(box, TEXT, FONT, HOLD);
    expect(b.h).toBeGreaterThan(FONT); // подложка выше кегля — текст в неё вписан
    expect(b.y + b.h).toBeLessThanOrEqual(box.y); // целиком выше верхней кромки рамки
    expect(b.y + b.h).toBeGreaterThan(box.y - FONT); // и вплотную к ней, а не где-то в стороне
    expect(b.y).toBeGreaterThanOrEqual(0); // при этом внутри кузова
    expect(b.x).toBe(box.x); // по левому краю выделения
  });

  it('уводит плашку внутрь рамки, когда над рамкой уже стенка кузова', () => {
    const box = { x: 0, y: 0, w: 2000, h: 1000 };
    const b = selectionBadge(box, TEXT, FONT, HOLD);
    expect(b.h).toBeGreaterThan(FONT);
    expect(b.y).toBeGreaterThanOrEqual(0); // не за переднюю стенку
    expect(b.y + b.h).toBeLessThanOrEqual(box.y + box.h); // и не ниже самой рамки
  });

  it('подложка шире своего текста — текст лежит на плашке, а не свисает с неё', () => {
    const b = selectionBadge({ x: 1000, y: 800, w: 1000, h: 500 }, TEXT, FONT, HOLD);
    expect(b.w).toBeGreaterThan(TEXT_W);
  });

  it('прижимает плашку к правому краю кузова, а не выпускает за него', () => {
    const b = selectionBadge({ x: 3900, y: 800, w: 100, h: 500 }, TEXT, FONT, HOLD);
    expect(b.w).toBeGreaterThan(TEXT_W); // плашка настоящая, а не схлопнутая до нуля
    expect(b.x + b.w).toBe(HOLD.width); // прижата ровно к кромке
  });

  it('текст лежит внутри плашки по обеим осям', () => {
    const b = selectionBadge({ x: 1000, y: 800, w: 1000, h: 500 }, TEXT, FONT, HOLD);
    expect(b.textX).toBeGreaterThan(b.x);
    expect(b.textX + TEXT_W).toBeLessThanOrEqual(b.x + b.w);
    expect(b.textY).toBeGreaterThan(b.y);
    expect(b.textY).toBeLessThan(b.y + b.h);
  });

  it('плашка шире кузова прижимается к левому краю, а не уезжает в минус', () => {
    const narrow = { width: 400, height: 2000 };
    const b = selectionBadge({ x: 100, y: 800, w: 200, h: 500 }, TEXT, FONT, narrow);
    expect(b.w).toBeGreaterThan(TEXT_W); // подложку не режем — режется только позиция
    expect(b.x).toBe(0);
  });
});
