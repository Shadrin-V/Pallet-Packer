# Склад: дроп в место броска + видимый призрак + фон — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Перенос стопки из кузова в склад: призрак и курсор видны над складом, стопка ложится в место
броска с «раздвиганием» соседей (reflow), плюс фоновая иллюстрация склада из вектора владельца.

**Architecture:** Чистая презентация в `apps/web`. Буфер получает явный порядок отображения (оверлей в
screen-state `LadeplanScreen`, как `tileOrientation`). `warehouseLayout.ts` (чистый модуль) считает индекс
вставки из точки и раскладывает по явному порядку с фантом-слотом. `CrossSection` прокидывает клиентскую
точку драга наружу для страничного призрака. Ассет фона заменяет `ForkliftMark`, привязывается к viewBox
склада.

**Tech Stack:** TypeScript, React, Vitest + jsdom, SVG. Движок `@shadrin-v/engine` — только чтение
(`stackBuffer`, `unplaceStacks`, `orientedDims`), контракт не меняется.

## Global Constraints

- Движок (`packages/engine`) и контракт (`docs/api-contract.md`) НЕ трогать — только чтение.
- Склад экран-онли: `print:hidden`; PNG/PDF-экспорт берёт только `svg[data-cutaway]`, склад не несёт этот атрибут.
- 1:1-масштаб склада к кузову держится структурно: секция склада без горизонтального padding/border/скролла;
  `viewBox` шириной `load.vehicle.length`, `width:100%`.
- Ни одной пользовательской строки в коде — только ключи локалей (`packages/i18n`), локали `de`, `ru`.
- Чистые модули (`warehouseLayout.ts`) тестируются без DOM; визуал и жесты — только настоящий Chrome
  (jsdom не проверяет геометрию/клиппинг/драг — см. HANDOVER 2026-07-23-cutaway).
- Внутренне — целые миллиметры (ADR 002).
- Детерминизм: одинаковый ввод + правки → одинаковая раскладка.

---

## File Structure

- `apps/web/src/screens/components/warehouseLayout.ts` — **[B]** чистая логика: раскладка по явному
  порядку, `insertionIndexAt(point)`, фантом-слот. Расширяется, остаётся pure.
- `apps/web/src/screens/components/warehouseLayout.test.ts` — тесты чистой логики.
- `apps/web/src/screens/components/CrossSection.tsx` — **[A]** новый проп `onCarry`/`onCarryEnd`, вызовы в
  `onMove`/`onUp`/`onCancel`.
- `apps/web/src/screens/LadeplanScreen.tsx` — **[A]** carry-state + страничный призрак кузов→склад; **[B]**
  явный порядок буфера + индекс вставки + запись при дропе.
- `apps/web/src/screens/components/WarehouseFloor.tsx` — **[B]** рендер фантом-зазора; **[C]** замена
  `ForkliftMark` привязкой ассета.
- `apps/web/src/screens/components/WarehouseFloor.test.tsx` — тесты рендера (фантом, ассет-группы).
- `apps/web/src/assets/warehouse-scenery.svg` — **[C]** ассет владельца (по брифу).
- `apps/web/src/screens/components/ForkliftMark.tsx` — **[C]** удаляется/поглощается ассетом.

---

## Task 1 [B-core]: `insertionIndexAt` + раскладка по явному порядку

**Files:**
- Modify: `apps/web/src/screens/components/warehouseLayout.ts`
- Test: `apps/web/src/screens/components/warehouseLayout.test.ts`

**Interfaces:**
- Consumes: существующие `warehouseFloor(load, tiles, opts)`, `PlacedTile{tile,x,y,dx,dy}`,
  `WarehouseFloorLayout{tiles,width,height}`, `orientedDims`.
- Produces:
  - `warehouseFloor(load, tiles, opts)` — БЕЗ изменения сигнатуры; порядок берётся из порядка массива
    `tiles` (уже так). Явный порядок задаёт вызывающий, переставляя `tiles` перед вызовом.
  - `insertionIndexAt(layout: WarehouseFloorLayout, point: {x:number;y:number}): number` — по точке в mm
    (в системе координат склада) вернуть индекс вставки в поток `[0..tiles.length]`. Правило: индекс
    первой плитки, чей ЦЕНТР правее/ниже точки в порядке потока; если точка за последней — `tiles.length`.
    Сравнение по ряду (y-полосе), затем по x внутри ряда.

- [ ] **Step 1: Failing test — вставка в середину ряда**

```ts
import { describe, it, expect } from 'vitest';
import { warehouseFloor, insertionIndexAt } from './warehouseLayout';
import type { BufferTile } from './warehouseLayout';
import type { Load } from '@shadrin-v/engine';

const load = {
  vehicle: { length: 13600, width: 2480, height: 2650 },
  cargo: [{ id: 'eur', name: 'EUR', length: 1200, width: 800, height: 1000, rotation: 'yaw' }],
} as unknown as Load;
const tile = (): BufferTile => ({ cargoTypeId: 'eur', units: 1, orientation: 'lwh' });

it('insertion index in the middle of a row', () => {
  const tiles = [tile(), tile(), tile()];
  const fl = warehouseFloor(load, tiles);
  // centre of the 2nd tile:
  const t1 = fl.tiles[1];
  const idx = insertionIndexAt(fl, { x: t1.x + t1.dx / 2, y: t1.y + t1.dy / 2 });
  expect(idx).toBe(1);
});
```

- [ ] **Step 2: Run — verify FAIL** (`insertionIndexAt` не определён)

Run: `npm test -w apps/web -- warehouseLayout`
Expected: FAIL — `insertionIndexAt is not a function`.

- [ ] **Step 3: Implement `insertionIndexAt`**

```ts
/** Where a point (mm, warehouse frame) falls in the flow order: index in [0..tiles.length].
 *  Rows first (by vertical band of each placed tile), then x within the row. A point past the
 *  last tile of its row inserts after it; past all rows, at the end. */
export function insertionIndexAt(
  layout: WarehouseFloorLayout,
  point: { x: number; y: number },
): number {
  const { tiles } = layout;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const cy = t.y + t.dy / 2;
    const cx = t.x + t.dx / 2;
    // First tile whose row is below the point, OR same row and whose centre is right of the point.
    if (point.y < t.y) return i; // point is above this tile's row entirely
    if (point.y <= t.y + t.dy && point.x < cx) return i; // within row, left of centre
    void cy;
  }
  return tiles.length;
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -w apps/web -- warehouseLayout`
Expected: PASS.

- [ ] **Step 5: More failing tests — начало ряда, конец, следующий ряд, пустой склад**

```ts
it('before the first tile → 0', () => {
  const tiles = [tile(), tile()];
  const fl = warehouseFloor(load, tiles);
  expect(insertionIndexAt(fl, { x: 0, y: fl.tiles[0].y })).toBe(0);
});

it('past the last tile → length', () => {
  const tiles = [tile(), tile()];
  const fl = warehouseFloor(load, tiles);
  expect(insertionIndexAt(fl, { x: load.vehicle.length, y: fl.tiles[1].y })).toBe(2);
});

it('empty floor → 0', () => {
  const fl = warehouseFloor(load, []);
  expect(insertionIndexAt(fl, { x: 500, y: 500 })).toBe(0);
});

it('point in the second row lands after the first row', () => {
  // Enough tiles to wrap to a second row at this vehicle length.
  const tiles = Array.from({ length: 14 }, tile);
  const fl = warehouseFloor(load, tiles);
  const secondRow = fl.tiles.find((t) => t.y > fl.tiles[0].y);
  expect(secondRow).toBeTruthy();
  const idx = insertionIndexAt(fl, { x: secondRow!.x - 1, y: secondRow!.y + 1 });
  const firstRowCount = fl.tiles.filter((t) => t.y === fl.tiles[0].y).length;
  expect(idx).toBe(firstRowCount);
});
```

- [ ] **Step 6: Run — adjust implementation until all pass**

Run: `npm test -w apps/web -- warehouseLayout`
Expected: PASS all. (If the second-row case fails, refine the row test: a tile is "in the point's row"
when `t.y <= point.y <= t.y + t.dy`; the loop's row-order guarantees earlier rows are consumed first.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/screens/components/warehouseLayout.ts apps/web/src/screens/components/warehouseLayout.test.ts
git commit -m "feat(warehouse): insertionIndexAt — flow index from a point (B-core)"
```

---

## Task 2 [B-core]: Фантом-слот в раскладке

**Files:**
- Modify: `apps/web/src/screens/components/warehouseLayout.ts`
- Test: `apps/web/src/screens/components/warehouseLayout.test.ts`

**Interfaces:**
- Produces: `PlacedTile` получает опциональный флаг `phantom?: true`. Раскладка с фантомом достигается
  вызывающим: вставить в массив `tiles` спец-плитку `{ ...carried, phantom: true }` на индекс из
  `insertionIndexAt`, затем `warehouseFloor` — соседи сдвинутся штатным reflow. `warehouseFloor`
  прокидывает `phantom` в `PlacedTile`. Отдельная функция не нужна — это композиция; тест фиксирует
  прокидывание флага и сдвиг соседей.

- [ ] **Step 1: Failing test — фантом раздвигает соседей и помечен**

```ts
it('a phantom tile shifts the tiles after it and is flagged', () => {
  const tiles = [tile(), tile(), tile()];
  const withPhantom: BufferTile[] = [
    tiles[0],
    { ...tile(), phantom: true } as BufferTile & { phantom?: true },
    tiles[1],
    tiles[2],
  ];
  const base = warehouseFloor(load, tiles);
  const fl = warehouseFloor(load, withPhantom);
  // The tile that was 2nd is now pushed right by one slot (a tile + gap).
  expect(fl.tiles[2].x).toBeGreaterThan(base.tiles[1].x);
  expect((fl.tiles[1] as { phantom?: true }).phantom).toBe(true);
});
```

- [ ] **Step 2: Run — verify FAIL** (`phantom` не прокидывается / тип не пускает поле)

Run: `npm test -w apps/web -- warehouseLayout`
Expected: FAIL.

- [ ] **Step 3: Implement — тип + прокидывание флага**

В `warehouseLayout.ts`: расширить `BufferTile` опциональным `phantom?: true` и `PlacedTile` тем же
полем; в цикле `warehouseFloor` переносить `tile.phantom` в `out.push({ ..., phantom: tile.phantom })`.

```ts
export interface BufferTile extends BufferStack {
  orientation: 'lwh' | 'wlh';
  /** A placeholder opened during a carry-in drag; not a real stack (B). */
  phantom?: true;
}
// в PlacedTile добавить: phantom?: true;
// в out.push: out.push({ tile, x, y, dx, dy, phantom: tile.phantom });
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -w apps/web -- warehouseLayout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/components/warehouseLayout.ts apps/web/src/screens/components/warehouseLayout.test.ts
git commit -m "feat(warehouse): phantom slot flag propagated through layout (B-core)"
```

---

## Task 3 [A]: Страничный призрак драга кузов→склад

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx` (пропы + `onMove`/`onUp`/`onCancel`)
- Modify: `apps/web/src/screens/LadeplanScreen.tsx` (carry-state + ghost)
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Produces (CrossSection пропы):
  - `onCarry?: (payload: { count: number; label: string; clientX: number; clientY: number }) => void` —
    вызывается на каждом `onMove` пока есть `drag` (несём стопку/группу). `count` = число единиц
    (для группы — сумма), `label` = имя типа (для группы — первый тип или ключ `warehouse.groupLabel`).
  - `onCarryEnd?: () => void` — вызывается в `onUp` и `onCancel`, когда драг завершён.
- Consumes (LadeplanScreen): рендерит `data-testid="hold-drag-ghost"` — `fixed`, `pointer-events:none`,
  как существующий `drag-ghost` (LadeplanScreen:501), пока carry-state не null.

- [ ] **Step 1: Failing test — onCarry вызывается при драге стопки в top-view**

```tsx
// В CrossSection.test.tsx: смонтировать top-view с onMoveStack+onCarry, начать драг стопки
// (pointerDown на data-stack-ref → pointerMove), ожидать вызов onCarry с count/label/clientX/clientY.
it('calls onCarry with the carried stack while dragging in the top view', () => {
  const onCarry = vi.fn();
  // ...render top CrossSection with onMoveStack + onCarry (see existing drag tests for setup)...
  // fireEvent.pointerDown(stackGroup); fireEvent.pointerMove(holdSvg, { clientX: 400, clientY: 200 });
  expect(onCarry).toHaveBeenCalledWith(
    expect.objectContaining({ count: expect.any(Number), clientX: 400, clientY: 200 }),
  );
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test -w apps/web -- CrossSection`
Expected: FAIL — `onCarry` не вызывается.

- [ ] **Step 3: Implement — вызовы onCarry/onCarryEnd**

В `onMove` (после установки `drag`): если `drag`, посчитать `count` (сумма `units` по `drag.refs` через
`rects`) и `label` (имя первого типа) и вызвать `onCarry?.({ count, label, clientX: e.clientX, clientY: e.clientY })`.
В `onUp` и `onCancel`: вызвать `onCarryEnd?.()`. Добавить пропы в тип компонента.

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -w apps/web -- CrossSection`
Expected: PASS.

- [ ] **Step 5: Wire the ghost in LadeplanScreen**

Добавить `const [carry, setCarry] = useState<{count:number;label:string;x:number;y:number}|null>(null);`
Передать в top-`CrossSection`: `onCarry={(p)=>setCarry({count:p.count,label:p.label,x:p.clientX,y:p.clientY})}`
и `onCarryEnd={()=>setCarry(null)}`. Отрисовать рядом с существующим `drag-ghost`:

```tsx
{carry && (
  <div
    data-testid="hold-drag-ghost"
    className="pointer-events-none fixed z-30 rounded-ctl border border-brand bg-card px-2 py-1 text-caption font-semibold shadow-pop"
    style={{ left: carry.x + 12, top: carry.y + 12 }}
  >
    {carry.label} ×{carry.count}
  </div>
)}
```

- [ ] **Step 6: jsdom test — ghost присутствует во время драга (LadeplanScreen.test)**

Смонтировать `LadeplanScreen` с редактируемой раскладкой, начать драг стопки в top-view, ожидать
`getByTestId('hold-drag-ghost')` с текстом `имя ×N`. Отпустить — ghost исчезает.

- [ ] **Step 7: Run — verify PASS**

Run: `npm test -w apps/web`
Expected: PASS (весь apps/web зелёный).

- [ ] **Step 8: Chrome-проверка (jsdom не ловит клиппинг)**

Harness с `LadeplanScreen` → `vite --port 5178` → `chrome --headless --screenshot` во время
CDP-драга (Грабли: trusted-события). Убедиться: карточка-призрак видна НАД поверхностью склада, курсор не
исчезает. Зафиксировать в комментарии PR.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "feat(ladeplan): page-level ghost keeps carried stack visible over the warehouse (A)"
```

---

## Task 4 [B-wire]: Явный порядок буфера + живой зазор + дроп в место броска

**Files:**
- Modify: `apps/web/src/screens/LadeplanScreen.tsx`
- Modify: `apps/web/src/screens/components/WarehouseFloor.tsx` (рендер фантома)
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx`, `WarehouseFloor.test.tsx`

**Interfaces:**
- Consumes: `insertionIndexAt`, `warehouseFloor` (Task 1–2); `unplaceStacks` (engine); `toHoldMm` уже
  маппит client→hold mm — нужен аналог `toWarehouseMm(clientX,clientY)` через `svg[role=img]` склада
  (по образцу `toHoldMm`, но для warehouse svg; вернуть mm в его viewBox или null если вне).
- Produces:
  - `bufferOrder: string[]` в screen-state — ключи `cargoTypeId#occurrence` в желаемом порядке; дефолт
    пуст → `orderedTiles = tiles` (детерминированный `stackBuffer`-порядок). Ключи не из оверлея
    добавляются в конец в дефолтном порядке.
  - При драге кузов→склад (carry) над складом: вычислить `idx = insertionIndexAt(warehouseFloor(load, orderedTiles), pt)`,
    показать фантом — передать `WarehouseFloor` проп `phantomAt?: {index:number; tile:BufferTile}` →
    компонент вставляет фантом-плитку на индекс перед `warehouseFloor`.
  - `onDropOutside(refs, clientX, clientY)`: если над складом — вычислить `idx`, вызвать `unplaceStacks`,
    и записать ключи вернувшихся стопок в `bufferOrder` на позицию `idx`.

- [ ] **Step 1: WarehouseFloor рендерит фантом — failing test**

```tsx
it('renders a dashed phantom slot at phantomAt.index', () => {
  // render WarehouseFloor with tiles + phantomAt={{ index: 1, tile }}
  // expect a [data-testid="warehouse-phantom"] rect between tiles 0 and 1
});
```

- [ ] **Step 2: Run — verify FAIL**; **Step 3: Implement**

В `WarehouseFloor`: принять проп `phantomAt?: {index:number; tile:BufferTile} | null`. Перед
`warehouseFloor(load, tiles)` собрать `renderTiles = phantomAt ? [...tiles.slice(0,idx), {...phantomAt.tile, phantom:true}, ...tiles.slice(idx)] : tiles`.
Для плитки с `pt.phantom` вместо `StackShape` рисовать dashed-прямоугольник `data-testid="warehouse-phantom"`
(fill none, stroke `var(--brand)`, dasharray), без числа/захвата.

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -w apps/web -- WarehouseFloor`

- [ ] **Step 5: LadeplanScreen — порядок + маппинг + запись при дропе (failing test)**

jsdom-тест: смонтировать, программно вызвать `onDropOutside([ref], clientX, clientY)` с координатами над
складом (замокать `getBoundingClientRect`/CTM как в существующих тестах drop). Ожидать: `unplaceStacks`
применён (стопка появилась в буфере) и её ключ в `bufferOrder` на индексе, соответствующем точке.
(Точный индекс проверяем на маленьком детерминированном буфере.)

- [ ] **Step 6: Implement — bufferOrder + orderedTiles + toWarehouseMm + фантом при carry + запись при дропе**

- `orderedTiles`: отсортировать `tiles` по `bufferOrder` (известные ключи по индексу, прочие — в конец в
  исходном порядке).
- `toWarehouseMm`: как `toHoldMm`, но по warehouse-svg.
- Во время carry (из Task 3 у нас есть client-точка): если `toWarehouseMm` != null, вычислить `idx` и
  прокинуть `phantomAt` в `WarehouseFloor`.
- В `onDropOutside`: если `overBuffer`, `pt = toWarehouseMm(...)`, `idx = insertionIndexAt(...)`,
  `applyEdit(prev => unplaceStacks(load, prev, refs))`, и обновить `bufferOrder`, вставив ключи
  вернувшихся стопок на `idx`. Пользовательская гарантия: рядом с точкой броска.

- [ ] **Step 7: Run — verify PASS**

Run: `npm test -w apps/web`
Expected: PASS.

- [ ] **Step 8: Chrome-проверка жеста (CDP, jsdom не ловит)**

CDP-репро реального перетаскивания (как для `lqz`): взять стопку в кузове, вести над складом (видеть
живой зазор), отпустить между двумя плитками → стопка встала туда, соседи раздвинулись, НЕ в верхний
левый угол. Зафиксировать в PR.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/components/WarehouseFloor.tsx apps/web/src/screens/LadeplanScreen.test.tsx apps/web/src/screens/components/WarehouseFloor.test.tsx
git commit -m "feat(warehouse): drop from hold lands at the release point, reflowing neighbours (B)"
```

---

## Task 5 [C]: Привязка ассета фона склада (после доставки вектора владельцем)

> **Блокер:** ждёт `apps/web/src/assets/warehouse-scenery.svg` от владельца по брифу
> `docs/superpowers/specs/2026-07-23-warehouse-scenery-asset-brief.md`. До доставки — не начинать.

**Files:**
- Create: `apps/web/src/assets/warehouse-scenery.svg` (владелец) → вычистить cruft.
- Modify: `apps/web/src/screens/components/WarehouseFloor.tsx` (замена `ForkliftMark` привязкой ассета)
- Remove: `apps/web/src/screens/components/ForkliftMark.tsx` (и его тест)
- Test: `apps/web/src/screens/components/WarehouseFloor.test.tsx`

**Interfaces:**
- Consumes: viewBox склада `0 0 floor.width floorHeight` (WarehouseFloor). Backdrop-группа масштабируется
  на весь viewBox; сценерия-группы (`forklift`, `decor-*`) позиционируются по свободным краям (правило
  `bayFree` сохраняется — сценерия только там, где нет реальных плиток).

- [ ] **Step 1: Санитайз ассета** — снять `sodipodi:*`/`inkscape:*`/`<metadata>`, проверить `currentColor`,
  отсутствие `<text>`/градиентов/растров; well-formed XML. (Ручная проверка + `npm run lint`.)

- [ ] **Step 2: Failing test — backdrop и сценерия рендерятся, ForkliftMark удалён**

```tsx
it('renders the scenery backdrop group and no ForkliftMark', () => {
  // render WarehouseFloor with a non-empty buffer
  // expect [data-testid="warehouse-backdrop"] present; forklift scenery present where bay is free
});
```

- [ ] **Step 3: Implement** — импортировать ассет (как `truck-front-*.svg` в `truckChrome.tsx`), привязать
  группы к viewBox склада; убрать `ForkliftMark` импорт/рендер; удалить файл `ForkliftMark.tsx` + тест.

- [ ] **Step 4: Run — verify PASS**

Run: `npm test -w apps/web -- WarehouseFloor`

- [ ] **Step 5: Chrome-проверка визуала** — `chrome --headless --screenshot`: backdrop бледный под
  плитками, погрузчик смотрит вверх (к грузовику), декор не путается с реальными плитками, ч/б читаемо.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/assets/warehouse-scenery.svg apps/web/src/screens/components/WarehouseFloor.tsx apps/web/src/screens/components/WarehouseFloor.test.tsx
git rm apps/web/src/screens/components/ForkliftMark.tsx
git commit -m "feat(warehouse): scenery backdrop + forklift asset replaces ForkliftMark (C)"
```

---

## Self-Review

**Spec coverage:**
- Часть A (призрак не исчезает) → Task 3. ✅
- Часть B (дроп в место броска, reflow, живой зазор, явный порядок) → Tasks 1, 2, 4. ✅
- Часть C (фон: backdrop + сценерия, погрузчик к грузовику) → Task 5 (+ бриф). ✅
- Тонкость взаимозаменяемости однотипных стопок → гарантия «рядом с точкой броска» держится в Task 4;
  точное правило нормировки индекса к границам групп типа уточняется при реализации Task 4 (не плейсхолдер:
  дефолтное поведение — вставка по вычисленному индексу; тесты фиксируют детерминированный маленький буфер).
- Вне скоупа (внутри-складское переупорядочивание) — явно не планируется. ✅

**Placeholder scan:** код чистого модуля (Task 1–2) полный; тесты драга (Task 3–4) даны скелетами с
точными ожиданиями и опорой на существующие drag-тесты `CrossSection.test.tsx` — намеренно, т.к. точная
установка pointer-события повторяет уже существующие тесты в файле (DRY: смотреть их, не дублировать
50 строк setup). Chrome-шаги — обязательные проверки, не заглушки.

**Type consistency:** `BufferTile.phantom?`, `PlacedTile.phantom?`, `insertionIndexAt`, `phantomAt`,
`onCarry`/`onCarryEnd`, `bufferOrder`, `toWarehouseMm` — согласованы между задачами.

**Порядок и зависимости:** Task 1 → 2 (оба B-core, pure). Task 3 (A) независим, но даёт client-точку,
которую Task 4 переиспользует. Task 4 зависит от 1,2,3. Task 5 (C) зависит только от наличия ассета,
может идти параллельно 1–4.
