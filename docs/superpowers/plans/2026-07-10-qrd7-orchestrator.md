# qrd.7 — Оркестратор упаковки Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Собрать `packLoad(load): Layout` — зоны по orderId, распределение заявки (fill/quantity), floor+vertical → per-tier placements, unplaced; + модель (orderId/loadingMode), контракт 0.4.0 в коде, геометрия column-aware.

**Architecture:** Новый `packing/orchestrator.ts`. Опирается на `packFloor` (qrd.4), `computeVerticalStack` (qrd.5), `findGeometryViolations` (qrd.9, делается column-aware). Внутренний модуль; публичный API — qrd.10.

**Tech Stack:** TypeScript (изоморфный), Vitest, fast-check.

## Global Constraints
- Целые мм; детерминизм (без `Math.random`/`Date`); изоморфность.
- **Геометрия-валидатор на КАЖДОМ результате упаковки** (property + по-кейсам) — не срезать.
- `full`≈yaw и правила nesting/stacking/rotation не нарушаются (наследуются).
- Column-aware ([ADR 014](../../adr/014-nested-column-geometry.md)): вертикальное перекрытие законно только для пары с одинаковыми `(x,y,cargoTypeId)`.
- `loadingMode` дефолт `rear`; зоны смежны по длине, порядок = первое появление orderId; типы в зоне — порядок списка; не влезает целиком → остаток в `unplaced`.
- `orchestrator.ts` НЕ в публичном `index.ts`.
- Из корня: `npx vitest run <path>`; `npm test`; `npm run typecheck`; `npm run lint`. Коммиты атомарные после зелёных гейтов.

**Источник истины:** [spec](../specs/2026-07-10-qrd7-orchestrator-design.md), [ADR 011](../../adr/011-order-grouping.md)/[012](../../adr/012-loading-modes.md)/[014](../../adr/014-nested-column-geometry.md).

---

### Task 1: Модель — orderId, loadingMode, контракт 0.4.0

**Files:** Modify `packages/engine/src/model/constants.ts`, `model/types.ts`, `src/index.ts`; Test `model/types.test.ts`, `src/index.test.ts`.

**Interfaces produced:** `type LoadingMode = 'rear'|'side'|'combined'` (constants); `CargoType.orderId?: string`; `Load.loadingMode?: LoadingMode`; `ENGINE_CONTRACT_VERSION === '0.4.0'`.

- [ ] **Step 1: Failing tests.** In `src/index.test.ts` add: `expect(ENGINE_CONTRACT_VERSION).toBe('0.4.0')`. In `model/types.test.ts` add a case constructing a `CargoType` with `orderId: 'A'` and a `Load` with `loadingMode: 'rear'` (type-level; assert the object round-trips, e.g. `expect(load.loadingMode).toBe('rear')`).
- [ ] **Step 2: Run — fail** (`0.2.0 !== 0.4.0`; unknown props). `npx vitest run packages/engine/src/index.test.ts packages/engine/src/model/types.test.ts`.
- [ ] **Step 3: Implement.**
  - `constants.ts`: add `export const LOADING_MODES = ['rear','side','combined'] as const; export type LoadingMode = (typeof LOADING_MODES)[number];`
  - `types.ts`: import `LoadingMode`; add `orderId?: string;` to `CargoType` (near `state`); add `loadingMode?: LoadingMode;` to `Load` (after `clearance`).
  - `index.ts`: `export const ENGINE_CONTRACT_VERSION = '0.4.0';`
- [ ] **Step 4: Run — pass.** Then `npm run typecheck` + `npm run lint`.
- [ ] **Step 5: Commit** `feat(engine): model orderId + loadingMode, contract 0.4.0 (qrd.7)`.

---

### Task 2: Геометрия column-aware (ADR 014)

**Files:** Modify `packages/engine/src/geometry/geometry.ts`; Test `geometry/geometry.test.ts`.

**Interfaces:** `findGeometryViolations` signature unchanged; overlap rule refined.

- [ ] **Step 1: Failing test.** In `geometry.test.ts`: two placements SAME `cargoTypeId`, same `x,y`, `z=0` and `z=step` (overlapping) with `state:'verschachtelt'` → `findGeometryViolations` returns `[]` (nested column, legal). A second case: two placements DIFFERENT `cargoTypeId` overlapping at same x,y,z → still returns an `overlap` violation. (Build minimal `Load`/`Layout`; vehicle large enough for bounds.)
- [ ] **Step 2: Run — fail** (current validator flags the nested pair). `npx vitest run packages/engine/src/geometry/geometry.test.ts`.
- [ ] **Step 3: Implement.** In the overlap double-loop, skip pairs that are the same column: before pushing an `overlap`, `if (a.p.x === b.p.x && a.p.y === b.p.y && a.p.cargoTypeId === b.p.cargoTypeId) continue;`
- [ ] **Step 4: Run — pass** (new + all existing 6 geometry tests green). `npm run typecheck` + `npm run lint`.
- [ ] **Step 5: Commit** `feat(engine): geometry validator column-aware for nested/stacked columns (ADR 014, qrd.7)`.

---

### Task 3: Колонка → per-tier placements

**Files:** Create `packages/engine/src/packing/orchestrator.ts` (start); Test `packing/orchestrator.test.ts`.

**Interfaces produced:** `columnPlacements(cargo: CargoType, x: number, y: number, orientation: Placement['orientation'], units: number): Placement[]` (exported for testing).

- [ ] **Step 1: Failing test.** `entschachtelt` cargo H=1000, `units=2`, x=100,y=50,orientation='lwh' → 2 placements at `z=0` (tier1) and `z=1000` (tier2), both `state:'entschachtelt'`, x=100,y=50. `verschachtelt` cargo H=144, stepHeight=22, units=3 → z=0,22,44, tiers 1..3.
- [ ] **Step 2: Run — fail** (import missing).
- [ ] **Step 3: Implement** in `orchestrator.ts`:
```ts
import type { CargoType, Layout, Load, Placement, UnplacedCount } from '../model/index';
import { ENGINE_CONTRACT_VERSION } from '../index';
import { packFloor, type FloorRequest } from './floor';
import { computeVerticalStack } from './vertical';

/** Per-tier placements for one floor column. dz = H (entschachtelt) or stepHeight (nested). */
export function columnPlacements(
  cargo: CargoType, x: number, y: number, orientation: Placement['orientation'], units: number,
): Placement[] {
  const dz = cargo.state === 'entschachtelt' ? cargo.height : (cargo.nesting.stepHeight ?? cargo.height);
  const out: Placement[] = [];
  for (let t = 0; t < units; t++) {
    out.push({ cargoTypeId: cargo.id, x, y, z: t * dz, orientation, tier: t + 1, state: cargo.state });
  }
  return out;
}
```
- [ ] **Step 4: Run — pass.** typecheck + lint.
- [ ] **Step 5: Commit** `feat(engine): column→per-tier placements helper (qrd.7)`.

---

### Task 4: Оркестратор packLoad (зоны + распределение + сборка)

**Files:** Modify `packing/orchestrator.ts`; Test `packing/orchestrator.test.ts`.

**Interfaces produced:** `packLoad(load: Load): Layout`.

- [ ] **Step 1: Failing tests** (append):
  - **Trivial (CLAUDE.md):** vehicle `2×2×2`, one cargo `1×1×1` (rotation none, entschachtelt, stackable, quantity 100) → `metrics.totalPlaced === 8`, `findGeometryViolations(load, layout) === []`.
  - **fill:** vehicle small, cargo `fill:true` → places capacity, `unplaced` empty; a quantity that exceeds capacity → `unplaced` has the remainder; totalPlaced ≤ Σquantity.
  - **nothing fits:** cargo bigger than vehicle → placements empty, all in `unplaced`.
  - **zones:** two types with `orderId:'A'` and `orderId:'B'` → all B-placements have `x ≥` max A-placement x (adjacent along length, A first); `findGeometryViolations === []`.
  - **loadingMode default rear:** homogeneous load default → arrangement grows along x (rear).
  - **property (fast-check):** random `Load` → `findGeometryViolations(load, packLoad(load)) === []`; `totalPlaced ≤ Σ quantity`; `packLoad(load)` deep-equals a second call (determinism). Build cargo with small dims, random rotation/state/orderId, vehicle bounds.
- [ ] **Step 2: Run — fail** (`packLoad` undefined).
- [ ] **Step 3: Implement** `packLoad` in `orchestrator.ts`:
```ts
function zonesOf(cargo: CargoType[]): CargoType[][] {
  const order: (string | undefined)[] = [];
  const map = new Map<string | undefined, CargoType[]>();
  for (const c of cargo) {
    if (!map.has(c.orderId)) { map.set(c.orderId, []); order.push(c.orderId); }
    map.get(c.orderId)!.push(c);
  }
  return order.map((k) => map.get(k)!);
}

export function packLoad(load: Load): Layout {
  const { vehicle } = load;
  const clearance = load.clearance ?? 0;
  const loadingMode = load.loadingMode ?? 'rear';
  const placements: Placement[] = [];
  const placedByType = new Map<string, number>();
  let usedFloorPositions = 0;
  let xOffset = 0;

  for (const zone of zonesOf(load.cargo)) {
    const region = { length: vehicle.length - xOffset, width: vehicle.width };
    if (region.length <= 0) break;
    // vertical capacity per type
    const stackOf = new Map<string, number>();
    const requests: FloorRequest[] = [];
    const fillReqs: FloorRequest[] = [];
    for (const c of zone) {
      const S = computeVerticalStack(c, vehicle.height).count;
      stackOf.set(c.id, S);
      if (S <= 0) continue;
      const req: FloorRequest = { cargoTypeId: c.id, length: c.length, width: c.width, rotation: c.rotation,
        count: c.fill ? 1_000_000 : Math.ceil(c.quantity / S) };
      (c.fill ? fillReqs : requests).push(req);
    }
    const fps = packFloor(region, [...requests, ...fillReqs], { clearance, loadingMode });
    // remaining quantity per type (fill = Infinity)
    const remaining = new Map<string, number>();
    for (const c of zone) remaining.set(c.id, c.fill ? Number.POSITIVE_INFINITY : c.quantity);
    let maxX = 0;
    for (const fp of fps) {
      const c = zone.find((z) => z.id === fp.cargoTypeId)!;
      const S = stackOf.get(fp.cargoTypeId)!;
      const rem = remaining.get(fp.cargoTypeId)!;
      const units = Math.min(S, rem);
      if (units <= 0) continue;
      remaining.set(fp.cargoTypeId, rem - units);
      placements.push(...columnPlacements(c, fp.x + xOffset, fp.y, fp.orientation, units));
      placedByType.set(fp.cargoTypeId, (placedByType.get(fp.cargoTypeId) ?? 0) + units);
      usedFloorPositions++;
      maxX = Math.max(maxX, fp.x + fp.dx);
    }
    xOffset += maxX + (maxX > 0 ? clearance : 0);
  }

  const unplaced: UnplacedCount[] = [];
  for (const c of load.cargo) {
    if (c.fill) continue;
    const placed = placedByType.get(c.id) ?? 0;
    if (placed < c.quantity) unplaced.push({ cargoTypeId: c.id, count: c.quantity - placed });
  }
  const totalPlaced = [...placedByType.values()].reduce((a, b) => a + b, 0);
  return {
    placements, unplaced,
    metrics: { totalPlaced, usedFloorPositions, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: ENGINE_CONTRACT_VERSION,
  };
}
```
Note: a `cargoTypeId` may appear in only one zone (orderId groups it), so `zone.find` is safe. If the same type id repeats across zones with different orderId, `placedByType`/`remaining` per zone still work (remaining is per-zone here; unplaced uses global quantity vs global placed — acceptable since a type belongs to one orderId group).
- [ ] **Step 4: Run — pass** (all cases + property). `npm test` (full suite green), `npm run typecheck`, `npm run lint`.
- [ ] **Step 5: Commit** `feat(engine): packLoad orchestrator — zones, fill/quantity, floor+vertical, Layout (qrd.7)`.

---

## После плана
- Закрыть `LKWkalk-qrd.7`. Разблокирует qrd.8 (метрики: заполнить проценты) → qrd.10 (публичный API) → qrd.13 (UI).
- Whole-branch review (директива: для qrd.7 обязателен) перед merge в main.
