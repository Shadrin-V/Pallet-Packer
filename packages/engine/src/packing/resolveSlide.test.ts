import { describe, expect, it } from 'vitest';
import type { CargoType, Layout, Load, Vehicle } from '../model/index';
import { findGeometryViolations } from '../geometry/geometry';
import { moveStacks } from './edit';
import { resolveSlide } from './resolveSlide';

/** Кузов 10 × 2,4 м, поддон 1200 × 800 — все координаты ниже считаются в уме. */
const load: Load = {
  vehicle: { id: 'v', name: 'LKW', length: 10000, width: 2400, height: 2650 },
  cargo: [
    {
      id: 'p',
      name: 'P',
      length: 1200,
      width: 800,
      height: 1000,
      quantity: 10,
      rotation: 'yawOnly',
      stacking: { stackable: false },
      nesting: { nestable: false },
      state: 'entschachtelt',
    },
  ],
};

const at = (x: number, y: number) => ({
  cargoTypeId: 'p',
  x,
  y,
  z: 0,
  orientation: 'lwh' as const,
  tier: 1,
  state: 'entschachtelt' as const,
});

/** Как `at`, но с явной ориентацией — для проверки, что ход считается по следу
 *  (`orientedDims`), а не по сырым `cargo.length`/`cargo.width`. */
const atOriented = (x: number, y: number, orientation: Layout['placements'][number]['orientation']) => ({
  ...at(x, y),
  orientation,
});

const layoutOf = (placements: Layout['placements']): Layout => ({
  placements,
  unplaced: [],
  metrics: {
    totalPlaced: placements.length,
    usedFloorPositions: placements.length,
    floorFillPercent: 0,
    volumeFillPercent: 0,
  },
  contractVersion: '0.16.0',
});

const ref = (x: number, y: number) => ({ cargoTypeId: 'p', x, y });

describe('resolveSlide', () => {
  it('гонит одинокую стопку до задней стенки', () => {
    const d = resolveSlide(load, layoutOf([at(0, 0)]), [ref(0, 0)], '+x');
    expect(d).toEqual({ dx: 8800, dy: 0 }); // 10000 − 1200
  });

  it('гонит одинокую стопку до передней стенки', () => {
    const d = resolveSlide(load, layoutOf([at(3000, 0)]), [ref(3000, 0)], '-x');
    expect(d).toEqual({ dx: -3000, dy: 0 });
  });

  it('гонит стопку до дальнего борта', () => {
    const d = resolveSlide(load, layoutOf([at(0, 0)]), [ref(0, 0)], '+y');
    expect(d).toEqual({ dx: 0, dy: 1600 }); // 2400 − 800
  });

  it('гонит стопку до ближнего борта', () => {
    const d = resolveSlide(load, layoutOf([at(0, 1600)]), [ref(0, 1600)], '-y');
    expect(d).toEqual({ dx: 0, dy: -1600 });
  });

  it('останавливает стопку вплотную к соседу, а не у стенки', () => {
    const d = resolveSlide(load, layoutOf([at(0, 0), at(5000, 0)]), [ref(0, 0)], '+x');
    expect(d).toEqual({ dx: 3800, dy: 0 }); // 5000 − 1200
  });

  it('считает ход по БЛИЖАЙШЕМУ препятствию', () => {
    const layout = layoutOf([at(0, 0), at(5000, 0), at(3000, 0)]);
    const d = resolveSlide(load, layout, [ref(0, 0)], '+x');
    expect(d).toEqual({ dx: 1800, dy: 0 }); // 3000 − 1200
  });

  it('не считает препятствием стопку из другой полосы', () => {
    // сосед стоит по y 1600…2400, наша стопка — 0…800: проекции не пересекаются
    const layout = layoutOf([at(0, 0), at(5000, 1600)]);
    const d = resolveSlide(load, layout, [ref(0, 0)], '+x');
    expect(d).toEqual({ dx: 8800, dy: 0 });
  });

  it('не считает препятствием стопку, стоящую впритык боком', () => {
    // сосед по y 800…1600 — соприкосновение боками не мешает проехать мимо
    const layout = layoutOf([at(0, 0), at(5000, 800)]);
    const d = resolveSlide(load, layout, [ref(0, 0)], '+x');
    expect(d).toEqual({ dx: 8800, dy: 0 });
  });

  it('двигает блок общей дельтой = минимуму ходов участниц', () => {
    const layout = layoutOf([at(0, 0), at(1200, 0), at(5000, 0)]);
    const d = resolveSlide(load, layout, [ref(0, 0), ref(1200, 0)], '+x');
    expect(d).toEqual({ dx: 2600, dy: 0 }); // ведущая: 5000 − (1200 + 1200)
  });

  it('не считает участниц блока препятствиями друг другу', () => {
    const layout = layoutOf([at(0, 0), at(1200, 0)]);
    const d = resolveSlide(load, layout, [ref(0, 0), ref(1200, 0)], '+x');
    expect(d).toEqual({ dx: 7600, dy: 0 }); // 10000 − (1200 + 1200)
  });

  it('возвращает нули, когда стопка уже вплотную', () => {
    const layout = layoutOf([at(0, 0), at(1200, 0)]);
    expect(resolveSlide(load, layout, [ref(0, 0)], '+x')).toEqual({ dx: 0, dy: 0 });
    expect(resolveSlide(load, layout, [ref(0, 0)], '-x')).toEqual({ dx: 0, dy: 0 });
  });

  it('возвращает нули на пустом списке и на несуществующей стопке', () => {
    const layout = layoutOf([at(0, 0)]);
    expect(resolveSlide(load, layout, [], '+x')).toEqual({ dx: 0, dy: 0 });
    expect(resolveSlide(load, layout, [ref(7777, 0)], '+x')).toEqual({ dx: 0, dy: 0 });
  });

  it('даёт дельту, которую moveStacks принимает и геометрия не осуждает', () => {
    const layout = layoutOf([at(0, 0), at(5000, 0)]);
    const d = resolveSlide(load, layout, [ref(0, 0)], '+x');
    const res = moveStacks(load, layout, [ref(0, 0)], d.dx, d.dy);
    expect(res.error).toBeUndefined();
    expect(findGeometryViolations(load, res.layout)).toHaveLength(0);
    expect(res.layout.placements.find((p) => p.x === 3800)).toBeDefined();
  });

  it('считает ход повёрнутой стопки по СЛЕДУ, а не по сырым length/width', () => {
    // Поддон 1200×800 развёрнут 'wlh': след 800 (по x) × 1200 (по y). Ход до задней стенки
    // обязан опираться на след 800, а не на cargo.length = 1200.
    const layout = layoutOf([atOriented(0, 0, 'wlh')]);
    const d = resolveSlide(load, layout, [ref(0, 0)], '+x');
    expect(d).toEqual({ dx: 9200, dy: 0 }); // 10000 − 800
  });

  it('двигает блок из стопок РАЗНОГО следа общей дельтой = минимуму ходов участниц', () => {
    // Участница A: 'lwh', след 1200×800, x=0 → свободный ход 10000 − (0 + 1200) = 8800.
    // Участница B: 'wlh', след 800×1200, x=500 → свободный ход 10000 − (500 + 800) = 8700.
    // Разные следы дают разные индивидуальные ходы — общая дельта блока обязана быть МЕНЬШИМ
    // из двух (8700), а не средним и не ходом первой участницы (8800).
    const layout = layoutOf([atOriented(0, 0, 'lwh'), atOriented(500, 1000, 'wlh')]);
    const d = resolveSlide(load, layout, [ref(0, 0), ref(500, 1000)], '+x');
    expect(d).toEqual({ dx: 8700, dy: 0 });
  });
});

describe('resolveSlide — стенка своего отсека (ADR 026, p3p)', () => {
  // Тягач [0,2400) + разрыв [2400,3400) + прицеп [3400,5800), кузов 2400×2400 в сечении — тот же
  // масштаб, что и в orchestrator.test.ts (twoBays), куб 1200³ ради согласованных чисел по эпику.
  const twoBays: Vehicle = {
    id: 't',
    name: 't',
    length: 5800,
    width: 2400,
    height: 2400,
    compartments: [
      { id: 'a', x: 0, length: 2400 },
      { id: 'b', x: 3400, length: 2400 },
    ],
  };
  const cube: CargoType = {
    id: 'c',
    name: 'c',
    length: 1200,
    width: 1200,
    height: 1200,
    quantity: 8,
    rotation: 'none',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
  };
  const twoBaysLoad: Load = { vehicle: twoBays, cargo: [cube] };
  const bayAt = (x: number, y: number) => ({
    cargoTypeId: 'c',
    x,
    y,
    z: 0,
    orientation: 'lwh' as const,
    tier: 1,
    state: 'entschachtelt' as const,
  });
  const bayRef = (x: number, y: number) => ({ cargoTypeId: 'c', x, y });

  it('стопка упирается в стенку СВОЕГО отсека, а не в конец пролёта', () => {
    // Тягач [0,2400): стопка 1200 в x=0, ход +x. Свободно до стенки отсека a: 2400 − 1200 = 1200 —
    // а не до конца всего пролёта (5800 − 1200 = 4600), как было бы при старой «одна стенка на весь
    // кузов» логике.
    const layout = layoutOf([bayAt(0, 0)]);
    const d = resolveSlide(twoBaysLoad, layout, [bayRef(0, 0)], '+x');
    expect(d).toEqual({ dx: 1200, dy: 0 });
  });

  it('выделение по обе стороны разрыва не переезжает через него', () => {
    // Участница A стоит в тягаче на x=300: свободный ход до СВОЕЙ стенки — 2400−(300+1200) = 900.
    // Участница B стоит в прицепе впритык к его ближней стенке, x=3400: свободный ход до ДАЛЬНЕЙ
    // стенки прицепа — 5800−(3400+1200) = 1200 (число совпадает со старой «стенка на весь кузов»,
    // потому что прицеп — последний отсек, и его дальняя стенка и есть конец всего пролёта).
    // Блок едет минимумом ходов участниц (ADR 021) — 900, а не 1200: старая логика посчитала бы A
    // ход до конца ВСЕГО пролёта (5800−1500 = 4300), не заметила бы, что A ближе к СВОЕЙ стенке, и
    // отдала бы блоку 1200 (ход B) — а на деле A после такого хода оказалась бы в разрыве
    // [2400,3400), где груза быть не может.
    const layout = layoutOf([bayAt(300, 0), bayAt(3400, 0)]);
    const refs = [bayRef(300, 0), bayRef(3400, 0)];
    const d = resolveSlide(twoBaysLoad, layout, refs, '+x');
    expect(d).toEqual({ dx: 900, dy: 0 });
  });
});
