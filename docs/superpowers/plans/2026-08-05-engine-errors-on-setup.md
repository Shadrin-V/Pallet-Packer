# Коды валидации движка на экране «Настройка» — Implementation Plan

> ⚠️ **ИСПОЛНЕН (2026-08-05, PR #78). Код в этом файле НЕ копировать — он разошёлся с репозиторием.**
> Ревью нашло в нём пять дефектов, каждый из которых давал зелёный, но ничего не проверяющий тест:
> фикстура `rotation: 'all6'` (в контракте `'none' | 'yawOnly' | 'full'`); фикстура
> `state: 'verschachtelt'` без шага не доводила движок до ветки `ERR_INVALID_NESTING`; тест
> атомарности перехватывался незамоканным `window.confirm`; тест «не переспрашиваем о правках» брал
> адресуемую ошибку, которую перехватывает первый гейт; тест предохранителя `App` обесценил гейт,
> добавленный более поздней задачей. Ключ `setup.calcBlocked` из §3 не заводился — состояние уже
> объявляет существующий `setup.header.calcBlocked`. Итог по тестам — **1116**, а не обещанные здесь
> числа. Истина о поведении — в [спеке](../specs/2026-08-05-engine-errors-on-setup-design.md) и в коде.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** экран «Настройка» показывает коды валидации движка вместе со своими проверками, а раскладка с ошибками никогда не становится показанным планом.

**Architecture:** одна сборка груза (`toCargoList`) кормит и расчёт, и живую валидацию, поэтому разойтись им негде. `validateLoad` вызывается на каждый рендер, его коды сливаются с локальными сообщениями по узкому правилу подавления и дальше едут по существующим рельсам панели (счётчик в шапке, клик по сообщению, прыжок «Рассчитать»). Инвариант «layout с `errors` не становится результатом» живёт в `App`, потому что Demo и восстановление из localStorage идут мимо экрана.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library (jsdom), Tailwind (токены), пакеты `@shadrin-v/engine` и `@shadrin-v/i18n` в монорепо npm workspaces.

**Спека:** `docs/superpowers/specs/2026-08-05-engine-errors-on-setup-design.md` — при расхождении права у спеки.

## Global Constraints

- Единицы измерения внутри — целые миллиметры (ADR 002).
- Ни одной пользовательской строки в коде: только ключи локалей, оба словаря `de` и `ru` (ADR 006). Действует eslint-правило `no-untranslated-text`.
- Типографика — только именованные ступени шкалы; произвольные `text-[…]` запрещены правилом `no-off-scale-typography`.
- Доменная логика — только в ядре; UI не решает, что валидно (архитектурный принцип 1).
- Гейты запускаются из **корня** репозитория: `npm test` (не workspace-scoped), `npm run typecheck`, `npm run lint`. Перед первым прогоном: `npm run build --workspace @shadrin-v/i18n && npm run build --workspace @shadrin-v/engine` — `dist` протухает.
- Тесты пишутся ДО кода, каждый шаг заканчивается зелёным прогоном и коммитом.
- Комментарии и сообщения тестов — по-русски (стиль файлов `setup*`), идентификаторы и коммиты — по-английски.

---

### Task 1: Единственная сборка груза `toCargoList`

Сегодня груз собирают два места (`handleCalculate` и Demo), а валидации нужен третий такой же — здесь появляется один общий. Заодно вступает решение спеки: строки с нулевым количеством в груз не попадают.

**Files:**
- Modify: `packages/engine/src/index.ts` (добавить экспорт кодов валидации)
- Modify: `apps/web/src/screens/setup/setupState.ts`
- Modify: `apps/web/src/screens/setup/setupValidation.ts` (перенос типа адреса)
- Test: `apps/web/src/screens/setup/setupState.test.ts`

**Interfaces:**
- Produces: `toCargoList(orders: OrderState[]): { cargo: CargoType[]; addressOf: Map<string, SetupMessageWhere> }`; тип `SetupMessageWhere { orderKey: string; positionId: string }` переезжает в `setupState.ts` и реэкспортируется из `setupValidation.ts` (импортёры не трогаются); из `@shadrin-v/engine` становятся доступны `VALIDATION_ERROR_CODES` и тип `ValidationErrorCode`.

- [ ] **Step 1: Написать падающий тест сборки груза**

В конец `apps/web/src/screens/setup/setupState.test.ts`. Файл собирает фикстуры из `emptyPosition()`/`emptyOrder()` (своих `pos`/`order` в нём нет) — держись того же стиля:

```ts
describe('toCargoList', () => {
  /** Позиция, пригодная к расчёту: `emptyPosition()` приходит без габаритов. */
  const p = (over: Partial<PositionState> = {}): PositionState => ({
    ...emptyPosition(), name: 'EPAL 1', length: 1200, width: 800, height: 144, quantity: 10, ...over,
  });

  it('собирает груз и адрес каждой позиции одним проходом', () => {
    const orders = [
      { ...emptyOrder(1), key: 'o1', orderId: 'SO-1', positions: [p({ id: 'p1' })] },
      { ...emptyOrder(2), key: 'o2', orderId: 'SO-2', positions: [p({ id: 'p2', quantity: 3 })] },
    ];
    const { cargo, addressOf } = toCargoList(orders);
    expect(cargo.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(cargo.map((c) => c.orderId)).toEqual(['SO-1', 'SO-2']);
    expect(addressOf.get('p2')).toEqual({ orderKey: 'o2', positionId: 'p2' });
  });

  // Обнуление количества — способ временно исключить строку из заявки (спека §6). Пока строка
  // попадала в груз, движок всё равно проверял её габариты, и обнулённый слишком крупный груз
  // МОЛЧА рвал расчёт: ERR_CARGO_EXCEEDS_VEHICLE → пустая раскладка без объяснения.
  it('исключает позиции с нулевым количеством — вместе с их адресом', () => {
    const orders = [{
      ...emptyOrder(1), key: 'o1', orderId: 'SO-1',
      positions: [p({ id: 'p1', quantity: 0 }), p({ id: 'p2' })],
    }];
    const { cargo, addressOf } = toCargoList(orders);
    expect(cargo.map((c) => c.id)).toEqual(['p2']);
    expect(addressOf.has('p1')).toBe(false);
  });

  it('все количества нулевые → груза нет (движок ответит ERR_EMPTY_LOAD)', () => {
    const orders = [{ ...emptyOrder(1), key: 'o1', orderId: 'SO-1', positions: [p({ quantity: 0 })] }];
    expect(toCargoList(orders).cargo).toEqual([]);
  });
});
```

Импорты в шапке файла дополнить: `toCargoList`, `type PositionState`.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run apps/web/src/screens/setup/setupState.test.ts`
Expected: FAIL — `toCargoList is not a function` / ошибка импорта.

- [ ] **Step 3: Реализовать `toCargoList` и перенести тип адреса**

В `apps/web/src/screens/setup/setupState.ts` рядом с `toCargo`:

```ts
/** Адрес строки заявки: ключ заказа + id позиции — ровно то, чем экран выбирает строку
 *  (`Selection`). Живёт здесь, а не в setupValidation: адрес рождается вместе с грузом. */
export interface SetupMessageWhere {
  orderKey: string;
  positionId: string;
}

/** Груз заявки и адрес каждой его позиции, собранные одним проходом (p3p.16).
 *  ЕДИНСТВЕННАЯ сборка груза в приложении: её зовут «Рассчитать», Demo и живая валидация — разойтись
 *  им негде, а расхождение сборок и было корнем молчаливого пустого плана.
 *  Позиции с нулевым количеством в груз не попадают: обнуление временно исключает строку из заявки
 *  (спека §6), и её габариты не должны блокировать расчёт. */
export function toCargoList(orders: OrderState[]): {
  cargo: CargoType[];
  addressOf: Map<string, SetupMessageWhere>;
} {
  const cargo: CargoType[] = [];
  const addressOf = new Map<string, SetupMessageWhere>();
  for (const o of orders) {
    for (const p of o.positions) {
      if (numOr0(p.quantity) === 0) continue;
      cargo.push(toCargo(p, o.orderId));
      addressOf.set(p.id, { orderKey: o.key, positionId: p.id });
    }
  }
  return { cargo, addressOf };
}
```

В `apps/web/src/screens/setup/setupValidation.ts` удалить собственное объявление `SetupMessageWhere` (строки с `export interface SetupMessageWhere { … }`) и вместо него реэкспортировать перенесённый тип — импортёры (`SetupScreen.tsx`, `LoadSummary.tsx`) остаются нетронутыми:

```ts
import { activeStep, dimsComplete, numOr0, type OrderState, type SetupMessageWhere } from './setupState';
export type { SetupMessageWhere };
```

В `packages/engine/src/index.ts` рядом с `export { validateLoad } …` добавить (коды уже описаны в `docs/api-contract.md` §3 — контракт не меняется, меняется только доступность типа):

```ts
export { VALIDATION_ERROR_CODES } from './validation/codes';
export type { ValidationErrorCode } from './validation/codes';
```

- [ ] **Step 4: Прогнать тест и типы**

Run: `npm run build --workspace @shadrin-v/engine && npx vitest run apps/web/src/screens/setup/setupState.test.ts && npm run typecheck`
Expected: PASS, 0 ошибок типов.

- [ ] **Step 5: Перевести оба существующих места сборки на `toCargoList`**

В `apps/web/src/screens/SetupScreen.tsx`:
- в `handleCalculate` строку `const cargo = orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId)));` заменить на `const { cargo } = toCargoList(orders);`
- в `handleDemo` вызов `onCalculate({ vehicle: d.vehicle, cargo: d.orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId))), … })` — на `cargo: toCargoList(d.orders).cargo`
- импорт из `./setup/setupState` дополнить `toCargoList` (сам `toCargo` остаётся: он реэкспортируется этим модулем наружу).

В `apps/web/src/data/demo.test.ts` обе локальные сборки (`demoLoad` и `loadOf`) перевести на тот же вызов, чтобы тест не проверял свою копию формулы:

```ts
import { toCargoList } from '../screens/setup/setupState';
// …
cargo: toCargoList(d.orders).cargo,
```

- [ ] **Step 6: Починить тест, который держался на нулевой строке**

`apps/web/src/screens/SetupScreen.test.tsx`, тест «предупреждение расчёт не блокирует»: единственная позиция с количеством 0 теперь даёт пустой груз, то есть расчёт блокируется по `ERR_EMPTY_LOAD`. Тесту нужна вторая, работающая позиция — иначе он проверяет не то, что называет:

```ts
  it('предупреждение расчёт не блокирует', async () => {
    const onCalculate = vi.fn();
    // Количество 0 — законный способ временно исключить позицию, а не ошибка (§6). Рядом стоит
    // непустая позиция: сама по себе нулевая строка дала бы пустой груз, а это уже ошибка
    // ERR_EMPTY_LOAD, и тест проверял бы блокировку вместо её отсутствия.
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 0 }), position({ id: 'p2' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(onCalculate).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 7: Прогнать полные гейты и закоммитить**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное (число тестов выросло на 3).

```bash
git add packages/engine/src/index.ts apps/web/src/screens/setup/setupState.ts apps/web/src/screens/setup/setupState.test.ts apps/web/src/screens/setup/setupValidation.ts apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx apps/web/src/data/demo.test.ts
git commit -m "refactor(setup): single cargo assembly via toCargoList, excluding zero-quantity rows"
```

---

### Task 2: Сообщения движка и правило слияния

Чистый модуль: коды движка превращаются в сообщения панели и сливаются с локальными. Экран пока не трогаем — задача проверяется одними юнит-тестами.

**Files:**
- Modify: `apps/web/src/screens/setup/setupValidation.ts`
- Test: `apps/web/src/screens/setup/setupValidation.test.ts`

**Interfaces:**
- Consumes: `toCargoList` из Task 1.
- Produces: `engineMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[]`, `allMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[]`; тип `SetupMessageCode` расширяется до `LocalMessageCode | ValidationErrorCode`.

- [ ] **Step 1: Написать падающие тесты слияния**

В `apps/web/src/screens/setup/setupValidation.test.ts` (фикстуры `vehicle`, `pos`, `order` уже есть в файле):

```ts
describe('allMessages — коды движка рядом с локальными проверками', () => {
  const train: Vehicle = {
    id: 't', name: 't', length: 16600, width: 2450, height: 3050,
    compartments: [{ id: 'tractor', x: 0, length: 7700 }, { id: 'trailer', x: 8900, length: 7700 }],
  };

  it('груз длиннее любого отсека → адресуемая ошибка движка', () => {
    const ms = allMessages([order([pos({ length: 8000, rotation: 'none' })])], train);
    expect(ms).toContainEqual(expect.objectContaining({
      code: 'ERR_CARGO_EXCEEDS_VEHICLE', level: 'error',
      where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1',
    }));
  });

  // ADR 013: движок смотрит ВСЕ разрешённые ориентации, локальная проверка — только исходную
  // высоту. Груз с вращением «все 6» ляжет набок, поэтому ошибки нет, а предупреждение есть.
  it('высокий груз с вращением all6 → только предупреждение, ошибки движка нет', () => {
    const ms = allMessages([order([pos({ height: 2600, rotation: 'all6' })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('setup.msg.tooTall');
    expect(ms.map((m) => m.code)).not.toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('высокий груз с запретом вращения → ошибка движка, tooTall спрятан как более слабый', () => {
    const ms = allMessages([order([pos({ height: 2600, rotation: 'none' })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
    expect(ms.map((m) => m.code)).not.toContain('setup.msg.tooTall');
  });

  it('незаполненные размеры → одно «укажите размеры», а не три ERR_INVALID_DIMENSION', () => {
    const ms = allMessages([order([pos({ length: '', width: '', height: '' })])], vehicle);
    expect(ms.filter((m) => m.code === 'setup.msg.dimsMissing')).toHaveLength(1);
    expect(ms.map((m) => m.code)).not.toContain('ERR_INVALID_DIMENSION');
  });

  it('неверный шаг вложения → локальный stepInvalid, ERR_INVALID_NESTING подавлен', () => {
    const ms = allMessages([order([pos({ state: 'verschachtelt' })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('setup.msg.stepInvalid');
    expect(ms.map((m) => m.code)).not.toContain('ERR_INVALID_NESTING');
  });

  it('длина отсека 0 → безадресный ERR_INVALID_COMPARTMENTS', () => {
    const broken: Vehicle = { ...train, compartments: [{ id: 'tractor', x: 0, length: 0 }, { id: 'trailer', x: 8900, length: 7700 }] };
    const m = allMessages([order([pos()])], broken).find((x) => x.code === 'ERR_INVALID_COMPARTMENTS');
    expect(m).toMatchObject({ level: 'error' });
    expect(m?.where).toBeUndefined();
  });

  // Предупреждение о дубле относится к ЗАКАЗУ, а адресовано первой его строке: широкое правило
  // «ошибка движка съедает warnings строки» проглотило бы его молча.
  it('дубль Auftrags-ID переживает ошибку движка на той же строке', () => {
    const ms = allMessages(
      [
        order([pos({ id: 'p1' })], 'SO-1'),
        order([pos({ id: 'p2', length: 8000, rotation: 'none' })], 'SO-1'),
      ],
      train,
    );
    expect(ms.map((m) => m.code)).toContain('setup.msg.duplicateOrderId');
    expect(ms.map((m) => m.code)).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('нулевая позиция с габаритами больше кузова расчёт не блокирует', () => {
    const ms = allMessages([order([pos({ id: 'p1', length: 8000, rotation: 'none', quantity: 0 }), pos({ id: 'p2' })])], train);
    expect(ms.filter((m) => m.level === 'error')).toEqual([]);
  });

  // Обнуление исключает строку из груза, но не отменяет незаконченную работу (решение 6 спеки).
  it('нулевая позиция с незаполненными размерами всё равно блокирует', () => {
    const ms = allMessages([order([pos({ id: 'p1', quantity: 0, length: '' }), pos({ id: 'p2' })])], vehicle);
    expect(ms.some((m) => m.code === 'setup.msg.dimsMissing' && m.level === 'error')).toBe(true);
  });

  it('все позиции нулевые → ERR_EMPTY_LOAD', () => {
    const ms = allMessages([order([pos({ quantity: 0 })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('ERR_EMPTY_LOAD');
  });

  it('порядок детерминирован: локальные ошибки, ошибки движка, потом предупреждения', () => {
    const ms = allMessages(
      [order([pos({ id: 'p1', length: '' }), pos({ id: 'p2', length: 8000, rotation: 'none' }), pos({ id: 'p3', quantity: 0 })])],
      train,
    );
    expect(ms.map((m) => m.level)).toEqual([...ms.map((m) => m.level)].sort((a, b) => (a === b ? 0 : a === 'error' ? -1 : 1)));
    expect(ms[0].code).toBe('setup.msg.dimsMissing');
  });
});

// Гейт: код движка без перевода превратился бы в пустое место на экране (движок отдаёт коды,
// текст — на стороне UI, ADR 006).
describe('коды движка переводимы', () => {
  it('каждый VALIDATION_ERROR_CODES есть в TRANSLATION_KEYS', () => {
    for (const code of VALIDATION_ERROR_CODES) expect(TRANSLATION_KEYS).toContain(code);
  });
});
```

Шапку файла дополнить импортами:

```ts
import { VALIDATION_ERROR_CODES } from '@shadrin-v/engine';
import { TRANSLATION_KEYS } from '@shadrin-v/i18n';
import { setupSummary, setupMessages, allMessages, firstError } from './setupValidation';
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run apps/web/src/screens/setup/setupValidation.test.ts`
Expected: FAIL — `allMessages is not a function`.

- [ ] **Step 3: Реализовать `engineMessages` и `allMessages`**

В `apps/web/src/screens/setup/setupValidation.ts`. Шапку модуля дополнить:

```ts
import { compartmentsOf, validateLoad, type ValidationErrorCode, type Vehicle } from '@shadrin-v/engine';
import { activeStep, dimsComplete, numOr0, toCargoList, type OrderState, type SetupMessageWhere } from './setupState';
```

Тип кода — объединение локальных и движковых (оба являются ключами локалей, поэтому `tt(m.code)` в `LoadSummary` продолжает компилироваться):

```ts
/** Коды локальных проверок = ключи локалей: строку выбирает компонент, модуль их не знает. */
export type LocalMessageCode =
  | 'setup.msg.stepInvalid'
  | 'setup.msg.dimsMissing'
  | 'setup.msg.tooTall'
  | 'setup.msg.volumeOver'
  | 'setup.msg.zeroQuantity'
  | 'setup.msg.duplicateOrderId';

/** Сообщение панели — либо локальная проверка, либо код движка: для экрана это одно множество. */
export type SetupMessageCode = LocalMessageCode | ValidationErrorCode;
```

Ниже `setupMessages` добавить:

```ts
/** Коды `validateLoad` как сообщения панели (p3p.16). Все они — ошибки: движок отвергает ввод
 *  целиком, полутонов у него нет. Ошибка про груз адресуется строке через карту `toCargoList`;
 *  ошибки кузова и отсеков адреса не имеют — как `volumeOver`, им некуда вести.
 *
 *  Адрес честен ровно настолько, насколько уникальны `p.id`: `loadSetup` уникальность не проверяет,
 *  и испорченный черновик с двумя одинаковыми id подсветит одну строку из двух. Чинится это не
 *  здесь, а в LKWkalk-p3p.15 (ERR_DUPLICATE_CARGO_ID в самом движке). */
export function engineMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[] {
  const { cargo, addressOf } = toCargoList(orders);
  const byId = new Map(cargo.map((c) => [c.id, c] as const));
  return validateLoad({ vehicle, cargo }).map((e) => {
    const id = typeof e.details?.cargoTypeId === 'string' ? e.details.cargoTypeId : undefined;
    const where = id ? addressOf.get(id) : undefined;
    const c = id ? byId.get(id) : undefined;
    return {
      code: e.code as ValidationErrorCode,
      level: 'error' as const,
      ...(where ? { where } : {}),
      ...(c ? { orderId: c.orderId, name: c.name } : {}),
    };
  });
}

/** Всё, что экран показывает и считает: локальные проверки плюс коды движка.
 *
 *  Подавление узкое и намеренно несимметричное:
 *  — локальная ОШИБКА по строке глушит коды движка по ней же: недозаполненная строка должна дать
 *    одно человеческое «укажите размеры», а не три ERR_INVALID_DIMENSION;
 *  — обратно — ровно одна пара: ERR_CARGO_EXCEEDS_VEHICLE прячет tooTall, потому что «не влезает ни
 *    в одной ориентации» строго сильнее «выше кузова». Широкое правило «ошибка движка съедает
 *    warnings строки» отвергнуто: duplicateOrderId относится к заказу, а адресован первой строке,
 *    и любая ошибка движка на ней проглотила бы его молча.
 *
 *  Порядок фиксирован (ошибки, потом предупреждения) — от него зависит, к какой строке прыгает
 *  «Рассчитать»: плавающий порядок означал бы разный прыжок на одном и том же вводе. */
export function allMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[] {
  const local = setupMessages(orders, vehicle);
  const engine = engineMessages(orders, vehicle);

  const rowsWithLocalError = new Set(
    local.filter((m) => m.level === 'error' && m.where).map((m) => m.where!.positionId),
  );
  const engineShown = engine.filter((m) => !(m.where && rowsWithLocalError.has(m.where.positionId)));

  const rowsThatDoNotFit = new Set(
    engineShown.filter((m) => m.code === 'ERR_CARGO_EXCEEDS_VEHICLE' && m.where).map((m) => m.where!.positionId),
  );
  const localShown = local.filter(
    (m) => !(m.code === 'setup.msg.tooTall' && m.where && rowsThatDoNotFit.has(m.where.positionId)),
  );

  return [
    ...localShown.filter((m) => m.level === 'error'),
    ...engineShown,
    ...localShown.filter((m) => m.level === 'warning'),
  ];
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run apps/web/src/screens/setup/setupValidation.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/setup/setupValidation.ts apps/web/src/screens/setup/setupValidation.test.ts
git commit -m "feat(setup): surface engine validation codes as panel messages with narrow suppression"
```

---

### Task 3: Предохранитель в `App` и признак принятия

Инвариант «раскладка с ошибками не становится показанным планом» — на границе системы, потому что Demo и восстановление из localStorage идут мимо экрана.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces: `App.onCalculate` возвращает `boolean` (принят результат или нет); `loadPersistedResult` отвергает сохранённый `Load`, дающий ошибки.

- [ ] **Step 1: Написать падающие тесты**

В `apps/web/src/App.test.tsx` (хелперы `fillDims`, `berechnenHeader`, `calculate`, `editStackManually`, `persistedLoad` уже есть в файле):

```ts
describe('предохранитель: раскладка с ошибками не становится планом', () => {
  /** Кузов сломан так, как это делает шапка «Настройки»: длина отсека 0 → ERR_INVALID_COMPARTMENTS.
   *  Здесь короче — прямо в сохранённом плане, потому что проверяется граница App, а не экран. */
  const brokenLoad = {
    vehicle: { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 },
    cargo: [],
    loadingMode: 'combined',
    orderGrouping: 'strict',
  };

  it('сохранённый Load с ошибками не восстанавливается: план пуст, ключи плана вычищены', () => {
    localStorage.setItem('ladungsplaner.load', JSON.stringify(brokenLoad));
    localStorage.setItem('ladungsplaner.orderColors', JSON.stringify({ 'SO-1': 0 }));
    localStorage.setItem('ladungsplaner.strategy', JSON.stringify({ loadingMode: 'rear' }));
    render(<App />);
    expect(screen.getByTestId('empty-plan')).toBeInTheDocument();
    expect(localStorage.getItem('ladungsplaner.load')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.orderColors')).toBeNull();
    // Негодный ПЛАН выброшен, но не работа пользователя: черновик «Настройки» и выбранная стратегия
    // к плану не относятся и обязаны пережить его отказ.
    expect(localStorage.getItem('ladungsplaner.strategy')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Von hinten', pressed: true })).toBeInTheDocument();
  });

  // Тест «результата нет» с чистого листа прошёл бы и при неверной очистке: начинаем с готового
  // плана и ручной правки, потому что отказ обязан быть атомарным — он ничего не разрушает.
  it('отказ не разрушает уже показанный план и ручные правки', async () => {
    render(<App />);
    await calculate();
    await editStackManually();
    const before = screen.getByRole('group', { name: 'Draufsicht' }).innerHTML;

    // Ломаем заявку: обнуляем длину кузова в шапке — движок ответит ERR_INVALID_DIMENSION.
    fireEvent.change(screen.getAllByLabelText('Länge')[0], { target: { value: '0' } });
    await userEvent.click(berechnenHeader());

    expect(screen.getByRole('group', { name: 'Draufsicht' }).innerHTML).toBe(before);
    expect(screen.queryByTestId('empty-plan')).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run apps/web/src/App.test.tsx`
Expected: FAIL — сохранённый план восстанавливается (виден `Draufsicht` вместо `empty-plan`), ключи на месте.

- [ ] **Step 3: Поставить предохранитель**

В `apps/web/src/App.tsx`, в `loadPersistedResult` после вычисления раскладки:

```ts
    const layout = calculateLayout(load);
    // Инвариант границы (p3p.16): раскладка с ошибками — не план, а отчёт о непригодном вводе.
    // Без этой строки перезагрузка возвращала молчаливый пустой лист: геометрических нарушений у
    // пустой раскладки нет, и прежняя проверка её пропускала.
    if (layout.errors?.length) return null;
    if (findGeometryViolations(load, layout).length > 0) return null;
```

И в `onCalculate` — тот же инвариант плюс признак принятия:

```ts
  /** Возвращает, принят ли результат. «Настройка» объявляет расчёт выполненным только по `true`:
   *  раньше объявление шло безусловно и врало уже при геометрическом отказе. */
  const onCalculate = (load: Load, opts?: { persist?: boolean; orderColors?: Record<string, number> }): boolean => {
    const layout = calculateLayout(load);
    // Невалидный ввод: показывать нечего, но и разрушать нечего — прежний план остаётся на экране.
    if (layout.errors?.length) return false;
    // Domain invariant: never surface a layout with geometry violations.
    if (findGeometryViolations(load, layout).length > 0) return false;
    setResult({ load, layout, transient: opts?.persist === false, orderColors: opts?.orderColors ?? result?.orderColors });
    setLoadingMode(load.loadingMode ?? 'combined');
    setOrderGrouping(load.orderGrouping ?? 'strict');
    return true;
  };
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run apps/web/src/App.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "fix(app): never surface a layout with validation errors, report acceptance"
```

---

### Task 4: Экран показывает коды движка и отказывается считать

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx`
- Modify: `apps/web/src/screens/setup/LoadSummary.tsx`
- Modify: `apps/web/src/screens/setup/RulesPanel.tsx`
- Test: `apps/web/src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: `allMessages`, `toCargoList`, `App.onCalculate: (load, opts?) => boolean`.
- Produces: `SetupScreenProps.onCalculate: (load: Load, opts?: { persist?: boolean; orderColors?: Record<string, number> }) => boolean`; `LoadSummary` принимает `summaryRef?: Ref<HTMLElement>`; `RulesPanel` его пробрасывает.

- [ ] **Step 1: Написать падающие тесты**

В `apps/web/src/screens/SetupScreen.test.tsx`. Сначала адаптировать хелпер `renderSetup`, чтобы существующие `vi.fn()` продолжали работать после смены сигнатуры пропа (иначе десятки тестов упадут на типах, а не на поведении):

```ts
function renderSetup(
  onCalculate: (l: Load, o?: { persist?: boolean; orderColors?: Record<string, number> }) => unknown,
  onReset?: () => void,
  opts: Partial<SetupScreenProps> = {},
) {
  return render(
    <LocaleProvider initial="de">
      <SetupScreen
        // Приём результата — дело App; тестам интересен факт вызова, поэтому по умолчанию «принят».
        // Тест отказа передаёт свой обработчик через opts.onCalculate.
        onCalculate={(l, o) => { onCalculate(l, o); return true; }}
        onReset={onReset}
        loadingMode="combined"
        orderGrouping="strict"
        onLoadingModeChange={() => {}}
        onOrderGroupingChange={() => {}}
        {...opts}
      />
    </LocaleProvider>,
  );
}
```

Прямой рендер `<SetupScreen … onCalculate={() => {}} …>` (около строки 104) заменить на `onCalculate={() => true}`.

Новые тесты:

```ts
describe('коды валидации движка на экране (p3p.16)', () => {
  /** Кузов-автопоезд: отсеки короче, чем полный пролёт, поэтому длинный груз не влезает никуда. */
  const train = { id: 't', name: 'Zug', length: 16600, width: 2450, height: 3050,
    compartments: [{ id: 'tractor', x: 0, length: 7700 }, { id: 'trailer', x: 8900, length: 7700 }] };

  /** Узкий экран — своя копия: в этом файле `narrow` объявлен внутри чужих describe-блоков. */
  const narrow = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));

  it('адресуемая ошибка движка не даёт считать и ведёт к строке', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialVehicle: train,
      initialOrders: [order('SO-1001', [position({ id: 'p1', length: 8000, rotation: 'none' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(onCalculate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Artikel')).toHaveValue('EPAL 1');
  });

  it('текст кода движка виден в панели', () => {
    renderSetup(vi.fn(), undefined, {
      initialVehicle: train,
      initialOrders: [order('SO-1001', [position({ id: 'p1', length: 8000, rotation: 'none' })])],
    });
    expect(screen.getByText(/passt in keiner zulässigen Ausrichtung/)).toBeInTheDocument();
  });

  it('шапка считает ошибки движка наравне со своими', () => {
    renderSetup(vi.fn(), undefined, {
      initialVehicle: { ...train, compartments: [{ id: 'tractor', x: 0, length: 0 }, { id: 'trailer', x: 8900, length: 7700 }] },
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    expect(screen.getByText(/Berechnung nicht möglich: 1 Fehler/)).toBeInTheDocument();
  });

  it('безадресная ошибка движка не даёт считать и уводит фокус в панель причин', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialVehicle: { ...train, compartments: [{ id: 'tractor', x: 0, length: 0 }, { id: 'trailer', x: 8900, length: 7700 }] },
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(onCalculate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('load-summary')).toHaveFocus());
  });

  it('на узком экране фокус уходит в ту же панель, которая там смонтирована', async () => {
    narrow();
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialVehicle: { ...train, compartments: [{ id: 'tractor', x: 0, length: 0 }, { id: 'trailer', x: 8900, length: 7700 }] },
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(onCalculate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('load-summary')).toHaveFocus());
  });

  it('ручные правки не переспрашиваются, когда расчёт всё равно запрещён', async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      hasManualEdits: true,
      initialVehicle: train,
      initialOrders: [order('SO-1001', [position({ id: 'p1', length: 8000, rotation: 'none' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it('нулевая строка не попадает в принятый Load', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 0 }), position({ id: 'p2' })])],
    });
    await userEvent.click(berechnenHeader());
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo.map((c) => c.id)).toEqual(['p2']);
  });

  it('отказ принявшего не объявляет расчёт выполненным', async () => {
    // App отвергает раскладку с ошибками (Task 3). Экран обязан промолчать: объявление шло
    // безусловно и врало уже при геометрическом отказе.
    renderSetup(vi.fn(), undefined, {
      onCalculate: () => false,
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(screen.queryByText(/Berechnet:/)).toBeNull();
  });

  it('объявление называет числа посчитанного, а не черновика', async () => {
    renderSetup(vi.fn(), undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 4 }), position({ id: 'p2', quantity: 0 })])],
    });
    await userEvent.click(berechnenHeader());
    await waitFor(() => expect(screen.getByText(/Berechnet: 1 Aufträge, 1 Positionen, 4 Einheiten/)).toBeInTheDocument());
  });
});
```

`narrow()` — уже существующий в файле хелпер узкого экрана (подмена `matchMedia`); если его имя другое, используй тот, которым пользуются тесты «на узком экране» рядом.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`
Expected: FAIL — расчёт запускается при ошибке движка, `load-summary` не найден.

- [ ] **Step 3: Дать панели фокусируемую точку**

В `apps/web/src/screens/setup/LoadSummary.tsx` принять ref и повесить его на `<aside>`:

```tsx
export function LoadSummary({
  summary,
  messages,
  onGoTo,
  summaryRef,
}: {
  summary: SetupSummary;
  messages: SetupMessage[];
  onGoTo: (where: SetupMessageWhere) => void;
  /** Куда уводить фокус, когда «Рассчитать» отказал по причине без адреса строки (p3p.16):
   *  причины перечислены здесь, и нажатие не должно выглядеть как «ничего не произошло». */
  summaryRef?: Ref<HTMLElement>;
}) {
```

и на самом элементе:

```tsx
    <aside
      ref={summaryRef}
      tabIndex={-1}
      data-testid="load-summary"
      className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-card"
    >
```

Импорт типа: `import type { Ref } from 'react';`

В `apps/web/src/screens/setup/RulesPanel.tsx` добавить проп и пробросить его в единственный рендер `LoadSummary` (пустое состояние панели):

```tsx
      return <LoadSummary summary={summary} messages={messages} onGoTo={onGoTo} summaryRef={summaryRef} />;
```

добавив `summaryRef?: Ref<HTMLElement>` в `RulesPanelProps` и в деструктуризацию параметров.

- [ ] **Step 4: Свести сообщения и закрыть расчёт гейтом**

В `apps/web/src/screens/SetupScreen.tsx`:

импорт валидации — `allMessages` вместо `setupMessages`:

```ts
import { allMessages, firstError, setupSummary, type SetupMessageWhere } from './setup/setupValidation';
```

тип пропа:

```ts
  /** Возвращает, принят ли результат: раскладку с ошибками валидации или геометрии App отвергает
   *  (p3p.16). Объявлять расчёт выполненным можно только по `true`. */
  onCalculate: (load: Load, opts?: { persist?: boolean; orderColors?: Record<string, number> }) => boolean;
```

сообщения:

```ts
  const messages = allMessages(orders, vehicle);
```

ref панели — рядом с прочими ref'ами компонента:

```ts
  const summaryRef = useRef<HTMLElement>(null);
```

и новый обработчик рядом с `goTo`:

```ts
  /** Показать причины отказа, когда вести некуда: ошибки кузова, отсеков и пустой заявки строкой не
   *  адресуются. Выбор снимается, чтобы панель разбора вернулась к сводке со списком причин — в
   *  широком режиме иначе на её месте были бы правила выбранной строки. */
  const showReasons = () => {
    setSelection(null);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };
```

`handleCalculate` целиком:

```ts
  const handleCalculate = () => {
    // Кнопка не гаснет (§6): погашенная не фокусируется и не объявляется скринридером, то есть
    // молча прячет и причину, и адрес ошибки. Нажатие при ошибках не считает, а ведёт к первой
    // ошибочной строке; предупреждения (количество 0, объём, высота) расчёт не блокируют.
    const first = firstError(messages);
    if (first?.where) {
      goTo(first.where);
      return;
    }
    // Ошибки движка про кузов, отсеки и пустую заявку адреса не имеют: вести некуда, но и молчать
    // нельзя — иначе нажатие снова выглядит как «ничего не произошло» (p3p.16).
    if (messages.some((m) => m.level === 'error')) {
      showReasons();
      return;
    }
    // Пересчёт строит раскладку с нуля и выбрасывает ручные правки стопок. Спрашиваем только когда
    // терять действительно есть что — и только после гейта: переспрашивать о потере правок, когда
    // расчёт всё равно запрещён, бессмысленно.
    if (hasManualEdits && typeof window !== 'undefined' && !window.confirm(tt('ladeplan.discardEditsConfirm')))
      return;
    const { cargo } = toCargoList(orders);
    const accepted = onCalculate(
      { vehicle, cargo, loadingMode, orderGrouping },
      { orderColors: buildOrderColors(orders) },
    );
    // App отверг ввод (ошибки валидации или геометрии) — объявлять нечего.
    if (!accepted) return;
    // Объявляем числа ПРИНЯТОГО груза, а не сводки черновика: сводка описывает, сколько строк
    // заведено, а посчитано может быть меньше — нулевые строки в заявку не входят.
    setLastResult((prev) => ({
      text: fillTemplate(tt('setup.calcDone'), {
        orders: new Set(cargo.map((c) => c.orderId)).size,
        positions: cargo.length,
        units: cargo.reduce((a, c) => a + c.quantity, 0),
      }),
      seq: (prev?.seq ?? 0) + 1,
    }));
  };
```

и прокинуть ref в оба места, где живёт сводка:

```tsx
            <RulesPanel
              …
              summary={summary}
              messages={messages}
              onGoTo={goTo}
              summaryRef={summaryRef}
            />
```

```tsx
        {!wide && (
          <LoadSummary summary={summary} messages={messages} onGoTo={goTo} summaryRef={summaryRef} />
        )}
```

- [ ] **Step 5: Прогнать тесты и гейты**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное. Если падают старые тесты «сводка/предупреждения» — сверься со спекой (раздел «Что задевается из существующего») прежде чем править ожидания: возможно, изменение поведения законно, а возможно — регрессия.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx apps/web/src/screens/setup/LoadSummary.tsx apps/web/src/screens/setup/RulesPanel.tsx
git commit -m "feat(setup): refuse to calculate on engine errors and show their reasons"
```

---

### Task 5: Сторож Demo и правка двух формулировок

**Files:**
- Modify: `packages/i18n/src/dictionaries/de.ts`
- Modify: `packages/i18n/src/dictionaries/ru.ts`
- Test: `apps/web/src/data/demo.test.ts`

**Interfaces:**
- Consumes: `toCargoList` (Task 1), `validateLoad` из `@shadrin-v/engine`.

- [ ] **Step 1: Написать падающий тест-сторож Demo**

Demo меняет форму ДО вызова `onCalculate`: невалидный вариант оставил бы форму и план в разных состояниях. Сегодня это недостижимо — тест удерживает, что так и останется. В `apps/web/src/data/demo.test.ts`:

```ts
  it('каждый демо-вариант валиден: иначе Demo оставит форму и план в разных состояниях', () => {
    for (const v of DEMO_VARIANTS) {
      // Ключ варианта в ожидании, а не рядом в комментарии: падение обязано называть виновника.
      expect({ variant: v.key, errors: validateLoad(loadOf(v)) }).toEqual({ variant: v.key, errors: [] });
    }
  });
```

Импорт в шапке дополнить: `validateLoad`.

- [ ] **Step 2: Прогнать — тест должен пройти сразу**

Run: `npx vitest run apps/web/src/data/demo.test.ts`
Expected: PASS. Это сторож, а не находка. Докажи, что он способен падать: временно сломай один вариант (например, длину кузова на 0), убедись в FAIL с именем варианта, верни как было.

- [ ] **Step 3: Поправить две формулировки, расходящиеся с движком**

Движок требует `stepHeight > 0` (`validate.ts`), а `x = 0` у первого отсека законен — тексты обещают другое.

`packages/i18n/src/dictionaries/de.ts`:

```ts
  ERR_INVALID_NESTING:
    'Ungültige Verschachtelung: Die Schritthöhe muss größer als 0 und höchstens so groß wie die Höhe der Ladung sein.',
  ERR_INVALID_COMPARTMENTS:
    'Die Laderaumabschnitte sind ungültig: Längen müssen positive ganze Zahlen sein, Positionen ganze Zahlen ab 0, aufsteigend und ohne Überschneidung (eine Kupplungslücke dazwischen ist erlaubt), und der letzte Abschnitt muss genau am Fahrzeugende enden.',
```

`packages/i18n/src/dictionaries/ru.ts` — те же две строки привести в соответствие по смыслу (шаг: больше 0 и не больше высоты груза; координаты отсеков: целые от 0, длины — положительные целые).

- [ ] **Step 4: Прогнать полные гейты**

Run: `npm run build --workspace @shadrin-v/i18n && npm test && npm run typecheck && npm run lint`
Expected: всё зелёное.

- [ ] **Step 5: Коммит**

```bash
git add packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts apps/web/src/data/demo.test.ts
git commit -m "fix(i18n): align nesting/compartment error wording with the engine rules"
```

---

## Проверка перед PR

- [ ] `npm test && npm run typecheck && npm run lint` из корня — зелёные.
- [ ] Ручная проверка в браузере (`npm run dev:web`): обнулить длину отсека у автопоезда → в шапке «Berechnung nicht möglich», в панели — текст `ERR_INVALID_COMPARTMENTS`, «Berechnen» не считает, фокус уходит в панель.
- [ ] Груз 8000 мм в автопоезде → сообщение адресуемо, клик ведёт к строке.
- [ ] `bd close LKWkalk-p3p.16` с комментарием о результате; проверить, не разблокировалось ли закрытие эпика `p3p`.

## Чего этот план НЕ делает

- Не трогает `POST /api/plans` (`LKWkalk-559`) и уникальность `cargo.id` (`LKWkalk-p3p.15`).
- Не подставляет `details` в текст ошибки (какое поле, какой отсек) — потребовало бы параметризованных ключей локалей.
- Не чинит испорченные черновики (заказ без позиций, дубли `p.id`) — только показывает ошибку.
