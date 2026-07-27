# Рамка чертежа: один источник масштаба — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Двор склада и разрез кузова снова рисуют груз в одном масштабе (`LKWkalk-6n4`), и разъехаться
им больше нечем — ширину рамки считает одна функция.

**Architecture:** Поля вокруг грузового объёма (`frontGutter`, `topGutter`, `wheelGutter`) и внешние
габариты `outerW`/`outerH` переезжают из `CrossSection` в чистый модуль `truckFrame.ts`. `WarehouseFloor`
берёт ширину оттуда же вместо `vehicle.length`. Масштаб держится равенством ширин ВНЕШНИХ `viewBox` при
`width:100%` в одной колонке — это и пинится тестом.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, SVG в миллиметрах.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-07-27-truck-frame-scale-design.md`. Расхождение с ней — повод
  остановиться и спросить, а не «поправить на месте».
- Движок `packages/engine` и контракт `0.14.0` **не трогаем**: это чистая презентация в `apps/web`.
- Ни одной новой пользовательской строки — правок в `packages/i18n` в этом плане нет.
- Прогон тестов **только из корня монорепо, фильтром пути**: `npm test -- apps/web packages`.
  `npm test -w apps/web` НЕ СУЩЕСТВУЕТ. Базовая линия — **617** проходящих.
- `apps/server` локально красен (`better-sqlite3`, `NODE_MODULE_VERSION 137 vs 127`) — пре-существующее,
  в CI зелено, в этом плане не чиним и в базовую линию не включаем.
- Мерж в `main` = выкладка на прод (ADR 023). Работа идёт в ветке `fix/6n4-truck-frame-scale`, в `main`
  только через PR с зелёным CI.
- Значения рамки — дробные мм (доли от высоты кузова). Это презентация, требование ADR 002 о целых
  миллиметрах относится к домену и здесь не применяется; округлять НЕ надо — округление и есть тот
  дрейф, который мы убираем.

---

### Task 1: `truckFrame.ts` — вынести рамку, поведения не менять

Чистый вынос: ни одно число не меняется, меняется только место, где оно живёт. Отдельная задача,
потому что её можно принять или отвергнуть независимо от починки двора.

**Files:**
- Create: `apps/web/src/screens/components/truckFrame.ts`
- Create: `apps/web/src/screens/components/truckFrame.test.ts`
- Modify: `apps/web/src/screens/components/CrossSection.tsx:28`, `:140-151`
- Modify: `apps/web/src/screens/components/truckChrome.tsx:32-36` (удалить мёртвый `GUTTER.ruler`,
  починить враньё в комментарии `0.657`)
- Modify: `apps/web/src/screens/components/truckChrome.test.tsx:95` (снять проверку удалённого поля)

**Interfaces:**
- Consumes: `GUTTER`, `RULER_FONT` из `./truckChrome`; тип `Vehicle` из `@shadrin-v/engine`.
- Produces: `truckFrame(vehicle: Vehicle, view: 'top' | 'side'): TruckFrame`, где
  `TruckFrame = { frontGutter: number; topGutter: number; wheelGutter: number; outerW: number; outerH: number }`.
  Задача 2 использует только `outerW`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/web/src/screens/components/truckFrame.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { truckFrame } from './truckFrame';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 };

describe('truckFrame', () => {
  it('outer width is the hold plus the cab gutter', () => {
    const f = truckFrame(V, 'top');
    expect(f.outerW).toBe(f.frontGutter + V.length);
  });

  // Виды стоят друг под другом в одной колонке: разные outerW сдвинули бы их по длине кузова.
  it('both views share one outer width', () => {
    expect(truckFrame(V, 'top').outerW).toBe(truckFrame(V, 'side').outerW);
  });

  // Колёса висят под полом только на виде сбоку; сверху их нет, и поле под них не резервируется.
  it('only the side view reserves room for the running gear', () => {
    expect(truckFrame(V, 'top').wheelGutter).toBe(0);
    expect(truckFrame(V, 'side').wheelGutter).toBeGreaterThan(0);
    expect(truckFrame(V, 'side').outerH).toBeGreaterThan(truckFrame(V, 'top').outerH);
  });

  // Вертикаль вида сверху меряется шириной кузова, вида сбоку — высотой.
  it('spans width on the top view and height on the side view', () => {
    const wide = { ...V, width: 2450, height: 3000 };
    expect(truckFrame(wide, 'top').outerH).toBe(truckFrame(wide, 'top').topGutter + wide.width);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- truckFrame`
Expected: FAIL — `Failed to resolve import "./truckFrame"`.

- [ ] **Step 3: Реализовать модуль**

Создать `apps/web/src/screens/components/truckFrame.ts`:

```ts
// Рамка чертежа кузова: поля вокруг грузового объёма и внешние габариты svg, в миллиметрах кузова.
//
// Живёт отдельно от CrossSection, потому что этими числами владеет НЕ ОДИН компонент: двор склада
// обещает груз в том же масштабе, что кузов, а масштаб держится равенством ширин ВНЕШНИХ viewBox при
// width:100% в одной колонке. Пока outerW считал сам CrossSection, двор держал это равенство
// комментарием — и молча потерял его, когда 41e.1 добавила поле под кабину (LKWkalk-6n4).
//
// Значения дробные: это доли от высоты кузова, презентация, а не домен (ADR 002 про целые мм — о
// домене). Округление здесь и есть тот дрейф, который модуль убирает.
import type { Vehicle } from '@shadrin-v/engine';
import { GUTTER, RULER_FONT } from './truckChrome';

export interface TruckFrame {
  /** мм слева под кабину — поле разреза, которое не принадлежит кузову. */
  frontGutter: number;
  /** мм сверху под полосу линейки длины. */
  topGutter: number;
  /** мм снизу под ходовую; 0 на виде сверху. */
  wheelGutter: number;
  /** мм — ширина внешнего viewBox. Равенством ЭТОГО числа держится общий масштаб мм→px. */
  outerW: number;
  /** мм — высота внешнего viewBox. */
  outerH: number;
}

export function truckFrame(vehicle: Vehicle, view: 'top' | 'side'): TruckFrame {
  const { length, width, height } = vehicle;
  const spanY = view === 'top' ? width : height;
  // Переднее поле резервируется в ОБОИХ видах: одинаковый outerW → одинаковый мм→px → виды стоят
  // в колонке друг под другом по длине кузова. Колёса — только сбоку. Сзади ничего не рисуется.
  const frontGutter = height * GUTTER.front;
  const wheelGutter = view === 'side' ? height * GUTTER.wheel : 0;
  // Линейка длины идёт НАД коробом; её полосе нужно вместить число, растущее вверх от кромки на
  // ~1.9 кегля плюс полстроки. Кегль = length * RULER_FONT.
  const topGutter = length * RULER_FONT * 2.8;
  return {
    frontGutter,
    topGutter,
    wheelGutter,
    outerW: frontGutter + length,
    outerH: topGutter + spanY + wheelGutter,
  };
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npm test -- truckFrame`
Expected: PASS, 4 теста.

- [ ] **Step 5: Перевести `CrossSection` на модуль**

В `apps/web/src/screens/components/CrossSection.tsx` заменить импорт (строка 28) — `GUTTER` больше не
нужен, `RULER_FONT` остаётся (используется на строке 623 для `VerticalRuler`):

```ts
import { RULER_FONT, FrontCap, TrailerUnder, GroundLine, TopChrome, MetreRuler, VerticalRuler } from './truckChrome';
import { truckFrame } from './truckFrame';
```

Заменить блок строк 140–151 целиком на:

```ts
  // Поля рамки и внешние габариты — из truckFrame: этими числами владеет не только разрез, но и двор
  // склада, который обещает груз в том же масштабе (LKWkalk-6n4).
  const { frontGutter, topGutter, wheelGutter, outerW, outerH } = truckFrame(load.vehicle, view);
```

Остальные строки (403, 417–418, 606, 610, 613, 616, 618, 623) не трогать — имена переменных те же.

- [ ] **Step 6: Убрать мёртвый `GUTTER.ruler` и починить комментарий**

В `truckChrome.tsx` строки 30–36 привести к:

```ts
// Gutter fractions of vehicle height, derived from the reference so chrome scales with the box.
// front = tractor width ahead of the box; wheel = gap below the floor where wheels hang.
// Consumed by truckFrame.ts, which owns the frame these fractions add up to.
export const GUTTER = {
  front: (FRONT - VBX) / BOX_H, // 0.618
  wheel: (GROUND - FLOOR) / BOX_H, // 0.137
};
```

В `truckChrome.test.tsx` удалить строку 95 (`expect(GUTTER.ruler).toBeGreaterThan(0);`).

- [ ] **Step 7: Прогнать весь фронт — поведение не изменилось**

Run: `npm test -- apps/web packages`
Expected: PASS, **621** (617 базовых + 4 новых теста `truckFrame`). Удаление проверки `GUTTER.ruler`
счёт не меняет — это один `expect` внутри существующего `it`, а не отдельный тест.

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/screens/components/truckFrame.ts \
        apps/web/src/screens/components/truckFrame.test.ts \
        apps/web/src/screens/components/CrossSection.tsx \
        apps/web/src/screens/components/truckChrome.tsx \
        apps/web/src/screens/components/truckChrome.test.tsx
git commit -m "refactor(cutaway): extract truckFrame — one owner for the drawing frame"
```

---

### Task 2: двор берёт ширину рамки — сама починка `6n4`

**Files:**
- Create: `apps/web/src/screens/components/holdYardScale.test.tsx`
- Modify: `apps/web/src/screens/components/warehouseLayout.ts:1-10` (шапка), `:171` (ширина)
- Modify: `apps/web/src/screens/components/warehouseLayout.test.ts:28-30`, `:38-46`, `:48-52`
- Modify: `apps/web/src/screens/components/WarehouseFloor.tsx:10-20` (шапка)
- Modify: `apps/web/src/screens/components/WarehouseFloor.test.tsx:58-66`

**Interfaces:**
- Consumes: `truckFrame(vehicle, 'top').outerW` из задачи 1.
- Produces: поведение `warehouseFloor(load, tiles)` — `width` по умолчанию равен `outerW`, а не
  `vehicle.length`. Явный `opts.width` продолжает перекрывать умолчание.

- [ ] **Step 1: Написать падающий тест на само обещание 1:1**

Создать `apps/web/src/screens/components/holdYardScale.test.tsx`:

```tsx
// Обещание 1:1: стопка во дворе ровно того размера, каким встанет в кузов. Держится равенством ширин
// ВНЕШНИХ viewBox — оба svg рисуются width:100% в одной колонке, значит мм→px совпадает by
// construction. Это единственный тест, который пинит само обещание; всё остальное — его следствия.
// Расходится оно молча (LKWkalk-6n4: 41e.1 добавила разрезу поле под кабину, двор остался как был).
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { calculateLayout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { CrossSection } from './CrossSection';
import { WarehouseFloor } from './WarehouseFloor';
import type { BufferTile } from './warehouseLayout';

// Wechselbrücke — случай владельца с прода: короткий кузов, где расхождение доходит до 23%.
const V = { id: 'v', name: 'Wechselbrücke', length: 7150, width: 2450, height: 2700 };
const load: Load = {
  vehicle: V,
  cargo: [
    {
      id: 'p',
      name: 'EPAL 3',
      length: 1000,
      width: 1200,
      height: 144,
      quantity: 8,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const tiles: BufferTile[] = [{ cargoTypeId: 'p', units: 4, orientation: 'lwh' }];

const viewBoxWidth = (svg: Element) => Number(svg.getAttribute('viewBox')!.split(' ')[2]);

describe('масштаб двора и кузова', () => {
  it('yard and cutaway share one mm→px scale', () => {
    render(
      <LocaleProvider initial="de">
        <CrossSection load={load} layout={calculateLayout(load)} view="top" label="Draufsicht" />
        <WarehouseFloor load={load} tiles={tiles} onRotate={() => {}} onPickUp={() => {}} dragging={null} />
      </LocaleProvider>,
    );
    const hold = document.querySelector('svg[data-cutaway="top"]')!;
    const yard = document.querySelector('svg[data-warehouse]')!;
    expect(viewBoxWidth(yard)).toBe(viewBoxWidth(hold));
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- holdYardScale`
Expected: FAIL — `expected 7150 to be 8818.3…` (двор уже рамки на ширину кабины).

Если вместо этого падение приходит из самого рендера `CrossSection` (jsdom не знает
`getScreenCTM`/`createSVGPoint`), добавить в файл `installSvgGeometry` из `./svgTestGeometry` —
так делает `CrossSection.test.tsx`. Простой рендер их обычно не трогает: они нужны только жестам.

- [ ] **Step 3: Двор берёт ширину рамки**

В `warehouseLayout.ts` добавить импорт под существующий:

```ts
import { truckFrame } from './truckFrame';
```

Заменить строку 171:

```ts
  const width = opts.width ?? truckFrame(load.vehicle, 'top').outerW;
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npm test -- holdYardScale`
Expected: PASS.

- [ ] **Step 5: Переписать два теста, пинивших неверный инвариант**

В `warehouseLayout.test.ts` заменить блок строк 27–30 на:

```ts
import { truckFrame } from './truckFrame';

describe('warehouseFloor', () => {
  // Не «шириной с кузов»: рамка разреза шире кузова на поле под кабину, и масштаб держится равенством
  // ИМЕННО рамок (LKWkalk-6n4). Полосу под кабиной двор занимает стопками — решение владельца.
  it('is as wide as the cutaway frame — the scale is shared by construction', () => {
    expect(warehouseFloor(load, []).width).toBe(truckFrame(V, 'top').outerW);
  });
```

В `WarehouseFloor.test.tsx` заменить блок строк 58–66 на:

```tsx
import { truckFrame } from './truckFrame';

describe('WarehouseFloor', () => {
  // Если эти ширины разойдутся, масштаб разойдётся молча: оба svg рисуются width:100% в одной
  // колонке, поэтому равенство viewBox по ширине — и есть весь механизм 1:1. Сравнивать надо с
  // рамкой разреза, а не с длиной кузова: рамка шире на поле под кабину (LKWkalk-6n4).
  it('is exactly as wide as the cutaway frame — that IS the 1:1 scale', () => {
    renderFloor();
    const svg = document.querySelector('[data-testid="warehouse-floor"] svg')!;
    const [, , w] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(w).toBe(truckFrame(V, 'top').outerW);
  });
```

- [ ] **Step 6: Запинить ширину в тестах, которые проверяют перенос строки, а не рамку**

Два теста задают короткий кузов, чтобы вызвать перенос ряда, и после правки перестают его вызывать:
рамка шире кузова, плитки помещаются в один ряд. Ширина в них — инструмент, а не предмет проверки,
поэтому она задаётся явной опцией.

`warehouseLayout.test.ts`, строки 38–46:

```ts
  it('wraps to a new row when the next tile would leave the floor', () => {
    // Ширина задана явно: тест про перенос строки, а не про рамку разреза.
    const { tiles } = warehouseFloor(load, [tile('a'), tile('a'), tile('a')], {
      width: 3000,
      gap: 200,
      pad: 200,
    });
    expect(tiles[2].y).toBeGreaterThan(tiles[0].y);
    expect(tiles[2].x).toBe(200); // новый ряд начинается слева
  });
```

`warehouseLayout.test.ts`, строки 48–52:

```ts
  it('a row is as tall as its tallest tile', () => {
    const { tiles } = warehouseFloor(load, [tile('a'), tile('b')], {
      width: 2200,
      gap: 200,
      pad: 200,
    });
    expect(tiles[1].y).toBe(1200); // 200 + 800 (высота ряда по 'a') + 200
  });
```

Обе локальные константы `narrow` внутри этих тестов удаляются как более не нужные.

- [ ] **Step 7: Переписать шапки, которые врут**

`warehouseLayout.ts`, строки 8–10 — заменить на:

```ts
// Двор ровно той же ширины, что РАМКА разреза (`truckFrame(...).outerW` = поле под кабину + длина
// кузова), и оба svg рисуются width:100% в одной колонке — это и держит масштаб 1:1, без измерений в
// JS. Не «шириной с кузов»: так было до 41e.1, и молчаливая потеря этого равенства и есть LKWkalk-6n4.
// Растёт двор в ГЛУБИНУ, что заодно отличает его от кузова: три ряда EPAL — это ~2800 мм.
```

`WarehouseFloor.tsx`, строки 10–13 — заменить на:

```ts
// Масштаб 1:1 структурен, а не измерен: viewBox этого svg ровно той же ширины, что ВНЕШНИЙ viewBox
// разреза (`truckFrame(vehicle, 'top').outerW` — поле под кабину плюс длина кузова), и оба рисуются
// width:100% внутри одной колонки, так что множитель мм→px одинаков by construction. Число считает
// truckFrame.ts, а не эти два компонента порознь — порознь они уже разъезжались (LKWkalk-6n4).
// Двор растёт в ГЛУБИНУ, что заодно не даёт ему читаться вторым грузовиком.
```

- [ ] **Step 8: Прогнать весь фронт**

Run: `npm test -- apps/web packages`
Expected: PASS, **622** (621 после задачи 1 + 1 новый).

- [ ] **Step 9: Гейты**

Run: `npm run typecheck && npm run lint`
Expected: обе команды без ошибок.

- [ ] **Step 10: Коммит**

```bash
git add apps/web/src/screens/components/holdYardScale.test.tsx \
        apps/web/src/screens/components/warehouseLayout.ts \
        apps/web/src/screens/components/warehouseLayout.test.ts \
        apps/web/src/screens/components/WarehouseFloor.tsx \
        apps/web/src/screens/components/WarehouseFloor.test.tsx
git commit -m "fix(warehouse): yard takes the cutaway frame width — 1:1 scale restored (6n4)"
```

---

### Task 3: проверка живьём и закрытие

Юнит-тест умеет пинить только `viewBox`; пиксели проверяются в браузере — это записано в шапке
`WarehouseFloor.tsx` ещё с `wxi` и остаётся правдой.

**Files:** правок кода нет.

- [ ] **Step 1: Поднять приложение**

```bash
cd apps/web && npm run dev          # :5173
DB_PATH=/tmp/qa.db npm run dev -w apps/server   # :3000, из корня
```

- [ ] **Step 2: Свести стопку в кузове и во дворе**

Выбрать пресет `Wechselbrücke` (7150×2450×2700) — случай владельца, где расхождение было 23%.
Положить в заявку EPAL 3 заведомо больше, чем влезает, чтобы часть попала во двор. Сравнить ширину
одной и той же стопки в виде сверху и во дворе: они должны совпасть.

- [ ] **Step 3: Проверить, что не сломалось соседнее**

- Перетащить стопку из двора в кузов и обратно — фантом-зазор садится туда, где стопка и остаётся.
- Загоны заказов (нужно ≥2 заказа) рисуются и не выходят за асфальт.
- Фон двора: доки по краям стали шире вместе с двором — оценить, не стало ли хуже. Если стало,
  завести это в `LKWkalk-jen` комментарием, НЕ чинить в этой ветке.

- [ ] **Step 4: PR**

```bash
git push -u origin fix/6n4-truck-frame-scale
gh pr create --title "fix(warehouse): масштаб 1:1 двора и кузова через общую рамку (6n4)" --body "$(cat <<'EOF'
Закрывает LKWkalk-6n4: стопка во дворе была крупнее, чем в кузове, на 11–23% —
тем сильнее, чем короче кузов (на Wechselbrücke 7150 видно глазом).

Причина: 41e.1 добавила разрезу поле под кабину (outerW = frontGutter + length),
двор остался равным vehicle.length, а масштаб держался равенством этих ширин.
Число считал один компонент, а обещание держал комментарием в другом.

- новый чистый модуль truckFrame.ts — единственный владелец рамки чертежа;
- двор берёт truckFrame(...).outerW и занимает полосу под кабиной стопками
  (решение владельца);
- обещание 1:1 пинится кросс-компонентным тестом, а не комментарием;
- удалён мёртвый GUTTER.ruler, переписаны три соврамших комментария.

Спека: docs/superpowers/specs/2026-07-27-truck-frame-scale-design.md
План: docs/superpowers/plans/2026-07-27-truck-frame-scale.md

Гейты: typecheck, lint, npm test -- apps/web packages (622).
Проверено в браузере на Wechselbrücke: стопка во дворе и в кузове одного размера,
перенос стопок и загоны заказов не сломаны.
EOF
)"
```

Мерж — только при зелёном обязательном чеке `ci`. Мерж = выкладка на прод (ADR 023).

- [ ] **Step 5: Проверить прод по маркеру сборки**

`/api/health` НЕ доказывает выкладку — он отвечал `ok` и до мержа. Доказательство — смена имени
ассета:

```bash
curl -s https://ladungsplaner.holz-schaefer.de/ | grep -o '/assets/[^"]*\.css'
```

Имя файла должно отличаться от того, что было до мержа.

- [ ] **Step 6: Закрыть задачу и убрать протухшую память**

```bash
bd close LKWkalk-6n4 --reason "Двор берёт ширину рамки разреза (truckFrame.outerW); масштаб 1:1 пинится кросс-компонентным тестом"
bd forget warehouse-yard-scale-broken-41e2   # описывала поломку и запрещала верить комментариям — комментарии переписаны
```
