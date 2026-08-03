# Slide-to-stop: прижать стопку к упору стрелкой — план реализации (`LKWkalk-gtw`)

> ✅ ВЫПОЛНЕН 2026-08-03. Все пять задач сделаны сабагентами; ветка `feat/gtw-slide-to-stop` слита в
> `main` squash-коммитом `fab49df` **локально, без PR** (шаг 3 задачи 5 разошёлся с планом — владелец
> выбрал локальный мерж). Гейты на слитом дереве: typecheck 0 · lint 0 · тесты 917/917.
> Итог сессии — `docs/superpowers/HANDOVER-2026-08-03-gtw-slide-to-stop.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** выделенная в виде сверху стопка (или блок) едет по стрелке до первого упора — стенки кузова или соседней стопки — и встаёт вплотную.

**Architecture:** свободный ход считает новая чистая функция ядра `resolveSlide` рядом с `resolveDrop`; дельту применяет существующий `moveStacks` через уже имеющийся проп `onMoveStacks`. Новой операции-мутации не появляется, UI правил размещения не узнаёт.

**Tech Stack:** TypeScript, vitest, React 18 + Tailwind (apps/web), пакеты `@shadrin-v/engine` и `@shadrin-v/i18n`.

Спека: `docs/superpowers/specs/2026-07-30-gtw-slide-to-stop-design.md`.

## Global Constraints

- Внутренние единицы — **целые миллиметры** ([ADR 002](../../adr/002-integer-millimeters.md)); округление только на границе UI.
- Вся доменная логика — **только в ядре** (`packages/engine`), никогда в UI (CLAUDE.md, принцип 1; [ADR 019](../../adr/019-manual-layout-editing-api.md)).
- **Ни одной пользовательской строки в коде** — только ключи локалей, языки `de` и `ru` ([ADR 006](../../adr/006-i18n-de-ru-error-codes.md)).
- **Сначала документация:** контракт и ADR обновляются до кода (CLAUDE.md).
- TDD: сначала падающий тест, затем реализация. Коммит — после зелёных тестов.
- `@shadrin-v/engine` и `@shadrin-v/i18n` резолвятся в **`dist`**: после правки пакета обязателен `npm run build -w packages/<pkg>`, иначе `apps/web` тестируется против старой сборки.
- Ветка уже создана: `feat/gtw-slide-to-stop` (в ней лежит спека).
- Гейты перед PR: `npm run typecheck`, `npm run lint`, `npm test` — из корня.

---

### Task 1: Документация впереди кода — ADR 024 и контракт 0.15.0

**Files:**
- Create: `docs/adr/024-slide-to-stop.md`
- Modify: `docs/api-contract.md` (строка 5 — версия; раздел операций после «Групповые правки»; история версий в конце)
- Modify: `docs/adr/README.md` (реестр ADR)

Тестов нет: задача документарная, её приёмка — чтение.

- [ ] **Шаг 1: Прочитать соседей, чтобы попасть в формат**

Прочитать `docs/adr/020-magnet-drop-resolution.md` и `docs/adr/021-group-layout-edits.md` целиком: у ADR в этом проекте фиксированная структура (Статус → Контекст → Решение → Последствия → Альтернативы) и повествовательный тон. Прочитать `docs/api-contract.md` строки 229–300 (разделы «Магнит постановки» и «Групповые правки») — новый раздел пишется по их образцу.

- [ ] **Шаг 2: Написать `docs/adr/024-slide-to-stop.md`**

Содержание (своими словами, не копией плана):
- **Контекст.** Магнит ([ADR 020](../../adr/020-magnet-drop-resolution.md)) тянет к ближайшему кандидату в пределах допуска и помогает лишь тому, кто уже привёл стопку почти на место; свободный ход в полтора метра он не проезжает. Владелец (2026-07-30) просит жест «прижать».
- **Решение.** Новый **запрос** `resolveSlide(load, layout, refs, dir)` возвращает дельту до первого упора; мутации нет — дельту применяет `moveStacks`. Отдельная функция, а не флаг у `moveStacks`: строгая операция судит переданную точку, а не ищет её (тот же довод, что в шапке `resolveDrop.ts` про `placeStack`), и вызывающий по API/MCP должен уметь сказать «поставь ровно сюда, иначе откажи».
- **Последствия.** Контракт `0.15.0`, аддитивно. Будущий MCP-инструмент `resolve_slide` появляется без рефакторинга ядра. `clearance` не учитывается — его нет во всей алгебре правок (`LKWkalk-qrd.31`); когда он появится, ход обязан будет остановиться на зазоре, и это отдельное решение.
- **Альтернативы.** Считать ход в UI перебором `resolveDrop` с большим допуском — отвергнуто: UI стал бы вторым местом, знающим правила размещения. Флаг `slideTo` у `moveStacks` — отвергнуто: ломает семантику строгой операции.

- [ ] **Шаг 3: Обновить `docs/api-contract.md`**

Три правки:
1. строка 5 — `Версия контракта: 0.15.0`;
2. новый раздел после «Групповые правки (0.14.0…)» — по образцу соседей:

```markdown
### Прижать к упору (0.15.0, [ADR 024](adr/024-slide-to-stop.md))

```ts
type SlideDir = '-x' | '+x' | '-y' | '+y';
interface SlideDelta { dx: number; dy: number }

function resolveSlide(load: Load, layout: Layout, refs: StackRef[], dir: SlideDir): SlideDelta;
```

Запрос, а не операция: возвращает, насколько выделенное может проехать по оси `dir` до первого
упора — стенки кузова или чужой напольной стопки. Стопки из `refs` друг другу не препятствия;
блок едет общей дельтой, равной минимуму ходов участниц. Ненулевым может быть только компонент,
отвечающий оси `dir`; второй всегда `0`. Функция тотальна: пустой `refs`, отсутствующая стопка
или отсутствие свободного хода дают `{ dx: 0, dy: 0 }`. Зазор (`clearance`) не учитывается — его
нет во всей алгебре правок. Дельта применяется существующим `moveStacks`, который и валидирует
результат.
```

3. история версий в конце файла — строка `0.15.0` первой, по образцу соседних:

```markdown
- `0.15.0` — добавлен запрос «прижать к упору»: `resolveSlide`, типы `SlideDir`, `SlideDelta`.
  Операции мутации не менялись. `ENGINE_CONTRACT_VERSION` → `0.15.0` (`LKWkalk-gtw`).
```

- [ ] **Шаг 4: Дописать ADR в реестр**

В `docs/adr/README.md` добавить строку про 024 в том же формате, что у 023.

- [ ] **Шаг 5: Коммит**

```bash
git add docs/adr/024-slide-to-stop.md docs/adr/README.md docs/api-contract.md
git commit -m "docs(contract): запрос resolveSlide и ADR 024 (gtw)"
```

---

### Task 2: Ядро — `resolveSlide`

**Files:**
- Create: `packages/engine/src/packing/resolveSlide.ts`
- Create: `packages/engine/src/packing/resolveSlide.test.ts`
- Modify: `packages/engine/src/packing/resolveDrop.ts` (открыть три внутренних имени: `overlaps1d`, `Box`, `floorBoxes`)
- Modify: `packages/engine/src/index.ts` (экспорт + версия контракта)
- Modify: `packages/engine/src/index.test.ts:6` (версия контракта)

**Interfaces:**
- Consumes: `floorBoxes(load, layout, exclude?)`, `overlaps1d(a0, a1, b0, b1)`, `interface Box extends StackRef { dx: number; dy: number }` из `resolveDrop.ts`; `refKey(ref)`, `StackRef` из `edit.ts`; `orientedDims` из `model/orientation`.
- Produces: `resolveSlide(load: Load, layout: Layout, refs: StackRef[], dir: SlideDir): SlideDelta`, `type SlideDir = '-x' | '+x' | '-y' | '+y'`, `interface SlideDelta { dx: number; dy: number }` — их берёт Task 3.

- [ ] **Шаг 1: Написать падающий тест**

Создать `packages/engine/src/packing/resolveSlide.test.ts` целиком:

```ts
import { describe, expect, it } from 'vitest';
import type { Layout, Load } from '../model/index';
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

const layoutOf = (placements: Layout['placements']): Layout => ({
  placements,
  unplaced: [],
  metrics: {
    totalPlaced: placements.length,
    usedFloorPositions: placements.length,
    floorFillPercent: 0,
    volumeFillPercent: 0,
  },
  contractVersion: '0.15.0',
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
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Запуск: `npm test -w packages/engine -- resolveSlide`
Ожидание: FAIL — `Cannot find module './resolveSlide'`.

- [ ] **Шаг 3: Открыть внутренние примитивы `resolveDrop.ts`**

Три точечные правки в `packages/engine/src/packing/resolveDrop.ts` — добавить `export` и по одному комментарию, зачем имя стало видимым:

```ts
/** Half-open interval overlap (touching edges do not overlap) — the rule edit.ts uses.
 *  Exported для `resolveSlide`: «кто стоит в моей полосе» — тот же вопрос и то же правило. */
export const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Стопка пола с её габаритами. Внутренний тип модуля, открытый `resolveSlide`. */
export interface Box extends StackRef {
  dx: number;
  dy: number;
}
```

и у `floorBoxes` заменить `function` на `export function`, дописав к её существующему комментарию строку:

```ts
 * Открыта для `resolveSlide`: «что стоит на полу, кроме меня» — общий вопрос обоих запросов.
```

- [ ] **Шаг 4: Написать `resolveSlide.ts`**

```ts
// Прижать к упору (ADR 024, api-contract 0.15.0). Отвечает на ОДИН вопрос: насколько выделенное
// может проехать по оси до первого упора — стенки кузова или чужой напольной стопки.
//
// Почему в ядре: «куда стопка может доехать» — доменное правило, а не деталь клавиатуры. UI,
// который считал бы ход сам, стал бы вторым местом, знающим правила размещения (ADR 019).
//
// Почему запрос, а не операция: мутации здесь нет вовсе — дельту применяет `moveStacks`, он же и
// валидирует результат. Тот же раздел труда, что у `resolveDrop` с `placeStack`.
import type { Layout, Load } from '../model/index';
import { orientedDims } from '../model/orientation';
import { refKey } from './edit';
import type { StackRef } from './edit';
import { floorBoxes, overlaps1d, type Box } from './resolveDrop';

/** Ось кузова и знак хода: x — длина, y — ширина. */
export type SlideDir = '-x' | '+x' | '-y' | '+y';

export interface SlideDelta {
  dx: number;
  dy: number;
}

const ZERO: SlideDelta = { dx: 0, dy: 0 };

export function resolveSlide(
  load: Load,
  layout: Layout,
  refs: StackRef[],
  dir: SlideDir,
): SlideDelta {
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  if (unique.length === 0) return ZERO;

  // Габариты участниц берутся из РАСКЛАДКИ (их собственная ориентация), а не угадываются.
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const members: Box[] = [];
  for (const ref of unique) {
    const column = layout.placements.find(
      (p) => p.cargoTypeId === ref.cargoTypeId && p.x === ref.x && p.y === ref.y,
    );
    const cargo = byId.get(ref.cargoTypeId);
    // Стопки нет — ехать нечему. Запрос тотален: он не бросает и не жалуется, а сообщает, что
    // хода нет; вызывающий на нулевой дельте просто ничего не делает.
    if (!column || !cargo) return ZERO;
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, column.orientation);
    members.push({ ...ref, dx, dy });
  }

  const selected = new Set(members.map(refKey));
  const boxes = floorBoxes(load, layout, (r) => selected.has(refKey(r)));

  const horizontal = dir === '-x' || dir === '+x';
  const forward = dir === '+x' || dir === '+y';
  const wall = horizontal ? load.vehicle.length : load.vehicle.width;

  // Блок едет общей дельтой (ADR 021): её задаёт самая стеснённая участница, иначе ведущая
  // въехала бы в препятствие, а взаимная расстановка блока разъехалась бы.
  let travel = Infinity;
  for (const m of members) {
    const pos = horizontal ? m.x : m.y;
    const size = horizontal ? m.dx : m.dy;
    let free = forward ? wall - (pos + size) : pos;
    for (const b of boxes) {
      // Мешает только то, что стоит в той же полосе. Полуоткрытое пересечение: стопка, лежащая
      // впритык БОКОМ, полосу не занимает и проехать мимо не мешает.
      const across = horizontal
        ? overlaps1d(m.y, m.y + m.dy, b.y, b.y + b.dy)
        : overlaps1d(m.x, m.x + m.dx, b.x, b.x + b.dx);
      if (!across) continue;
      const bPos = horizontal ? b.x : b.y;
      const bSize = horizontal ? b.dx : b.dy;
      const gap = forward ? bPos - (pos + size) : pos - (bPos + bSize);
      // Отрицательный зазор — препятствие ПОЗАДИ хода: оно ничего не ограничивает.
      if (gap >= 0) free = Math.min(free, gap);
    }
    travel = Math.min(travel, Math.max(0, free));
  }

  if (travel === 0 || !Number.isFinite(travel)) return ZERO;
  const signed = forward ? travel : -travel;
  return horizontal ? { dx: signed, dy: 0 } : { dx: 0, dy: signed };
}
```

- [ ] **Шаг 5: Прогнать тесты ядра**

Запуск: `npm test -w packages/engine -- resolveSlide`
Ожидание: PASS, все 13 тестов.

- [ ] **Шаг 6: Открыть функцию наружу и поднять версию контракта**

В `packages/engine/src/index.ts`:

```ts
export const ENGINE_CONTRACT_VERSION = '0.15.0';
```

и после строки с `resolveDrop`:

```ts
export { resolveSlide } from './packing/resolveSlide';
export type { SlideDir, SlideDelta } from './packing/resolveSlide';
```

В `packages/engine/src/index.test.ts:6` — `expect(engine.ENGINE_CONTRACT_VERSION).toBe('0.15.0');`

- [ ] **Шаг 7: Прогнать весь пакет и собрать `dist`**

```bash
npm test -w packages/engine
npm run build -w packages/engine   # apps/web резолвит движок в dist
```
Ожидание: тесты зелёные, сборка без ошибок.

- [ ] **Шаг 8: Коммит**

```bash
git add packages/engine/src
git commit -m "feat(engine): resolveSlide — свободный ход стопки до упора (gtw)"
```

---

### Task 3: UI — стрелки прижимают выделенное

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx` (импорт `resolveSlide`; `frameRef`; `tabIndex`/`onKeyDown`/фокус на внешнем `svg` около строки 402)
- Test: `apps/web/src/screens/components/CrossSection.test.tsx` (новый `describe` в конце файла)

**Interfaces:**
- Consumes: `resolveSlide`, `SlideDir` из `@shadrin-v/engine` (Task 2); существующие `sel: StackRef[]`, `onMoveStacks`, `draggable` внутри компонента.
- Produces: ничего наружу — новых пропов у `CrossSection` не появляется, `LadeplanScreen` не трогается.

- [ ] **Шаг 1: Написать падающие тесты**

Дописать в конец `apps/web/src/screens/components/CrossSection.test.tsx` (внутри `describe('group selection', ...)`, где живут `renderTop`, `stackEl`, `rubberBand`, `MovableGroup` — они нужны все). Убедиться, что `createEvent` есть в импорте из `@testing-library/react`; если нет — добавить его к `fireEvent, render, screen`.

```ts
  /** Клик по стопке = нажать и отпустить, не сдвинув указателя: это выделение, а не перенос.
   *  Координаты — середина стопки в мм (геометрия стоит тождественная: 1 px = 1 мм). */
  const clickStack = (el: Element, x = 500, y = 500) => {
    fireEvent.pointerDown(el, { clientX: x, clientY: y });
    fireEvent.pointerUp(el, { clientX: x, clientY: y });
  };
  const frameOf = (container: HTMLElement) =>
    container.querySelector('svg[data-cutaway="top"]')!;

  it('стрелка прижимает выделенную стопку к борту', () => {
    const onMoveStacks = vi.fn();
    const { container } = renderTop({ onMoveStacks });
    clickStack(stackEl(container, 0, 0));

    fireEvent.keyDown(frameOf(container), { key: 'ArrowDown' });

    expect(onMoveStacks).toHaveBeenCalledTimes(1);
    const [refs, dx, dy] = onMoveStacks.mock.calls[0];
    expect(refs).toEqual([{ cargoTypeId: 'c', x: 0, y: 0 }]);
    expect({ dx, dy }).toEqual({ dx: 0, dy: 1000 }); // 2000 − 1000, до дальнего борта
  });

  it('молчит, когда ехать некуда', () => {
    const onMoveStacks = vi.fn();
    const { container } = renderTop({ onMoveStacks });
    clickStack(stackEl(container, 0, 0)); // справа вплотную стоит стопка на x=1000

    fireEvent.keyDown(frameOf(container), { key: 'ArrowRight' });
    fireEvent.keyDown(frameOf(container), { key: 'ArrowLeft' }); // слева передняя стенка

    expect(onMoveStacks).not.toHaveBeenCalled();
  });

  it('двигает весь выделенный блок одной дельтой', () => {
    const onMoveStacks = vi.fn();
    const { svg, container } = renderTop({ onMoveStacks });
    rubberBand(svg, 0, 0, 1500, 500); // рамка выделяет стопки на x=0 и x=1000

    fireEvent.keyDown(frameOf(container), { key: 'ArrowDown' });

    const [refs, dx, dy] = onMoveStacks.mock.calls[0];
    expect(refs).toHaveLength(2);
    expect({ dx, dy }).toEqual({ dx: 0, dy: 1000 });
  });

  it('без выделения не трогает прокрутку страницы', () => {
    const onMoveStacks = vi.fn();
    const { container } = renderTop({ onMoveStacks });

    const ev = createEvent.keyDown(frameOf(container), { key: 'ArrowDown' });
    fireEvent(frameOf(container), ev);

    expect(onMoveStacks).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('оставляет выделение на стопке, которую только что прижал', () => {
    restoreSvgGeometry = installSvgGeometry();
    const { container } = render(
      <LocaleProvider initial="de">
        <MovableGroup />
      </LocaleProvider>,
    );
    clickStack(stackEl(container, 2000, 0), 2500, 500);

    fireEvent.keyDown(frameOf(container), { key: 'ArrowDown' });

    // стопка уехала к борту…
    expect(container.querySelector('[data-stack-ref="c@2000,1000"]')).not.toBeNull();
    // …и осталась выделенной: с новой позиции её можно прижать вправо к задней стенке
    fireEvent.keyDown(frameOf(container), { key: 'ArrowRight' });
    expect(container.querySelector('[data-stack-ref="c@3000,1000"]')).not.toBeNull();
  });

  it('в виде сбоку стрелок не слушает', () => {
    restoreSvgGeometry = installSvgGeometry();
    const onMoveStacks = vi.fn();
    const { container } = render(
      <LocaleProvider initial="de">
        <CrossSection load={groupLoad} layout={groupLayout} view="side" label="Seitenansicht" onMoveStacks={onMoveStacks} />
      </LocaleProvider>,
    );

    const side = container.querySelector('svg[data-cutaway="side"]')!;
    expect(side).not.toHaveAttribute('tabindex');
    fireEvent.keyDown(side, { key: 'ArrowDown' });
    expect(onMoveStacks).not.toHaveBeenCalled();
  });
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Запуск: `npm test -w apps/web -- CrossSection`
Ожидание: FAIL — `onMoveStacks` не вызывается (обработчика клавиш ещё нет).

- [ ] **Шаг 3: Реализовать в `CrossSection.tsx`**

1) К импортам движка добавить `resolveSlide` и тип `SlideDir`; к импорту React — `type KeyboardEvent as ReactKeyboardEvent`.

2) Рядом с `const svgRef = useRef<SVGSVGElement>(null);` (строка 153):

```tsx
  /** Внешний svg — тот, что несёт `data-cutaway`. Именно он держит фокус: `svgRef` смотрит на
   *  ВЛОЖЕННЫЙ грузовой svg, а рамка фокуса вокруг одного лишь груза обрезала бы линейки. */
  const frameRef = useRef<SVGSVGElement>(null);
```

3) Рядом с эффектом Escape (после строки 177):

```tsx
  // Выделение появилось — забираем фокус, иначе стрелки уйдут в прокрутку страницы и жест
  // «прижать» окажется недостижим ровно тогда, когда он нужен.
  useEffect(() => {
    if (draggable && sel.length > 0) frameRef.current?.focus?.();
  }, [draggable, sel.length]);

  /** Клавиша → ось и знак хода. `←/→` вдоль длины кузова, `↑/↓` поперёк, к бортам. */
  const SLIDE_KEYS: Record<string, SlideDir> = {
    ArrowLeft: '-x',
    ArrowRight: '+x',
    ArrowUp: '-y',
    ArrowDown: '+y',
  };

  const onSlideKey = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const dir = SLIDE_KEYS[e.key];
    // Без выделения стрелка — это прокрутка страницы, и отнимать её нельзя.
    if (!dir || sel.length === 0 || !onMoveStacks) return;
    e.preventDefault();
    const { dx, dy } = resolveSlide(load, layout, sel, dir);
    // Ехать некуда — молчаливый no-op: картинка и так показывает, что стопка касается упора.
    if (dx === 0 && dy === 0) return;
    onMoveStacks(sel, dx, dy);
    // Выделение едет вместе со стопками: оно адресует их координатами, и оставшись на месте,
    // указывало бы туда, где уже никто не стоит. Дельта законна по построению `resolveSlide`
    // (в габаритах и без пересечений), поэтому здесь, в отличие от броска, нечего отвергать.
    setSel(sel.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })));
  };
```

4) Внешний `svg` (строка 402) получает ref, фокус и обработчик:

```tsx
      <svg
        ref={frameRef}
        viewBox={`0 0 ${outerW} ${outerH}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        // Правки разрешены — разрез становится точкой входа для клавиатуры: стрелки прижимают
        // выделенное к упору (ADR 024). В виде сбоку и в режиме «только смотреть» ничего не
        // меняется: ни tabIndex, ни обработчика.
        tabIndex={draggable ? 0 : undefined}
        onKeyDown={draggable ? onSlideKey : undefined}
        className={draggable ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint' : undefined}
        data-cutaway={view}
        style={{ background: 'var(--paper)', display: 'block' }}
      >
```

- [ ] **Шаг 4: Прогнать тесты**

```bash
npm test -w apps/web -- CrossSection
```
Ожидание: PASS, включая шесть новых.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "feat(ladeplan): стрелки прижимают выделенное к упору (gtw)"
```

---

### Task 4: Подсказка о жесте

**Files:**
- Modify: `packages/i18n/src/keys.ts` (ключ `ladeplan.slideHint` рядом с `ladeplan.selection.count`)
- Modify: `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`
- Modify: `apps/web/src/screens/components/CrossSection.tsx` (строка ~678, внутри `<figure>` после svg)
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Consumes: `tt` (`useT`) — уже используется в компоненте; `sel`, `draggable` из Task 3.
- Produces: ничего.

- [ ] **Шаг 1: Написать падающий тест**

В тот же `describe('group selection', ...)`:

```ts
  it('подсказка про стрелки видна только при выделении', () => {
    const { container } = renderTop({ onMoveStacks: vi.fn() });
    expect(container.querySelector('[data-testid="slide-hint"]')).toBeNull();

    clickStack(stackEl(container, 0, 0));
    expect(container.querySelector('[data-testid="slide-hint"]')).toHaveTextContent(
      'Pfeiltasten',
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('[data-testid="slide-hint"]')).toBeNull();
  });
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Запуск: `npm test -w apps/web -- CrossSection`
Ожидание: FAIL — элемент `slide-hint` не найден.

- [ ] **Шаг 3: Завести ключ локали**

В `packages/i18n/src/keys.ts` — после `'ladeplan.selection.count',` добавить `'ladeplan.slideHint',`.

В `packages/i18n/src/dictionaries/de.ts` рядом с `ladeplan.selection.count`:

```ts
  'ladeplan.slideHint': 'Pfeiltasten: an den Anschlag schieben',
```

В `packages/i18n/src/dictionaries/ru.ts` там же:

```ts
  'ladeplan.slideHint': 'Стрелки: прижать к упору',
```

- [ ] **Шаг 4: Собрать словари**

```bash
npm run build -w packages/i18n
```
Без этого шага `apps/web` тестируется против старой сборки, и тест падает с «не найден текст» — то есть выглядит как ошибка вёрстки, а не сборки.

- [ ] **Шаг 5: Показать подсказку**

В `CrossSection.tsx`, внутри `<figure>` перед блоком `{view === 'top' && (` с Vorne/Hinten (строка ~678):

```tsx
      {/* Жест «прижать» ничем себя не выдаёт, пока о нём не сказать. Подсказка живёт ровно столько,
          сколько выделение, — постоянная строка под каждым планом была бы шумом. Экранная: в печати
          органов правки нет. */}
      {draggable && sel.length > 0 && (
        <p data-testid="slide-hint" className="mt-1 px-0.5 text-caption text-muted print:hidden">
          {tt('ladeplan.slideHint')}
        </p>
      )}
```

- [ ] **Шаг 6: Прогнать тесты**

```bash
npm test -w apps/web -- CrossSection
```
Ожидание: PASS.

- [ ] **Шаг 7: Коммит**

```bash
git add packages/i18n/src apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "feat(i18n): подсказка о жесте «прижать к упору» (gtw)"
```

---

### Task 5: Гейты, проверка в браузере, PR

**Files:** изменений кода нет.

- [ ] **Шаг 1: Полные гейты из корня**

```bash
npm run typecheck && npm run lint && npm test
```
Ожидание: 0 ошибок типов, 0 замечаний линтера, все тесты зелёные (было 893 + 20 новых).

- [ ] **Шаг 2: Проверить жест в настоящем браузере**

```bash
nvm use
cd apps/web && npm run dev     # :5173
```
Проверить руками: клик по стопке в виде сверху → видно кольцо фокуса и подсказку; `↓` прижимает стопку к борту; повторное `↓` не делает ничего; рамкой выделить две стопки → `→` двигает блок целиком; клик по пустому полу снимает выделение, и стрелки снова прокручивают страницу; печать (Ctrl+P) подсказки не содержит.

- [ ] **Шаг 3: Закрыть задачу и открыть PR**

```bash
bd update LKWkalk-gtw --status in_progress   # если ещё не переведена
git push -u origin feat/gtw-slide-to-stop
gh pr create --title "feat(ladeplan): прижать стопку к упору стрелкой (gtw)" --body "$(cat <<'EOF'
Магнит помогает лишь тому, кто уже привёл стопку почти на место: он подтягивает к ближайшему
кандидату в пределах допуска, а свободный ход в полтора метра не проезжает. Теперь выделенная
стопка (или блок) едет по стрелке до первого упора — стенки кузова или соседа — и встаёт вплотную.

Ход считает чистый запрос ядра `resolveSlide` (ADR 024, контракт 0.15.0); дельту применяет
существующий `moveStacks`, поэтому новой операции-мутации нет и UI правил размещения не узнаёт.
Стрелки перехватываются только при фокусе в виде сверху и непустом выделении — иначе страница
прокручивается как прежде. Ехать некуда — молчаливый no-op.

Спека: docs/superpowers/specs/2026-07-30-gtw-slide-to-stop-design.md
Проверено в Chrome: фокус, одиночная стопка, блок из двух, отказ у стенки, печать без подсказки.
EOF
)"
```

- [ ] **Шаг 4: После зелёного CI — мерж в `main`**

Мерж = выкладка на прод ([ADR 023](../../adr/023-continuous-deploy-from-main.md)). Squash, как принято в репозитории. После мержа закрыть `LKWkalk-gtw` с комментарием о результате.

---

## Что план сознательно не делает

- Не трогает `clearance` (`LKWkalk-qrd.31`) и вертикаль: ход считается по полу.
- Не добавляет клавиатурного ВЫБОРА стопок — выделение по-прежнему мышью (`LKWkalk-dwc.5`, `LKWkalk-e8x` остаются открытыми).
- Не меняет `LadeplanScreen`: дельта применяется существующим `onMoveStacks`.
