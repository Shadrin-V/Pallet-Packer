# qrd.4 — ShelfPacker (floor-стадия) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать floor-упаковщик `packFloor` как чистый детерминированный примитив: раскладка футпринтов по прямоугольной области с ориентацией «по макс-влезанию» и режимами загрузки rear/side/combined.

**Architecture:** Один модуль `packages/engine/src/packing/floor.ts`. `packFloor` выбирает ориентацию каждого типа по макс-влезанию (yaw-swap L↔W), затем раскладывает shelf-next-fit'ом; ось полки задаёт `loadingMode`. `combined` (дефолт) прогоняет rear и side, возвращает плотнейшую (tie → rear). Модуль внутренний (не в `index.ts`); `Layout`, `orderId`, бамп контракта — за оркестратором qrd.7.

**Tech Stack:** TypeScript (изоморфный, без DOM/Node), Vitest, fast-check (property-based). Исходники — ESM.

## Global Constraints

- Все размеры и координаты — **целые миллиметры** (ADR 002).
- **Детерминизм:** запрещены `Math.random`, `Date.now`, `new Date()`. Одинаковый вход → побайтово одинаковый выход (включая порядок массива).
- **Изоморфность:** никаких обращений к DOM/Node/файловой системе.
- Модуль floor.ts **не экспортируется** из `packages/engine/src/index.ts` (публичный API — эпик qrd.10).
- Эталонные числа (область `13600×2430`, clearance 0): EUR `1200×800` → **34**; Gitterbox `1240×835` → **20**; при `rotation:'none'` EUR → **33**.
- Ориентации только напольные (yaw): `'lwh'` / `'wlh'`. Высота единицы неизменна.
- Система координат: `x` — длина (`0` = перед, `L` = задняя дверь), `y` — ширина (`0` = борт загрузки).
- Тесты запускаются из корня репозитория. Один файл: `npx vitest run packages/engine/src/packing/floor.test.ts`. По имени: добавить `-t "<фрагмент>"`. Полный прогон: `npm test`. Типы: `npm run typecheck`.
- Коммиты — атомарные, после зелёных тестов (conventional commits). Git-политика — conservative: коммить только при явном разрешении пользователя/исполнителя.

**Источник истины:** [docs/superpowers/specs/2026-07-10-qrd4-shelf-packer-design.md](../specs/2026-07-10-qrd4-shelf-packer-design.md), [ADR 011](../../adr/011-order-grouping.md), [ADR 012](../../adr/012-loading-modes.md), контракт [0.4.0](../../api-contract.md).

---

### Task 1: Типы + выбор ориентации «по макс-влезанию»

**Files:**
- Create: `packages/engine/src/packing/floor.ts`
- Test: `packages/engine/src/packing/floor.test.ts`

**Interfaces:**
- Consumes: `RotationRule` из `packages/engine/src/model/index` (`'none' | 'yawOnly' | 'full'`).
- Produces:
  - `type LoadingMode = 'rear' | 'side' | 'combined'`
  - `type FloorOrientation = 'lwh' | 'wlh'`
  - `interface FloorRequest { cargoTypeId: string; length: number; width: number; rotation: RotationRule; count: number }`
  - `interface FloorPlacement { cargoTypeId: string; x: number; y: number; dx: number; dy: number; orientation: FloorOrientation }`
  - `interface PackFloorOptions { clearance?: number; loadingMode?: LoadingMode }`
  - `function fitCount(span: number, dim: number, clearance: number): number`
  - `function chooseOrientation(req: FloorRequest, region: {length:number;width:number}, clearance: number): { dx:number; dy:number; orientation: FloorOrientation }`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/packing/floor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chooseOrientation, fitCount, type FloorRequest } from './floor';

const REGION = { length: 13600, width: 2430 };

function req(over: Partial<FloorRequest> = {}): FloorRequest {
  return { cargoTypeId: 'c', length: 1200, width: 800, rotation: 'yawOnly', count: 1, ...over };
}

describe('fitCount', () => {
  it('counts items along a span (clearance 0)', () => {
    expect(fitCount(13600, 800, 0)).toBe(17);
    expect(fitCount(13600, 1200, 0)).toBe(11);
    expect(fitCount(2430, 1200, 0)).toBe(2);
  });

  it('returns 0 when the item is larger than the span', () => {
    expect(fitCount(1000, 1200, 0)).toBe(0);
  });

  it('applies clearance between items', () => {
    expect(fitCount(1000, 300, 100)).toBe(2); // 300+100+300=700<=1000; third would need 1100
  });
});

describe('chooseOrientation (max-fit, ADR 011)', () => {
  it('EUR fills more in wlh (34) than lwh (33)', () => {
    const fp = chooseOrientation(req({ length: 1200, width: 800, rotation: 'yawOnly' }), REGION, 0);
    expect(fp.orientation).toBe('wlh');
    expect([fp.dx, fp.dy]).toEqual([800, 1200]);
  });

  it('Gitterbox stays lwh (20 vs 16)', () => {
    const fp = chooseOrientation(req({ length: 1240, width: 835, rotation: 'yawOnly' }), REGION, 0);
    expect(fp.orientation).toBe('lwh');
  });

  it('rotation none forces lwh', () => {
    const fp = chooseOrientation(req({ length: 1200, width: 800, rotation: 'none' }), REGION, 0);
    expect(fp.orientation).toBe('lwh');
  });

  it('tie prefers lwh', () => {
    const fp = chooseOrientation(req({ length: 1000, width: 1000, rotation: 'yawOnly' }), REGION, 0);
    expect(fp.orientation).toBe('lwh');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts`
Expected: FAIL — `Failed to resolve import "./floor"` / `chooseOrientation is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/engine/src/packing/floor.ts`:

```ts
import type { RotationRule } from '../model/index';

export type LoadingMode = 'rear' | 'side' | 'combined';
export type FloorOrientation = 'lwh' | 'wlh';

export interface FloorRequest {
  cargoTypeId: string;
  length: number; // родная длина футпринта, мм > 0
  width: number; //  родная ширина футпринта, мм > 0
  rotation: RotationRule;
  count: number; // сколько пытаться разместить (fill → большое число)
}

export interface FloorPlacement {
  cargoTypeId: string;
  x: number;
  y: number;
  dx: number; // занятый размер по оси x
  dy: number; // занятый размер по оси y
  orientation: FloorOrientation;
}

export interface PackFloorOptions {
  clearance?: number;
  loadingMode?: LoadingMode;
}

interface Region {
  length: number;
  width: number;
}
interface Footprint {
  dx: number;
  dy: number;
  orientation: FloorOrientation;
}

/** Сколько единиц размера `dim` влезает в `span` с равномерным зазором `clearance` между ними. */
export function fitCount(span: number, dim: number, clearance: number): number {
  if (dim <= 0 || span < dim) return 0;
  return Math.floor((span + clearance) / (dim + clearance));
}

function gridCapacity(region: Region, fp: Footprint, clearance: number): number {
  return fitCount(region.length, fp.dx, clearance) * fitCount(region.width, fp.dy, clearance);
}

/** Выбор yaw-ориентации по макс-влезанию (ADR 011). Тай-брейк → 'lwh'. */
export function chooseOrientation(req: FloorRequest, region: Region, clearance: number): Footprint {
  const lwh: Footprint = { dx: req.length, dy: req.width, orientation: 'lwh' };
  const canYaw = req.rotation === 'yawOnly' || req.rotation === 'full';
  if (!canYaw) return lwh;
  const wlh: Footprint = { dx: req.width, dy: req.length, orientation: 'wlh' };
  return gridCapacity(region, wlh, clearance) > gridCapacity(region, lwh, clearance) ? wlh : lwh;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts`
Expected: PASS (7 tests). Then `npm run typecheck` → 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/floor.ts packages/engine/src/packing/floor.test.ts
git commit -m "feat(engine): floor packer — max-fit orientation chooser (qrd.4)"
```

---

### Task 2: Shelf next-fit укладка + режимы rear/side/combined

**Files:**
- Modify: `packages/engine/src/packing/floor.ts`
- Test: `packages/engine/src/packing/floor.test.ts`

**Interfaces:**
- Consumes: `chooseOrientation`, `FloorRequest`, `FloorPlacement`, `PackFloorOptions`, `LoadingMode`, `FloorOrientation` из Task 1.
- Produces: `function packFloor(region: {length:number;width:number}, requests: FloorRequest[], opts?: PackFloorOptions): FloorPlacement[]`
  - `loadingMode` по умолчанию `'combined'`; `clearance` по умолчанию `0`.

- [ ] **Step 1: Write the failing tests (reference numbers + modes)**

Append to `packages/engine/src/packing/floor.test.ts`:

```ts
import { packFloor, type FloorPlacement } from './floor';

function eur(count = 100000): FloorRequest {
  return { cargoTypeId: 'eur', length: 1200, width: 800, rotation: 'yawOnly', count };
}

describe('packFloor — reference fills', () => {
  it('trivial exact: 2x2 region, 1x1 footprint -> 4', () => {
    const one: FloorRequest = { cargoTypeId: 'u', length: 1, width: 1, rotation: 'none', count: 100 };
    expect(packFloor({ length: 2, width: 2 }, [one])).toHaveLength(4);
  });

  it('EUR yawOnly on 13600x2430 -> 34 (side)', () => {
    expect(packFloor(REGION, [eur()], { loadingMode: 'side' })).toHaveLength(34);
  });

  it('EUR yawOnly on 13600x2430 -> 34 (rear)', () => {
    expect(packFloor(REGION, [eur()], { loadingMode: 'rear' })).toHaveLength(34);
  });

  it('Gitterbox 1240x835 -> 20', () => {
    const gb: FloorRequest = { cargoTypeId: 'gb', length: 1240, width: 835, rotation: 'yawOnly', count: 100000 };
    expect(packFloor(REGION, [gb], { loadingMode: 'side' })).toHaveLength(20);
  });

  it('rotation none -> 33 (swap forbidden)', () => {
    const eurNone: FloorRequest = { ...eur(), rotation: 'none' };
    expect(packFloor(REGION, [eurNone], { loadingMode: 'side' })).toHaveLength(33);
  });

  it('empty requests -> []', () => {
    expect(packFloor(REGION, [])).toEqual([]);
  });

  it('respects requested count', () => {
    expect(packFloor(REGION, [eur(10)], { loadingMode: 'side' })).toHaveLength(10);
  });
});

describe('packFloor — orientation axis (rear vs side coords)', () => {
  it('side lays a non-square footprint growing along y', () => {
    const r: FloorRequest = { cargoTypeId: 'r', length: 1000, width: 500, rotation: 'none', count: 100 };
    const out = packFloor({ length: 1000, width: 2000 }, [r], { loadingMode: 'side' });
    // side: one column along x (1000), shelves stack along y at 0,500,1000,1500
    expect(new Set(out.map((p) => p.y))).toEqual(new Set([0, 500, 1000, 1500]));
    expect(out.every((p) => p.x === 0)).toBe(true);
  });

  it('rear lays the same footprint growing along x', () => {
    const r: FloorRequest = { cargoTypeId: 'r', length: 500, width: 1000, rotation: 'none', count: 100 };
    const out = packFloor({ length: 2000, width: 1000 }, [r], { loadingMode: 'rear' });
    // rear: one row along y (1000), shelves stack along x at 0,500,1000,1500
    expect(new Set(out.map((p) => p.x))).toEqual(new Set([0, 500, 1000, 1500]));
    expect(out.every((p) => p.y === 0)).toBe(true);
  });
});

describe('packFloor — combined (default)', () => {
  it('combined places max(rear, side) on a mixed load', () => {
    const region = { length: 3000, width: 2000 };
    const reqs: FloorRequest[] = [
      { cargoTypeId: 'A', length: 1200, width: 800, rotation: 'yawOnly', count: 10 },
      { cargoTypeId: 'B', length: 1000, width: 600, rotation: 'yawOnly', count: 10 },
    ];
    const rear = packFloor(region, reqs, { loadingMode: 'rear' }).length;
    const side = packFloor(region, reqs, { loadingMode: 'side' }).length;
    const combined = packFloor(region, reqs, { loadingMode: 'combined' }).length;
    expect(combined).toBe(Math.max(rear, side));
  });

  it('default mode is combined and deterministic', () => {
    const reqs = [eur()];
    expect(packFloor(REGION, reqs)).toEqual(packFloor(REGION, reqs, { loadingMode: 'combined' }));
    expect(packFloor(REGION, reqs)).toEqual(packFloor(REGION, reqs));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts`
Expected: FAIL — `packFloor is not a function` / import error.

- [ ] **Step 3: Write the implementation**

Append to `packages/engine/src/packing/floor.ts`:

```ts
function pushPlacement(
  out: FloorPlacement[],
  cargoTypeId: string,
  fp: Footprint,
  mode: 'rear' | 'side',
  fillCursor: number,
  growCursor: number,
): void {
  // side: fill=x, grow=y. rear: fill=y, grow=x.
  const x = mode === 'side' ? fillCursor : growCursor;
  const y = mode === 'side' ? growCursor : fillCursor;
  out.push({ cargoTypeId, x, y, dx: fp.dx, dy: fp.dy, orientation: fp.orientation });
}

function packShelf(
  region: Region,
  requests: FloorRequest[],
  clearance: number,
  mode: 'rear' | 'side',
): FloorPlacement[] {
  const out: FloorPlacement[] = [];
  const fillSpan = mode === 'side' ? region.length : region.width;
  const growSpan = mode === 'side' ? region.width : region.length;

  let growCursor = 0; // начало активной полки по оси роста
  let fillCursor = 0; // позиция в активной полке по оси укладки
  let shelfDepth = 0; // максимальный размер по оси роста в активной полке

  for (const req of requests) {
    if (req.count <= 0) continue;
    const fp = chooseOrientation(req, region, clearance);
    if (fp.dx <= 0 || fp.dy <= 0) continue;
    const fillExtent = mode === 'side' ? fp.dx : fp.dy;
    const growExtent = mode === 'side' ? fp.dy : fp.dx;

    for (let i = 0; i < req.count; i++) {
      const fitsCurrent =
        fillCursor + fillExtent <= fillSpan &&
        growCursor + Math.max(shelfDepth, growExtent) <= growSpan;
      if (fitsCurrent) {
        pushPlacement(out, req.cargoTypeId, fp, mode, fillCursor, growCursor);
        fillCursor += fillExtent + clearance;
        if (growExtent > shelfDepth) shelfDepth = growExtent;
        continue;
      }
      // текущая полка не вмещает — открываем следующую
      const nextGrow = growCursor + shelfDepth + (shelfDepth > 0 ? clearance : 0);
      if (nextGrow + growExtent <= growSpan && fillExtent <= fillSpan) {
        growCursor = nextGrow;
        fillCursor = 0;
        shelfDepth = growExtent;
        pushPlacement(out, req.cargoTypeId, fp, mode, fillCursor, growCursor);
        fillCursor += fillExtent + clearance;
      } else {
        break; // оставшиеся единицы этого запроса не размещаются
      }
    }
  }
  return out;
}

/**
 * Детерминированная shelf/next-fit укладка футпринтов по области пола (ADR 004, 011, 012).
 * Ориентация — по макс-влезанию на уровне типа; ось полки — по `loadingMode`; порядок входа =
 * приоритет (переполнение → хвост не размещается). Координаты — от origin области (0,0).
 */
export function packFloor(
  region: Region,
  requests: FloorRequest[],
  opts: PackFloorOptions = {},
): FloorPlacement[] {
  const clearance = opts.clearance ?? 0;
  const mode = opts.loadingMode ?? 'combined';
  if (mode === 'rear') return packShelf(region, requests, clearance, 'rear');
  if (mode === 'side') return packShelf(region, requests, clearance, 'side');
  // combined: плотнейшая из двух; при равенстве — rear (детерминированный тай-брейк).
  const rear = packShelf(region, requests, clearance, 'rear');
  const side = packShelf(region, requests, clearance, 'side');
  return side.length > rear.length ? side : rear;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts`
Expected: PASS (все тесты Task 1 + Task 2). Then `npm run typecheck` → 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/floor.ts packages/engine/src/packing/floor.test.ts
git commit -m "feat(engine): shelf next-fit floor packer with rear/side/combined modes (qrd.4)"
```

---

### Task 3: Clearance, приоритет, edge-cases и property-based валидация геометрии

**Files:**
- Modify: `packages/engine/src/packing/floor.test.ts`
- (код floor.ts уже полон; ожидаем зелёные тесты без правок реализации — если тест падает, чиним floor.ts по TDD)

**Interfaces:**
- Consumes: `packFloor`, `FloorRequest`, `FloorPlacement`, `LoadingMode` из Task 2; `findGeometryViolations` из `../geometry/geometry`; доменные типы `CargoType`, `Layout`, `Load`, `RotationRule` из `../model/index`.
- Produces: только тесты (публичной поверхности не добавляет).

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/packing/floor.test.ts`:

```ts
import fc from 'fast-check';
import type { CargoType, Layout, Load, RotationRule } from '../model/index';
import type { LoadingMode } from './floor';
import { findGeometryViolations } from '../geometry/geometry';

describe('packFloor — clearance, priority, edges', () => {
  it('clearance reduces the count below 34', () => {
    expect(packFloor(REGION, [eur()], { clearance: 50, loadingMode: 'side' }).length).toBeLessThan(34);
  });

  it('places nothing when the footprint exceeds the region in both orientations', () => {
    const big: FloorRequest = { cargoTypeId: 'big', length: 5000, width: 5000, rotation: 'yawOnly', count: 3 };
    expect(packFloor({ length: 2000, width: 2000 }, [big])).toEqual([]);
  });

  it('respects input order as priority under space pressure', () => {
    const region = { length: 2000, width: 1000 };
    const A: FloorRequest = { cargoTypeId: 'A', length: 1000, width: 1000, rotation: 'none', count: 2 };
    const B: FloorRequest = { cargoTypeId: 'B', length: 1000, width: 1000, rotation: 'none', count: 5 };
    const out = packFloor(region, [A, B], { loadingMode: 'side' });
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.cargoTypeId === 'A')).toBe(true);
  });
});

function toLoadAndLayout(
  region: { length: number; width: number },
  requests: FloorRequest[],
  placements: FloorPlacement[],
): { load: Load; layout: Layout } {
  const cargo: CargoType[] = requests.map((r) => ({
    id: r.cargoTypeId,
    name: r.cargoTypeId,
    length: r.length,
    width: r.width,
    height: 100,
    quantity: r.count,
    rotation: r.rotation,
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
  }));
  const layout: Layout = {
    placements: placements.map((fp) => ({
      cargoTypeId: fp.cargoTypeId,
      x: fp.x,
      y: fp.y,
      z: 0,
      orientation: fp.orientation,
      tier: 1,
      state: 'entschachtelt',
    })),
    unplaced: [],
    metrics: { totalPlaced: placements.length, usedFloorPositions: placements.length, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.0.0',
  };
  const load: Load = {
    vehicle: { id: 'v', name: 'v', length: region.length, width: region.width, height: 1000 },
    cargo,
  };
  return { load, layout };
}

describe('packFloor — property: no geometry violations', () => {
  it('never overlaps or exceeds bounds for random inputs', () => {
    const arbReq = fc.record({
      length: fc.integer({ min: 100, max: 3000 }),
      width: fc.integer({ min: 100, max: 3000 }),
      rotation: fc.constantFrom<RotationRule>('none', 'yawOnly', 'full'),
      count: fc.integer({ min: 0, max: 40 }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 14000 }),
        fc.integer({ min: 500, max: 3000 }),
        fc.array(arbReq, { minLength: 0, maxLength: 5 }),
        fc.constantFrom<LoadingMode>('rear', 'side', 'combined'),
        fc.integer({ min: 0, max: 50 }),
        (L, W, rawReqs, mode, clearance) => {
          const region = { length: L, width: W };
          const requests: FloorRequest[] = rawReqs.map((r, i) => ({ cargoTypeId: `c${i}`, ...r }));
          const placements = packFloor(region, requests, { clearance, loadingMode: mode });
          const { load, layout } = toLoadAndLayout(region, requests, placements);
          expect(findGeometryViolations(load, layout)).toEqual([]);
        },
      ),
    );
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts`
Expected: это верификационные тесты против готовой реализации Task 2 — clearance / priority / edge-кейсы должны пройти сразу. Property-тест либо проходит, либо находит реальный контрпример (тогда это баг во floor.ts).

- [ ] **Step 3: If the property test fails — debug (systematic-debugging)**

Ожидаемо кода менять не нужно: bounds-проверки в `packShelf` держат размещение в пределах области; `chooseOrientation` через `gridCapacity` отсекает не влезающие ориентации (capacity 0); порядок входа сохраняется. Если property-тест падает — fast-check печатает seed и минимальный контрпример: зафиксировать его отдельным `it`, починить `packShelf`/`chooseOrientation`, повторить прогон до зелёного.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts`
Expected: PASS (весь файл). Then `npm test` (полный прогон движка, регрессий нет) и `npm run typecheck` → 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/floor.test.ts
git commit -m "test(engine): floor packer clearance, priority, property-based geometry (qrd.4)"
```

---

## После плана

- Закрыть `LKWkalk-qrd.4` с комментарием (эталоны 34/20/33/4 зелёные, property-тест без нарушений).
- Ветку `wip/qrd-4` пометить superseded (новый `floor.ts` заменяет старую эвристику EUR=33).
- Разблокируются `LKWkalk-qrd.6` (rotation) и `LKWkalk-qrd.7` (оркестратор — там `orderId`/`loadingMode` в модель, бамп контракта, сборка `Layout`).
