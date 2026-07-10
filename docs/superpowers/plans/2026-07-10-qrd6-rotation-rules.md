# qrd.6 — Правила вращения (none/yawOnly/full) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Централизовать маппинг «режим вращения → ориентации» в один модуль и переключить на него geometry, validation и packer; зафиксировать семантику трёх режимов тестами.

**Architecture:** Новый чистый модуль `model/orientation.ts` — единственный источник: `allowedOrientations` (номинально, full→6), `floorOrientations` (MVP-упаковщик, full≈yaw), `orientedDims` (ось-маппинг). Три текущие копии (geometry, validate, floor) заменяются вызовами модуля — поведение не меняется. Плюс выделенные тесты режимов в упаковщике.

**Tech Stack:** TypeScript (изоморфный), Vitest.

## Global Constraints

- Целые миллиметры; детерминизм (без `Math.random`/`Date`); изоморфность (без DOM/Node/fs).
- **Рефактор поведение НЕ меняет.** Существующие тесты `geometry.test.ts`, `validate.test.ts`, `floor.test.ts` — сеть безопасности; должны остаться зелёными без правок ожиданий.
- `full` ≈ yaw в упаковщике; переворот на грань — вне MVP ([ADR 013](../../adr/013-rotation-mvp-yaw.md)). Валидация лояльна: `allowedOrientations('full')` = 6 ориентаций.
- `model/orientation.ts` НЕ добавляется в публичный `packages/engine/src/index.ts`; потребители импортируют его напрямую (`../model/orientation`).
- Контракт не меняется (`RotationRule`/`Orientation` те же; версия 0.4.0).
- `allowedOrientations('full')` обязан давать ровно `['lwh','wlh','lhw','hlw','whl','hwl']` (= `ORIENTATIONS`), чтобы производные триплеты в `validate` совпали с прежними.
- Тесты из корня: `npx vitest run <path>`; полный прогон `npm test`; `npm run typecheck`; `npm run lint`.
- Коммиты атомарные после зелёных тестов; git-политика conservative.

**Источник истины:** [spec](../specs/2026-07-10-qrd6-rotation-rules-design.md), [ADR 013](../../adr/013-rotation-mvp-yaw.md).

---

### Task 1: Модуль `model/orientation.ts`

**Files:**
- Create: `packages/engine/src/model/orientation.ts`
- Test: `packages/engine/src/model/orientation.test.ts`

**Interfaces:**
- Consumes: `Orientation`, `RotationRule`, `ORIENTATIONS` из `./constants`.
- Produces:
  - `allowedOrientations(rotation: RotationRule): Orientation[]`
  - `floorOrientations(rotation: RotationRule): Array<'lwh' | 'wlh'>`
  - `orientedDims(l: number, w: number, h: number, orientation: Orientation): [number, number, number]`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/model/orientation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allowedOrientations, floorOrientations, orientedDims } from './orientation';

describe('allowedOrientations (notional, ADR 013)', () => {
  it('none -> [lwh]', () => expect(allowedOrientations('none')).toEqual(['lwh']));
  it('yawOnly -> [lwh, wlh]', () => expect(allowedOrientations('yawOnly')).toEqual(['lwh', 'wlh']));
  it('full -> all six in canonical order', () =>
    expect(allowedOrientations('full')).toEqual(['lwh', 'wlh', 'lhw', 'hlw', 'whl', 'hwl']));
});

describe('floorOrientations (MVP packer, full ≈ yaw)', () => {
  it('none -> [lwh]', () => expect(floorOrientations('none')).toEqual(['lwh']));
  it('yawOnly -> [lwh, wlh]', () => expect(floorOrientations('yawOnly')).toEqual(['lwh', 'wlh']));
  it('full -> [lwh, wlh] (tipping deferred)', () =>
    expect(floorOrientations('full')).toEqual(['lwh', 'wlh']));
});

describe('orientedDims (axis mapping l/w/h -> x/y/z)', () => {
  const l = 100;
  const w = 200;
  const h = 300;
  it('lwh -> [l, w, h]', () => expect(orientedDims(l, w, h, 'lwh')).toEqual([100, 200, 300]));
  it('wlh -> [w, l, h]', () => expect(orientedDims(l, w, h, 'wlh')).toEqual([200, 100, 300]));
  it('lhw -> [l, h, w]', () => expect(orientedDims(l, w, h, 'lhw')).toEqual([100, 300, 200]));
  it('hlw -> [h, l, w]', () => expect(orientedDims(l, w, h, 'hlw')).toEqual([300, 100, 200]));
  it('whl -> [w, h, l]', () => expect(orientedDims(l, w, h, 'whl')).toEqual([200, 300, 100]));
  it('hwl -> [h, w, l]', () => expect(orientedDims(l, w, h, 'hwl')).toEqual([300, 200, 100]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/src/model/orientation.test.ts`
Expected: FAIL — `Failed to resolve import "./orientation"`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/engine/src/model/orientation.ts`:

```ts
// Rotation → orientation mapping (single source; ADR 013). Consumed by geometry, validation, packing.
import { type Orientation, type RotationRule, ORIENTATIONS } from './constants';

/**
 * Orientations a rotation rule notionally permits. Lenient: `full` → all six (used by validation's
 * vehicle-fit check and by the geometry validator). The MVP packer uses only the yaw subset — see
 * `floorOrientations`.
 */
export function allowedOrientations(rotation: RotationRule): Orientation[] {
  switch (rotation) {
    case 'none':
      return ['lwh'];
    case 'yawOnly':
      return ['lwh', 'wlh'];
    case 'full':
      return [...ORIENTATIONS];
    default:
      return [];
  }
}

/**
 * Floor (yaw) orientations the MVP packer may place. `full` is treated as yaw — tipping onto a face
 * is deferred post-MVP (ADR 013), so `full` and `yawOnly` return the same set here.
 */
export function floorOrientations(rotation: RotationRule): Array<'lwh' | 'wlh'> {
  return rotation === 'none' ? ['lwh'] : ['lwh', 'wlh'];
}

/** Map an orientation (axis order l/w/h → x/y/z) to (dx, dy, dz) from base length/width/height. */
export function orientedDims(
  l: number,
  w: number,
  h: number,
  orientation: Orientation,
): [number, number, number] {
  const src = { l, w, h };
  const axes = orientation.split('') as Array<'l' | 'w' | 'h'>;
  return [src[axes[0]], src[axes[1]], src[axes[2]]];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/model/orientation.test.ts`
Expected: PASS (12 tests). Then `npm run typecheck` → 0 ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/model/orientation.ts packages/engine/src/model/orientation.test.ts
git commit -m "feat(engine): shared rotation→orientation module (qrd.6)"
```

---

### Task 2: Рефактор `geometry.ts` и `validate.ts` на общий модуль

**Files:**
- Modify: `packages/engine/src/geometry/geometry.ts`
- Modify: `packages/engine/src/validation/validate.ts`
- Safety net (no change): `packages/engine/src/geometry/geometry.test.ts`, `packages/engine/src/validation/validate.test.ts`

**Interfaces:**
- Consumes: `allowedOrientations`, `orientedDims` из `../model/orientation` (Task 1).
- Produces: без изменений публичной поверхности (`findGeometryViolations`, `assertValidGeometry`, `validateLoad` — прежние сигнатуры и поведение).

This is a behavior-preserving refactor: no new test is written first; the existing `geometry.test.ts` and `validate.test.ts` are the safety net that must stay green.

- [ ] **Step 1: Refactor `geometry.ts`**

In `packages/engine/src/geometry/geometry.ts`:

Replace the import line 1:
```ts
import type { CargoType, Layout, Load, Orientation, Placement, RotationRule } from '../model/index';
```
with:
```ts
import type { CargoType, Layout, Load, Placement } from '../model/index';
import { allowedOrientations, orientedDims } from '../model/orientation';
```

Delete the local `orientedDims` function (the `/** Map an orientation string ... */` block) and the local `allowedOrientations` function (the `function allowedOrientations(rotation: RotationRule) { switch ... }` block) entirely.

Update the call site inside `findGeometryViolations` from:
```ts
    const [dx, dy, dz] = orientedDims(c, p.orientation);
```
to:
```ts
    const [dx, dy, dz] = orientedDims(c.length, c.width, c.height, p.orientation);
```

(The `allowedOrientations(c.rotation).includes(p.orientation)` call stays as-is — it now resolves to the imported function.)

- [ ] **Step 2: Refactor `validate.ts`**

In `packages/engine/src/validation/validate.ts`, add after line 2:
```ts
import { allowedOrientations, orientedDims } from '../model/orientation';
```

Replace the entire `orientationTriples` function (lines 8–31) with:
```ts
/** Footprint/height triples (dx, dy, dz) the cargo may occupy under its rotation rule. */
function orientationTriples(cargo: CargoType): Array<[number, number, number]> {
  return allowedOrientations(cargo.rotation).map((o) =>
    orientedDims(cargo.length, cargo.width, cargo.height, o),
  );
}
```

- [ ] **Step 3: Run the safety-net suites (must stay green)**

Run: `npx vitest run packages/engine/src/geometry/geometry.test.ts packages/engine/src/validation/validate.test.ts`
Expected: PASS — identical results to before the refactor (behavior preserved). Then `npm run typecheck` (0 errors) and `npm run lint` (0 errors — confirm no now-unused imports remain in either file).

If any test fails, the refactor changed behavior — revert the diverging edit and re-check against the original logic (esp. that `allowedOrientations('full')` order matches the old hardcoded triples).

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/geometry/geometry.ts packages/engine/src/validation/validate.ts
git commit -m "refactor(engine): geometry + validation use shared rotation module (qrd.6)"
```

---

### Task 3: `floor.ts` на `floorOrientations` + тесты режимов

**Files:**
- Modify: `packages/engine/src/packing/floor.ts`
- Test: `packages/engine/src/packing/floor.test.ts`

**Interfaces:**
- Consumes: `floorOrientations` из `../model/orientation` (Task 1); `packFloor`, `eur`, `REGION`, `FloorRequest` уже в `floor.ts`/`floor.test.ts`.
- Produces: `chooseOrientation` без изменения сигнатуры/поведения (теперь yaw-решение берётся из `floorOrientations`).

- [ ] **Step 1: Write the failing tests (rotation modes in the packer)**

Append to `packages/engine/src/packing/floor.test.ts`:

```ts
describe('packFloor — rotation modes (qrd.6)', () => {
  it('full is treated as yaw: EUR full -> 34 in wlh', () => {
    const eurFull: FloorRequest = { ...eur(), rotation: 'full' };
    const out = packFloor(REGION, [eurFull], { loadingMode: 'side' });
    expect(out).toHaveLength(34);
    expect(out.every((p) => p.orientation === 'wlh')).toBe(true);
  });

  it('none never changes orientation (every placement lwh)', () => {
    const eurNone: FloorRequest = { ...eur(), rotation: 'none' };
    const out = packFloor(REGION, [eurNone], { loadingMode: 'side' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.orientation === 'lwh')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass against current code**

Run: `npx vitest run packages/engine/src/packing/floor.test.ts -t "rotation modes"`
Expected: PASS — the current `chooseOrientation` already treats `full` as yaw (`canYaw = yawOnly || full`) and `none` as `lwh`. These tests pin that behavior before the refactor in Step 3.

- [ ] **Step 3: Refactor `chooseOrientation` to use `floorOrientations`**

In `packages/engine/src/packing/floor.ts`, add after line 1:
```ts
import { floorOrientations } from '../model/orientation';
```

Replace the body of `chooseOrientation`:
```ts
export function chooseOrientation(req: FloorRequest, region: Region, clearance: number): Footprint {
  const lwh: Footprint = { dx: req.length, dy: req.width, orientation: 'lwh' };
  const canYaw = req.rotation === 'yawOnly' || req.rotation === 'full';
  if (!canYaw) return lwh;
  const wlh: Footprint = { dx: req.width, dy: req.length, orientation: 'wlh' };
  return gridCapacity(region, wlh, clearance) > gridCapacity(region, lwh, clearance) ? wlh : lwh;
}
```
with:
```ts
export function chooseOrientation(req: FloorRequest, region: Region, clearance: number): Footprint {
  const lwh: Footprint = { dx: req.length, dy: req.width, orientation: 'lwh' };
  const canYaw = floorOrientations(req.rotation).includes('wlh');
  if (!canYaw) return lwh;
  const wlh: Footprint = { dx: req.width, dy: req.length, orientation: 'wlh' };
  return gridCapacity(region, wlh, clearance) > gridCapacity(region, lwh, clearance) ? wlh : lwh;
}
```

- [ ] **Step 4: Run the full engine suite (behavior preserved + new tests)**

Run: `npm test`
Expected: PASS — all suites green (floor reference numbers 34/33/20/4 unchanged, new rotation-mode tests pass, orientation + geometry + validate green). Then `npm run typecheck` (0 errors) and `npm run lint` (0 errors).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/floor.ts packages/engine/src/packing/floor.test.ts
git commit -m "refactor(engine): floor packer uses floorOrientations; add rotation-mode tests (qrd.6)"
```

---

## После плана

- Закрыть `LKWkalk-qrd.6` с комментарием (три режима зафиксированы тестами; дублирование rotation-логики устранено; поведение сохранено).
- Разблокируется `LKWkalk-qrd.7` (оркестратор) — при условии, что qrd.4 тоже влит (qrd.7 зависит от qrd.4/5/6/9).
- Ветка `feat/qrd-6-rotation-rules` — stacked на `feat/qrd-4-shelf-packer`; при merge qrd.4 в main перебазировать на main.
