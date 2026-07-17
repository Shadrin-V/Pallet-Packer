# Warehouse 1:1 + Magnet Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Буфер становится складом в масштабе 1:1 с плитками как в кузове, а постановка перестаёт
наказывать за промах: магнит прижимает стопку вплотную, а подсветка показывает исход до отпускания.

**Architecture:** Магнит — чистая функция `resolveDrop` в **ядре** (ADR 019: алгебра правок живёт там).
Она точна и дёшева, потому что позиционно-независимые правила (ориентация, доступ вил) проверяются
однократно, а перебор кандидатов идёт только по границам и пересечениям. UI зовёт её на каждом
`pointermove` для призрака и на отпускании — для постановки. Склад — SVG в мм с тем же `viewBox` по
ширине, что и вид сверху, поэтому масштаб совпадает **по построению**, без измерений в JS.

**Tech Stack:** TypeScript, React, SVG в мм-координатах, vitest + @testing-library/react, puppeteer-core.

Спека: [`docs/superpowers/specs/2026-07-17-warehouse-buffer-design.md`](../specs/2026-07-17-warehouse-buffer-design.md).
Эпик: **`LKWkalk-a5b`**. Ветка: `feat/warehouse-magnet`.

## Global Constraints

- **Домен — только в ядре.** Метрики, построение колонки и правила допустимости позиции UI не считает
  никогда (ADR 019). Магнит — доменное правило → `packages/engine`.
- **`placeStack`/`moveStack` остаются строгими.** Магнит — отдельная функция, а не флаг у них: API/MCP
  не должен получить операцию, которая двигает груз на своё усмотрение.
- Контракт → **0.13.0**, аддитивно. `@shadrin-v/engine` → **0.0.8** (не публикуется).
- Внутренне — **целые миллиметры** (ADR 002).
- Ни одной пользовательской строки в коде — только ключи локалей (`de`, `ru`).
- Детерминизм: тот же вход → тот же выход. Все тай-брейки явные.
- Инварианты на каждом результате: `findGeometryViolations(load, layout) === []`;
  `placed + unplaced` по типу сохраняется; ручная стопка не выше расчётной.
- Эталоны упаковщика **EUR 34 / GB 20 / none 33** — не шелохнуть.
- Гейты: `npm test` · `npm run lint` · `npm run typecheck` · `npm run build --workspace apps/web`.
  Правил `packages/*` → пересобрать их dist (он в `.gitignore`).

---

### Task 1: `resolveDrop` — магнит в ядре (`LKWkalk-crb`)

**Files:**
- Create: `packages/engine/src/packing/resolveDrop.ts`
- Create: `packages/engine/src/packing/resolveDrop.test.ts`
- Modify: `packages/engine/src/index.ts` (экспорт)
- Modify: `docs/api-contract.md` (→ 0.13.0)
- Create: `docs/adr/020-magnet-drop-resolution.md`
- Modify: `packages/engine/package.json` (→ 0.0.8)

**Interfaces:**
- Consumes: `StackRef`, `PlaceStackSpec` из `./edit`; `orientedDims`, `allowedOrientations`,
  `forkPinnedOrientation` из `../model/orientation`.
- Produces:
  ```ts
  export interface DropResolution { x: number; y: number; ok: boolean; error?: EngineError; blocking: StackRef[] }
  export interface ResolveDropOptions { tolerance?: number; exclude?: StackRef }
  export function resolveDrop(load: Load, layout: Layout, spec: PlaceStackSpec, opts?: ResolveDropOptions): DropResolution
  ```

**Границы ответственности (важно, зафиксировать в doc-комментарии):** `resolveDrop` решает вопрос
**позиции**. Она проверяет ориентацию и доступ вил — потому что при них НИ ОДНА позиция не годится, и
искать незачем. Она НЕ проверяет наличие свободных единиц (`ERR_EDIT_NOTHING_TO_PLACE`): это не вопрос
позиции, и при переносе своей же стопки он бессмыслен. Единицы остаются на `placeStack`.

- [ ] **Step 1: Написать падающие тесты**

Файл `packages/engine/src/packing/resolveDrop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Layout, Load } from '../model/index';
import { placeStack } from './edit';
import { resolveDrop } from './resolveDrop';

const V = { id: 'v', name: 'LKW', length: 10000, width: 2400, height: 2650 };
const pallet = {
  id: 'p', name: 'P', length: 1200, width: 800, height: 1000,
  quantity: 10, rotation: 'yawOnly' as const,
  stacking: { stackable: false }, nesting: { nestable: false },
  state: 'entschachtelt' as const, orderId: 'SO-1',
};
const load: Load = { vehicle: V, cargo: [pallet] };
const at = (x: number, y: number) => ({
  cargoTypeId: 'p', x, y, z: 0, orientation: 'lwh' as const, tier: 1, state: 'entschachtelt' as const,
});
const layoutOf = (placements: Layout['placements'], unplaced = 5): Layout => ({
  placements,
  unplaced: [{ cargoTypeId: 'p', count: unplaced }],
  metrics: { totalPlaced: placements.length, usedFloorPositions: placements.length, floorFillPercent: 0, volumeFillPercent: 0 },
  contractVersion: '0.13.0',
});
const spec = (x: number, y: number) => ({ cargoTypeId: 'p', x, y, orientation: 'lwh' as const, units: 1 });

describe('resolveDrop', () => {
  it('returns the aim untouched when it is free and nothing is near enough to snap to', () => {
    const r = resolveDrop(load, layoutOf([]), spec(5000, 800));
    expect(r).toMatchObject({ x: 5000, y: 800, ok: true, blocking: [] });
  });

  it('snaps flush when the aim overlaps a neighbour', () => {
    // сосед занимает 0…1200; целимся в 1080 → налезаем на 120 мм. Впритык = 1200.
    const r = resolveDrop(load, layoutOf([at(0, 0)]), spec(1080, 0));
    expect(r).toMatchObject({ x: 1200, y: 0, ok: true });
  });

  it('closes a gap: a valid aim still snaps flush to the neighbour', () => {
    // 1260 свободно (сосед кончается на 1200), но оставляет щель 60 мм → прижать к 1200.
    const r = resolveDrop(load, layoutOf([at(0, 0)]), spec(1260, 0));
    expect(r).toMatchObject({ x: 1200, y: 0, ok: true });
  });

  it('refuses and names the blocking stack when nothing fits within tolerance', () => {
    // соседи слева и справа вплотную, щели нет; целимся в середину занятого
    const packed = layoutOf([at(0, 0), at(1200, 0), at(2400, 0)]);
    const r = resolveDrop(load, packed, spec(1250, 0), { tolerance: 100 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(r.blocking.length).toBeGreaterThan(0);
  });

  it('does not search when fork access pins the orientation — no position can fix it', () => {
    const pinned: Load = {
      vehicle: V,
      cargo: [{ ...pallet, forkAccess: 'twoSides', forkAxis: 'length' }],
      loadingMode: 'rear',
    };
    const r = resolveDrop(pinned, layoutOf([]), { ...spec(5000, 800), orientation: 'wlh' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
    expect(r.blocking).toEqual([]);
  });

  it('refuses an orientation the rotation rule forbids', () => {
    const fixed: Load = { vehicle: V, cargo: [{ ...pallet, rotation: 'none' }] };
    const r = resolveDrop(fixed, layoutOf([]), { ...spec(5000, 800), orientation: 'wlh' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
  });

  it('excludes the moved stack from its own collision check', () => {
    const one = layoutOf([at(0, 0)]);
    const r = resolveDrop(load, one, spec(60, 0), { exclude: { cargoTypeId: 'p', x: 0, y: 0 } });
    expect(r.ok).toBe(true); // не считает себя помехой; прижмётся к стенке x=0
    expect(r.x).toBe(0);
  });

  it('pulls an aim just outside the hold back inside', () => {
    const r = resolveDrop(load, layoutOf([]), spec(-50, -30));
    expect(r).toMatchObject({ x: 0, y: 0, ok: true });
  });

  it('refuses an aim far outside the hold rather than teleporting it', () => {
    const r = resolveDrop(load, layoutOf([]), spec(-5000, 800));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('is deterministic', () => {
    const l = layoutOf([at(0, 0), at(2400, 0)]);
    expect(resolveDrop(load, l, spec(1250, 0))).toEqual(resolveDrop(load, l, spec(1250, 0)));
  });

  // Подсветка не может врать: зелёное обещание обязано выполняться.
  it('never returns ok for a position placeStack would refuse', () => {
    const l = layoutOf([at(0, 0), at(2400, 0)]);
    for (let x = -200; x <= 4000; x += 100) {
      for (const y of [0, 400, 800, 1600]) {
        const r = resolveDrop(load, l, spec(x, y));
        if (!r.ok) continue;
        const applied = placeStack(load, l, { cargoTypeId: 'p', x: r.x, y: r.y, orientation: 'lwh', units: 1 });
        expect(applied.error, `resolveDrop said ok at ${r.x},${r.y} but placeStack refused`).toBeUndefined();
      }
    }
  });
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

Run: `npx vitest run packages/engine/src/packing/resolveDrop.test.ts`
Expected: FAIL — `Cannot find module './resolveDrop'`.

- [ ] **Step 3: Реализация**

Создать `packages/engine/src/packing/resolveDrop.ts`:

```ts
// Magnet drop resolution (ADR 020, api-contract 0.13.0). Answers ONE question: given where the user
// aimed a stack, where may it actually stand? Pure and total, like the rest of the edit algebra.
//
// Why it lives in the core: "where a stack may stand" is a domain rule, not a pointer detail — the UI
// owning it would be the second place that knows the packing rules (ADR 019).
//
// Why it is a separate function rather than a `tolerance` flag on placeStack: placeStack judges the
// point it is given. An API/MCP caller must be able to say "put it exactly here, refuse otherwise" —
// a placeStack that quietly relocates cargo is not that operation.
//
// Scope: this resolves a POSITION. It checks rotation and fork access because under them NO position
// works, so searching is pointless. It does NOT check unit availability — that is not a question about
// position (and is meaningless when moving a stack that already stands). placeStack still owns it.
import type { EngineError, Layout, Load } from '../model/index';
import { allowedOrientations, forkPinnedOrientation, orientedDims } from '../model/orientation';
import type { PlaceStackSpec, StackRef } from './edit';

/** Where the stack would land, and whether it may. */
export interface DropResolution {
  x: number;
  y: number;
  ok: boolean;
  /** Why not, when !ok. */
  error?: EngineError;
  /** Stacks in the way at the aim — the UI outlines these in red. Empty when ok. */
  blocking: StackRef[];
}

export interface ResolveDropOptions {
  /** How far the magnet may pull, in mm. Default: half the footprint's shorter side. */
  tolerance?: number;
  /** Moving an existing stack: it must not count itself as an obstacle. */
  exclude?: StackRef;
}

const err = (code: string, details?: Record<string, unknown>): EngineError =>
  details ? { code, details } : { code };

/** Half-open interval overlap (touching edges do not overlap) — the rule edit.ts uses. */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

const sameRef = (a: StackRef, b: StackRef) =>
  a.cargoTypeId === b.cargoTypeId && a.x === b.x && a.y === b.y;

interface Box extends StackRef {
  dx: number;
  dy: number;
}

/** One box per floor column (placements of a column share x, y and orientation). */
function floorBoxes(load: Load, layout: Layout, exclude?: StackRef): Box[] {
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: Box[] = [];
  for (const p of layout.placements) {
    const key = `${p.cargoTypeId}@${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = byId.get(p.cargoTypeId);
    if (!c) continue;
    const ref: StackRef = { cargoTypeId: p.cargoTypeId, x: p.x, y: p.y };
    if (exclude && sameRef(ref, exclude)) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, p.orientation);
    out.push({ ...ref, dx, dy });
  }
  return out;
}

export function resolveDrop(
  load: Load,
  layout: Layout,
  spec: PlaceStackSpec,
  opts: ResolveDropOptions = {},
): DropResolution {
  const aim = { x: spec.x, y: spec.y };
  const refuse = (error: EngineError, blocking: StackRef[] = []): DropResolution => ({
    ...aim,
    ok: false,
    error,
    blocking,
  });

  const cargo = load.cargo.find((c) => c.id === spec.cargoTypeId);
  if (!cargo) return refuse(err('ERR_EDIT_NO_STACK', { cargoTypeId: spec.cargoTypeId }));

  // Position-independent rules first. Nudging cannot fix either, so do not even search.
  if (!allowedOrientations(cargo.rotation).includes(spec.orientation)) {
    return refuse(err('ERR_EDIT_ROTATION', { cargoTypeId: cargo.id, orientation: spec.orientation, rotation: cargo.rotation }));
  }
  if (cargo.forkAccess === 'twoSides') {
    const pinned = forkPinnedOrientation(load.loadingMode ?? 'combined', cargo.forkAxis ?? 'length');
    if (pinned !== null && spec.orientation !== pinned) {
      return refuse(err('ERR_EDIT_FORK_ACCESS', { cargoTypeId: cargo.id, orientation: spec.orientation, loadingMode: load.loadingMode ?? 'combined', forkAxis: cargo.forkAxis ?? 'length' }));
    }
  }

  const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, spec.orientation);
  const maxX = load.vehicle.length - dx;
  const maxY = load.vehicle.width - dy;
  if (maxX < 0 || maxY < 0) {
    return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: cargo.id, dx, dy }));
  }

  const tol = opts.tolerance ?? Math.min(dx, dy) / 2;
  const boxes = floorBoxes(load, layout, opts.exclude);

  // Candidates per axis: the aim itself, both walls, and flush against every neighbour's edges.
  // Filtered to what is inside the hold and within reach of the aim — so the magnet can tidy a near
  // miss but never teleport the stack somewhere the user was not pointing.
  const axis = (aimV: number, size: number, max: number, edges: [number, number][]): number[] => {
    const out = new Set<number>();
    const push = (v: number) => {
      if (v >= 0 && v <= max && Math.abs(v - aimV) <= tol) out.add(v);
    };
    push(aimV);
    push(0);
    push(max);
    for (const [start, extent] of edges) {
      push(start + extent); // our near edge against their far edge
      push(start - size); // our far edge against their near edge
    }
    return [...out];
  };
  const xs = axis(aim.x, dx, maxX, boxes.map((b) => [b.x, b.dx]));
  const ys = axis(aim.y, dy, maxY, boxes.map((b) => [b.y, b.dy]));

  const hits = (x: number, y: number): Box[] =>
    boxes.filter((b) => overlaps1d(x, x + dx, b.x, b.x + b.dx) && overlaps1d(y, y + dy, b.y, b.y + b.dy));

  const touchesX = (v: number) => v === 0 || v === maxX || boxes.some((b) => v === b.x + b.dx || v + dx === b.x);
  const touchesY = (v: number) => v === 0 || v === maxY || boxes.some((b) => v === b.y + b.dy || v + dy === b.y);

  // Flush beats near: a loader parks pallets edge to edge, and a 60 mm gap is neither wanted nor
  // honest about how much still fits. Distance decides among equally flush spots; (x, y) breaks the
  // last tie, so the same drop always resolves the same way.
  let best: { x: number; y: number; flush: number; dist: number } | null = null;
  for (const x of xs) {
    for (const y of ys) {
      if (hits(x, y).length > 0) continue;
      const cand = {
        x,
        y,
        flush: (touchesX(x) ? 1 : 0) + (touchesY(y) ? 1 : 0),
        dist: Math.hypot(x - aim.x, y - aim.y),
      };
      if (
        !best ||
        cand.flush > best.flush ||
        (cand.flush === best.flush &&
          (cand.dist < best.dist ||
            (cand.dist === best.dist && (cand.x < best.x || (cand.x === best.x && cand.y < best.y)))))
      ) {
        best = cand;
      }
    }
  }

  if (best) return { x: best.x, y: best.y, ok: true, blocking: [] };

  // Nothing within reach. Report the aim's own problem — bounds first, as edit.ts does: "does not fit
  // in the truck" is the more fundamental answer than "is on top of that pallet".
  const outside = aim.x < 0 || aim.y < 0 || aim.x > maxX || aim.y > maxY;
  if (outside) return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: cargo.id, x: aim.x, y: aim.y }));
  const blocking = hits(aim.x, aim.y).map(({ cargoTypeId, x, y }) => ({ cargoTypeId, x, y }));
  return refuse(err('ERR_EDIT_OVERLAP', { cargoTypeId: cargo.id, x: aim.x, y: aim.y }), blocking);
}
```

- [ ] **Step 4: Экспорт из ядра**

В `packages/engine/src/index.ts` добавить рядом с экспортом `./packing/edit`:

```ts
export { resolveDrop, type DropResolution, type ResolveDropOptions } from './packing/resolveDrop';
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run packages/engine/src/packing/`
Expected: PASS.

- [ ] **Step 6: ADR 020 + контракт 0.13.0 + версия пакета**

Создать `docs/adr/020-magnet-drop-resolution.md` (контекст → решение → последствия), зафиксировав:
магнит в ядре; `placeStack` остаётся строгим; прижим побеждает близость; позиционно-независимые
правила проверяются однократно (отсюда дешевизна live-подсветки).

В `docs/api-contract.md` — версия `0.13.0` и раздел про `resolveDrop` рядом с §2 «Операции ручной
правки». В `packages/engine/package.json` — `"version": "0.0.8"`.

- [ ] **Step 7: Коммит**

```bash
git add packages/engine docs/adr/020-magnet-drop-resolution.md docs/api-contract.md
git commit -m "feat(engine): resolveDrop — magnet drop resolution (contract 0.13.0, ADR 020)

LKWkalk-crb"
```

---

### Task 2: `warehouseLayout` — раскладка площадки (`LKWkalk-sqj`)

**Files:**
- Create: `apps/web/src/screens/components/warehouseLayout.ts`
- Create: `apps/web/src/screens/components/warehouseLayout.test.ts`

**Interfaces:**
- Consumes: `BufferTile` (переезжает из `BufferStrip.tsx` в `WarehouseFloor.tsx` в Task 4 — до тех пор
  импортировать из `./BufferStrip`); `orientedDims`, `type Load` из `@shadrin-v/engine`.
- Produces:
  ```ts
  export interface PlacedTile { tile: BufferTile; x: number; y: number; dx: number; dy: number }
  export interface WarehouseFloor { tiles: PlacedTile[]; width: number; height: number }
  export function warehouseFloor(load: Load, tiles: BufferTile[], opts?: { width?: number; gap?: number; pad?: number }): WarehouseFloor
  ```

- [ ] **Step 1: Написать падающие тесты**

```ts
import { describe, expect, it } from 'vitest';
import type { Load } from '@shadrin-v/engine';
import { warehouseFloor } from './warehouseLayout';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
const cargo = (id: string, length: number, width: number) => ({
  id, name: id, length, width, height: 144, quantity: 10,
  rotation: 'yawOnly' as const, stacking: { stackable: false }, nesting: { nestable: false },
  state: 'entschachtelt' as const, orderId: 'SO-1',
});
const load: Load = { vehicle: V, cargo: [cargo('a', 1200, 800), cargo('b', 600, 400)] };
const tile = (cargoTypeId: string, units = 1) => ({ cargoTypeId, units, orientation: 'lwh' as const });

describe('warehouseFloor', () => {
  it('is as wide as the hold — the scale is shared by construction', () => {
    expect(warehouseFloor(load, []).width).toBe(V.length);
  });

  it('lays tiles left to right at their real size, separated by the gap', () => {
    const { tiles } = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(tiles[0]).toMatchObject({ x: 200, y: 200, dx: 1200, dy: 800 });
    expect(tiles[1]).toMatchObject({ x: 1600, y: 200 }); // 200 + 1200 + 200
  });

  it('wraps to a new row when the next tile would leave the floor', () => {
    // ширина 3000, pad 200 → полезно 2600; две паллеты 1200 + gap 200 = 2600 → третья переносится
    const narrow: Load = { ...load, vehicle: { ...V, length: 3000 } };
    const { tiles } = warehouseFloor(narrow, [tile('a'), tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(tiles[2].y).toBeGreaterThan(tiles[0].y);
    expect(tiles[2].x).toBe(200); // новый ряд начинается слева
  });

  it('a row is as tall as its tallest tile', () => {
    const narrow: Load = { ...load, vehicle: { ...V, length: 2200 } };
    // ряд 1: a (dy 800) + b (dy 400) не влезут вместе → b переносится и его y = 200 + 800 + 200
    const { tiles } = warehouseFloor(narrow, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    expect(tiles[1].y).toBe(1200);
  });

  it('height covers the content plus padding', () => {
    const { height } = warehouseFloor(load, [tile('a')], { gap: 200, pad: 200 });
    expect(height).toBe(1200); // 200 + 800 + 200
  });

  it('respects each tile orientation', () => {
    const { tiles } = warehouseFloor(load, [{ cargoTypeId: 'a', units: 1, orientation: 'wlh' }]);
    expect(tiles[0]).toMatchObject({ dx: 800, dy: 1200 });
  });

  it('handles an empty buffer', () => {
    expect(warehouseFloor(load, [])).toMatchObject({ tiles: [], height: 0 });
  });

  it('is deterministic', () => {
    const build = () => warehouseFloor(load, [tile('a'), tile('b'), tile('a')]);
    expect(build()).toEqual(build());
  });
});
```

- [ ] **Step 2: Убедиться, что падает.** Run: `npx vitest run apps/web/src/screens/components/warehouseLayout.test.ts` → FAIL (модуля нет).

- [ ] **Step 3: Реализация**

```ts
// Where the buffer's stacks stand on the warehouse floor (LKWkalk-sqj). Rows left to right, wrapping
// at the floor's width; the floor grows downwards to fit.
//
// This is screen arrangement, not domain: the core knows about holds and columns, not about strips
// and wrapping. It lives here with cutaway.ts and orderBreakdown.ts, and stays a pure function so it
// can be tested without a DOM.
//
// The floor is exactly as wide as the hold, and both SVGs render at width:100% inside the same
// column — that is what makes the 1:1 scale hold, with no measuring in JS.
import { orientedDims, type Load } from '@shadrin-v/engine';
import type { BufferTile } from './BufferStrip';

export interface PlacedTile {
  tile: BufferTile;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface WarehouseFloor {
  tiles: PlacedTile[];
  /** mm — always the vehicle length, so the floor shares the top view's scale. */
  width: number;
  /** mm — grows with the content; 0 when the buffer is empty. */
  height: number;
}

const GAP = 200;
const PAD = 200;

export function warehouseFloor(
  load: Load,
  tiles: BufferTile[],
  opts: { width?: number; gap?: number; pad?: number } = {},
): WarehouseFloor {
  const width = opts.width ?? load.vehicle.length;
  const gap = opts.gap ?? GAP;
  const pad = opts.pad ?? PAD;
  const byId = new Map(load.cargo.map((c) => [c.id, c]));

  const out: PlacedTile[] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const tile of tiles) {
    const c = byId.get(tile.cargoTypeId);
    if (!c) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, tile.orientation);
    if (x > pad && x + dx > width - pad) {
      x = pad;
      y += rowH + gap;
      rowH = 0;
    }
    out.push({ tile, x, y, dx, dy });
    x += dx + gap;
    rowH = Math.max(rowH, dy);
  }
  return { tiles: out, width, height: out.length === 0 ? 0 : y + rowH + pad };
}
```

- [ ] **Step 4: Тесты зелёные.** Run: `npx vitest run apps/web/src/screens/components/warehouseLayout.test.ts`

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/components/warehouseLayout.ts apps/web/src/screens/components/warehouseLayout.test.ts
git commit -m "feat(web): warehouseFloor — row-wrapping layout for the 1:1 warehouse

LKWkalk-sqj"
```

---

### Task 3: `StackShape` — общий примитив (`LKWkalk-rue`)

**Files:**
- Create: `apps/web/src/screens/components/StackShape.tsx`
- Modify: `apps/web/src/screens/components/CrossSection.tsx` (использовать примитив)
- Test: покрыт существующими тестами `CrossSection.test.tsx` (регресс: вид не меняется)

**Interfaces:**
- Produces:
  ```ts
  export function StackShape(props: {
    x: number; y: number; w: number; h: number; series: number;
    /** Приглушить заливку и штриховку (дальний ряд вида сбоку). Контур не гасится никогда. */
    muted?: boolean;
    /** Шаг штриховки в тех же единицах, что и координаты (мм). */
    hatchSpacing?: number;
  }): JSX.Element
  ```

Рендерит ровно то, что сегодня рендерят строки 200-203 `CrossSection.tsx`: заливка `fillOpacity`
(0.16 / 0.06 при `muted`), `HatchMarks` (`opacity` 0.8 / 0.25), контур `strokeWidth 1.5`
`vectorEffect="non-scaling-stroke"`.

- [ ] **Step 1: Создать компонент** (код — как в блоке выше, вынести из `CrossSection`).
- [ ] **Step 2: Заменить в `CrossSection`** три элемента на `<StackShape x={r.x} y={r.y} w={r.w} h={r.h} series={r.series} muted={behind} hatchSpacing={180} />`.
- [ ] **Step 3: Тесты.** Run: `npx vitest run apps/web/src/screens/components/` → PASS без правок ожиданий (это рефакторинг: вид не меняется). Тест D2 из плана A проверяет `rect:first-child` / последний `rect` внутри группы — `StackShape` обязан сохранить этот порядок узлов.
- [ ] **Step 4: Коммит**

```bash
git add apps/web/src/screens/components/StackShape.tsx apps/web/src/screens/components/CrossSection.tsx
git commit -m "refactor(web): extract StackShape — one stack look for hold and warehouse

LKWkalk-rue"
```

---

### Task 4: `WarehouseFloor` + `ForkliftMark` + i18n (`LKWkalk-wxi`)

**Files:**
- Create: `apps/web/src/screens/components/WarehouseFloor.tsx` (заменяет `BufferStrip.tsx`)
- Create: `apps/web/src/screens/components/ForkliftMark.tsx`
- Create: `apps/web/src/screens/components/WarehouseFloor.test.tsx`
- Delete: `apps/web/src/screens/components/BufferStrip.tsx`
- Modify: `packages/i18n/src/keys.ts`, `keys.test.ts`, `dictionaries/de.ts`, `dictionaries/ru.ts`
- Modify: `apps/web/src/screens/LadeplanScreen.tsx` (импорт)

**Ключевые требования (из спеки §4.4):**
- `viewBox="0 0 {vehicle.length} {height}"`, `width="100%"` — **тест сторожит равенство ширины**.
- Плитка = `StackShape` + `×N` + `<title>` с именем типа. Никаких карточек, имён и кнопок.
- Клик выделяет → `RotateHandle` (как в кузове). `tabIndex={0}`, Enter/Space выделяет — **иначе,
  убрав кнопку `⟳`, мы теряем поворот с клавиатуры**.
- Порог `CLICK_SLOP_MM` отличает клик от перетаскивания.
- `ForkliftMark` — вид сверху, 1:1, `pointer-events: none`, `aria-hidden`, бледный.
- `print:hidden`, без `data-cutaway` (PNG его не видит).
- Пустой буфер → компактная строка «Всё размещено», площадка не рисуется.
- Ключи `buffer.*` → `warehouse.*`; DE «Lager», RU «Склад».

- [ ] **Step 1: Тесты** — `viewBox` по ширине === `vehicle.length`; плитка несёт `×N` и `<title>`;
  Enter на плитке выделяет и показывает ручку поворота; пустой буфер не рисует SVG.
- [ ] **Step 2: Убедиться, что падают.**
- [ ] **Step 3: Реализация** (`ForkliftMark`: корпус ≈2300×1150 мм, вилы ≈1200 мм, `fill` в `var(--line)`
  с низкой прозрачностью).
- [ ] **Step 4: Тесты зелёные + `npx vitest run packages/i18n`** (словари полны).
- [ ] **Step 5: Коммит** — `feat(web): WarehouseFloor — the buffer becomes a 1:1 warehouse floor (LKWkalk-wxi)`

---

### Task 5: Живая подсветка (`LKWkalk-3kr`)

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx` (проп `preview`, свой drag через `resolveDrop`)
- Modify: `apps/web/src/screens/LadeplanScreen.tsx` (drag плитки → `resolveDrop` → призрак → `placeStack`)
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Consumes: `resolveDrop`, `DropResolution` из `@shadrin-v/engine`.
- Produces: у `CrossSection` — новый необязательный проп
  ```ts
  preview?: { x: number; y: number; dx: number; dy: number; ok: boolean; blocking: StackRef[] } | null
  ```

**Требования:** призрак на **примагниченном** месте зелёным при `ok`; на прицеле красным при отказе +
красный контур каждой стопки из `blocking`. Отпускание применяет **ровно показанное** (`placeStack`
по `preview.x/y`), иначе подсветка врёт. Без rAF-троттлинга (обоснование — спека §3).

- [ ] **Step 1: Тесты** — при `ok` призрак `stroke` брендово-зелёный на `(x, y)` резолюции; при отказе
  призрак красный на прицеле и у стопки из `blocking` появляется красный контур.
- [ ] **Step 2: Убедиться, что падают.**
- [ ] **Step 3: Реализация.**
- [ ] **Step 4: Тесты зелёные.**
- [ ] **Step 5: Коммит** — `feat(web): live green/red drop preview (LKWkalk-3kr)`

---

### Task 6: Порядок секций + подпись PNG (`LKWkalk-91u`)

**Files:**
- Modify: `apps/web/src/screens/LadeplanScreen.tsx:385-418` (порядок), `:257-283` (`handleExportPng`)
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx`

- [ ] **Step 1: Тесты** — (а) порядок в DOM: `data-cutaway="side"` идёт раньше `data-cutaway="top"`,
  склад — последним; (б) подпись PNG берётся из `data-cutaway`: замокать `exportPlanPng` и проверить,
  что `sections[0].caption` === подпись вида сбоку.
- [ ] **Step 2: Убедиться, что падают** — (б) упадёт: сегодня `captions[0]` — «Вид сверху».
- [ ] **Step 3: Реализация.** Порядок: сбоку → сверху (+ ПЕРЁД/ЗАД) → склад. В `handleExportPng`:

```ts
const captionOf: Record<string, string> = { top: tt('ladeplan.top'), side: tt('ladeplan.side') };
// …
sections: svgs.map((svg) => ({ caption: captionOf[svg.dataset.cutaway ?? ''] ?? '', svg })),
```

- [ ] **Step 4: Тесты зелёные.**
- [ ] **Step 5: Коммит** — `feat(web): side view first; PNG captions come from data-cutaway (LKWkalk-91u)`

---

### Task 7: D1 + D3 — цифры один раз (`LKWkalk-5i4`)

**Files:**
- Delete: `apps/web/src/screens/components/Metrics.tsx`, `Metrics.test.tsx` (если есть)
- Modify: `apps/web/src/screens/LadeplanScreen.tsx` (пятая фигура, импорт, подписи)
- Modify: `packages/i18n/src/keys.ts`, `keys.test.ts`, `dictionaries/{de,ru}.ts`

**Требования (спека §4.8):** полоса переиспользует `results.floorFillPercent` и
`results.volumeFillPercent`; `ladeplan.fig.load` и `results.unplaced` снимаются из `keys.ts`,
`keys.test.ts` и обоих словарей. `Metrics` удаляется целиком (проверено: импортируется только листом).

- [ ] **Step 1: Тест** — мета-полоса несёт пять фигур, включая объём; `Metrics` на листе нет.
- [ ] **Step 2: Убедиться, что падает.**
- [ ] **Step 3: Реализация.**
- [ ] **Step 4: Тесты зелёные + `npx vitest run packages/i18n`.**
- [ ] **Step 5: Коммит** — `feat(web): one source for the figures — Metrics folds into the meta band (LKWkalk-5i4, D1+D3)`

---

### Task 8: Гейты, Chrome, merge, выкат

- [ ] **Step 1: Пересобрать пакеты** — `npm run build --workspace packages/engine && npm run build --workspace packages/i18n`
- [ ] **Step 2: Гейты** — `npm test` · `npm run lint` · `npm run typecheck` · `npm run build --workspace apps/web`. Эталоны EUR 34 / GB 20 / none 33 не шелохнулись.
- [ ] **Step 3: Chrome** (jsdom не умеет ни вёрстку, ни canvas). Круг: вынуть стопку → склад →
  примагнитить в щель → поставить. Совпадение масштаба: паллета в кузове и на складе одного размера
  в пикселях. Прокрутка склада при переполнении. **Перед drag — `scrollIntoView`.**
- [ ] **Step 4: Merge** (по отдельности, НЕ через `&&`):
  ```bash
  git checkout main
  git merge feat/warehouse-magnet
  git push origin main
  ```
- [ ] **Step 5: Выкат** — `git push origin main:production`; проверка: `git ls-remote origin production` == HEAD И имя `/assets/index-*.js` на проде сменилось (возможна гонка ~20 с: ассет 404 → SPA-фолбэк ~460 байт).
- [ ] **Step 6: Закрыть беды** — `bd close LKWkalk-crb LKWkalk-sqj LKWkalk-rue LKWkalk-wxi LKWkalk-3kr LKWkalk-91u LKWkalk-5i4 LKWkalk-a5b`, затем `bd dolt push`.
- [ ] **Step 7: CHANGELOG** — запись за 2026-07-17 про склад, магнит и D1+D3.

---

## Self-Review

**Покрытие спеки:**
- §4.1 порядок секций + подпись PNG → Task 6 ✓
- §4.2 масштаб 1:1 без измерений → Task 2 (`width` = `vehicle.length`) + Task 4 (тест на `viewBox`) ✓
- §4.3 раскладка площадки → Task 2 ✓
- §4.4 плитка как в кузове, клавиатура → Task 3 (примитив) + Task 4 ✓
- §4.5 погрузчик 1:1 → Task 4 ✓
- §4.6 `resolveDrop` → Task 1 ✓
- §4.7 живая подсветка → Task 5 ✓
- §4.8 D1+D3 → Task 7 ✓
- §4.9 имя (`warehouse.*`, `Lager`/«Склад») → Task 4 ✓
- §5 контракт 0.13.0, ADR 020, пакет 0.0.8 → Task 1 ✓
- §6 тесты 1-11 → Task 1; 12 → Task 2; 13, 17 → Task 4; 14, 15 → Task 6; 16 → Task 5; 18 → Task 7;
  Chrome → Task 8 ✓

**Расхождение со спекой, разрешённое здесь:** спека, тест 9 требует «если `resolveDrop` вернул `ok`,
`placeStack` не отказывает». `resolveDrop` намеренно **не** проверяет наличие свободных единиц
(`ERR_EDIT_NOTHING_TO_PLACE`) — это не вопрос позиции и бессмыслен при переносе. Поэтому тест
формулируется на раскладке, где единицы есть (`unplaced: 5`), а граница ответственности
зафиксирована в doc-комментарии `resolveDrop.ts`. Инвариант «подсветка не врёт» соблюдён: UI тащит
плитку, которая в буфере уже лежит.

**Плейсхолдеры:** в Task 1-3, 6, 7 код полный. Task 4 и 5 описаны требованиями и интерфейсами без
полного кода компонентов — они крупные, и их форма зависит от того, как ляжет `StackShape` (Task 3);
писать их код вперёд Task 3 значит писать его дважды. Все требования проверяемы, все интерфейсы
и все ключи названы точно.

**Согласованность типов:** `BufferTile` в Task 2 импортируется из `./BufferStrip`, а в Task 4 файл
удаляется — **Task 4 обязан перенести `BufferTile` в `WarehouseFloor.tsx` и починить импорт в
`warehouseLayout.ts`**. `StackRef` — из ядра, единое имя во всех задачах. `DropResolution.blocking` —
`StackRef[]`, тот же тип, что принимает `preview.blocking` в Task 5. `warehouseFloor` (функция) и
`WarehouseFloor` (компонент, Task 4) — разные файлы, коллизии имён нет, но в `LadeplanScreen`
импортируются оба: функция как `warehouseFloor`, компонент как `WarehouseFloor`.
