# Group Selection and Block Move Implementation Plan (LKWkalk-dwc.6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user rubber-band several stacks in the top view and move them as one rigid block — inside the hold, or out to the buffer strip in a single gesture.

**Architecture:** The core gains a group algebra (`unplaceStacks`, `moveStacks`, `resolveGroupDrop`) alongside the existing single-stack one; `moveStacks` takes a **delta**, so the group's shape is preserved by construction rather than by a check. `resolveGroupDrop` generalises the existing magnet (ADR 020): candidates are common deltas, scored *flush-beats-near* and validated in score order until the first legal one. The web layer keeps only the pointer: a pure `marquee.ts` does rect→stack hit-testing (jsdom cannot run pixel gestures), and `CrossSection` holds a `StackRef[]` selection instead of a single ref.

**Tech Stack:** TypeScript (strict), Vitest + fast-check, React 18, Testing Library, plain SVG (no drag library), npm workspaces monorepo.

## Global Constraints

- Engine is headless and isomorphic: no DOM, no Node APIs in `packages/engine`.
- All internal lengths are **integer millimetres** (ADR 002).
- Every edit operation is **pure and total**: on refusal it returns the ORIGINAL layout object plus an `EngineError`, never a half-applied edit and never silence (ADR 019).
- Engine returns **error codes only**; all user-facing text comes from locale keys (ADR 006). Locales: `de`, `ru` — both must be updated together, the `Dictionary` type enforces it.
- No user-facing string literals in `apps/web` — keys only.
- Results must be **deterministic**: the same input always resolves to the same delta.
- Contract change is additive: `ENGINE_CONTRACT_VERSION` `0.13.0` → `0.14.0`, documented in `docs/api-contract.md` + a new ADR **before** the code (project rule "documentation first").
- Selection chrome is screen-only: every new visual element carries `className="print:hidden"`.
- Tests run from the repo root only: `npm test` (no per-package config).
- Commit messages in English; conversation with the user in Russian.

---

### Task 1: Contract and ADR (documentation first)

**Files:**
- Create: `docs/adr/021-group-layout-edits.md`
- Modify: `docs/api-contract.md:5` (version line), `docs/api-contract.md` (new section after the magnet section, ~line 229-300, and a new entry at the top of the version history)
- Modify: `packages/engine/src/index.ts:5`
- Test: `packages/engine/src/index.test.ts:6`

**Interfaces:**
- Consumes: nothing.
- Produces: `ENGINE_CONTRACT_VERSION === '0.14.0'`. Documents the signatures Tasks 2 and 3 implement:
  - `unplaceStacks(load: Load, layout: Layout, refs: StackRef[]): EditResult`
  - `moveStacks(load: Load, layout: Layout, refs: StackRef[], dx: number, dy: number): EditResult`
  - `resolveGroupDrop(load: Load, layout: Layout, refs: StackRef[], aim: GroupAim, opts?: GroupDropOptions): GroupDropResolution`
  - `interface GroupAim { dx: number; dy: number }`
  - `interface GroupDropResolution { dx: number; dy: number; ok: boolean; error?: EngineError; blocking: StackRef[] }`

- [ ] **Step 1: Write the failing test**

In `packages/engine/src/index.test.ts`, change the existing assertion on line 6:

```ts
    expect(engine.ENGINE_CONTRACT_VERSION).toBe('0.14.0');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/src/index.test.ts`
Expected: FAIL — `expected '0.13.0' to be '0.14.0'`

- [ ] **Step 3: Bump the constant**

In `packages/engine/src/index.ts`, line 5:

```ts
export const ENGINE_CONTRACT_VERSION = '0.14.0';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/engine/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Write ADR 021**

Create `docs/adr/021-group-layout-edits.md`:

```markdown
# ADR 021 — Групповые правки раскладки: жёсткий перенос и групповой магнит

- Статус: принято
- Дата: 2026-07-21
- Задача: `LKWkalk-dwc.6`
- Связано: [ADR 019](019-manual-layout-editing-api.md) (алгебра ручных правок),
  [ADR 020](020-magnet-drop-resolution.md) (магнит постановки)

## Контекст

Алгебра ручных правок (ADR 019) оперирует одной стопкой: `moveStack`, `rotateStack`,
`unplaceStack`. Логисту этого мало — чтобы закрыть щель, надо подвинуть блок из нескольких
стопок, сохранив их взаимное расположение, а чтобы освободить место под поворот — вынести
несколько стопок в буфер одним движением.

Наивное решение — вызвать `moveStack` в цикле — неверно дважды. Во-первых, промежуточные
состояния невалидны: стопка A, сдвинутая на место, где ещё стоит B, будет отвергнута, хотя
после сдвига B место освободится. Во-вторых, отказ на середине цикла оставил бы
полуприменённую правку, что запрещено ADR 019.

## Решение

Групповые операции — самостоятельные функции ядра, а не композиция одиночных.

1. `moveStacks(load, layout, refs, dx, dy)` принимает **дельту**, а не целевые координаты.
   Жёсткость переноса тем самым обеспечена типом сигнатуры: выразить «группа разъехалась»
   невозможно. Проверка геометрии выполняется один раз, на итоговой раскладке.
2. `unplaceStacks(load, layout, refs)` — свёртка `unplaceStack`. Отказать по геометрии не
   может: пол только освобождается.
3. `resolveGroupDrop(load, layout, refs, aim, opts)` обобщает магнит ADR 020. Кандидат —
   общая дельта: для каждой выделенной стопки берутся её собственные кандидаты по каждой оси
   (прицел, обе стены, вплотную к краям каждого невыделенного соседа), из них вычитается её
   прицельная позиция. Дельта годится, если при ней все выделенные стопки в габаритах и не
   пересекаются с невыделенными. Между собой выделенные пересечься не могут: они не
   пересекались до сдвига, а сдвиг общий.

Правило выбора наследуется от ADR 020 без изменений: *вплотную важнее, чем близко*, при
равенстве — ближе к прицелу, при равенстве — меньшая дельта по x, затем по y.

Допуск по умолчанию — минимум по выделенным стопкам от «половины короткой стороны отпечатка»:
группа не притягивается дальше, чем притянулась бы её самая тесная участница.

## Последствия

- Отказ — всегда целиком: исходная раскладка плюс код ошибки. Частичного применения нет
  ни при каком входе, включая пустой `refs` и дельту `(0, 0)` (обе — успешные no-op).
- Порядок вычисления в `resolveGroupDrop` задан производительностью: магнит считается на
  каждый `pointermove`, поэтому кандидаты сначала дёшево оцениваются (O(1) на кандидата
  после предрасчёта по осям), сортируются, и только потом по порядку проверяются на
  валидность до первого прошедшего. Дорогая проверка выполняется обычно один-два раза.
- Новых кодов ошибок не появляется: групповые операции возвращают существующие
  `ERR_EDIT_NO_STACK`, `ERR_EDIT_OUT_OF_BOUNDS`, `ERR_EDIT_OVERLAP`.
- Одиночные операции остаются как есть: API/MCP-вызывающий должен иметь возможность сказать
  «поставь ровно сюда, иначе откажи».

## Отвергнутые альтернативы

- **Цикл из `moveStack`.** Ломается на промежуточных состояниях и нарушает атомарность.
- **Независимый магнит на каждую стопку.** Каждая притягивалась бы к своему месту, форма
  группы разъезжается — ровно то, что требование запрещает.
- **Сущность «группа» в модели.** Группа — состояние выделения в UI, а не свойство груза;
  хранить её в `Layout` значило бы протащить UI-состояние в доменную модель.
```

- [ ] **Step 6: Update the API contract**

In `docs/api-contract.md`, change the version line (line 5) from `0.13.0` to `0.14.0`.

Add a new section after the magnet section (`### Магнит постановки (0.13.0, ...)`):

```markdown
### Групповые правки (0.14.0, [ADR 021](adr/021-group-layout-edits.md))

Операции над несколькими стопками сразу. Отказ — всегда целиком: возвращается исходная
раскладка и код ошибки, полуприменённого состояния не бывает.

```ts
interface GroupAim { dx: number; dy: number }

interface GroupDropOptions {
  /** Насколько далеко магнит может подтянуть, мм. Применяется одинаково ко всем участницам. */
  tolerance?: number;
}

interface GroupDropResolution {
  dx: number;
  dy: number;
  ok: boolean;
  error?: EngineError;
  /** Невыделенные стопки, мешающие в прицельной дельте. Пусто при ok. */
  blocking: StackRef[];
}

unplaceStacks(load: Load, layout: Layout, refs: StackRef[]): EditResult
moveStacks(load: Load, layout: Layout, refs: StackRef[], dx: number, dy: number): EditResult
resolveGroupDrop(
  load: Load,
  layout: Layout,
  refs: StackRef[],
  aim: GroupAim,
  opts?: GroupDropOptions,
): GroupDropResolution
```

`moveStacks` принимает дельту, а не целевые координаты: взаимное расположение группы
сохраняется по построению. Повторяющиеся `refs` считаются одной стопкой (выделение — множество).

Пустой `refs` и дельта `(0, 0)` — успешные no-op: возвращается исходная раскладка без ошибки.

Коды ошибок — существующие: `ERR_EDIT_NO_STACK`, `ERR_EDIT_OUT_OF_BOUNDS`, `ERR_EDIT_OVERLAP`.
```

Add at the top of the version history list:

```markdown
- `0.14.0` — добавлены групповые правки: `unplaceStacks`, `moveStacks`, `resolveGroupDrop`,
  типы `GroupAim`, `GroupDropResolution`. Аддитивно: одиночные операции и их поведение не
  менялись. `ENGINE_CONTRACT_VERSION` → `0.14.0` (`LKWkalk-dwc.6`).
```

- [ ] **Step 7: Verify the whole suite still passes**

Run: `npm test`
Expected: all tests pass (454 at branch point, plus nothing new yet).

- [ ] **Step 8: Commit**

```bash
git add docs/adr/021-group-layout-edits.md docs/api-contract.md packages/engine/src/index.ts packages/engine/src/index.test.ts
git commit -m "docs(engine): group layout edits contract 0.14.0 + ADR 021 (LKWkalk-dwc.6)"
```

---

### Task 2: Core — `unplaceStacks` and `moveStacks`

**Files:**
- Modify: `packages/engine/src/packing/edit.ts` (append after `rotateStack`, before `stackBuffer`)
- Modify: `packages/engine/src/index.ts:15-16` (exports)
- Test: `packages/engine/src/packing/edit.test.ts` (append new describe blocks)

**Interfaces:**
- Consumes: `ENGINE_CONTRACT_VERSION === '0.14.0'` from Task 1. Existing internals of `edit.ts`: `isRef`, `outOfBounds`, `overlapsOtherStack`, `violationError`, `err`, `withUnplaced`, `retally`, and the exported `unplaceStack`.
- Produces:
  - `unplaceStacks(load: Load, layout: Layout, refs: StackRef[]): EditResult`
  - `moveStacks(load: Load, layout: Layout, refs: StackRef[], dx: number, dy: number): EditResult`
  - `refKey(r: StackRef): string` — module-internal, NOT exported from the package; Task 3 imports it from `./edit` inside the engine.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/packing/edit.test.ts`. Note the existing file already imports `calculateLayout`, `findGeometryViolations`, defines `cargo`, `cubes` and `totalUnits` — reuse them; extend the import line from `./edit` to include the two new functions:

```ts
import { moveStack, rotateStack, unplaceStack, placeStack, stackBuffer, unplaceStacks, moveStacks } from './edit';
import type { StackRef } from './edit';
```

(`StackRef` lives in `packing/edit.ts`, not in `model/` — the existing `import type { CargoType, Layout, Load } from '../model/index'` line stays as it is)

Then append:

```ts
describe('unplaceStacks', () => {
  it('takes every named column off the floor in one call', () => {
    const layout = calculateLayout(cubes);
    const before = totalUnits(cubes, layout, 'c');
    const refs = layout.placements.slice(0, 2).map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

    const { layout: next, error } = unplaceStacks(cubes, layout, refs);

    expect(error).toBeUndefined();
    expect(next.placements).toHaveLength(layout.placements.length - 2);
    expect(next.unplaced.find((u) => u.cargoTypeId === 'c')?.count).toBe(2);
    expect(totalUnits(cubes, next, 'c')).toBe(before); // nothing invented or lost
    expect(findGeometryViolations(cubes, next)).toEqual([]);
  });

  it('treats a repeated ref as one stack — a selection is a set', () => {
    const layout = calculateLayout(cubes);
    const p = layout.placements[0];
    const ref = { cargoTypeId: 'c', x: p.x, y: p.y };

    const { layout: next, error } = unplaceStacks(cubes, layout, [ref, ref]);

    expect(error).toBeUndefined();
    expect(next.placements).toHaveLength(layout.placements.length - 1);
    expect(next.unplaced.find((u) => u.cargoTypeId === 'c')?.count).toBe(1);
  });

  it('is a no-op for an empty selection', () => {
    const layout = calculateLayout(cubes);
    const { layout: next, error } = unplaceStacks(cubes, layout, []);
    expect(error).toBeUndefined();
    expect(next).toBe(layout);
  });

  it('refuses the WHOLE call when one ref names no column', () => {
    const layout = calculateLayout(cubes);
    const good = { cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y };

    const { layout: next, error } = unplaceStacks(cubes, layout, [good, { cargoTypeId: 'c', x: 12345, y: 0 }]);

    expect(error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(next).toBe(layout); // the good ref was NOT applied
  });
});

describe('moveStacks', () => {
  /** 4×2 m hold, 1×1 m cubes: 8 floor positions, so a group has room to shift by one cell. */
  const wide: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [cargo({ id: 'c', name: 'Cube', length: 1000, width: 1000, height: 1000, quantity: 4 })],
  };

  /** Every pairwise offset within a set of points — the shape of the group, position-independent. */
  const shape = (pts: { x: number; y: number }[]): string =>
    pts
      .map((a) => pts.map((b) => `${a.x - b.x},${a.y - b.y}`).join('|'))
      .sort()
      .join(';');

  it('preserves the mutual arrangement of the group', () => {
    const layout = calculateLayout(wide);
    const refs = [...layout.placements]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .slice(0, 2)
      .map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    const before = shape(refs);

    const { layout: next, error } = moveStacks(wide, layout, refs, 0, 1000);

    expect(error).toBeUndefined();
    // Read the moved columns back OUT of the resulting layout — asserting on the refs we passed in
    // would only re-check our own arithmetic, not what moveStacks actually did.
    const moved = refs.map((r) => {
      const p = next.placements.find((q) => q.x === r.x && q.y === r.y + 1000);
      expect(p).toBeDefined();
      return { x: p!.x, y: p!.y };
    });
    expect(shape(moved)).toBe(before);
    expect(findGeometryViolations(wide, next)).toEqual([]);
  });

  it('shifts every placement of every selected column, including upper tiers', () => {
    const tall: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 3000 },
      cargo: [cargo({ id: 's', name: 'Stackable', length: 1000, width: 1000, height: 1000, quantity: 6, stacking: { stackable: true } })],
    };
    const layout = calculateLayout(tall);
    const first = layout.placements[0];
    const ref = { cargoTypeId: 's', x: first.x, y: first.y };
    const tiers = layout.placements.filter((p) => p.x === ref.x && p.y === ref.y).length;
    expect(tiers).toBeGreaterThan(1);

    const { layout: next, error } = moveStacks(tall, layout, [ref], 0, 1000);

    expect(error).toBeUndefined();
    expect(next.placements.filter((p) => p.x === ref.x && p.y === ref.y + 1000)).toHaveLength(tiers);
    expect(next.placements.filter((p) => p.x === ref.x && p.y === ref.y)).toHaveLength(0);
  });

  it('refuses the whole move when ONE member would leave the hold, leaving the layout untouched', () => {
    const layout = calculateLayout(wide);
    const refs = layout.placements.map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

    const { layout: next, error } = moveStacks(wide, layout, refs, 100000, 0);

    expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
    expect(next).toBe(layout); // identity: not a rebuilt copy, the ORIGINAL object
  });

  /** A hold with a free cell to the right of the last stack: 3 cubes in a 4 m row. */
  const row: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [cargo({ id: 'c', name: 'Cube', length: 1000, width: 1000, height: 1000, quantity: 3 })],
  };
  /** The stacks of `row`, left to right. */
  const rowRefs = (layout: Layout): StackRef[] =>
    [...new Map(layout.placements.map((p) => [`${p.x},${p.y}`, p])).values()]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

  it('refuses the whole move when a member would land on an unselected stack', () => {
    const layout = calculateLayout(row);
    const refs = rowRefs(layout);
    // Neighbours one cell apart, and only the LEFT one moves — so it lands on a stack that stays.
    const step = refs[1].x - refs[0].x;
    expect(step).toBeGreaterThan(0);
    expect(refs[1].y).toBe(refs[0].y);

    const { layout: next, error } = moveStacks(row, layout, [refs[0]], step, 0);

    expect(error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(next).toBe(layout);
  });

  it('lets the group slide THROUGH its own members — they move together', () => {
    const layout = calculateLayout(row);
    const refs = rowRefs(layout);
    const step = refs[1].x - refs[0].x;
    // The SAME shift that was just refused for one stack is legal for the whole row: each member
    // lands where the next one stood, and that one is moving too.
    const { layout: next, error } = moveStacks(row, layout, refs, step, 0);

    expect(error).toBeUndefined();
    expect(findGeometryViolations(row, next)).toEqual([]);
    expect(next.placements.some((p) => p.x === refs[refs.length - 1].x + step)).toBe(true);
  });

  it('is a no-op for an empty selection and for a zero delta', () => {
    const layout = calculateLayout(wide);
    const refs = [{ cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y }];
    expect(moveStacks(wide, layout, [], 500, 500).layout).toBe(layout);
    expect(moveStacks(wide, layout, refs, 0, 0).layout).toBe(layout);
    expect(moveStacks(wide, layout, [], 500, 500).error).toBeUndefined();
    expect(moveStacks(wide, layout, refs, 0, 0).error).toBeUndefined();
  });

  it('refuses when a ref names no column', () => {
    const layout = calculateLayout(wide);
    const { layout: next, error } = moveStacks(wide, layout, [{ cargoTypeId: 'c', x: 12345, y: 0 }], 0, 1000);
    expect(error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(next).toBe(layout);
  });

  it('conserves units — a move never invents or drops cargo', () => {
    const layout = calculateLayout(wide);
    const before = totalUnits(wide, layout, 'c');
    const refs = layout.placements.slice(0, 2).map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    const { layout: next } = moveStacks(wide, layout, refs, 0, 0);
    expect(totalUnits(wide, next, 'c')).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/packing/edit.test.ts`
Expected: FAIL — `unplaceStacks is not a function` / `moveStacks is not a function` (and a TS error on the import).

- [ ] **Step 3: Implement**

In `packages/engine/src/packing/edit.ts`, add near the other small helpers (right after `isRef`, around line 54):

```ts
/** Stable identity of a floor column — used to test membership of a selection. */
export const refKey = (r: StackRef): string => `${r.cargoTypeId}@${r.x},${r.y}`;
```

Then insert after `rotateStack` (before the `stackBuffer` doc comment):

```ts
/**
 * Take several columns off the floor at once (ADR 021).
 *
 * Cannot fail on geometry — the floor only empties — so the only refusal is a ref that names no
 * column, and it refuses the WHOLE call: a partially emptied floor is exactly the half-applied edit
 * ADR 019 forbids. Repeated refs are one stack; a selection is a set.
 */
export function unplaceStacks(load: Load, layout: Layout, refs: StackRef[]): EditResult {
  const unique = new Map(refs.map((r) => [refKey(r), r]));
  // Validate every ref against the ORIGINAL layout first, so nothing is applied before we know the
  // whole call is good.
  for (const ref of unique.values()) {
    if (!layout.placements.some(isRef(ref))) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };
  }
  let cur = layout;
  for (const ref of unique.values()) {
    cur = unplaceStack(load, cur, ref).layout;
  }
  return { layout: cur };
}

/**
 * Shift several columns by a common delta (ADR 021).
 *
 * Takes a DELTA rather than target coordinates: the group's mutual arrangement is then preserved by
 * construction, and "the group came apart" is not expressible. Members are excluded from each
 * other's overlap test — they move together, so a member sliding onto another member's old spot is
 * legal. Refusal is whole: the original layout comes back untouched.
 */
export function moveStacks(load: Load, layout: Layout, refs: StackRef[], dx: number, dy: number): EditResult {
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  if (unique.length === 0 || (dx === 0 && dy === 0)) return { layout };

  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const keys = new Set(unique.map(refKey));
  const moving = (p: Placement) => keys.has(refKey(p));

  // Every check runs against the original layout before anything is built — bounds for all members
  // first (the more fundamental answer, as elsewhere in this module), then overlap.
  const footprints: { ref: StackRef; w: number; h: number }[] = [];
  for (const ref of unique) {
    const column = layout.placements.filter(isRef(ref));
    const cargo = byId.get(ref.cargoTypeId);
    if (column.length === 0 || !cargo) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };
    const [w, h] = orientedDims(cargo.length, cargo.width, cargo.height, column[0].orientation);
    footprints.push({ ref, w, h });
  }
  for (const { ref, w, h } of footprints) {
    if (outOfBounds(load, ref.x + dx, ref.y + dy, w, h)) {
      return { layout, error: err('ERR_EDIT_OUT_OF_BOUNDS', { ...ref, dx, dy }) };
    }
  }
  for (const { ref, w, h } of footprints) {
    if (overlapsOtherStack(load, layout, moving, ref.x + dx, ref.y + dy, w, h)) {
      return { layout, error: err('ERR_EDIT_OVERLAP', { ...ref, dx, dy }) };
    }
  }

  const candidate: Layout = {
    ...layout,
    placements: layout.placements.map((p) => (moving(p) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
  };
  const bad = violationError(load, candidate);
  return bad ? { layout, error: bad } : { layout: candidate };
}
```

Note on `overlapsOtherStack`: its third parameter is a predicate meaning "this placement is NOT an obstacle", so passing `moving` excludes every selected column — which is exactly the rigid-group rule.

- [ ] **Step 4: Export from the package**

In `packages/engine/src/index.ts`, extend the two edit lines:

```ts
export { moveStack, rotateStack, unplaceStack, placeStack, stackBuffer, unplaceStacks, moveStacks } from './packing/edit';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/packing/edit.test.ts`
Expected: PASS, all describes green.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/packing/edit.ts packages/engine/src/packing/edit.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): unplaceStacks and moveStacks — rigid group edits (LKWkalk-dwc.6)"
```

---

### Task 3: Core — `resolveGroupDrop` (the group magnet)

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.ts` (generalise `floorBoxes`, append `resolveGroupDrop`)
- Modify: `packages/engine/src/index.ts:17-18` (exports)
- Test: `packages/engine/src/packing/resolveDrop.test.ts` (append a new describe block)

**Interfaces:**
- Consumes: `refKey` from `./edit` (Task 2). Existing `resolveDrop.ts` internals: `overlaps1d`, `err`, `Box`, `floorBoxes`.
- Produces:
  - `interface GroupAim { dx: number; dy: number }`
  - `interface GroupDropOptions { tolerance?: number }`
  - `interface GroupDropResolution { dx: number; dy: number; ok: boolean; error?: EngineError; blocking: StackRef[] }`
  - `resolveGroupDrop(load, layout, refs, aim, opts?): GroupDropResolution`

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/packing/resolveDrop.test.ts`. Read the top of that file first for its existing fixtures; if it defines its own `cargo`/`Load` helpers, reuse them, otherwise use the self-contained ones below.

```ts
import { resolveGroupDrop } from './resolveDrop';
import { calculateLayout } from '../api/api';
import type { CargoType, Load } from '../model/index';
import type { StackRef } from './edit';

const gcargo = (over: Partial<CargoType> & Pick<CargoType, 'id' | 'name'>): CargoType => ({
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: 1,
  rotation: 'yawOnly',
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt',
  ...over,
});

describe('resolveGroupDrop', () => {
  /** 4×2 m hold, 1×1 m cubes → 8 floor positions in a 4×2 grid. */
  const grid: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [gcargo({ id: 'c', name: 'Cube', quantity: 8 })],
  };
  const refsAt = (...pts: [number, number][]): StackRef[] =>
    pts.map(([x, y]) => ({ cargoTypeId: 'c', x, y }));

  it('accepts the zero delta — a group that already stands legally may stay put', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const refs = refsAt([sorted[0].x, sorted[0].y]);

    const r = resolveGroupDrop(grid, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.blocking).toEqual([]);
  });

  it('pulls a near miss flush — flush beats near, as for a single stack', () => {
    // One lone stack in an otherwise empty hold, aimed 60 mm short of the far wall.
    const lone: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
      cargo: [gcargo({ id: 'c', name: 'Cube', quantity: 1 })],
    };
    const layout = calculateLayout(lone);
    const start = layout.placements[0];
    const refs = refsAt([start.x, start.y]);
    // aim so the stack's far edge sits 60 mm short of x = 4000
    const aimDx = 4000 - 1000 - 60 - start.x;

    const r = resolveGroupDrop(lone, layout, refs, { dx: aimDx, dy: 0 });

    expect(r.ok).toBe(true);
    expect(start.x + r.dx).toBe(3000); // flush against the far wall, not 60 mm short of it
  });

  it('refuses as a whole when no delta in reach works, and names what is in the way', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const one = refsAt([sorted[0].x, sorted[0].y]);

    // aim straight onto an occupied neighbour, with a tolerance too small to escape it
    const r = resolveGroupDrop(grid, layout, one, { dx: 1000, dy: 0 }, { tolerance: 0 });

    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(r.blocking.length).toBeGreaterThan(0);
  });

  it('reports out-of-bounds rather than overlap when the aim leaves the hold', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const one = refsAt([sorted[0].x, sorted[0].y]);

    const r = resolveGroupDrop(grid, layout, one, { dx: 100000, dy: 0 }, { tolerance: 0 });

    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('never counts a group member as an obstacle to another member', () => {
    const layout = calculateLayout(grid);
    const all = layout.placements.map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    // The entire floor moves as one: any delta that keeps it in bounds must be legal, because the
    // only things in the way are members.
    const r = resolveGroupDrop(grid, layout, all, { dx: 0, dy: 0 });
    expect(r.ok).toBe(true);
    expect(r.blocking).toEqual([]);
  });

  it('is deterministic — the same input always resolves to the same delta', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const refs = refsAt([sorted[0].x, sorted[0].y]);
    const a = resolveGroupDrop(grid, layout, refs, { dx: 37, dy: 12 });
    const b = resolveGroupDrop(grid, layout, refs, { dx: 37, dy: 12 });
    expect(a).toEqual(b);
  });

  it('refuses an empty selection and a ref that names no column', () => {
    const layout = calculateLayout(grid);
    expect(resolveGroupDrop(grid, layout, [], { dx: 0, dy: 0 }).error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(resolveGroupDrop(grid, layout, refsAt([12345, 0]), { dx: 0, dy: 0 }).error?.code).toBe('ERR_EDIT_NO_STACK');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/packing/resolveDrop.test.ts`
Expected: FAIL — `resolveGroupDrop is not a function`.

- [ ] **Step 3: Generalise `floorBoxes` to exclude a set**

In `packages/engine/src/packing/resolveDrop.ts`, replace the existing `floorBoxes` function (lines 53-70) with:

```ts
/** One box per floor column: every placement sharing a cargo type and (x, y) is one stack. */
function floorBoxes(load: Load, layout: Layout, exclude?: (ref: StackRef) => boolean): Box[] {
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
    if (exclude?.(ref)) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, p.orientation);
    out.push({ ...ref, dx, dy });
  }
  return out;
}
```

And update its single existing caller on line 121 from:

```ts
  const boxes = floorBoxes(load, layout, opts.exclude);
```

to:

```ts
  const boxes = floorBoxes(load, layout, opts.exclude ? (r) => sameRef(r, opts.exclude!) : undefined);
```

- [ ] **Step 4: Implement `resolveGroupDrop`**

Append to `packages/engine/src/packing/resolveDrop.ts`:

```ts
/** How far a group was dragged, in mm. A delta, not a target — the group is rigid (ADR 021). */
export interface GroupAim {
  dx: number;
  dy: number;
}

/**
 * Options for the group magnet. Deliberately NOT ResolveDropOptions: that type's `exclude` names the
 * one stack a single-stack drag must not trip over, and a group excludes its own members
 * structurally — there is no second meaning for it here, so the field is not offered at all.
 */
export interface GroupDropOptions {
  /** How far the magnet may pull, in mm. Applied identically to every member; the group is rigid.
   *  Default: the tightest member's own default (half its shorter side). */
  tolerance?: number;
}

/** Where the whole group would land, and whether it may. */
export interface GroupDropResolution {
  dx: number;
  dy: number;
  ok: boolean;
  /** Why not, when !ok. */
  error?: EngineError;
  /** Unselected stacks in the way at the aim — the UI outlines these in red. Empty when ok. */
  blocking: StackRef[];
}

/**
 * The magnet for a rigid group (ADR 021) — the same question as resolveDrop, asked about a DELTA.
 *
 * Candidates are common deltas: each member contributes the deltas that would put IT at its aim, at
 * either wall, or flush against a neighbour's edge; a delta is legal when EVERY member is then in
 * bounds and clear of every unselected column. Members never block each other — they move together.
 *
 * Ordering is deliberate and is what keeps this cheap enough for every pointermove: candidates are
 * scored first (O(1) each after the per-axis precomputation), then validated in score order until
 * the first legal one, so the expensive check normally runs once or twice.
 */
export function resolveGroupDrop(
  load: Load,
  layout: Layout,
  refs: StackRef[],
  aim: GroupAim,
  opts: GroupDropOptions = {},
): GroupDropResolution {
  const refuse = (error: EngineError, blocking: StackRef[] = []): GroupDropResolution => ({
    dx: aim.dx,
    dy: aim.dy,
    ok: false,
    error,
    blocking,
  });

  const unique = [...new Map(refs.map((r) => [`${r.cargoTypeId}@${r.x},${r.y}`, r])).values()];
  if (unique.length === 0) return refuse(err('ERR_EDIT_NO_STACK'));

  // Members with their footprints, taken from the layout (their own orientation, not a guess).
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const members: Box[] = [];
  for (const ref of unique) {
    const column = layout.placements.find(
      (p) => p.cargoTypeId === ref.cargoTypeId && p.x === ref.x && p.y === ref.y,
    );
    const cargo = byId.get(ref.cargoTypeId);
    if (!column || !cargo) return refuse(err('ERR_EDIT_NO_STACK', { ...ref }));
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, column.orientation);
    members.push({ ...ref, dx, dy });
  }

  const selected = new Set(members.map((m) => `${m.cargoTypeId}@${m.x},${m.y}`));
  const boxes = floorBoxes(load, layout, (r) => selected.has(`${r.cargoTypeId}@${r.x},${r.y}`));

  // Default tolerance: the tightest member's own default. The group must not be pulled further than
  // its most sensitive participant would be.
  const tol = opts.tolerance ?? Math.min(...members.map((m) => Math.min(m.dx, m.dy) / 2));

  // Candidate deltas per axis. Each member offers: stay at the aim, sit at either wall, or sit flush
  // against a neighbour's near/far edge — all expressed as a delta by subtracting the member's own
  // current coordinate. Filtered to what is within reach of the aimed delta.
  const axisDeltas = (
    aimD: number,
    pick: (m: Box) => { pos: number; size: number },
    max: (m: Box) => number,
    edges: (b: Box) => { start: number; extent: number },
  ): number[] => {
    const out = new Set<number>([aimD]);
    for (const m of members) {
      const { pos, size } = pick(m);
      const lim = max(m);
      const push = (target: number) => {
        const d = target - pos;
        if (target >= 0 && target <= lim && Math.abs(d - aimD) <= tol) out.add(d);
      };
      push(pos + aimD);
      push(0);
      push(lim);
      for (const b of boxes) {
        const { start, extent } = edges(b);
        push(start + extent); // our near edge against their far edge
        push(start - size); // our far edge against their near edge
      }
    }
    return [...out];
  };

  const dxs = axisDeltas(
    aim.dx,
    (m) => ({ pos: m.x, size: m.dx }),
    (m) => load.vehicle.length - m.dx,
    (b) => ({ start: b.x, extent: b.dx }),
  );
  const dys = axisDeltas(
    aim.dy,
    (m) => ({ pos: m.y, size: m.dy }),
    (m) => load.vehicle.width - m.dy,
    (b) => ({ start: b.y, extent: b.dy }),
  );

  // Flush = at least one member ends against a wall or a neighbour's edge on that axis.
  const flushX = (d: number) =>
    members.some(
      (m) =>
        m.x + d === 0 ||
        m.x + d === load.vehicle.length - m.dx ||
        boxes.some((b) => m.x + d === b.x + b.dx || m.x + d + m.dx === b.x),
    );
  const flushY = (d: number) =>
    members.some(
      (m) =>
        m.y + d === 0 ||
        m.y + d === load.vehicle.width - m.dy ||
        boxes.some((b) => m.y + d === b.y + b.dy || m.y + d + m.dy === b.y),
    );

  const hitsAt = (ddx: number, ddy: number): Box[] =>
    boxes.filter((b) =>
      members.some(
        (m) =>
          overlaps1d(m.x + ddx, m.x + ddx + m.dx, b.x, b.x + b.dx) &&
          overlaps1d(m.y + ddy, m.y + ddy + m.dy, b.y, b.y + b.dy),
      ),
    );
  const inBounds = (ddx: number, ddy: number): boolean =>
    members.every(
      (m) =>
        m.x + ddx >= 0 &&
        m.y + ddy >= 0 &&
        m.x + ddx + m.dx <= load.vehicle.length &&
        m.y + ddy + m.dy <= load.vehicle.width,
    );

  // Score cheaply, sort, then validate in order — the expensive check runs on the winner, not on
  // the whole cross product. Flush beats near; distance breaks ties; (dx, dy) breaks the last one,
  // so the same drag always resolves the same way.
  const scored = dxs
    .flatMap((ddx) => dys.map((ddy) => ({ ddx, ddy })))
    .map(({ ddx, ddy }) => ({
      ddx,
      ddy,
      flush: (flushX(ddx) ? 1 : 0) + (flushY(ddy) ? 1 : 0),
      dist: Math.hypot(ddx - aim.dx, ddy - aim.dy),
    }))
    .sort((a, b) => b.flush - a.flush || a.dist - b.dist || a.ddx - b.ddx || a.ddy - b.ddy);

  for (const c of scored) {
    if (!inBounds(c.ddx, c.ddy)) continue;
    if (hitsAt(c.ddx, c.ddy).length > 0) continue;
    return { dx: c.ddx, dy: c.ddy, ok: true, blocking: [] };
  }

  // Nothing within reach. Report the aim's own problem — bounds first, as edit.ts does.
  if (!inBounds(aim.dx, aim.dy)) {
    return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { dx: aim.dx, dy: aim.dy }));
  }
  const blocking = hitsAt(aim.dx, aim.dy).map(({ cargoTypeId, x, y }) => ({ cargoTypeId, x, y }));
  return refuse(err('ERR_EDIT_OVERLAP', { dx: aim.dx, dy: aim.dy }), blocking);
}
```

- [ ] **Step 5: Export from the package**

In `packages/engine/src/index.ts`, extend the resolveDrop lines:

```ts
export { resolveDrop, resolveGroupDrop } from './packing/resolveDrop';
export type { DropResolution, ResolveDropOptions, GroupAim, GroupDropOptions, GroupDropResolution } from './packing/resolveDrop';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the property-based invariant test**

Append to `packages/engine/src/packing/edit.test.ts` (fast-check is already a root devDependency):

```ts
import fc from 'fast-check';

describe('group edits — invariants', () => {
  const grid: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [cargo({ id: 'c', name: 'Cube', length: 1000, width: 1000, height: 1000, quantity: 8 })],
  };

  it('any ACCEPTED group move leaves a geometrically valid layout', () => {
    const layout = calculateLayout(grid);
    const all = layout.placements.map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

    fc.assert(
      fc.property(
        fc.subarray(all, { minLength: 1 }),
        fc.integer({ min: -4000, max: 4000 }),
        fc.integer({ min: -2000, max: 2000 }),
        (refs, dx, dy) => {
          const { layout: next, error } = moveStacks(grid, layout, refs, dx, dy);
          if (error) {
            expect(next).toBe(layout); // refusal never mutates
            return;
          }
          expect(findGeometryViolations(grid, next)).toEqual([]);
          expect(totalUnits(grid, next, 'c')).toBe(totalUnits(grid, layout, 'c'));
        },
      ),
      { numRuns: 300, seed: 20260721 },
    );
  });
});
```

- [ ] **Step 8: Run the property test**

Run: `npx vitest run packages/engine/src/packing/edit.test.ts`
Expected: PASS. If it fails, fast-check prints the shrunk counterexample — that is a real bug in `moveStacks`, fix the implementation rather than loosening the property.

- [ ] **Step 9: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/packing/resolveDrop.ts packages/engine/src/packing/resolveDrop.test.ts packages/engine/src/packing/edit.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): resolveGroupDrop — magnet for a rigid group (LKWkalk-dwc.6)"
```

---

### Task 4: Web — pure marquee module and locale key

**Files:**
- Create: `apps/web/src/screens/components/marquee.ts`
- Create: `apps/web/src/screens/components/marquee.test.ts`
- Modify: `packages/i18n/src/keys.ts` (add key after `'ladeplan.rotateStack'`, line 69)
- Modify: `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`

**Interfaces:**
- Consumes: `CutRect` from `./cutaway`, `StackRef` from `@shadrin-v/engine`.
- Produces, all from `apps/web/src/screens/components/marquee.ts`:
  - `interface MarqueeRect { x: number; y: number; w: number; h: number }`
  - `normalizeRect(ax: number, ay: number, bx: number, by: number): MarqueeRect`
  - `stacksInRect(rects: CutRect[], rect: MarqueeRect): StackRef[]`
  - `refKey(r: StackRef): string`
  - `hasRef(refs: StackRef[], r: StackRef): boolean`
  - `toggleRef(refs: StackRef[], r: StackRef): StackRef[]`
  - `groupBBox(rects: CutRect[], refs: StackRef[]): MarqueeRect | null`
  - Locale key `'ladeplan.selection.count'` with an `{n}` placeholder.

**Why a separate module:** jsdom does not implement `getScreenCTM`, so any pointer→mm gesture collapses to zero in tests (documented at `apps/web/src/screens/components/CrossSection.test.tsx:198-200`). Keeping hit-testing pure is the only way it can be tested at all.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/screens/components/marquee.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRect, stacksInRect, refKey, hasRef, toggleRef, groupBBox } from './marquee';
import type { CutRect } from './cutaway';

const rect = (x: number, y: number, w = 1000, h = 1000, cargoTypeId = 'c'): CutRect => ({
  x,
  y,
  w,
  h,
  series: 0,
  cargoTypeId,
});

/** Two stacks: one at the origin, one a cell away diagonally. */
const rects: CutRect[] = [rect(0, 0), rect(2000, 1000)];

describe('normalizeRect', () => {
  it('accepts corners in any order', () => {
    expect(normalizeRect(10, 20, 110, 220)).toEqual({ x: 10, y: 20, w: 100, h: 200 });
    // dragged right-to-left and bottom-to-top
    expect(normalizeRect(110, 220, 10, 20)).toEqual({ x: 10, y: 20, w: 100, h: 200 });
  });
});

describe('stacksInRect', () => {
  it('selects a stack the marquee only clips at the corner', () => {
    // covers just the bottom-right 100×100 mm of the stack at (0,0)
    const hit = stacksInRect(rects, { x: 900, y: 900, w: 200, h: 200 });
    expect(hit).toEqual([{ cargoTypeId: 'c', x: 0, y: 0 }]);
  });

  it('selects every stack it touches, not just the first', () => {
    const hit = stacksInRect(rects, { x: 0, y: 0, w: 4000, h: 2000 });
    expect(hit).toHaveLength(2);
  });

  it('does not select a stack it merely abuts — touching edges do not overlap', () => {
    // the marquee's right edge sits exactly on the stack's left edge
    expect(stacksInRect(rects, { x: 1000, y: 0, w: 500, h: 500 })).toEqual([]);
  });

  it('selects nothing for a zero-area marquee', () => {
    expect(stacksInRect(rects, { x: 500, y: 500, w: 0, h: 0 })).toEqual([]);
    expect(stacksInRect(rects, { x: 500, y: 500, w: 0, h: 300 })).toEqual([]);
  });
});

describe('selection set helpers', () => {
  const a = { cargoTypeId: 'c', x: 0, y: 0 };
  const b = { cargoTypeId: 'c', x: 2000, y: 1000 };
  const sameSpotOtherType = { cargoTypeId: 'd', x: 0, y: 0 };

  it('identifies a stack by type AND position', () => {
    expect(refKey(a)).not.toBe(refKey(sameSpotOtherType));
    expect(hasRef([a], { ...a })).toBe(true);
    expect(hasRef([a], sameSpotOtherType)).toBe(false);
  });

  it('toggles membership without touching the rest', () => {
    expect(toggleRef([a], b)).toEqual([a, b]);
    expect(toggleRef([a, b], a)).toEqual([b]);
  });
});

describe('groupBBox', () => {
  it('spans every selected stack', () => {
    const box = groupBBox(rects, [
      { cargoTypeId: 'c', x: 0, y: 0 },
      { cargoTypeId: 'c', x: 2000, y: 1000 },
    ]);
    expect(box).toEqual({ x: 0, y: 0, w: 3000, h: 2000 });
  });

  it('is null when nothing is selected or the selection is stale', () => {
    expect(groupBBox(rects, [])).toBeNull();
    expect(groupBBox(rects, [{ cargoTypeId: 'c', x: 99999, y: 0 }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/screens/components/marquee.test.ts`
Expected: FAIL — cannot resolve `./marquee`.

- [ ] **Step 3: Implement the module**

Create `apps/web/src/screens/components/marquee.ts`:

```ts
// Rubber-band selection geometry for the top view (LKWkalk-dwc.6), in mm — the same coordinate
// space the cutaway svg uses.
//
// Why this is a module and not inline in CrossSection: jsdom implements no getScreenCTM, so a
// pointer gesture cannot be exercised in a component test at all. Everything that can be decided
// without a pointer lives here, where it is testable; the component keeps only the pointer.
import type { StackRef } from '@shadrin-v/engine';
import type { CutRect } from './cutaway';

export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Two corners in any drag direction → a rect with non-negative extent. */
export function normalizeRect(ax: number, ay: number, bx: number, by: number): MarqueeRect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Half-open interval overlap (touching edges do not overlap) — the engine's rule, edit.ts. */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Which stacks the marquee catches. Touch selects: any intersection counts (design 2026-07-21) —
 * a 13.6 m hold is drawn heavily squeezed across its width, so demanding full containment would be
 * a precision exercise. A zero-area marquee (a plain click) catches nothing.
 */
export function stacksInRect(rects: CutRect[], rect: MarqueeRect): StackRef[] {
  if (rect.w <= 0 || rect.h <= 0) return [];
  return rects
    .filter(
      (r) =>
        overlaps1d(r.x, r.x + r.w, rect.x, rect.x + rect.w) &&
        overlaps1d(r.y, r.y + r.h, rect.y, rect.y + rect.h),
    )
    .map((r) => ({ cargoTypeId: r.cargoTypeId, x: r.x, y: r.y }));
}

/** Stable identity of a floor column. A position alone is not one: two types can share a corner. */
export const refKey = (r: StackRef): string => `${r.cargoTypeId}@${r.x},${r.y}`;

export const hasRef = (refs: StackRef[], r: StackRef): boolean =>
  refs.some((s) => refKey(s) === refKey(r));

/** Shift/Ctrl-click: add the stack, or drop it, leaving the rest of the selection alone. */
export const toggleRef = (refs: StackRef[], r: StackRef): StackRef[] =>
  hasRef(refs, r) ? refs.filter((s) => refKey(s) !== refKey(r)) : [...refs, r];

/**
 * The box that spans the selection — the group frame drawn over the individual outlines.
 * Null when nothing is selected, or when the selection no longer matches any drawn stack (a stale
 * selection after a recompute): there is no honest box to draw for stacks that are not there.
 */
export function groupBBox(rects: CutRect[], refs: StackRef[]): MarqueeRect | null {
  const keys = new Set(refs.map(refKey));
  const hit = rects.filter((r) => keys.has(refKey({ cargoTypeId: r.cargoTypeId, x: r.x, y: r.y })));
  if (hit.length === 0) return null;
  const x = Math.min(...hit.map((r) => r.x));
  const y = Math.min(...hit.map((r) => r.y));
  const right = Math.max(...hit.map((r) => r.x + r.w));
  const bottom = Math.max(...hit.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/screens/components/marquee.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the locale key**

In `packages/i18n/src/keys.ts`, add after `'ladeplan.rotateStack',` (line 69):

```ts
  'ladeplan.selection.count',
```

In `packages/i18n/src/dictionaries/de.ts`, after the `'ladeplan.rotateStack'` entry (line 69):

```ts
  'ladeplan.selection.count': '{n} Stapel ausgewählt',
```

In `packages/i18n/src/dictionaries/ru.ts`, at the matching position (line 69):

```ts
  'ladeplan.selection.count': 'Выделено стопок: {n}',
```

- [ ] **Step 6: Rebuild i18n so apps/web sees the new key**

`packages/i18n` publishes from a gitignored `dist/`, so a new key is invisible to `apps/web` until it is built.

Run: `npm run build --workspace packages/i18n`
Then: `npm test`
Expected: all pass, including `packages/i18n/src/dictionaries/index.test.ts` (which enforces that every key exists in every locale).

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/screens/components/marquee.ts apps/web/src/screens/components/marquee.test.ts packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(web): pure marquee geometry + selection-count locale key (LKWkalk-dwc.6)"
```

---

### Task 5: Web — multi-selection, marquee gesture, group drag

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx` (selection state, gesture routing, chrome)
- Modify: `apps/web/src/screens/LadeplanScreen.tsx:140-141` (add `onMoveStacks`), `:245-251` (`onDropOutside` → group)
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`, `apps/web/src/screens/LadeplanScreen.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–4 — `moveStacks`, `unplaceStacks`, `resolveGroupDrop`, `GroupDropResolution` from `@shadrin-v/engine`; `normalizeRect`, `stacksInRect`, `hasRef`, `toggleRef`, `groupBBox`, `refKey`, `MarqueeRect` from `./marquee`; `fillTemplate` from `./stackFormula`; the existing `snap` and `StackSel` from `./editLayout`.
- Produces: `CrossSection` props change —
  - `onMoveStack?: (sel: StackSel, toX: number, toY: number) => void` (unchanged, still used for a single stack)
  - **new** `onMoveStacks?: (refs: StackRef[], dx: number, dy: number) => void`
  - `onDropOutside?: (refs: StackRef[], clientX: number, clientY: number) => void` — **signature widened** from a single `StackSel` to an array.

- [ ] **Step 1: Add the SVG geometry stubs so a gesture can be driven at all**

Until now, pointer gestures were untestable here: jsdom implements neither `createSVGPoint` nor `getScreenCTM`, and `getBoundingClientRect` returns all zeros (`CrossSection.test.tsx:198-200` documents this). Those are three missing browser APIs, not a law of nature — stub them with the identity transform and a gesture becomes drivable, with **1 client pixel = 1 mm of hold**.

Create `apps/web/src/screens/components/svgTestGeometry.ts`:

```ts
// Test-only: jsdom ships no SVG geometry (createSVGPoint, getScreenCTM) and returns a zero
// getBoundingClientRect, so a pointer gesture over a cutaway collapses to a zero-length drag and
// every such test silently asserts nothing.
//
// These stubs install the IDENTITY transform: one client pixel is one millimetre of hold, and the
// svg occupies the rect it is given. That makes gesture tests honest — the component's own
// arithmetic still runs, only the browser's missing plumbing is supplied.
// Returns an uninstall function. Prototype patches outlive the test that made them — they are not
// undone by Testing Library's cleanup — so a test file that forgets to restore silently changes the
// geometry every later file in the same worker sees. Always restore in afterEach.
export function installSvgGeometry(rect = { left: 0, top: 0, width: 4000, height: 2000 }): () => void {
  const proto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  const elProto = Element.prototype as unknown as Record<string, unknown>;
  const saved = {
    createSVGPoint: proto.createSVGPoint,
    getScreenCTM: proto.getScreenCTM,
    getBoundingClientRect: proto.getBoundingClientRect,
    setPointerCapture: elProto.setPointerCapture,
    releasePointerCapture: elProto.releasePointerCapture,
  };
  proto.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform(this: { x: number; y: number }) {
        return { x: this.x, y: this.y }; // identity: client px === hold mm
      },
    };
  };
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  proto.getScreenCTM = function () {
    return { ...identity, inverse: () => identity };
  };
  proto.getBoundingClientRect = function () {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    };
  };
  // jsdom throws InvalidPointerId for a pointer it never saw; capture is irrelevant to the logic.
  elProto.setPointerCapture = function () {};
  elProto.releasePointerCapture = function () {};

  return () => {
    proto.createSVGPoint = saved.createSVGPoint;
    proto.getScreenCTM = saved.getScreenCTM;
    proto.getBoundingClientRect = saved.getBoundingClientRect;
    elProto.setPointerCapture = saved.setPointerCapture;
    elProto.releasePointerCapture = saved.releasePointerCapture;
  };
}
```

Every test file that installs these MUST restore them:

```ts
let restoreSvgGeometry: (() => void) | null = null;
afterEach(() => {
  restoreSvgGeometry?.();
  restoreSvgGeometry = null;
});
```

and each `renderTop()` / gesture test assigns `restoreSvgGeometry = installSvgGeometry(...)` instead of discarding the return value.

- [ ] **Step 2: Write the failing component tests**

Append to `apps/web/src/screens/components/CrossSection.test.tsx`. Reuse the file's existing fixtures and its `render(<LocaleProvider initial="de">…</LocaleProvider>)` convention; the helper below spells out the load so the coordinates in the assertions are unambiguous.

```tsx
import { installSvgGeometry } from './svgTestGeometry';

describe('group selection', () => {
  /** 4×2 m hold, 1×1 m cubes → a row of stacks at y=0, x = 0, 1000, 2000. */
  const groupLoad: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [
      {
        id: 'c',
        name: 'Cube',
        length: 1000,
        width: 1000,
        height: 1000,
        quantity: 3,
        rotation: 'yawOnly',
        stacking: { stackable: false },
        nesting: { nestable: false },
        state: 'entschachtelt',
      },
    ],
  };

  const renderTop = (props: Partial<Parameters<typeof CrossSection>[0]> = {}) => {
    restoreSvgGeometry = installSvgGeometry();
    const layout = calculateLayout(groupLoad);
    const utils = render(
      <LocaleProvider initial="de">
        <CrossSection
          load={groupLoad}
          layout={layout}
          view="top"
          label="Draufsicht"
          onMoveStack={vi.fn()}
          onRotateStack={vi.fn()}
          {...props}
        />
      </LocaleProvider>,
    );
    const svg = utils.container.querySelector('svg[data-cutaway="top"]')!;
    return { ...utils, svg, layout };
  };

  /** Drag on the empty floor from (x0,y0) to (x1,y1), in mm. */
  const rubberBand = (svg: Element, x0: number, y0: number, x1: number, y1: number) => {
    fireEvent.pointerDown(svg, { clientX: x0, clientY: y0 });
    fireEvent.pointerMove(svg, { clientX: x1, clientY: y1 });
    fireEvent.pointerUp(svg, { clientX: x1, clientY: y1 });
  };

  const stackEl = (container: HTMLElement, x: number, y: number) =>
    container.querySelector(`[data-stack-ref="c@${x},${y}"]`)!;

  it('draws no group chrome before anything is selected', () => {
    const { queryByTestId } = renderTop();
    expect(queryByTestId('group-frame')).toBeNull();
    expect(queryByTestId('marquee')).toBeNull();
  });

  it('rubber-bands the stacks it touches and reports the count', () => {
    const { svg, getByTestId } = renderTop();
    // A band over x 0..1500, y 0..500 clips the stacks at x=0 and x=1000, but not the one at 2000.
    rubberBand(svg, 0, 0, 1500, 500);

    expect(getByTestId('group-frame')).toBeInTheDocument();
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
  });

  it('a click on empty floor clears the selection', () => {
    const { svg, queryByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByTestId('group-frame')).not.toBeNull();

    fireEvent.pointerDown(svg, { clientX: 3500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 3500, clientY: 1500 });

    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('shift-click drops one stack out of the selection without touching the rest', () => {
    const { svg, container, getByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');

    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500, shiftKey: true });

    // one left — below 2, so the group frame goes away entirely
    expect(container.querySelector('[data-testid="group-count"]')).toBeNull();
  });

  it('dragging a selected stack moves the WHOLE group by one delta', () => {
    const onMoveStacks = vi.fn();
    const { svg, container } = renderTop({ onMoveStacks });
    rubberBand(svg, 0, 0, 1500, 500);

    // grab the stack at x=0 and drag it down a full cell
    const g = stackEl(container, 0, 0);
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 1500 });

    expect(onMoveStacks).toHaveBeenCalledTimes(1);
    const [refs, dx, dy] = onMoveStacks.mock.calls[0];
    expect(refs).toHaveLength(2);
    expect(dx).toBe(0);
    expect(dy).toBe(1000);
  });

  it('keeps the group selected after a move, so it can be nudged again', () => {
    const { svg, container, getByTestId } = renderTop({ onMoveStacks: vi.fn() });
    rubberBand(svg, 0, 0, 1500, 500);
    const g = stackEl(container, 0, 0);
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 1500 });

    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
  });

  it('hands the whole group to onDropOutside when released off the cutaway', () => {
    const onDropOutside = vi.fn();
    const { svg, container } = renderTop({ onDropOutside, onMoveStacks: vi.fn() });
    rubberBand(svg, 0, 0, 1500, 500);

    const g = stackEl(container, 0, 0);
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 2600 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 2600 }); // below the svg's 2000-tall box

    expect(onDropOutside).toHaveBeenCalledTimes(1);
    expect(onDropOutside.mock.calls[0][0]).toHaveLength(2);
  });

  it('offers the rotate handle for a single stack only', () => {
    const { svg, container, queryByLabelText } = renderTop();
    // single click selects one stack → handle present
    const g = stackEl(container, 0, 0);
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500 });
    expect(queryByLabelText('Stapel drehen')).not.toBeNull();

    // a two-stack group → no handle: rotating a group is a different operation
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByLabelText('Stapel drehen')).toBeNull();
  });

  it('Escape clears the selection', () => {
    const { svg, queryByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByTestId('group-frame')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('keeps every selection affordance off the printed sheet', () => {
    const { svg, getByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(getByTestId('group-frame').closest('g')).toHaveClass('print:hidden');
  });
});
```

Add whatever of `fireEvent`, `vi`, `calculateLayout`, `Load`, `LocaleProvider`, `CrossSection` the file does not already import.

- [ ] **Step 3: Write the failing screen test**

Append to `apps/web/src/screens/LadeplanScreen.test.tsx`, following the fixture style already used at lines 104-196:

```tsx
it('sends a whole group to the buffer in one gesture', () => {
  // The svg sits at the top of the viewport; the buffer strip is stubbed below it, so a release at
  // y=2600 is outside the cutaway AND over the strip.
  const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 2400, right: 4000, bottom: 3000, width: 4000, height: 600, x: 0, y: 2400, toJSON: () => ({}) } as DOMRect;
  };
  try {
    const { container } = renderLadeplan(); // the file's existing render helper
    const svg = container.querySelector('svg[data-cutaway="top"]')!;

    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });

    const g = container.querySelector('[data-stack-ref]')!;
    fireEvent.pointerDown(g, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 2600 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 2600 });

    // Both stacks of the group are now unplaced — the strip counts them.
    expect(screen.getByTestId('warehouse-count')).toHaveTextContent('2 nicht platziert');
  } finally {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    restoreSvg();
  }
});
```

Adjust the expected count to the fixture the file actually renders: the binding assertion is that **every** stack of the group lands in the buffer, i.e. the count rises by the size of the selection, not by one.

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/screens/components/CrossSection.test.tsx apps/web/src/screens/LadeplanScreen.test.tsx`
Expected: FAIL — `group-frame` / `group-count` not found, `onMoveStacks` never called.

- [ ] **Step 5: Change the selection state to a list**

In `apps/web/src/screens/components/CrossSection.tsx`:

Replace the import line 18 and add the marquee import:

```ts
import { snap, type StackSel } from './editLayout';
import { normalizeRect, stacksInRect, hasRef, toggleRef, groupBBox, refKey } from './marquee';
import { fillTemplate } from './stackFormula';
```

Extend the engine import on line 13:

```ts
import { resolveDrop, resolveGroupDrop, type Layout, type Load, type StackRef } from '@shadrin-v/engine';
```

Replace the selection state (line 98):

```ts
  const [sel, setSel] = useState<StackRef[]>([]);
```

Delete the now-unused `sameStack` helper (lines 49-50) — `hasRef` replaces it.

Add marquee state next to `drag`:

```ts
  /** Live rubber band, in mm: the press origin plus the current pointer. */
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
```

- [ ] **Step 6: Widen `DragState` to carry a group**

Replace the `DragState` interface (lines 36-44):

```ts
interface DragState {
  /** Everything being carried. One stack for a plain drag, the whole selection for a group drag. */
  refs: StackRef[];
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  /** The engine's verdict for the current pointer position, or null before the first move. */
  preview: DropPreview | null;
  /** Group drags resolve a delta, not a position — kept so the drop applies what was previewed. */
  delta: { dx: number; dy: number } | null;
}
```

- [ ] **Step 7: Route the press**

Replace `onDown` (lines 128-133):

```ts
  const onDown = (r: CutRect) => (e: ReactPointerEvent) => {
    if (!draggable) return;
    const ref: StackRef = { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y };
    // Shift/Ctrl-click adds or drops this one stack and starts no drag: the user is composing a
    // selection, not moving anything yet.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSel((cur) => toggleRef(cur, ref));
      return;
    }
    const s = toSvg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // Pressing a stack that is already selected carries the WHOLE selection; pressing one outside it
    // is a fresh single-stack drag, and the old selection is abandoned.
    const inGroup = hasRef(sel, ref);
    if (!inGroup) setSel([ref]);
    setDrag({
      refs: inGroup ? sel : [ref],
      startX: s.x,
      startY: s.y,
      dx: 0,
      dy: 0,
      preview: null,
      delta: null,
    });
  };
```

Add a background press handler (this replaces the inline `onPointerDown` on the `<svg>`, line 184):

```ts
  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.target !== svgRef.current) return; // a stack handled it
    const s = toSvg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setBand({ x0: s.x, y0: s.y, x1: s.x, y1: s.y });
  };
```

- [ ] **Step 8: Route the move**

Replace `onMove` (lines 134-140):

```ts
  const onMove = (e: ReactPointerEvent) => {
    if (band) {
      const s = toSvg(e);
      setBand({ ...band, x1: s.x, y1: s.y });
      return;
    }
    if (!drag) return;
    const s = toSvg(e);
    const dx = s.x - drag.startX;
    const dy = s.y - drag.startY;
    if (drag.refs.length > 1) {
      const res = resolveGroupDrop(load, layout, drag.refs, { dx: snap(dx), dy: snap(dy) });
      setDrag({ ...drag, dx, dy, delta: { dx: res.dx, dy: res.dy }, preview: groupPreview(drag.refs, res) });
    } else {
      setDrag({ ...drag, dx, dy, delta: null, preview: previewFor(drag.refs[0], dx, dy) });
    }
  };
```

Add `groupPreview` next to `previewFor`. The existing `DropPreview` describes ONE rect, so the group ghost reuses it for the group's bounding box — the frame the user is dragging:

```ts
  /** The group ghost: the selection's bounding box at the resolved delta, plus whatever blocks it. */
  const groupPreview = (refs: StackRef[], res: GroupDropResolution): DropPreview | null => {
    const box = groupBBox(rects, refs);
    if (!box) return null;
    return {
      x: box.x + res.dx,
      y: box.y + res.dy,
      dx: box.w,
      dy: box.h,
      ok: res.ok,
      blocking: res.blocking,
    };
  };
```

Add `GroupDropResolution` to the engine type import.

- [ ] **Step 9: Route the release**

Replace `onUp` (lines 141-166):

```ts
  const onUp = (e: ReactPointerEvent) => {
    if (band) {
      const r = normalizeRect(band.x0, band.y0, band.x1, band.y1);
      // A press that did not travel is a click on empty floor: clear the selection.
      setSel(stacksInRect(rects, r));
      setBand(null);
      return;
    }
    if (!drag) return;
    const box = svgRef.current?.getBoundingClientRect();
    const outside =
      !!box && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
    if (outside && onDropOutside) {
      onDropOutside(drag.refs, e.clientX, e.clientY);
      setSel([]); // those stacks are off the floor now
      setDrag(null);
      return;
    }
    if (Math.hypot(drag.dx, drag.dy) < CLICK_SLOP_MM) {
      // A click on a stack toggles it as the sole selection (revealing the rotate action).
      if (rotatable) {
        const only = drag.refs[0];
        setSel((cur) => (cur.length === 1 && hasRef(cur, only) ? [] : [only]));
      }
    } else if (drag.refs.length > 1) {
      // Apply exactly the delta the ghost promised, and KEEP the selection so the user can nudge
      // the same block again without re-drawing the marquee.
      const d =
        drag.delta ?? resolveGroupDrop(load, layout, drag.refs, { dx: snap(drag.dx), dy: snap(drag.dy) });
      onMoveStacks?.(drag.refs, d.dx, d.dy);
      setSel(drag.refs.map((r) => ({ ...r, x: r.x + d.dx, y: r.y + d.dy })));
    } else {
      const to = drag.preview ?? previewFor(drag.refs[0], drag.dx, drag.dy);
      onMoveStack?.(drag.refs[0], to.x, to.y);
      setSel([]);
    }
    setDrag(null);
  };
```

- [ ] **Step 10: Update the props and the svg wiring**

In the component signature, replace the `onDropOutside` prop type and add `onMoveStacks`:

```ts
  /** When provided (top view), a group of 2+ selected stacks moves by a common delta. */
  onMoveStacks?: (refs: StackRef[], dx: number, dy: number) => void;
  /** Stacks dragged off the cutaway and dropped elsewhere (e.g. onto the buffer strip). Pointer
   *  capture keeps the events coming here even once the pointer has left this svg. */
  onDropOutside?: (refs: StackRef[], clientX: number, clientY: number) => void;
```

On the `<svg>` element, replace the `onPointerDown` line (184):

```ts
        onPointerDown={draggable ? onBackgroundDown : undefined}
```

and add an Escape handler by making the svg focusable is NOT needed — instead attach a window listener:

```ts
  useEffect(() => {
    if (!draggable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setBand(null);
      setSel([]);
      setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draggable]);
```

Add `useEffect` to the React import on line 12.

- [ ] **Step 11: Draw the chrome**

In the rect loop, replace the `isSelected` line (199) and the drag transform (193-194):

```ts
          const ref: StackRef = { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y };
          const isDragging = !!drag && hasRef(drag.refs, ref);
          const tf = isDragging ? `translate(${drag!.dx} ${drag!.dy})` : undefined;
          ...
          const isSelected = hasRef(sel, ref);
```

Give the stack group a stable test handle — without one, a test cannot address a particular stack, and the index `key={i}` is not addressable:

```tsx
            <g
              key={i}
              data-testid="stack"
              data-stack-ref={refKey(ref)}
              transform={tf}
              onPointerDown={draggable ? onDown(r) : undefined}
              style={draggable ? { cursor: 'grab' } : undefined}
            >
```

Keep the existing per-stack dashed rect exactly as it is. Change only the `RotateHandle` so it appears for a single selection alone — replace its guard by wrapping it:

```ts
              {isSelected && sel.length === 1 && (
                <RotateHandle … />
              )}
```

(the `<>…</>` fragment now holds the dashed `<rect>` unconditionally under `isSelected`, and the handle under the extra `sel.length === 1`).

After the rect loop and before the drop-preview block, add the group frame and the live marquee:

```ts
        {(() => {
          if (view !== 'top' || sel.length < 2) return null;
          const box = groupBBox(rects, sel);
          if (!box) return null;
          const d = drag && drag.refs.length > 1 ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          return (
            <g className="print:hidden" pointerEvents="none" transform={`translate(${d.x} ${d.y})`}>
              <rect
                data-testid="group-frame"
                x={box.x} y={box.y} width={box.w} height={box.h}
                fill="none" stroke="var(--brand)" strokeWidth={1.5} strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={box.x} y={box.y - countFont * 0.3}
                fill="var(--brand)" fontSize={countFont * 0.7} fontWeight={700}
                data-testid="group-count"
              >
                {fillTemplate(tt('ladeplan.selection.count'), { n: sel.length })}
              </text>
            </g>
          );
        })()}
        {band && view === 'top' && (() => {
          const r = normalizeRect(band.x0, band.y0, band.x1, band.y1);
          return (
            <rect
              data-testid="marquee"
              className="print:hidden"
              pointerEvents="none"
              x={r.x} y={r.y} width={r.w} height={r.h}
              fill="var(--brand)" fillOpacity={0.08}
              stroke="var(--brand)" strokeWidth={1} strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })()}
```

- [ ] **Step 12: Wire the screen**

In `apps/web/src/screens/LadeplanScreen.tsx`, extend the engine import to include `moveStacks` and `unplaceStacks`, then add next to `onMoveStack` (line 140-141):

```ts
  const onMoveStacks = (refs: StackRef[], dx: number, dy: number) =>
    applyEdit((prev) => moveStacks(load, prev, refs, dx, dy));
```

Replace `onDropOutside` (lines 245-251):

```ts
  /** Stacks dragged out of the hold and dropped on the strip go back to the buffer, all at once. */
  const bufferRef = useRef<HTMLDivElement>(null);
  const onDropOutside = (refs: StackRef[], clientX: number, clientY: number) => {
    const box = bufferRef.current?.getBoundingClientRect();
    if (!box) return;
    const overBuffer =
      clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
    if (overBuffer) applyEdit((prev) => unplaceStacks(load, prev, refs));
  };
```

Pass the new prop to the top-view `CrossSection` (line 428 onwards):

```tsx
              onMoveStacks={onMoveStacks}
```

Add `StackRef` to the type imports from `@shadrin-v/engine`.

- [ ] **Step 13: Run the web tests**

Run: `npx vitest run apps/web`
Expected: PASS, including the pre-existing drag and buffer tests — the single-stack path must not regress.

- [ ] **Step 14: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean, test count above the 454 at branch point.

- [ ] **Step 15: Manual check in the browser**

Run: `npm run dev --workspace apps/web`
Verify by hand, since jsdom cannot: rubber-band 3 stacks → group frame with the count appears; drag the group → it moves as a block and snaps flush; drag it into a wall → red blockers and no move; drag the group onto the buffer strip → all of them appear there; Shift-click removes one stack from the selection; Escape clears; print preview shows no selection chrome.

- [ ] **Step 16: Commit**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/LadeplanScreen.test.tsx
git commit -m "feat(web): marquee group selection and block move of stacks (LKWkalk-dwc.6)"
```

---

### Task 6: Changelog and bead closure

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add the changelog entry**

Open `docs/CHANGELOG.md`, read the most recent entry to match its heading style and date format exactly, then add above it:

```markdown
### Групповое выделение и перенос стопок (`LKWkalk-dwc.6`)

- Рамка мыши по виду сверху: протяжка с пустого места пола выделяет все задетые стопки;
  Shift/Ctrl-клик добавляет или снимает одну, Escape снимает выделение.
- Группа переносится как жёсткий блок — взаимное расположение стопок сохраняется. Групповой
  магнит подтягивает блок целиком к ближайшему законному месту, наследуя правило одиночного
  магнита «вплотную важнее, чем близко».
- Не влезло — отказ целиком: раскладка не меняется, мешающие стопки подсвечиваются красным.
  Полуприменённых правок не бывает.
- Выделенная группа уходит в буфер одним движением. Обратно стопки возвращаются поштучно:
  буфер раскладывает тайлы построчно и формы группы не хранит.
- Хром выделения экранный: в печать и PDF не идёт.
- Контракт движка `0.14.0` — добавлены `unplaceStacks`, `moveStacks`, `resolveGroupDrop`
  ([ADR 021](adr/021-group-layout-edits.md)). Аддитивно, одиночные операции не менялись.
```

- [ ] **Step 2: Verify everything one last time**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean. Record the exact test count in the commit body.

- [ ] **Step 3: Commit and close the bead**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): group selection and block move (LKWkalk-dwc.6)"
bd close LKWkalk-dwc.6 --reason "Marquee group selection, rigid block move with group magnet, group-to-buffer. Contract 0.14.0 + ADR 021."
```

---

## Notes for the reviewer of each task

- **The invariant that matters most** is all-or-nothing: on refusal the returned layout must be the ORIGINAL object (`expect(next).toBe(layout)`, identity — not `toEqual`). A rebuilt-but-equal copy would pass a loose test and still be a bug, because it means the operation walked a mutation path.
- **Do not add error codes.** Group operations reuse `ERR_EDIT_NO_STACK`, `ERR_EDIT_OUT_OF_BOUNDS`, `ERR_EDIT_OVERLAP`; the screen already renders all three.
- **Do not let the UI decide geometry.** If a step tempts you to compute overlap or bounds in `apps/web`, it belongs in the engine (ADR 019).
- **jsdom cannot run pointer gestures** (no `getScreenCTM`). A component test that appears to drag is asserting nothing. Push the logic into `marquee.ts` and test it there.
