import { describe, it, expect } from 'vitest';
import { boxesIntersect, placeMark, positionMark, positionMarks, sideMarkVisible } from './positionMark';

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

const F = 122.5; // countFont кузова шириной 2450 мм
const HOLD = { length: 13600 };
const inside = (outer: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  b.x >= outer.x && b.y >= outer.y && b.x + b.w <= outer.x + outer.w && b.y + b.h <= outer.y + outer.h;

describe('placeMark', () => {
  it('кегль знака всегда равен кеглю «×N» — и на большой, и на маленькой стопке', () => {
    for (const r of [
      { x: 0, y: 0, w: 1200, h: 800 },
      { x: 0, y: 2556, w: 1200, h: 144 },
      { x: 0, y: 0, w: 150, h: 1200 },
    ]) {
      expect(placeMark('top', r, 'A', F, HOLD).fontSize).toBe(F);
      expect(placeMark('side', r, 'A', F, HOLD).fontSize).toBe(F);
    }
  });

  it('вид сверху, след 1200×800: знак внутри, в левом верхнем углу; имя и ×N — ниже полосы знака', () => {
    const r = { x: 1000, y: 400, w: 1200, h: 800 };
    const p = placeMark('top', r, 'J', F, HOLD);
    expect(p.outside).toBe(false);
    expect(p.leader).toBeUndefined();
    expect(inside(r, p.box)).toBe(true);
    expect(p.box.x - r.x).toBeLessThan(r.w / 4);
    expect(p.box.y - r.y).toBeLessThan(r.h / 4);
    expect(boxesIntersect(p.box, p.labelArea)).toBe(false);
    expect(inside(r, p.labelArea)).toBe(true);
  });

  it('вид сбоку, плита 144 мм: знак вынесен строго над полосой, по её середине', () => {
    const r = { x: 2400, y: 2700 - 144, w: 1200, h: 144 };
    const p = placeMark('side', r, 'B', F, HOLD);
    expect(p.outside).toBe(true);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(r.y);
    expect(p.anchor).toBe('middle');
    expect(p.x).toBe(r.x + r.w / 2);
    expect(p.box.x).toBeGreaterThanOrEqual(r.x);
    expect(p.box.x + p.box.w).toBeLessThanOrEqual(r.x + r.w);
  });

  it('вид сверху, узкий след 150 мм: знак рядом со следом, с выноской; у правого борта — слева', () => {
    const r = { x: 1000, y: 0, w: 150, h: 1200 };
    const p = placeMark('top', r, 'C', F, HOLD);
    expect(p.outside).toBe(true);
    expect(p.box.x).toBeGreaterThanOrEqual(r.x + r.w);
    expect(p.leader).toEqual({ x1: r.x + r.w, y1: r.y + r.h / 2, x2: expect.any(Number), y2: r.y + r.h / 2 });
    const atWall = { x: HOLD.length - 150, y: 0, w: 150, h: 1200 };
    const q = placeMark('top', atWall, 'C', F, HOLD);
    expect(q.box.x + q.box.w).toBeLessThanOrEqual(atWall.x);
    expect(q.anchor).toBe('end');
  });

  it('вид сверху, след 600×400: полоса знака и подпись не пересекаются', () => {
    const r = { x: 0, y: 0, w: 600, h: 400 };
    const p = placeMark('top', r, 'AB', F, HOLD);
    expect(p.outside).toBe(false);
    expect(boxesIntersect(p.box, p.labelArea)).toBe(false);
  });
});

describe('sideMarkVisible', () => {
  const H = 2700;
  const rear = (h: number) => ({ x: 0, y: H - h, w: 1200, h });
  const front = { x: 0, y: H - 144, w: 1200, h: 144 };

  it('ближняя стопка закрывает место знака — знак дальней не рисуется', () => {
    const r = rear(288); // выступ 144 мм < 1,4 кегля
    expect(sideMarkVisible(placeMark('side', r, 'A', F, HOLD), [front])).toBe(false);
  });

  it('выступ над ближней стопкой ≥ 1,4 кегля — знак дальней виден', () => {
    const r = rear(432); // выступ 288 мм
    expect(sideMarkVisible(placeMark('side', r, 'A', F, HOLD), [front])).toBe(true);
  });

  it('ничего ближе нет — знак виден', () => {
    expect(sideMarkVisible(placeMark('side', front, 'B', F, HOLD), [])).toBe(true);
  });
});
