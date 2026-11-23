import { describe, it, expect } from 'vitest';
import { calculateLayout, type CargoType, type Load } from '@shadrin-v/engine';
import {
  boxesIntersect,
  placeMark,
  positionMark,
  positionMarks,
  sideMarkPlacements,
  sideMarkVisible,
  type MarkItem,
} from './positionMark';
import { sideRects } from './cutaway';

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

describe('sideMarkPlacements', () => {
  const H = 2700;
  const bar = (key: string, x: number, rowY: number, h: number, w = 1200): MarkItem => ({
    key,
    mark: key.toUpperCase(),
    rect: { x, y: H - h, w, h },
    rowY,
  });

  it('две плиты 144 мм в соседних рядах на одном x: ровно один знак — ближней', () => {
    const placed = sideMarkPlacements([bar('a', 0, 0, 144), bar('b', 0, 800, 144)], F, HOLD);
    expect([...placed.keys()]).toEqual(['b']);
  });

  it('полоса целиком закрыта ближними (две ближние рядом) — знака нет', () => {
    const items = [bar('a', 0, 0, 288, 1600), bar('b', 0, 800, 432, 800), bar('c', 800, 800, 432, 800)];
    const placed = sideMarkPlacements(items, F, HOLD);
    expect(placed.has('a')).toBe(false);
    expect(placed.has('b') && placed.has('c')).toBe(true);
  });

  it('узкая высокая стопка: над полосой места нет (крыша) — знак не рисуется, за крышу не выходит', () => {
    const placed = sideMarkPlacements([bar('a', 0, 0, H - 50, 150)], F, HOLD);
    expect(placed.size).toBe(0);
  });

  it('инвариант: ни одна пара мест знаков сбоку не пересекается, ни одно не выходит за крышу', () => {
    const V = { id: 'v', name: 'LKW', length: 13600, width: 2450, height: H };
    const type = (id: string, h: number, quantity: number, orderId: string, l = 1200, w = 800): CargoType => ({
      id, name: id, length: l, width: w, height: h, quantity, rotation: 'yawOnly',
      stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt', orderId,
    });
    const loads: Load[] = [
      { vehicle: V, cargo: Array.from({ length: 10 }, (_, k) => type(`p${k}`, 144, k === 9 ? 2000 : 2, `BE-${k >> 1}`)) },
      { vehicle: V, cargo: Array.from({ length: 10 }, (_, k) => type(`q${k}`, 144, 1, `BE-${k >> 1}`)) },
      { vehicle: V, cargo: [type('a', 144, 7, 'BE-1'), type('b', 600, 5, 'BE-1', 1200, 1000), type('c', 144, 3, 'BE-2', 600, 400), type('d', 1000, 9, 'BE-3')] },
    ];
    for (const load of loads) {
      const layout = calculateLayout(load);
      const rects = sideRects(load, layout, H);
      const marks = positionMarks(load.cargo.map((c) => c.id));
      const items = rects.map((r) => ({
        key: `${r.cargoTypeId}@${r.x},${r.rowY}`,
        mark: marks.get(r.cargoTypeId)!,
        rect: r,
        rowY: r.rowY,
      }));
      const placed = [...sideMarkPlacements(items, F, HOLD).values()];
      expect(placed.length).toBeGreaterThan(0);
      for (let i = 0; i < placed.length; i++) {
        expect(placed[i].box.y).toBeGreaterThanOrEqual(0);
        for (let j = i + 1; j < placed.length; j++) expect(boxesIntersect(placed[i].box, placed[j].box)).toBe(false);
      }
    }
  });
});

describe('placeMark — вынос сверху среди соседей', () => {
  const narrow = { x: 1200, y: 0, w: 150, h: 1200 };
  const leftN = { x: 0, y: 0, w: 1200, h: 1200 };
  const rightN = { x: 1350, y: 0, w: 1200, h: 1200 };

  it('справа сосед — знак слева, на соседа не ложится', () => {
    const p = placeMark('top', narrow, 'C', F, HOLD, [rightN]);
    expect(p.outside).toBe(true);
    expect(p.anchor).toBe('end');
    expect(boxesIntersect(p.box, rightN)).toBe(false);
  });

  it('соседи с обеих сторон — знак внутри своего следа, по центру, поверх «×N»', () => {
    const p = placeMark('top', narrow, 'C', F, HOLD, [leftN, rightN]);
    expect(p.outside).toBe(false);
    expect(p.leader).toBeUndefined();
    expect(p.anchor).toBe('middle');
    expect(p.x).toBe(narrow.x + narrow.w / 2);
    expect(p.y).toBe(narrow.y + narrow.h / 2);
    expect(boxesIntersect(p.box, leftN) || boxesIntersect(p.box, rightN)).toBe(false);
  });
});
