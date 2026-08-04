# Многоотсековый транспорт (автопоезд) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Научить движок и приложение транспорту с несколькими грузовыми отсеками, чтобы автопоезд (тягач + прицеп) считался одной заявкой и ни одна единица груза не вставала в разрыв между машинами.

**Architecture:** Отсеки — интервалы `[x, x + length)` на **общей** оси длины транспорта; разрыв между машинами существует в координатах, но груз туда не встаёт. Благодаря общей оси `Placement`, `StackRef`, `Layout` и вся пиксельная математика UI не меняются, а изменение контракта остаётся **аддитивным** (0.16.0). Единственный сквозной инвариант: единица груза лежит целиком внутри **одного** отсека. Он заменяет собой сегодняшнюю проверку «в габаритах кузова» в четырёх местах ядра.

**Tech Stack:** TypeScript (изоморфное ядро `@shadrin-v/engine` без DOM/Node), Vitest, React 18 + Vite (`apps/web`), SVG в миллиметрах кузова, i18n `de`/`ru`.

**Спека:** [2026-08-04-p3p-multi-compartment-design.md](../specs/2026-08-04-p3p-multi-compartment-design.md). **beads:** `LKWkalk-p3p`.

## Global Constraints

- Все линейные размеры — **целые миллиметры** ([ADR 002](../../adr/002-integer-millimeters.md)). Дробей в домене нет.
- **Правило «сначала документация»:** ADR и `api-contract.md` правятся до кода (Task 1).
- **TDD без исключений:** сначала падающий тест, потом код. Тест, который не падал, не считается ведущим (грабли `72g`).
- Ядро **не знает о UI**: ни строк, ни DOM, ни Node. Только данные и коды ошибок.
- Ни одной пользовательской строки в коде — только ключи локалей (`de`, `ru`).
- Тесты гоняются **с корня**: `npm test` (не workspace-scoped). Ожидаемая база на старте — 978/978.
- Дев-сервер: `npm run dev:web` (скрипта `npm run dev` не существует).
- **Работа ведётся в ветке, не в `main`.** Мерж в `main` = немедленная выкладка на прод ([ADR 023](../../adr/023-continuous-deploy-from-main.md)), а этот план проходит через промежуточные состояния, где ядро уже знает про отсеки, а UI ещё нет. Перед Task 1: `git switch -c feat/p3p-multi-compartment`. Коммиты атомарные, после зелёных тестов; в `main` — одним PR после финального гейта.
- Отсутствие `Vehicle.compartments` обязано давать **побайтово прежний** `Layout`. Это гейт аддитивности (Task 9).

## Карта файлов

**Создаются:**

| Файл | Ответственность |
|---|---|
| `packages/engine/src/model/compartments.ts` | Единственный источник знания «что такое отсек»: `compartmentsOf`, `compartmentSpanning`, `fitsInSomeCompartment` |
| `packages/engine/src/model/compartments.test.ts` | Тесты того же |
| `apps/web/src/screens/setup/vehicleCompartments.ts` | Чистая правка длин отсеков в редакторе (сдвиг `x`, пересчёт `length`) |
| `apps/web/src/screens/setup/vehicleCompartments.test.ts` | Тесты того же |
| `docs/adr/026-multi-compartment-vehicle.md` | Решение и его обоснование |

**Меняются:**

| Файл | Что именно |
|---|---|
| `packages/engine/src/model/types.ts` | `Compartment`, `Vehicle.compartments?` |
| `packages/engine/src/validation/validate.ts` | `ERR_INVALID_COMPARTMENTS`; `fitsInVehicle` → «в какой-нибудь отсек» |
| `packages/engine/src/metrics/metrics.ts` | Площадь и объём — суммой по отсекам |
| `packages/engine/src/geometry/geometry.ts` | Границы → границы отсека |
| `packages/engine/src/packing/orchestrator.ts` | Внешний цикл по отсекам; `remaining` протянут сквозь них |
| `packages/engine/src/packing/edit.ts` | `outOfBounds` → границы отсека |
| `packages/engine/src/packing/resolveDrop.ts` | Кандидаты-стенки на каждый отсек |
| `packages/engine/src/packing/resolveSlide.ts` | Упор — стенка своего отсека |
| `packages/engine/src/index.ts` | Экспорты + `ENGINE_CONTRACT_VERSION` → `0.16.0` |
| `apps/web/src/data/presets.ts` | `DimPreset.compartments?` + пресет автопоезда |
| `apps/web/src/screens/setup/SetupHeader.tsx` | Поле длины на отсек; сборка `Vehicle` из пресета |
| `apps/web/src/screens/setup/setupValidation.ts` | Объём кузова суммой по отсекам |
| `apps/web/src/screens/components/CrossSection.tsx` | Стенки отсеков, разрыв как «не кузов», подписи |
| `apps/web/src/screens/LadeplanScreen.tsx` | Счётчики размещённого по отсекам |
| `packages/i18n/src/keys.ts`, `dictionaries/de.ts`, `dictionaries/ru.ts` | Ключи меток отсеков |

**Порядок и зависимости.** Task 2 — фундамент, от него зависят 3–9. Задачи 3, 4, 5, 7 независимы друг от друга и могут идти параллельно. Task 6 (упаковщик) опирается на 2. Task 8 и 9 — на 2 и 7. UI (10–13) — после 9.

## Общие фикстуры тестов

Задачи 6–9 и 12–13 пользуются одними и теми же фикстурами. **Каждый тест-файл объявляет их у себя** — в репозитории нет общего модуля тестовых фикстур, и заводить его ради этой задачи не нужно (файлы тестов здесь самодостаточны по сложившемуся стилю). Копируйте блок целиком:

```ts
// Два отсека по 2400 мм с разрывом 1000: пролёт 5800, грузовая длина 4800.
const twoBays: Vehicle = {
  id: 't', name: 't', length: 5800, width: 2400, height: 2400,
  compartments: [{ id: 'a', x: 0, length: 2400 }, { id: 'b', x: 3400, length: 2400 }],
};

const cube = (over: Partial<CargoType> = {}): CargoType => ({
  id: 'c', name: 'c', length: 1200, width: 1200, height: 1200, quantity: 8,
  rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false },
  state: 'entschachtelt', ...over,
});
```

Для задач 12–13 (UI) дополнительно:

```ts
const trainLoad: Load = { vehicle: trainVehicle, cargo: [cube({ quantity: 8 })] };
const trainLayout = packLoad(trainLoad);
const plainVehicle: Vehicle = { id: 'v', name: 'v', length: 13600, width: 2450, height: 2650 };
const plainLoad: Load = { vehicle: plainVehicle, cargo: [cube({ quantity: 8 })] };
const plainLayout = packLoad(plainLoad);
```

где `trainVehicle` — настоящий пресет автопоезда (Task 10): отсеки `[{x: 0, length: 7700}, {x: 8900, length: 7700}]`, `length: 16600`, `width: 2450`, `height: 3050`. В Task 12 и 13 проверяются числа именно этого пресета (`x = 8900`, сумма длин 15400), поэтому подменять его на `twoBays` нельзя.

`noop` в тестах `LadeplanScreen` — набор обязательных пропов-заглушек; возьмите его из соседних тестов того же файла, не изобретая свой.

---

### Task 1: Документы вперёд кода

**Files:**
- Create: `docs/adr/026-multi-compartment-vehicle.md`
- Modify: `docs/api-contract.md` (§1 Vehicle, §3 коды, §5 история версий), `docs/spec.md` (Приложение A), `docs/lkw-presets-logist-2026-07-20.md:59-68`, `docs/CHANGELOG.md`
- Test: нет (документы)

**Interfaces:**
- Consumes: спека брейншторма.
- Produces: письменный контракт `0.16.0`, на который ссылаются все последующие задачи.

- [ ] **Step 1: Написать ADR 026**

Формат — как у соседей (`docs/adr/024-slide-to-stop.md`): Контекст → Решение → Последствия. Обязательно зафиксировать:

- отсеки = интервалы на общей оси длины, разрыв — реальный интервал координат без пола;
- отвергнутая альтернатива `compartmentId` + локальные координаты и **почему**: область броска в `CrossSection` — одна вложенная `<svg data-hold>` с `viewBox="0 0 length spanY"`, через `getScreenCTM` пиксели мапятся прямо в мм груза, и `LadeplanScreen` пересчитывает через неё же броски двор→кузов; локальные координаты потребовали бы N таких svg и переписывания всей этой математики;
- следствие: изменение **аддитивное**, а не ломающее, вопреки исходной формулировке `LKWkalk-p3p`;
- инвариант: единица лежит целиком внутри одного отсека;
- метрики считаются суммой по отсекам, иначе разрыв завысил бы кузов и занизил `volumeFillPercent`.

- [ ] **Step 2: Правка `docs/api-contract.md`**

В §1 — тип `Compartment` и поле `Vehicle.compartments?` ровно в той форме, что в Task 2. В §3 — строка `ERR_INVALID_COMPARTMENTS`. В описаниях `findGeometryViolations` и операций правки — «в габаритах отсека» вместо «в габаритах кузова». В шапке файла версия `0.16.0`, в истории версий сверху:

```markdown
- `0.16.0` — добавлены тип `Compartment` и поле `Vehicle.compartments?` (транспорт с несколькими
  грузовыми отсеками, [ADR 026](adr/026-multi-compartment-vehicle.md)). Отсеки — интервалы на общей
  оси длины; разрыв между отсеками существует в координатах, груз в него не встаёт. Добавлен код
  `ERR_INVALID_COMPARTMENTS`; `ERR_CARGO_EXCEEDS_VEHICLE` теперь означает «не влезает ни в один
  отсек». Аддитивно: формы `Placement`, `StackRef`, `PlaceStackSpec`, `Layout`, `DropResolution`,
  `SlideDelta`, `BufferStack` не менялись, отсутствие `compartments` = один отсек = прежнее
  поведение. `ENGINE_CONTRACT_VERSION` → `0.16.0` (`LKWkalk-p3p`).
```

- [ ] **Step 3: Приложение A в `docs/spec.md` и справочник пресетов**

В Приложение A добавить автопоезд: два отсека 7700 × 2450 × 3050, разрыв 1200, полный пролёт 16600. В `docs/lkw-presets-logist-2026-07-20.md` заменить раздел «Автопоезд (вариант 5) — вынесен в отдельную задачу» на запись о том, что вариант внесён, со ссылкой на ADR 026, и **сохранить пометку**, что длины 7700 + 7700 и разрыв 1200 требуют подтверждения логистом.

- [ ] **Step 4: Запись в `docs/CHANGELOG.md`**

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(contract): multi-compartment vehicle, ADR 026, contract 0.16.0 (p3p)"
```

---

### Task 2: Модель отсеков

**Files:**
- Create: `packages/engine/src/model/compartments.ts`, `packages/engine/src/model/compartments.test.ts`
- Modify: `packages/engine/src/model/types.ts:18-26`
- Test: `packages/engine/src/model/compartments.test.ts`

**Interfaces:**
- Consumes: `Vehicle` из `model/types.ts`.
- Produces: `Compartment` (тип контракта), `CompartmentSpan`, `compartmentsOf(vehicle): CompartmentSpan[]`, `compartmentSpanning(vehicle, x, dx): CompartmentSpan | null`, `fitsInSomeCompartment(vehicle, x, dx): boolean`. Реэкспортируются автоматом: `model/index.ts` делает `export *`. **Задачи 3–9 обязаны звать эти функции, а не считать границы сами** — иначе инвариант расползётся по пяти файлам, как расползлась норма контраста в `palette.test.ts`.

- [ ] **Step 1: Написать падающие тесты**

```ts
// packages/engine/src/model/compartments.test.ts
import { describe, expect, it } from 'vitest';
import { compartmentsOf, compartmentSpanning, fitsInSomeCompartment } from './compartments';
import type { Vehicle } from './types';

const single: Vehicle = { id: 'v', name: 'v', length: 13600, width: 2450, height: 2650 };
const train: Vehicle = {
  id: 't', name: 't', length: 16600, width: 2450, height: 3050,
  compartments: [
    { id: 'tractor', x: 0, length: 7700 },
    { id: 'trailer', x: 8900, length: 7700 },
  ],
};

describe('compartmentsOf', () => {
  it('односоставный кузов = один неявный отсек во всю длину', () => {
    expect(compartmentsOf(single)).toEqual([{ id: 'v', x: 0, length: 13600, name: undefined }]);
  });

  it('многосоставный отдаёт свои отсеки', () => {
    expect(compartmentsOf(train).map((c) => [c.x, c.length])).toEqual([[0, 7700], [8900, 7700]]);
  });
});

describe('compartmentSpanning', () => {
  it('интервал целиком внутри отсека', () => {
    expect(compartmentSpanning(train, 0, 1200)?.id).toBe('tractor');
    expect(compartmentSpanning(train, 8900, 7700)?.id).toBe('trailer');
  });

  it('интервал в разрыве — ничей', () => {
    expect(compartmentSpanning(train, 7800, 1000)).toBeNull();
  });

  it('интервал, оседлавший границу машин, — ничей', () => {
    // Начинается в тягаче, кончается за его стенкой: сумма длин влезла бы, отсек — нет.
    expect(compartmentSpanning(train, 7000, 1200)).toBeNull();
  });

  it('за бортом — ничей', () => {
    expect(compartmentSpanning(train, 16000, 1200)).toBeNull();
    expect(compartmentSpanning(train, -1, 100)).toBeNull();
  });
});

describe('fitsInSomeCompartment', () => {
  it('односоставный ведёт себя как прежняя проверка границ', () => {
    expect(fitsInSomeCompartment(single, 12400, 1200)).toBe(true);
    expect(fitsInSomeCompartment(single, 12401, 1200)).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run packages/engine/src/model/compartments.test.ts`
Expected: FAIL — «Failed to resolve import "./compartments"».

- [ ] **Step 3: Добавить тип в контракт**

В `packages/engine/src/model/types.ts` над `Vehicle`:

```ts
/** Грузовой отсек — интервал [x, x + length) на оси длины транспорта (ADR 026, контракт 0.16.0). */
export interface Compartment {
  id: string;
  /** Ключ метки; локализация — на стороне UI. */
  name?: string;
  /** мм, начало отсека по оси длины; целое, >= 0. */
  x: number;
  /** мм, > 0, целое. */
  length: number;
}
```

и поле в `Vehicle` (после `height`):

```ts
  /** Отсеки по возрастанию `x`. Отсутствует = один отсек [0, length). Разрывы между отсеками —
   *  физические промежутки между машинами: координаты там есть, груз туда не встаёт (ADR 026). */
  compartments?: Compartment[];
```

- [ ] **Step 4: Реализовать модуль**

```ts
// packages/engine/src/model/compartments.ts
//
// Единственное место, знающее, что такое отсек. Все проверки границ в ядре (валидация, геометрия,
// правки, магнит, упор) обязаны спрашивать здесь, а не считать `vehicle.length` сами: инвариант
// «единица лежит целиком внутри ОДНОГО отсека» иначе расползётся по пяти файлам и разойдётся молча.
import type { Vehicle } from './types';

export interface CompartmentSpan {
  id: string;
  name?: string;
  x: number;
  length: number;
}

/** Отсеки транспорта. Односоставный кузов — один неявный отсек [0, length).
 *
 *  Пустой массив тоже читается как односоставный, хотя валидация его отвергает: функция зовётся и
 *  из путей, где вход ещё не проверен (ручные правки, магнит), и обязана быть тотальной. Отказ за
 *  пустой массив — работа `validateLoad`, а не этой функции. */
export function compartmentsOf(vehicle: Vehicle): CompartmentSpan[] {
  const cs = vehicle.compartments;
  if (cs === undefined || cs.length === 0) {
    return [{ id: vehicle.id, name: undefined, x: 0, length: vehicle.length }];
  }
  return cs.map((c) => ({ id: c.id, name: c.name, x: c.x, length: c.length }));
}

/** Отсек, вмещающий интервал [x, x + dx) ЦЕЛИКОМ. `null` — интервал в разрыве, за бортом или
 *  оседлал границу между машинами. Именно это `null` и запрещает поставить поддон в сцепку. */
export function compartmentSpanning(vehicle: Vehicle, x: number, dx: number): CompartmentSpan | null {
  for (const c of compartmentsOf(vehicle)) {
    if (x >= c.x && x + dx <= c.x + c.length) return c;
  }
  return null;
}

export const fitsInSomeCompartment = (vehicle: Vehicle, x: number, dx: number): boolean =>
  compartmentSpanning(vehicle, x, dx) !== null;
```

- [ ] **Step 5: Тесты зелёные**

Run: `npx vitest run packages/engine/src/model/compartments.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 6: Полный прогон и коммит**

Run: `npm test` — ожидается 978 + 8 = 986, ни одного падения (тип добавлен опционально, ничьё поведение не тронуто).

```bash
git add packages/engine/src/model/
git commit -m "feat(engine): compartment model — intervals on the shared length axis (p3p)"
```

---

### Task 3: Валидация отсеков

**Files:**
- Modify: `packages/engine/src/validation/validate.ts:16-20,26-44`
- Test: `packages/engine/src/validation/validate.test.ts`

**Interfaces:**
- Consumes: `compartmentsOf` (Task 2).
- Produces: код `ERR_INVALID_COMPARTMENTS` с `details.reason` из набора `'empty' | 'x' | 'length' | 'overlap' | 'span'`.

- [ ] **Step 1: Написать падающие тесты**

```ts
// добавить в packages/engine/src/validation/validate.test.ts
const trainVehicle = (compartments: Compartment[], length = 16600): Vehicle => ({
  id: 't', name: 't', length, width: 2450, height: 3050, compartments,
});
const okCargo: CargoType = {
  id: 'c', name: 'c', length: 1200, width: 800, height: 144, quantity: 1,
  rotation: 'yawOnly', stacking: { stackable: true }, nesting: { nestable: false },
  state: 'entschachtelt',
};
const codes = (v: Vehicle) => validateLoad({ vehicle: v, cargo: [okCargo] }).map((e) => e.code);

describe('валидация отсеков', () => {
  it('корректные отсеки проходят', () => {
    expect(codes(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 8900, length: 7700 }]))).toEqual([]);
  });

  it('пустой массив отвергается: односоставный кузов выражается ОТСУТСТВИЕМ поля', () => {
    expect(codes(trainVehicle([]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('отсеки не по возрастанию x', () => {
    expect(codes(trainVehicle([{ id: 'b', x: 8900, length: 7700 }, { id: 'a', x: 0, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('пересекающиеся отсеки', () => {
    expect(codes(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 7000, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('нецелая или неположительная длина', () => {
    expect(codes(trainVehicle([{ id: 'a', x: 0, length: 7700.5 }, { id: 'b', x: 8900, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
    expect(codes(trainVehicle([{ id: 'a', x: 0, length: 0 }, { id: 'b', x: 8900, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('конец последнего отсека обязан совпасть с длиной транспорта', () => {
    // Иначе в хвосте заводится молчаливая мёртвая зона, а `length` перестаёт быть производным.
    expect(codes(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 8900, length: 7700 }], 17000))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('груз длиннее отсека отвергается, хотя короче полного пролёта', () => {
    const longCargo: CargoType = { ...okCargo, id: 'long', length: 8000, rotation: 'none' };
    const v = trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 8900, length: 7700 }]);
    expect(validateLoad({ vehicle: v, cargo: [longCargo] }).map((e) => e.code)).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run packages/engine/src/validation/validate.test.ts`
Expected: FAIL — все, кроме первого: сегодня `compartments` не читается вовсе.

- [ ] **Step 3: Реализовать**

В `validate.ts` заменить `fitsInVehicle` и добавить проверку отсеков:

```ts
import { compartmentsOf } from '../model/compartments';

/** Груз должен влезть в КАКОЙ-НИБУДЬ отсек. Восьмиметровая деталь не помещается в автопоезд
 *  2 × 7,7 м, хотя короче полного пролёта 16,6 м — пролёт включает разрыв, а груз в нём не стоит. */
function fitsInVehicle(cargo: CargoType, vehicle: Vehicle): boolean {
  const maxLength = Math.max(...compartmentsOf(vehicle).map((c) => c.length));
  return orientationTriples(cargo).some(
    ([dx, dy, dz]) => dx <= maxLength && dy <= vehicle.width && dz <= vehicle.height,
  );
}

/** Отсеки: целые, положительные, по возрастанию, без пересечений, и конец последнего = длине
 *  транспорта. Отдаёт максимум одну ошибку: перечислять все поломки сразу незачем — первая же
 *  говорит, что справочник кузовов испорчен. */
function compartmentErrors(vehicle: Vehicle): EngineError[] {
  const cs = vehicle.compartments;
  if (cs === undefined) return [];
  const bad = (reason: string, details?: Record<string, unknown>): EngineError[] => [
    { code: 'ERR_INVALID_COMPARTMENTS', details: { reason, ...details } },
  ];
  if (cs.length === 0) return bad('empty');
  let prevEnd = 0;
  for (const c of cs) {
    if (!Number.isInteger(c.x) || c.x < 0) return bad('x', { id: c.id, x: c.x });
    if (!isPositiveInt(c.length)) return bad('length', { id: c.id, length: c.length });
    if (c.x < prevEnd) return bad('overlap', { id: c.id, x: c.x, prevEnd });
    prevEnd = c.x + c.length;
  }
  if (prevEnd !== vehicle.length) return bad('span', { end: prevEnd, length: vehicle.length });
  return [];
}
```

В `validateLoad`, сразу после цикла проверки габаритов транспорта:

```ts
  const compartmentIssues = vehicleValid ? compartmentErrors(vehicle) : [];
  errors.push(...compartmentIssues);
```

Проверка отсеков идёт **только при валидных габаритах** транспорта: сравнивать `prevEnd` с мусорным `vehicle.length` бессмысленно, а вторая ошибка про то же самое лишь зашумит ответ.

Условие у `ERR_CARGO_EXCEEDS_VEHICLE` дополнить: `compartmentIssues.length === 0 &&` — при испорченных отсеках «влезает ли груз» не определено.

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run packages/engine/src/validation/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/validation/
git commit -m "feat(engine): validate compartments; cargo must fit one compartment (p3p)"
```

---

### Task 4: Метрики суммой по отсекам

**Files:**
- Modify: `packages/engine/src/metrics/metrics.ts:22-28`
- Test: `packages/engine/src/metrics/metrics.test.ts`

**Interfaces:**
- Consumes: `compartmentsOf` (Task 2).
- Produces: поведение — `floorFillPercent`/`volumeFillPercent` считаются от суммы отсеков.

- [ ] **Step 1: Написать падающие тесты**

```ts
// добавить в packages/engine/src/metrics/metrics.test.ts
it('разрыв между отсеками не считается объёмом кузова', () => {
  // Два отсека по 2400 мм при разрыве 1000: пролёт 5800, но кузова только 4800.
  const vehicle: Vehicle = {
    id: 'v', name: 'v', length: 5800, width: 1200, height: 1000,
    compartments: [{ id: 'a', x: 0, length: 2400 }, { id: 'b', x: 3400, length: 2400 }],
  };
  const cargo: CargoType = {
    id: 'c', name: 'c', length: 1200, width: 1200, height: 1000, quantity: 1,
    rotation: 'none', stacking: { stackable: false }, nesting: { nestable: false },
    state: 'entschachtelt',
  };
  const layout: Layout = {
    placements: [{ cargoTypeId: 'c', x: 0, y: 0, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt' }],
    unplaced: [], metrics: { totalPlaced: 1, usedFloorPositions: 1, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.16.0',
  };
  // Пол кузова = (2400 + 2400) × 1200; одна единица 1200×1200 = четверть.
  expect(computeFillMetrics({ vehicle, cargo: [cargo] }, layout).floorFillPercent).toBeCloseTo(25, 9);
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run packages/engine/src/metrics/metrics.test.ts`
Expected: FAIL — получено ≈20,69 (площадь считается от пролёта 5800 вместе с разрывом) вместо 25.

- [ ] **Step 3: Реализовать**

```ts
import { compartmentsOf } from '../model/compartments';
// ...
  const { vehicle } = load;
  // Пол и объём — СУММА отсеков, а не пролёт × ширина: пролёт включает разрыв между машинами,
  // где пола нет вовсе. Считать по нему значило бы занижать заполнение на пустоту (ADR 026).
  const floorArea = compartmentsOf(vehicle).reduce((a, c) => a + c.length * vehicle.width, 0);
  const holdVolume = floorArea * vehicle.height;
```

Для односоставного кузова обе формулы дают ровно прежнее число — существующие тесты метрик обязаны остаться зелёными без правок.

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run packages/engine/src/metrics/`
Expected: PASS, включая все прежние.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/metrics/
git commit -m "fix(engine): hold area and volume sum over compartments, not the span (p3p)"
```

---

### Task 5: Геометрия — границы отсека

**Files:**
- Modify: `packages/engine/src/geometry/geometry.ts:62-74`
- Test: `packages/engine/src/geometry/geometry.test.ts`

**Interfaces:**
- Consumes: `fitsInSomeCompartment` (Task 2).
- Produces: `findGeometryViolations` сообщает `out-of-bounds` для единицы в разрыве или на границе машин.

- [ ] **Step 1: Написать падающие тесты**

```ts
// добавить в packages/engine/src/geometry/geometry.test.ts
const train: Vehicle = {
  id: 't', name: 't', length: 5800, width: 1200, height: 1000,
  compartments: [{ id: 'a', x: 0, length: 2400 }, { id: 'b', x: 3400, length: 2400 }],
};
const unit: CargoType = {
  id: 'c', name: 'c', length: 1200, width: 1200, height: 1000, quantity: 3,
  rotation: 'none', stacking: { stackable: false }, nesting: { nestable: false },
  state: 'entschachtelt',
};
const at = (x: number): Layout => ({
  placements: [{ cargoTypeId: 'c', x, y: 0, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt' }],
  unplaced: [], metrics: { totalPlaced: 1, usedFloorPositions: 1, floorFillPercent: 0, volumeFillPercent: 0 },
  contractVersion: '0.16.0',
});

it('единица в разрыве между машинами — вне габаритов', () => {
  expect(findGeometryViolations({ vehicle: train, cargo: [unit] }, at(2500)).map((v) => v.kind)).toEqual(['out-of-bounds']);
});

it('единица, оседлавшая границу машин, — вне габаритов', () => {
  expect(findGeometryViolations({ vehicle: train, cargo: [unit] }, at(1800)).map((v) => v.kind)).toEqual(['out-of-bounds']);
});

it('единица внутри второго отсека законна', () => {
  expect(findGeometryViolations({ vehicle: train, cargo: [unit] }, at(3400))).toEqual([]);
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run packages/engine/src/geometry/geometry.test.ts`
Expected: FAIL на первых двух — сегодня обе координаты лежат внутри пролёта 5800 и нарушением не считаются.

- [ ] **Step 3: Реализовать**

```ts
import { fitsInSomeCompartment } from '../model/compartments';
// ...
    // Границы — границы ОТСЕКА, а не транспорта (ADR 026). По оси длины проверка спрашивает модель
    // отсеков: координата в разрыве между машинами лежит внутри пролёта, но пола под ней нет.
    if (
      p.x < 0 ||
      p.y < 0 ||
      p.z < 0 ||
      !fitsInSomeCompartment(vehicle, p.x, dx) ||
      p.y + dy > vehicle.width ||
      p.z + dz > vehicle.height
    ) {
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run packages/engine/src/geometry/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/geometry/
git commit -m "feat(engine): geometry bounds are compartment bounds (p3p)"
```

---

### Task 6: Упаковщик — цикл по отсекам

**Files:**
- Modify: `packages/engine/src/packing/orchestrator.ts:92-163`
- Test: `packages/engine/src/packing/orchestrator.test.ts`

**Interfaces:**
- Consumes: `compartmentsOf` (Task 2), `packFloor`, `computeVerticalStack` (без изменений).
- Produces: `packLoad(load)` раскладывает груз по всем отсекам; форма `Layout` не меняется.

**Подводный камень, который здесь легко утопить.** Сегодня `packZones` строит `FloorRequest.count` из `c.quantity`. Во втором отсеке это неверно: считать надо от **остатка**, иначе прицеп запросит место под всю заявку целиком и вытеснит собой соседей. Карта `remaining` поэтому создаётся снаружи цикла и живёт через все отсеки.

> **Поправка по факту реализации (2026-08-04).** Числа `quantity` в тестах ниже были невыполнимы: отсек 2400 × 2400 при высоте 2400 принимает 4 напольных места × 2 яруса = **8 единиц** куба 1200³, то есть при `quantity: 8` весь груз ложится в ПЕРВЫЙ отсек, а второй остаётся пуст. Три теста на перетекание груза в соседний кузов в исходной редакции ничего не проверяли, а «по 4 в отсеке» в первом тесте — неверное утверждение. Кроме того, единый регион 5800 (старое поведение) даёт те же 16 единиц, что два отсека по 8, поэтому `fill`-тест на голом `totalPlaced` не отличал новое поведение от старого. Итоговые числа — в `packages/engine/src/packing/orchestrator.test.ts`: `quantity: 12` для теста перетекания, ассерт распределения `x >= 3400` для `fill`, `head: 12` + `tail: { length: 1500, quantity: 4 }` для приоритета заявки. **Урок для будущих планов: считать вместимость фикстуры явно, прежде чем писать ожидаемые числа.**

- [ ] **Step 1: Написать падающие тесты**

```ts
// добавить в packages/engine/src/packing/orchestrator.test.ts
const twoBays: Vehicle = {
  id: 't', name: 't', length: 5800, width: 2400, height: 2400,
  compartments: [{ id: 'a', x: 0, length: 2400 }, { id: 'b', x: 3400, length: 2400 }],
};
const cube = (over: Partial<CargoType> = {}): CargoType => ({
  id: 'c', name: 'c', length: 1200, width: 1200, height: 1200, quantity: 8,
  rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false },
  state: 'entschachtelt', ...over,
});

it('точный ответ: два отсека 2400³ и куб 1200 → ровно 8 единиц, по 4 в отсеке', () => {
  const layout = packLoad({ vehicle: twoBays, cargo: [cube()] });
  expect(layout.metrics.totalPlaced).toBe(8);
  expect(layout.metrics.usedFloorPositions).toBe(4); // по 2 напольных места в каждом отсеке
  expect(layout.unplaced).toEqual([]);
});

it('ни одна единица не встаёт в разрыв — на случайных заявках', () => {
  // Property-тест, а не один кейс: разрыв ловится только тогда, когда габариты груза и отсеков
  // подобраны неудачно, и подбирать их вручную — значит проверять ровно те случаи, о которых уже
  // подумал. `fast-check` здесь уже используется (floor.test.ts, edit.test.ts).
  fc.assert(
    fc.property(
      fc.integer({ min: 1000, max: 4000 }),   // длина отсека
      fc.integer({ min: 200, max: 2000 }),    // длина разрыва
      fc.integer({ min: 300, max: 1500 }),    // длина единицы
      fc.integer({ min: 300, max: 1200 }),    // ширина единицы
      fc.integer({ min: 1, max: 30 }),        // количество
      (bay, gap, cl, cw, qty) => {
        const vehicle: Vehicle = {
          id: 't', name: 't', length: bay * 2 + gap, width: 2450, height: 2400,
          compartments: [{ id: 'a', x: 0, length: bay }, { id: 'b', x: bay + gap, length: bay }],
        };
        const cargo = [cube({ length: cl, width: cw, height: 1200, quantity: qty })];
        const load = { vehicle, cargo };
        expect(findGeometryViolations(load, packLoad(load))).toEqual([]);
      },
    ),
    { numRuns: 500 },
  );
});

it('densityFirst не ломается об отсеки', () => {
  // ADR 016: «плотность бьёт группировку» — densityFirst обязан размещать НЕ МЕНЬШЕ strict.
  // С отсеками сравниваются два многоотсековых прохода, а не один с другим.
  const cargo = [cube({ id: 'a', orderId: 'SO-1', quantity: 5 }), cube({ id: 'b', orderId: 'SO-2', quantity: 5 })];
  const strict = packLoad({ vehicle: twoBays, cargo, orderGrouping: 'strict' });
  const dense = packLoad({ vehicle: twoBays, cargo, orderGrouping: 'densityFirst' });
  expect(dense.metrics.totalPlaced).toBeGreaterThanOrEqual(strict.metrics.totalPlaced);
});

it('заказ, не влезший в первый отсек, продолжается во втором', () => {
  // Один orderId, 8 единиц: в тягач влезает 4, остальные обязаны уехать в прицеп, а не в unplaced.
  const layout = packLoad({ vehicle: twoBays, cargo: [cube({ orderId: 'SO-1' })] });
  const inTrailer = layout.placements.filter((p) => p.x >= 3400);
  expect(inTrailer.length).toBeGreaterThan(0);
  expect(layout.unplaced).toEqual([]);
});

it('fill заполняет оба отсека', () => {
  const layout = packLoad({ vehicle: twoBays, cargo: [cube({ quantity: 0, fill: true })] });
  expect(layout.metrics.totalPlaced).toBe(8);
});

it('приоритет заявки: хвост списка уходит в unplaced, а не мелочь', () => {
  const layout = packLoad({
    vehicle: twoBays,
    cargo: [cube({ id: 'head', quantity: 8 }), cube({ id: 'tail', quantity: 4 })],
  });
  expect(layout.unplaced.map((u) => u.cargoTypeId)).toEqual(['tail']);
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run packages/engine/src/packing/orchestrator.test.ts`
Expected: FAIL — сегодня упаковщик видит один отсек длиной 5800 и ставит груз в разрыв; первый тест даст 12 вместо 8.

- [ ] **Step 3: Реализовать**

`packZones` получает отсек и общую карту остатков; `remaining` больше не строится внутри:

```ts
import { compartmentsOf, type CompartmentSpan } from '../model/compartments';

/** Разложить зоны внутри ОДНОГО отсека, вычитая размещённое из общей карты остатков.
 *  Остатки общие на весь транспорт: прицеп грузит то, чего не хватило тягачу. */
function packZones(
  load: Load,
  zones: CargoType[][],
  comp: CompartmentSpan,
  remaining: Map<string, number>,
): ZonePacking {
  const { vehicle } = load;
  const clearance = load.clearance ?? 0;
  const loadingMode = load.loadingMode ?? 'combined';
  const placements: Placement[] = [];
  const placedByType = new Map<string, number>();
  let usedFloorPositions = 0;
  let xOffset = comp.x;

  for (const zone of zones) {
    const region = { length: comp.x + comp.length - xOffset, width: vehicle.width };
    if (region.length <= 0) break;
    const stackOf = new Map<string, number>();
    const requests: FloorRequest[] = [];
    const fillReqs: FloorRequest[] = [];
    for (const c of zone) {
      const rem = remaining.get(c.id) ?? 0;
      if (rem <= 0) continue;                       // всё уже уехало в предыдущий отсек
      const S = computeVerticalStack(c, vehicle.height).count;
      stackOf.set(c.id, S);
      if (S <= 0) continue;
      const req: FloorRequest = {
        cargoTypeId: c.id,
        length: c.length,
        width: c.width,
        rotation: c.rotation,
        // Место запрашивается под ОСТАТОК, а не под всю заявку: иначе второй отсек попросил бы
        // столько же, сколько первый, и вытеснил бы соседей по зоне.
        count: c.fill ? 1_000_000 : Math.ceil(rem / S),
        forkAccess: c.forkAccess,
        forkAxis: c.forkAxis,
      };
      (c.fill ? fillReqs : requests).push(req);
    }
    const fps = packFloor(region, [...requests, ...fillReqs], { clearance, loadingMode });
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
  return { placements, placedByType, usedFloorPositions };
}

/** Пройти все отсеки по возрастанию x, протягивая остатки сквозь них. */
function packCompartments(load: Load, zones: CargoType[][]): ZonePacking {
  const remaining = new Map<string, number>();
  for (const c of load.cargo) remaining.set(c.id, c.fill ? Number.POSITIVE_INFINITY : c.quantity);

  const placements: Placement[] = [];
  const placedByType = new Map<string, number>();
  let usedFloorPositions = 0;
  for (const comp of compartmentsOf(load.vehicle)) {
    const part = packZones(load, zones, comp, remaining);
    placements.push(...part.placements);
    for (const [id, n] of part.placedByType) {
      placedByType.set(id, (placedByType.get(id) ?? 0) + n);
    }
    usedFloorPositions += part.usedFloorPositions;
  }
  return { placements, placedByType, usedFloorPositions };
}
```

В `packLoad` заменить оба вызова `packZones(load, zonesOf(...))` на `packCompartments(load, zonesOf(...))`. Остальное тело `packLoad` не трогается.

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run packages/engine/src/packing/`
Expected: PASS, включая все прежние тесты упаковщика (односоставный кузов = один отсек = прежний путь).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/orchestrator.ts packages/engine/src/packing/orchestrator.test.ts
git commit -m "feat(engine): pack compartment by compartment, carrying leftovers forward (p3p)"
```

---

### Task 7: Ручные правки — границы отсека

**Files:**
- Modify: `packages/engine/src/packing/edit.ts:62-68`
- Test: `packages/engine/src/packing/edit.test.ts`

**Interfaces:**
- Consumes: `fitsInSomeCompartment` (Task 2).
- Produces: `placeStack`/`moveStack`/`moveStacks` отказывают с `ERR_EDIT_OUT_OF_BOUNDS` на позиции, не влезающей целиком в один отсек. Новых кодов нет.

- [ ] **Step 1: Написать падающие тесты**

```ts
// добавить в packages/engine/src/packing/edit.test.ts
it('поставить стопку в разрыв нельзя', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const layout = packLoad(load);
  const bare = unplaceStacks(load, layout, [{ cargoTypeId: 'c', x: 0, y: 0 }]).layout;
  const res = placeStack(load, bare, { cargoTypeId: 'c', x: 2500, y: 0, orientation: 'lwh' });
  expect(res.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  expect(res.layout).toBe(bare); // отказ возвращает ИСХОДНУЮ раскладку
});

it('стопку нельзя посадить верхом на границу машин', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const layout = packLoad(load);
  const bare = unplaceStacks(load, layout, [{ cargoTypeId: 'c', x: 0, y: 0 }]).layout;
  expect(placeStack(load, bare, { cargoTypeId: 'c', x: 1800, y: 0, orientation: 'lwh' }).error?.code)
    .toBe('ERR_EDIT_OUT_OF_BOUNDS');
});

it('перенос группы через разрыв отвергается целиком', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const layout = packLoad(load);
  const refs = layout.placements.filter((p) => p.tier === 1 && p.x < 2400)
    .map((p) => ({ cargoTypeId: p.cargoTypeId, x: p.x, y: p.y }));
  const res = moveStacks(load, layout, refs, 2500, 0);
  expect(res.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  expect(res.layout).toBe(layout);
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run packages/engine/src/packing/edit.test.ts`
Expected: FAIL — сегодня 2500 и 1800 лежат внутри пролёта 5800 и принимаются.

- [ ] **Step 3: Реализовать**

```ts
import { fitsInSomeCompartment } from '../model/compartments';
// ...
/**
 * Does this footprint leave the hold? Checked BEFORE overlap, on purpose: a spot outside the hold is
 * usually also on top of something, and "does not fit in the truck" is the more fundamental answer —
 * it keeps the reported reason stable instead of depending on which neighbour happens to be there.
 *
 * По длине граница — граница ОТСЕКА (ADR 026): позиция в разрыве между машинами или верхом на их
 * границе лежит внутри пролёта, но пола под ней нет. Для пользователя это тот же ответ «сюда
 * нельзя», поэтому кода ошибки не добавляется.
 */
const outOfBounds = (load: Load, x: number, y: number, dx: number, dy: number): boolean =>
  x < 0 || y < 0 || !fitsInSomeCompartment(load.vehicle, x, dx) || y + dy > load.vehicle.width;
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run packages/engine/src/packing/edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/edit.ts packages/engine/src/packing/edit.test.ts
git commit -m "feat(engine): manual edits respect compartment bounds (p3p)"
```

---

### Task 8: Магнит — стенки каждого отсека

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.ts:123-171`
- Test: `packages/engine/src/packing/resolveDrop.test.ts`

**Interfaces:**
- Consumes: `compartmentsOf`, `fitsInSomeCompartment` (Task 2).
- Produces: `resolveDrop`/`resolveGroupDrop` без изменений сигнатур; кандидаты по оси длины строятся на каждый отсек.

- [ ] **Step 1: Написать падающие тесты**

```ts
// добавить в packages/engine/src/packing/resolveDrop.test.ts
it('прицел в разрыв примагничивается к ближайшей стенке соседнего отсека', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
  // Прицел 2600: 200 мм за стенкой тягача (2400), допуск по умолчанию — половина короткой стороны (600).
  const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 2600, y: 0, orientation: 'lwh' });
  expect(res.ok).toBe(true);
  expect(res.x).toBe(1200); // дальняя кромка вплотную к стенке тягача: 1200 + 1200 = 2400
});

it('прицел глубоко в разрыве — отказ, стопку туда не телепортируют', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
  const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 2900, y: 0, orientation: 'lwh' });
  expect(res.ok).toBe(false);
});

it('стенка второго отсека — такой же кандидат, как стенка первого', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
  const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 3500, y: 0, orientation: 'lwh' });
  expect(res.ok).toBe(true);
  expect(res.x).toBe(3400); // притянуло к передней стенке прицепа
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run packages/engine/src/packing/resolveDrop.test.ts`
Expected: FAIL — сегодня кандидаты-стенки только `0` и `length − dx`, а позиция в разрыве принимается как валидная.

- [ ] **Step 3: Реализовать**

Заменить ранний габаритный отказ, ось x и `touchesX`:

```ts
import { compartmentsOf, fitsInSomeCompartment } from '../model/compartments';
// ...
  const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, spec.orientation);
  const maxY = load.vehicle.width - dy;
  // Стопка не влезает ни в один отсек — искать позицию незачем.
  const fitsAnywhere = compartmentsOf(load.vehicle).some((c) => c.length >= dx);
  if (!fitsAnywhere || maxY < 0) {
    return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: cargo.id, dx, dy }));
  }

  const tol = opts.tolerance ?? Math.min(dx, dy) / 2;
  const boxes = floorBoxes(load, layout, opts.exclude ? (r) => sameRef(r, opts.exclude!) : undefined);

  // Ось ШИРИНЫ — как была: одна пара стенок на весь транспорт.
  const axisY = (aimV: number, size: number, max: number, edges: [number, number][]): number[] => {
    const out = new Set<number>();
    const push = (v: number) => {
      if (v >= 0 && v <= max && Math.abs(v - aimV) <= tol) out.add(v);
    };
    push(aimV);
    push(0);
    push(max);
    for (const [start, extent] of edges) {
      push(start + extent);
      push(start - size);
    }
    return [...out];
  };

  // Ось ДЛИНЫ: стенок столько же, сколько отсеков, а годной считается позиция, лежащая целиком в
  // одном из них. Разрыв не требует особого случая — позиция в нём просто не проходит фильтр.
  // Побочно это и есть «магнит вытягивает прицел из сцепки»: стенки соседних отсеков остаются
  // кандидатами, пока прицел в пределах допуска.
  const axisX = (aimV: number, size: number, edges: [number, number][]): number[] => {
    const out = new Set<number>();
    const push = (v: number) => {
      if (Math.abs(v - aimV) <= tol && fitsInSomeCompartment(load.vehicle, v, size)) out.add(v);
    };
    push(aimV);
    for (const c of compartmentsOf(load.vehicle)) {
      push(c.x);
      push(c.x + c.length - size);
    }
    for (const [start, extent] of edges) {
      push(start + extent);
      push(start - size);
    }
    return [...out];
  };

  const xs = axisX(aim.x, dx, boxes.map((b): [number, number] => [b.x, b.dx]));
  const ys = axisY(aim.y, dy, maxY, boxes.map((b): [number, number] => [b.y, b.dy]));
```

`touchesX` — «впритык» к стенке любого отсека:

```ts
  const touchesX = (v: number) =>
    compartmentsOf(load.vehicle).some((c) => v === c.x || v + dx === c.x + c.length) ||
    boxes.some((b) => v === b.x + b.dx || v + dx === b.x);
```

`touchesY` и правило выбора (больше «впритык»-осей → ближе к прицелу → `(x, y)` по возрастанию) не трогаются.

**Проверить отдельно:** `maxX` больше не существует как одно число — убедиться, что все его прежние употребления в файле заменены, `npx tsc --noEmit` молчит.

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, включая все прежние тесты магнита.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/packing/resolveDrop.ts packages/engine/src/packing/resolveDrop.test.ts
git commit -m "feat(engine): magnet candidates per compartment wall (p3p)"
```

---

### Task 9: Упор + гейт аддитивности + версия контракта

**Files:**
- Modify: `packages/engine/src/packing/resolveSlide.ts:52-62`, `packages/engine/src/index.ts:5`
- Test: `packages/engine/src/packing/resolveSlide.test.ts`, `packages/engine/src/index.test.ts`

**Interfaces:**
- Consumes: `compartmentSpanning` (Task 2).
- Produces: `ENGINE_CONTRACT_VERSION === '0.16.0'`; `resolveSlide` упирается в стенку своего отсека.

- [ ] **Step 1: Написать падающие тесты**

```ts
// packages/engine/src/packing/resolveSlide.test.ts
it('стопка упирается в стенку СВОЕГО отсека, а не в конец пролёта', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 2 })] };
  const layout = packLoad(load);
  const ref = { cargoTypeId: 'c', x: 0, y: 0 };
  // Тягач 0..2400, стопка 1200 в нуле: свободного хода ровно 1200, а не до 5800.
  expect(resolveSlide(load, layout, [ref], '+x')).toEqual({ dx: 1200, dy: 0 });
});

it('выделение по обе стороны разрыва не переезжает через него', () => {
  const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
  const layout = packLoad(load);
  const refs = [{ cargoTypeId: 'c', x: 0, y: 0 }, { cargoTypeId: 'c', x: 3400, y: 0 }];
  // Ход блока — минимум ходов участниц; передняя в прицепе упрётся в его же стенку.
  const d = resolveSlide(load, layout, refs, '+x');
  expect(d.dx).toBeLessThanOrEqual(1200);
});
```

```ts
// packages/engine/src/index.test.ts
it('версия контракта', () => {
  expect(ENGINE_CONTRACT_VERSION).toBe('0.16.0');
});
```

**Гейт аддитивности** — главный страховочный тест задачи, в `packages/engine/src/packing/orchestrator.test.ts`:

```ts
it('односоставный кузов без compartments даёт ту же раскладку, что и раньше', () => {
  // Гейт аддитивности (ADR 026): отсутствие поля обязано быть неотличимо от прежнего движка.
  // Эталон — кузов, ЯВНО описанный одним отсеком во всю длину: если пути разошлись, они дадут
  // разные раскладки, и разойдутся молча.
  const plain: Vehicle = { id: 'v', name: 'v', length: 13600, width: 2450, height: 2650 };
  const explicit: Vehicle = { ...plain, compartments: [{ id: 'only', x: 0, length: 13600 }] };
  const cargo = [cube({ id: 'a', length: 1200, width: 800, height: 144, quantity: 40 })];
  expect(packLoad({ vehicle: plain, cargo })).toEqual(packLoad({ vehicle: explicit, cargo }));
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run packages/engine/src/packing/resolveSlide.test.ts packages/engine/src/index.test.ts`
Expected: FAIL — упор даёт `dx: 4600` (до конца пролёта), версия `0.15.0`.

- [ ] **Step 3: Реализовать**

```ts
import { compartmentSpanning } from '../model/compartments';
// ... внутри цикла по участницам, вместо общего `wall`:
  for (const m of members) {
    const pos = horizontal ? m.x : m.y;
    const size = horizontal ? m.dx : m.dy;
    // Упор по длине — стенка СВОЕГО отсека (ADR 026): за разрывом стоит стена, а не свободный пол.
    // Отсюда же само собой берётся «внутри отсека» для блока: групповой ход — минимум ходов
    // участниц, поэтому выделение по обе стороны сцепки упрётся в первую же стенку.
    const comp = horizontal ? compartmentSpanning(load.vehicle, m.x, m.dx) : null;
    if (horizontal && comp === null) return ZERO; // стопка стоит невесть где — ехать нечему
    const near = horizontal ? comp!.x : 0;
    const far = horizontal ? comp!.x + comp!.length : load.vehicle.width;
    let free = forward ? far - (pos + size) : pos - near;
    // ... дальше цикл по boxes без изменений
```

Строку `const wall = horizontal ? load.vehicle.length : load.vehicle.width;` удалить.

- [ ] **Step 4: Обновить версию и тесты зелёные**

В `packages/engine/src/index.ts`: `export const ENGINE_CONTRACT_VERSION = '0.16.0';`

Run: `npm test`
Expected: PASS целиком. Это первый прогон, где ядро полностью поддерживает отсеки.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/
git commit -m "feat(engine): slide stops at compartment wall; contract 0.16.0 (p3p)"
```

---

### Task 10: Пресет автопоезда и локали

**Files:**
- Modify: `apps/web/src/data/presets.ts:6-38`, `apps/web/src/screens/setup/SetupHeader.tsx:76-82`, `packages/i18n/src/keys.ts:149-150`, `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`
- Test: `apps/web/src/data/presets.test.ts` (создать, если нет), `packages/i18n/src/dictionaries/completeness.test.ts` (существующий, обязан остаться зелёным)

**Interfaces:**
- Consumes: `Compartment` (Task 2).
- Produces: `DimPreset.compartments?: Compartment[]`; пресет с ключом `lkw-gliederzug`.

- [ ] **Step 1: Написать падающий тест**

```ts
// apps/web/src/data/presets.test.ts
import { describe, expect, it } from 'vitest';
import { VEHICLE_PRESETS } from './presets';
import { validateLoad } from '@shadrin-v/engine';

describe('пресет автопоезда', () => {
  const train = VEHICLE_PRESETS.find((p) => p.key === 'lkw-gliederzug');

  it('существует и описан двумя отсеками', () => {
    expect(train?.compartments?.map((c) => [c.x, c.length])).toEqual([[0, 7700], [8900, 7700]]);
  });

  it('проходит валидацию движка: конец последнего отсека = длине', () => {
    const vehicle = { id: train!.key, name: train!.name, length: train!.length,
      width: train!.width, height: train!.height, compartments: train!.compartments };
    const cargo = [{ id: 'c', name: 'c', length: 1200, width: 800, height: 144, quantity: 1,
      rotation: 'yawOnly' as const, stacking: { stackable: true }, nesting: { nestable: false },
      state: 'entschachtelt' as const }];
    expect(validateLoad({ vehicle, cargo })).toEqual([]);
  });

  it('односоставные пресеты остаются без compartments', () => {
    expect(VEHICLE_PRESETS.filter((p) => p.compartments !== undefined)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run apps/web/src/data/presets.test.ts`
Expected: FAIL — пресета нет.

- [ ] **Step 3: Реализовать**

В `presets.ts` расширить тип и добавить пресет последним (первый элемент — дефолт `SetupScreen`, его двигать нельзя):

```ts
import type { Compartment } from '@shadrin-v/engine';

export interface DimPreset {
  key: string;
  name: string;
  length: number;
  width: number;
  height: number;
  /** Грузовые отсеки (ADR 026). Отсутствует = один отсек во всю длину. */
  compartments?: Compartment[];
}
```

```ts
  // Вариант 5 со схемы логиста — автопоезд: ДВА кузова с физическим разрывом, а не один отсек на
  // 15,4 м. Длины 7700 + 7700 (Jumbo-Gliederzug: сходится и с 15 400 мм, и с 110–120 м³ на схеме) и
  // разрыв 1200 мм ТРЕБУЮТ ПОДТВЕРЖДЕНИЯ ЛОГИСТОМ — см. docs/lkw-presets-logist-2026-07-20.md.
  // `length` — полный пролёт вместе с разрывом; грузовая длина = сумма отсеков = 15 400.
  {
    key: 'lkw-gliederzug',
    name: 'LKW Gliederzug (Jumbo)',
    length: 16600,
    width: 2450,
    height: 3050,
    compartments: [
      { id: 'tractor', name: 'vehicle.compartment.tractor', x: 0, length: 7700 },
      { id: 'trailer', name: 'vehicle.compartment.trailer', x: 8900, length: 7700 },
    ],
  },
```

В `SetupHeader.tsx:76-82` протянуть отсеки при выборе пресета — сейчас `Vehicle` собирается перечислением полей, и без правки автопоезд пришёл бы одним отсеком:

```ts
                  p
                    ? {
                        id: p.key, name: p.name, length: p.length, width: p.width, height: p.height,
                        // Без этого автопоезд молча выродился бы в один отсек длиной 16,6 м —
                        // ровно та поломка, ради которой заведена модель отсеков.
                        ...(p.compartments ? { compartments: p.compartments } : {}),
                      }
                    : { ...vehicle, name: tt('setup.vehiclePreset.custom') },
```

Ключи локалей — в `packages/i18n/src/keys.ts` рядом с `vehicle.cargoHold`:

```ts
  'vehicle.compartment.tractor',
  'vehicle.compartment.trailer',
```

`de.ts`: `'vehicle.compartment.tractor': 'Motorwagen'`, `'vehicle.compartment.trailer': 'Anhänger'`.
`ru.ts`: `'vehicle.compartment.tractor': 'Тягач'`, `'vehicle.compartment.trailer': 'Прицеп'`.

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run apps/web/src/data/presets.test.ts packages/i18n/`
Expected: PASS, включая `completeness.test.ts` (оба словаря обязаны знать оба новых ключа).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/data/presets.ts apps/web/src/data/presets.test.ts apps/web/src/screens/setup/SetupHeader.tsx packages/i18n/
git commit -m "feat(web): road-train preset with two compartments + locale keys (p3p)"
```

---

### Task 11: Редактор кузова — поле длины на отсек

**Files:**
- Create: `apps/web/src/screens/setup/vehicleCompartments.ts`, `apps/web/src/screens/setup/vehicleCompartments.test.ts`
- Modify: `apps/web/src/screens/setup/SetupHeader.tsx:89`, `apps/web/src/screens/setup/setupValidation.ts:59`
- Test: `apps/web/src/screens/setup/vehicleCompartments.test.ts`, `apps/web/src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: `Vehicle`, `compartmentsOf`.
- Produces: `setCompartmentLength(vehicle: Vehicle, index: number, length: number): Vehicle` — чистая функция, сохраняющая разрывы и пересчитывающая `x` последующих отсеков и полный `length`.

**Почему отдельный модуль.** Правка длины отсека — это не «поменять число»: сдвигаются `x` всех последующих отсеков и полный пролёт, а инвариант «конец последнего = `length`» обязан пережить каждое нажатие. В теле React-компонента такое живёт ровно до первой правки соседа (та же причина, по которой `reconcileYardOrder` вынесен из `LadeplanScreen` в `yardOrder.ts`).

- [ ] **Step 1: Написать падающие тесты**

```ts
// apps/web/src/screens/setup/vehicleCompartments.test.ts
import { describe, expect, it } from 'vitest';
import { setCompartmentLength } from './vehicleCompartments';
import type { Vehicle } from '@shadrin-v/engine';

const train: Vehicle = {
  id: 't', name: 't', length: 16600, width: 2450, height: 3050,
  compartments: [
    { id: 'tractor', x: 0, length: 7700 },
    { id: 'trailer', x: 8900, length: 7700 },
  ],
};

describe('setCompartmentLength', () => {
  it('удлинение первого отсека сдвигает второй и полный пролёт, сохраняя разрыв', () => {
    const v = setCompartmentLength(train, 0, 8000);
    expect(v.compartments).toEqual([
      { id: 'tractor', x: 0, length: 8000 },
      { id: 'trailer', x: 9200, length: 7700 },   // разрыв те же 1200
    ]);
    expect(v.length).toBe(16900);
  });

  it('правка последнего отсека меняет только его и полный пролёт', () => {
    const v = setCompartmentLength(train, 1, 8300);
    expect(v.compartments?.[0]).toEqual({ id: 'tractor', x: 0, length: 7700 });
    expect(v.length).toBe(17200);
  });

  it('инвариант «конец последнего = length» держится после любой правки', () => {
    for (const [i, len] of [[0, 1], [1, 12345], [0, 20000]] as const) {
      const v = setCompartmentLength(train, i, len);
      const last = v.compartments![v.compartments!.length - 1];
      expect(last.x + last.length).toBe(v.length);
    }
  });

  it('односоставный кузов правится как прежде: одно поле длины, отсеков не заводится', () => {
    const plain: Vehicle = { id: 'v', name: 'v', length: 13600, width: 2450, height: 2650 };
    const v = setCompartmentLength(plain, 0, 13000);
    expect(v.length).toBe(13000);
    expect(v.compartments).toBeUndefined();
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run apps/web/src/screens/setup/vehicleCompartments.test.ts`
Expected: FAIL — «Failed to resolve import "./vehicleCompartments"».

- [ ] **Step 3: Реализовать**

```ts
// apps/web/src/screens/setup/vehicleCompartments.ts
// Правка длин отсеков в редакторе кузова. Отдельно от компонента, потому что правка одного отсека
// двигает СОСЕДЕЙ: разрывы между машинами сохраняются, `x` последующих отсеков и полный пролёт
// пересчитываются, а инвариант «конец последнего = vehicle.length» (ADR 026, ERR_INVALID_COMPARTMENTS)
// обязан пережить каждое нажатие в поле.
import type { Vehicle } from '@shadrin-v/engine';

/** Поставить отсеку `index` длину `length`, сохранив разрывы между отсеками. Односоставный кузов
 *  (нет `compartments`) правится как прежде: меняется только `vehicle.length`. */
export function setCompartmentLength(vehicle: Vehicle, index: number, length: number): Vehicle {
  const cs = vehicle.compartments;
  if (cs === undefined || cs.length === 0) return { ...vehicle, length };
  if (index < 0 || index >= cs.length) return vehicle;

  const gaps = cs.map((c, i) => (i === 0 ? c.x : c.x - (cs[i - 1].x + cs[i - 1].length)));
  const lengths = cs.map((c, i) => (i === index ? length : c.length));

  let x = gaps[0];
  const next = cs.map((c, i) => {
    if (i > 0) x += gaps[i];
    const placed = { ...c, x, length: lengths[i] };
    x += lengths[i];
    return placed;
  });
  return { ...vehicle, compartments: next, length: x };
}
```

В `SetupHeader.tsx` заменить одно поле длины на поле-на-отсек для многосоставного кузова:

```tsx
            {vehicle.compartments === undefined ? (
              <MeasureField label={tt('field.length')} value={vehicle.length}
                onChange={(v) => onVehicleChange({ ...vehicle, length: numOr0(v) })} />
            ) : (
              vehicle.compartments.map((c, i) => (
                <MeasureField
                  key={c.id}
                  label={`${tt('field.length')} · ${c.name ? tt(c.name as TranslationKey) : c.id}`}
                  value={c.length}
                  onChange={(v) => onVehicleChange(setCompartmentLength(vehicle, i, numOr0(v)))}
                />
              ))
            )}
```

В `setupValidation.ts:59` объём кузова — суммой по отсекам:

```ts
    vehicleVolume: compartmentsOf(vehicle).reduce((a, c) => a + c.length * vehicle.width * vehicle.height, 0),
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run apps/web/src/screens/setup/ apps/web/src/screens/SetupScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/setup/
git commit -m "feat(web): per-compartment length fields in the vehicle editor (p3p)"
```

---

### Task 12: Чертёж — стенки отсеков и разрыв

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx:500-520` (пол и сетка), плюс блок обвеса ~700-750
- Test: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Consumes: `compartmentsOf` (Task 2).
- Produces: разметка `data-compartment` на каждом отсеке — по ней тесты и живая проверка находят кузова.

**Что НЕ трогать.** Внешний `viewBox`, вложенная `<svg data-hold>` с `viewBox="0 0 length spanY"`, `toSvg`, `getScreenCTM`, `data-hold-bg`, обработчики указателя. Вся пиксельная математика остаётся прежней — в этом и был смысл общей оси координат. Правка чисто изобразительная.

- [ ] **Step 1: Написать падающие тесты**

```tsx
// добавить в apps/web/src/screens/components/CrossSection.test.tsx
it('рисует по прямоугольнику пола на отсек, а не один на весь пролёт', () => {
  const { container } = render(<CrossSection load={trainLoad} layout={trainLayout} view="top" label="top" />);
  const bays = container.querySelectorAll('[data-compartment]');
  expect(bays).toHaveLength(2);
  expect(bays[0].getAttribute('x')).toBe('0');
  expect(bays[1].getAttribute('x')).toBe('8900');
});

it('разрыв между машинами не залит полом', () => {
  const { container } = render(<CrossSection load={trainLoad} layout={trainLayout} view="top" label="top" />);
  const widths = [...container.querySelectorAll('[data-compartment]')].map((n) => Number(n.getAttribute('width')));
  expect(widths.reduce((a, b) => a + b, 0)).toBe(15400); // 16600 пролёта минус 1200 сцепки
});

it('односоставный кузов остаётся одним прямоугольником пола', () => {
  const { container } = render(<CrossSection load={plainLoad} layout={plainLayout} view="top" label="top" />);
  expect(container.querySelectorAll('[data-compartment]')).toHaveLength(1);
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npx vitest run apps/web/src/screens/components/CrossSection.test.tsx`
Expected: FAIL — атрибута `data-compartment` не существует.

- [ ] **Step 3: Реализовать**

Пол `data-hold-bg` и сетка перестают быть сплошными на весь пролёт и рисуются по отсекам; между ними — фон страницы, без пола, без сетки, с толстой кромкой у каждой стенки:

```tsx
        {/* Пол — по прямоугольнику на отсек (ADR 026). Разрыв между машинами полом НЕ заливается:
            там нет пола физически, и залитая полоса врала бы, что туда можно ставить. Атрибут
            data-hold-bg остаётся на каждом: он и есть цель нажатия по пустому полу (86v). */}
        {draggable && compartmentsOf(load.vehicle).map((c) => (
          <rect key={c.id} data-hold-bg data-compartment={c.id}
            x={c.x} y={0} width={c.length} height={spanY} fill="var(--paper)" />
        ))}
```

Сетка перестаёт быть сплошной: вертикальные линии рисуются по отсекам, горизонтальные — отрезками внутри каждого отсека. Линия, попадающая в разрыв, не рисуется вовсе, иначе сцепка читалась бы как пол.

```tsx
{compartmentsOf(load.vehicle).map((c) => (
  <g key={`grid-${c.id}`} pointerEvents="none">
    {/* Сетка внутри отсека: шаг тот же 1000 мм, но отсчёт от кромки СВОЕГО отсека — иначе у
        второго кузова линии поехали бы относительно его собственной стенки. */}
    {gridLines(c.length).map((gx) => (
      <line key={`vx${c.id}${gx}`} x1={c.x + gx} y1={0} x2={c.x + gx} y2={spanY}
        stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    ))}
    {gridLines(spanY).map((gy) => (
      <line key={`hy${c.id}${gy}`} x1={c.x} y1={gy} x2={c.x + c.length} y2={gy}
        stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    ))}
  </g>
))}
```

Подпись отсека — над его кромкой, тем же кеглем, что линейка длины (`length * RULER_FONT` из `truckChrome`), только для многосоставного кузова: у односоставного подписывать нечего.

```tsx
{load.vehicle.compartments !== undefined && compartmentsOf(load.vehicle).map((c) => (
  <text key={`cap-${c.id}`} x={c.x} y={-spanY * 0.02} pointerEvents="none"
    fontSize={length * RULER_FONT} fill="var(--faint)" fontWeight={600}>
    {c.name ? tt(c.name as TranslationKey) : c.id}
  </text>
))}
```

Обвес (только вид сбоку). `TrailerUnder({ length, height })` из `truckChrome` рисует ходовую, привязывая колёса к **корме** кузова длиной `length`; смещения по `x` у него нет. Поэтому второй кузов получает свой экземпляр в группе со сдвигом, а не новый компонент:

```tsx
{view === 'side' && showTruck && compartmentsOf(load.vehicle).slice(1).map((c) => (
  <g key={`under-${c.id}`} transform={`translate(${c.x}, 0)`}>
    <TrailerUnder length={c.length} height={height} />
  </g>
))}
```

`FrontCap` остаётся только у первого отсека — кабина у состава одна. В разрыве — дышло одной линией на высоте оси. Полноценная иллюстрация прицепа в объём задачи не входит и заводится follow-up'ом (Task 13, шаг 5).

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run apps/web/src/screens/components/`
Expected: PASS, включая прежние тесты `CrossSection` и `holdYardScale` (масштаб двора держится равенством внешних `viewBox` — оно не тронуто).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "feat(web): draw compartment floors and the coupling gap (p3p)"
```

---

### Task 13: Счётчики по отсекам и живая проверка

**Files:**
- Modify: `apps/web/src/screens/LadeplanScreen.tsx:757-772` (полоса метрик)
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx`

**Interfaces:**
- Consumes: `compartmentsOf`, `Layout.placements`.
- Produces: счётчики размещённого по отсекам; новых полей контракта не появляется — числа выводятся из `placements`.

- [ ] **Step 1: Написать падающий тест**

```tsx
// добавить в apps/web/src/screens/LadeplanScreen.test.tsx
it('показывает размещённое по отсекам', () => {
  render(<LadeplanScreen load={trainLoad} layout={trainLayout} {...noop} />);
  const counts = screen.getAllByTestId('compartment-count').map((n) => n.textContent);
  expect(counts).toHaveLength(2);
});

it('односоставный кузов счётчиков по отсекам не показывает', () => {
  render(<LadeplanScreen load={plainLoad} layout={plainLayout} {...noop} />);
  expect(screen.queryAllByTestId('compartment-count')).toHaveLength(0);
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run apps/web/src/screens/LadeplanScreen.test.tsx`
Expected: FAIL — `compartment-count` не существует.

- [ ] **Step 3: Реализовать**

Счётчик — чистый вывод из раскладки, без новых полей контракта:

```ts
const placedPerCompartment = (load: Load, layout: Layout): { id: string; name?: string; count: number }[] =>
  compartmentsOf(load.vehicle).map((c) => ({
    id: c.id,
    name: c.name,
    count: layout.placements.filter((p) => p.x >= c.x && p.x < c.x + c.length).length,
  }));
```

Показывать только при `load.vehicle.compartments !== undefined` — у односоставного кузова «в отсеке столько же, сколько всего» и строка была бы шумом.

- [ ] **Step 4: Живая проверка в Chrome**

Прогон по протоколу CDP из памяти проекта (`2026-08-03-cdp-browser-verification`): свой порт, старый процесс убить перед прогоном.

```bash
npm run dev:web
```

Проверить на реальном автопоезде:
1. Расчёт даёт груз в обоих кузовах и **ничего** в разрыве.
2. Перенос стопки мышью внутри каждого кузова работает; попытка бросить в разрыв краснеет и отменяется.
3. Бросок из двора в кузов и обратно (мапится через `data-hold` — то место, которое мы не трогали).
4. `Emulation.setDeviceMetricsOverride` **375 px**: прочитать чертёж автопоезда. Если нечитаемо — **не менять компоновку молча**, вынести факт владельцу (это признанный хвост спеки).
5. PNG-экспорт и печать: обвес и груз попадают в кадр целиком.

- [ ] **Step 5: Завести follow-up в beads**

```bash
bd create "Дизайн: иллюстрация прицепа для автопоезда (обвес второго кузова)" \
  -t task -p 3 -d "truckChrome рисует кабину и ходовую одной машины; для автопоезда в p3p сделан скупой honest-обвес (ходовая под вторым кузовом, дышло в разрыве). Нужна полноценная иллюстрация прицепа в ряд к брифам rigid/semitrailer/swapbody (docs/superpowers/specs/2026-07-27-truck-asset-brief-*.md)."
bd dep add <новый-id> LKWkalk-41e
```

- [ ] **Step 6: Полный прогон и коммит**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное.

```bash
git add apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/LadeplanScreen.test.tsx
git commit -m "feat(web): per-compartment placed counts on the plan sheet (p3p)"
```

---

## Финальный гейт перед мержем

Мерж в `main` = выкладка на прод ([ADR 023](../../adr/023-continuous-deploy-from-main.md)), отдельного шага релиза нет.

- [ ] `npm test` с корня — зелено; тестов стало ≈ 978 + 40.
- [ ] `npm run typecheck` и `npm run lint` — по нулю.
- [ ] `/code-review` на полном диффе ветки; для правок ядра — кросс-модель (`/codex` либо `/code-review ultra`).
- [ ] Живая проверка из Task 13 пройдена, включая 375 px.
- [ ] `docs/CHANGELOG.md` и `docs/api-contract.md` описывают ровно то, что в коде (реконсиляция doc↔реальность).
- [ ] После деплоя: `curl -s https://ladungsplaner.holz-schaefer.de/api/health` → `{"status":"ok","contract":"0.16.0"}`.
- [ ] `bd close LKWkalk-p3p` с комментарием о результате.
