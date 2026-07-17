# Side-View Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На виде сбоку дальний ряд перестаёт закрашивать ближний, а низкие дальние стопки перестают
пропадать из-за притенения.

**Architecture:** Глубина стопки считается по **реальному перекрытию проекций** (интервал по длине +
бо́льший `y` = ближе к зрителю), а не по совпадению `x`. Порядок отрисовки задаётся возрастанием `rowY`,
а не рангом глубины. Притенение дальнего ряда гасит только заливку и штриховку, контур остаётся.

**Tech Stack:** TypeScript, React, SVG в мм-координатах, vitest + @testing-library/react.

Спека: [`docs/superpowers/specs/2026-07-17-side-view-depth-design.md`](../specs/2026-07-17-side-view-depth-design.md).
Задача: **`LKWkalk-1t2`**. Ветка: `fix/side-view-depth`.

## Global Constraints

- Изменения **только в UI-проекции** (`cutaway.ts`, `CrossSection.tsx`). Движок, контракт и раскладка
  не трогаются. Версия контракта не меняется.
- Расчёт детерминирован при одинаковом вводе — тай-брейк по `x` обязателен.
- Конвенция вида сбоку: зритель стоит у `y = width` и смотрит в сторону `y = 0` → **бо́льший `y` =
  ближе к зрителю**.
- Половинно-открытое перекрытие: касание кромками — **не** перекрытие (`a0 < b1 && b0 < a1`), то же
  правило, что в `packages/engine/src/packing/edit.ts`.
- Ни одной пользовательской строки в коде — только ключи локалей (в этом плане новых строк нет).
- Гейты перед merge: `npm test` · `npm run lint` · `npm run typecheck` · `npm run build --workspace apps/web`.
- Эталоны упаковщика **EUR 34 / GB 20 / none 33** не должны шелохнуться — этот план их не касается,
  но `npm test` их сторожит.

---

### Task 1: Глубина по перекрытию проекций

**Files:**
- Modify: `apps/web/src/screens/components/cutaway.ts:77-111` (`sideRects`)
- Test: `apps/web/src/screens/components/cutaway.test.ts`

**Interfaces:**
- Consumes: `CutRect` (уже есть, поля `depth`, `rowY` не меняются по типу).
- Produces: `sideRects(load, layout, vehicleHeight, colors?) → CutRect[]`, где `depth` = число стопок,
  реально загораживающих эту. `depth === 0` означает «ничто не загораживает».

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `apps/web/src/screens/components/cutaway.test.ts`. Импорт `Layout` расширяет
существующий импорт из `@shadrin-v/engine` в строке 2:

```ts
// строка 2 становится:
import { calculateLayout, type Layout, type Load } from '@shadrin-v/engine';
```

Сам блок:

```ts
// Стопки в РАЗНЫХ рядах, чьи x не совпадают, но проекции на бок перекрываются. Раскладка собрана
// руками: упаковщик такую расстановку на однородном грузе не даёт, а sideRects — чистая функция
// от Layout, так что это честный юнит-тест её правила.
const mixedV = { id: 'v2', name: 'LKW', length: 4000, width: 2400, height: 2000 };
const mixed: Load = {
  vehicle: mixedV,
  cargo: ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    length: 1200,
    width: 800,
    height: 1000,
    quantity: 1,
    rotation: 'none' as const,
    stacking: { stackable: false },
    nesting: { nestable: false },
    state: 'entschachtelt' as const,
    orderId: 'SO-1',
  })),
};
const mixedLayout = (placements: Layout['placements']): Layout => ({
  placements,
  unplaced: [],
  metrics: { totalPlaced: placements.length, usedFloorPositions: placements.length, floorFillPercent: 0, volumeFillPercent: 0 },
  contractVersion: '0.12.0',
});
const at = (cargoTypeId: string, x: number, y: number): Layout['placements'][number] => ({
  cargoTypeId, x, y, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt',
});

describe('side view depth ranks by projection overlap, not by equal x', () => {
  it('ranks the rear stack behind the near one even when their x differ', () => {
    // a: x 0…1200 в дальнем ряду (y=0); b: x 600…1800 в ближнем (y=1600). Перекрываются по длине.
    const rects = sideRects(mixed, mixedLayout([at('a', 0, 0), at('b', 600, 1600)]), mixedV.height);
    const rear = rects.find((r) => r.rowY === 0)!;
    const near = rects.find((r) => r.rowY === 1600)!;
    expect({ rearDepth: rear.depth, nearDepth: near.depth }).toEqual({ rearDepth: 1, nearDepth: 0 });
  });

  it('does not dim a rear stack that nothing actually hides', () => {
    // Одиночная стопка в дальнем ряду и стопка в ближнем, но ДАЛЕКО по длине (не перекрываются).
    const rects = sideRects(mixed, mixedLayout([at('a', 0, 0), at('b', 2500, 1600)]), mixedV.height);
    expect(rects.map((r) => r.depth)).toEqual([0, 0]);
  });

  it('is deterministic for the same input', () => {
    const build = () => sideRects(mixed, mixedLayout([at('a', 0, 0), at('b', 600, 1600)]), mixedV.height);
    expect(build()).toEqual(build());
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run apps/web/src/screens/components/cutaway.test.ts -t "projection overlap"`
Expected: FAIL — первый тест даёт `{ rearDepth: 0, nearDepth: 0 }` вместо `{ rearDepth: 1, nearDepth: 0 }`.

- [ ] **Step 3: Минимальная реализация**

В `apps/web/src/screens/components/cutaway.ts` добавить рядом с `gridLines`-подобными хелперами
(над `sideRects`):

```ts
/** Half-open interval overlap (touching edges do not overlap) — the engine's rule, edit.ts. */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
```

Заменить в `sideRects` блок `ysByX` (строки 90-110) на:

```ts
  // Depth = how many stacks actually hide this one: they overlap it IN THE PROJECTION (by the x
  // interval — not by an equal x, which is what the side view collapses) and stand nearer the viewer.
  // Convention: the viewer is at y = width looking towards y = 0, so a LARGER y is nearer.
  // depth 0 therefore means "nothing is in front of this stack" — an isolated stack in a rear row is
  // no longer dimmed for company it does not keep.
  const hiddenBy = (s: (typeof stacks)[number]) =>
    stacks.filter((o) => o !== s && o.y > s.y && overlaps1d(s.x, s.x + s.w, o.x, o.x + o.w)).length;
  return stacks.map((s) => ({
    x: s.x,
    y: vehicleHeight - s.top,
    w: s.w,
    h: s.top,
    series: s.series,
    cargoTypeId: s.cargoTypeId,
    depth: hiddenBy(s),
    rowY: s.y,
  }));
```

Обновить doc-комментарий над `sideRects` (строки 71-76): фраза «Stacks that share an x … `depth` ranks
them front→back» описывает снятое правило. Новый текст:

```ts
/**
 * Side view (Seitenansicht): one silhouette bar per floor stack (grouped by x,y), its height = that
 * stack's top (max z+dz). Stacks whose x INTERVALS overlap hide one another in the projection;
 * `depth` counts how many stand in front of this one, so the renderer can dim what is genuinely
 * behind something — and leave alone what merely shares a row with it.
 */
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run apps/web/src/screens/components/cutaway.test.ts`
Expected: PASS — все, включая два старых теста (`front/back depth rank`, `T2`): на однородной сетке
2×2 (x ∈ {0,1000}, ряды выровнены) новое правило даёт те же ранги, что и старое.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/components/cutaway.ts apps/web/src/screens/components/cutaway.test.ts
git commit -m "fix(cutaway): rank side-view depth by projection overlap, not by equal x

sideRects ranked depth only among stacks with an identical x, but the side
view collapses the x INTERVAL — two stacks in different rows that overlap
lengthwise both scored depth 0, so the rear one was neither dimmed nor
drawn behind. Depth now counts the stacks that actually hide a stack.

Falls out of the same change: an isolated rear-row stack that nothing
overlaps scores 0 and stops being dimmed for no reason.

LKWkalk-1t2"
```

---

### Task 2: Порядок отрисовки по `rowY`

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx:110-112`
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Consumes: `CutRect.rowY` из Task 1.
- Produces: порядок `<g>` в DOM вида сбоку — по возрастанию `rowY`, тай-брейк по `x`.

- [ ] **Step 1: Написать падающий тест**

Фикстура подобрана так, чтобы поймать именно порок сортировки по глубине. **Глубина — счётчик, а не
порядок:** дальнюю стопку может загораживать одна соседка (глубина 1), а ближнюю — три (глубина 3).
Сортировка по убыванию глубины нарисует ближнюю раньше дальней, и дальняя её закрасит. Простые две
стопки этого не ловят — там глубина случайно совпадает с порядком, и тест прошёл бы сразу.

Добавить в `apps/web/src/screens/components/CrossSection.test.tsx`:

```ts
// строка 4 становится:
import { calculateLayout, type Layout, type Load } from '@shadrin-v/engine';
```

```ts
// Пять стопок 1200×400. s(x=0,y=0) — дальняя, её загораживает ровно одна: o(x=600,y=500).
// Саму o загораживают три стопки при x=1300, которые до s не достают (1300 ≥ 1200).
// Глубины: s=1, o=3 → сортировка по глубине ставит o ПЕРЕД s, и дальняя s закрашивает ближнюю o.
const depthV = { id: 'v2', name: 'LKW', length: 4000, width: 2400, height: 2000 };
const depthLoad: Load = {
  vehicle: depthV,
  cargo: [
    {
      id: 'p',
      name: 'P',
      length: 1200,
      width: 400,
      height: 1000,
      quantity: 5,
      rotation: 'none',
      stacking: { stackable: false },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const at = (x: number, y: number): Layout['placements'][number] => ({
  cargoTypeId: 'p', x, y, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt',
});
const depthLayout: Layout = {
  placements: [at(0, 0), at(600, 500), at(1300, 1000), at(1300, 1500), at(1300, 2000)],
  unplaced: [],
  metrics: { totalPlaced: 5, usedFloorPositions: 5, floorFillPercent: 0, volumeFillPercent: 0 },
  contractVersion: '0.12.0',
};

describe('side view paint order', () => {
  it('draws far rows before near ones — depth is a count, not an order', () => {
    const { container } = render(
      <LocaleProvider>
        <CrossSection load={depthLoad} layout={depthLayout} view="side" label="Seitenansicht" />
      </LocaleProvider>,
    );
    const svg = container.querySelector('svg[data-cutaway="side"]')!;
    // первый <rect> каждой группы несёт её x — по нему и опознаём стопку
    const xs = [...svg.querySelectorAll('g > rect:first-child')].map((r) => Number(r.getAttribute('x')));
    expect(xs).toEqual([0, 600, 1300, 1300, 1300]); // по возрастанию rowY
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run apps/web/src/screens/components/CrossSection.test.tsx -t "paint order"`
Expected: FAIL — получено `[600, 1300, 0, 1300, 1300]`: `o` (глубина 3) нарисована первой, а дальняя
`s` (глубина 1) — третьей, то есть поверх неё.

- [ ] **Step 3: Реализация**

В `apps/web/src/screens/components/CrossSection.tsx` заменить строки 110-112:

```tsx
  // Side view: draw far rows before near ones, so a nearer stack overlays what it really hides.
  // Sorting by `depth` would be wrong: "hidden by two" does not mean "further back than hidden by
  // one" — that is a count, not an order. `rowY` is the order; x breaks ties, for determinism.
  const sortedRects =
    view === 'side'
      ? [...rects].sort((a, b) => (a.rowY ?? 0) - (b.rowY ?? 0) || a.x - b.x)
      : rects;
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run apps/web/src/screens/components/CrossSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "fix(cutaway): paint side view by rowY, far rows first

Sorting by depth is not an order: 'hidden by two' does not mean 'further
back than hidden by one'. Row y is the order, x breaks ties so the same
input always yields the same DOM.

LKWkalk-1t2"
```

---

### Task 3: D2 — дальний ряд гасится заливкой, не контуром

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx:192-203`
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Consumes: `CutRect.depth` из Task 1.
- Produces: у дальней стопки (`depth > 0`) контур `stroke-opacity` 1, заливка `fill-opacity` 0.06.

- [ ] **Step 1: Написать падающий тест**

Использует фикстуру `depthLoad`/`depthLayout` из Task 2 (тот же файл):

```ts
describe('side view dimming (D2)', () => {
  it('dims a rear stack by its fill, keeping the outline at full strength', () => {
    const { container } = render(
      <LocaleProvider>
        <CrossSection load={depthLoad} layout={depthLayout} view="side" label="Seitenansicht" />
      </LocaleProvider>,
    );
    const svg = container.querySelector('svg[data-cutaway="side"]')!;
    // дальняя стопка (x=0) идёт первой после Task 2
    const rear = svg.querySelectorAll('g')[0];
    // группа больше не гасится целиком — иначе контур гаснет вместе с заливкой
    expect(rear.getAttribute('opacity')).toBeNull();
    const fill = rear.querySelector('rect:first-child')!;
    const outline = [...rear.querySelectorAll('rect')].at(-1)!;
    expect(Number(fill.getAttribute('fill-opacity'))).toBeLessThan(0.16);
    expect(outline.getAttribute('stroke-opacity')).toBeNull(); // контур в полную силу
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run apps/web/src/screens/components/CrossSection.test.tsx -t "D2"`
Expected: FAIL — `expect(rear.getAttribute('opacity')).toBeNull()` получает `"0.4"`.

- [ ] **Step 3: Реализация**

В `apps/web/src/screens/components/CrossSection.tsx`, в `sortedRects.map(...)`:

Строка 196 — заменить:
```tsx
          const dim = view === 'side' && (r.depth ?? 0) > 0;
```
на:
```tsx
          // Rear rows: dim the FILL, never the outline. A low rear stack (a quarter-pallet at 864 of
          // 2650 mm) vanished when the whole group went to 0.4 — and the side view is now the first
          // thing on the sheet, so it has to stay readable behind the front row.
          const behind = view === 'side' && (r.depth ?? 0) > 0;
```

Строка 199 — снять `opacity` с группы:
```tsx
            <g key={i} transform={tf} onPointerDown={draggable ? onDown(r) : undefined} style={draggable ? { cursor: 'grab' } : undefined}>
```

Строки 201-203 — заливка и штриховка гаснут, контур нет:
```tsx
              {/* solid tint base + direct-line hatch (prints, unlike a <pattern>) + colour outline */}
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`var(--s${r.series})`} fillOpacity={behind ? 0.06 : 0.16} />
              <HatchMarks x={r.x} y={r.y} w={r.w} h={r.h} series={r.series} spacing={180} strokeWidth={1.3} opacity={behind ? 0.25 : 0.8} />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={`var(--s${r.series})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run apps/web/src/screens/components/`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "feat(cutaway): rear rows keep a full-strength outline (D2)

Dimming the whole group to 0.4 hid low rear stacks almost entirely — a
quarter-pallet is 864 of 2650 mm. Only the fill and hatch fade now; the
outline stays, so a rear row reads as behind rather than absent.

LKWkalk-1t2"
```

---

### Task 4: Гейты, merge, выкат

- [ ] **Step 1: Пересобрать пакеты (web-тесты импортируют dist, он в .gitignore)**

```bash
npm run build --workspace packages/engine && npm run build --workspace packages/i18n
```

- [ ] **Step 2: Полные гейты**

```bash
npm test
npm run lint
npm run typecheck
npm run build --workspace apps/web
```
Expected: всё зелёное; тестов **больше 365** (добавлено 5). Эталоны EUR 34 / GB 20 / none 33 не
шелохнулись.

- [ ] **Step 3: Проверка в реальном Chrome**

jsdom не рисует. Открыть демо, нажать «Рассчитать», посмотреть вид сбоку: дальний ряд читается
контуром и не закрывает ближний; низкие стопки (Viertelpalette, 6 ярусов) видны.

- [ ] **Step 4: Merge в main (по отдельности, НЕ через `&&` — хук экспортит issues.jsonl)**

```bash
git checkout main
git merge fix/side-view-depth
git push origin main
```

- [ ] **Step 5: Выкат в production**

```bash
git push origin main:production
```
Проверка: `git ls-remote origin production` == HEAD, и имя `/assets/index-*.js` на проде **сменилось**
(хеш Coolify может не совпасть с локальным). Сразу после смены имени возможна гонка: ассет ещё 404 и
отдаётся SPA-фолбэк (~460 байт) — подождать ~20 с и перекачать.

- [ ] **Step 6: Закрыть задачу**

```bash
bd close LKWkalk-1t2 --reason "Глубина ряда считается по перекрытию проекций; порядок отрисовки по rowY; дальний ряд гасится заливкой, контур остаётся (D2). Проверено на проде."
bd dolt push
```

---

## Self-Review

**Покрытие спеки:**
- §3.1 глубина по перекрытию → Task 1 ✓
- §3.2 порядок по `rowY` → Task 2 ✓
- §3.3 D2 контур → Task 3 ✓
- §5 тесты 1-6 → Task 1 (тесты 1, 2, 4), Task 2 (тест 5), Task 3 (тест 6). Тест 3 («регресс:
  совпадающие x») покрыт существующими тестами `cutaway.test.ts:43` и `:56`, которые остаются
  зелёными без правок — отдельный тест был бы их дублем (DRY). ✓
- §4 контракт не меняется → Global Constraints ✓
- §6 вне scope → в этом плане ничего из этого нет ✓

**Плейсхолдеры:** нет. Каждый шаг несёт код или точную команду.

**Согласованность типов:** `CutRect.depth`/`rowY` — существующие поля, тип не менялся. `hiddenBy`
локальна для `sideRects`. `overlaps1d` — новый модульный хелпер `cutaway.ts`, конфликта имён нет
(одноимённая функция в `packages/engine/src/packing/edit.ts` — другой модуль). Обе фикстуры `at()`
(`cutaway.test.ts` берёт `cargoTypeId` параметром, `CrossSection.test.tsx` — один тип `'p'`) дают
одинаковую форму `Placement` с обязательными `tier: 1` и `state: 'entschachtelt'` — сверено с
`packages/engine/src/model/types.ts:80-89`. Файлы разные, имя `at` не конфликтует.

**Арифметика фикстур проверена вручную:**
- Task 1, тест 1: `a` 0…1200 (y 0), `b` 600…1800 (y 1600) → перекрываются (600 < 1200) → `a.depth` 1,
  `b.depth` 0. Габарит: 1600 + 800 = 2400 ≤ width 2400 ✓.
- Task 1, тест 2: `b` уезжает на x 2500…3700 → 2500 ≥ 1200, перекрытия нет → обе глубины 0.
  Габарит: 3700 ≤ length 4000 ✓.
- Task 2: глубины `s`=1, `o`=3, при x=1300 → 2, 1, 0. Старая сортировка (по убыванию глубины) даёт
  `[600, 1300, 0, 1300, 1300]` — дальняя `s` третья, поверх ближней `o`. Новая (по `rowY`) даёт
  `[0, 600, 1300, 1300, 1300]`. Габарит: y 2000 + 400 = 2400 ≤ 2400 ✓; x 1300 + 1200 = 2500 ≤ 4000 ✓.
