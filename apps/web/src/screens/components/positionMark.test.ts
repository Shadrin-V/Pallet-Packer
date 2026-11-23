import { describe, it, expect } from 'vitest';
import { markGlyph, positionMark, positionMarks } from './positionMark';

describe('positionMark', () => {
  it('буквы по порядку, после Z — две буквы', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(positionMark)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});

describe('positionMarks', () => {
  it('id позиции → знак по порядку; повтор id не сдвигает следующие знаки', () => {
    const m = positionMarks(['p1', 'm3', 'p2', 'p1', 'p3']);
    expect([...m.entries()]).toEqual([
      ['p1', 'A'],
      ['m3', 'B'],
      ['p2', 'C'],
      ['p3', 'D'],
    ]);
  });
});

describe('markGlyph', () => {
  it('в левом верхнем углу стопки, кегль 0,8 × countFont', () => {
    const g = markGlyph({ x: 100, y: 200, w: 1200, h: 800 }, 100);
    expect(g.fontSize).toBe(80);
    expect(g.x).toBeGreaterThan(100);
    expect(g.y).toBeGreaterThan(200);
    expect(g.x).toBeLessThan(100 + 1200 / 2);
    expect(g.y).toBeLessThan(200 + 800 / 2);
  });

  it('маленькая стопка: кегль не больше трети меньшей стороны, но знак есть', () => {
    const g = markGlyph({ x: 0, y: 0, w: 1200, h: 144 }, 122.5);
    expect(g.fontSize).toBe(48);
    expect(g.fontSize).toBeGreaterThan(0);
    // знак целиком внутри стопки
    expect(g.y + g.fontSize / 2).toBeLessThanOrEqual(144);
  });
});
