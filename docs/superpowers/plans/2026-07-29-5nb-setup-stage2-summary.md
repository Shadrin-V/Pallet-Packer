# Экран «Настройка», этап 2: шапка, сводка, сообщения — план реализации

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ САБ-НАВЫК — `superpowers:subagent-driven-development`
> (рекомендуется) либо `superpowers:executing-plans`. Шаги помечены чекбоксами (`- [ ]`).

**Цель:** довести экран «Настройка» до §6 спеки — липкая шапка с кузовом, сводкой и действиями;
сводка загрузки и список ошибок/предупреждений в пустом состоянии панели; кнопка «Рассчитать»
больше не гаснет, а ведёт к первой ошибочной позиции.

**Архитектура:** третий чистый модуль `setupValidation.ts` считает сводку и сообщения из
`OrderState[]` + `Vehicle` — без DOM, таблицами в тестах. Презентация разъезжается на `SetupHeader`
(липкая шапка) и `LoadSummary` (пустое состояние панели); `SetupScreen.tsx` остаётся тонким
координатором: состояние, выбор строки, персистентность, сборка `Load`. Движок и контракт `0.14.0`
не трогаются ни строчкой.

**Стек:** TypeScript, React 18, Vite, Tailwind (только шкала из `docs/design/design-system.md`),
vitest + @testing-library/react, `@shadrin-v/i18n` (ключи, `formatLength`).

**Источник требований:** [спека §6, §9, §11, §12](../specs/2026-07-28-5nb-setup-redesign-design.md).
Задача — `LKWkalk-5nb` (этап 1 закрыт и выложен, PR #42).

**Решения владельца 2026-07-29 (сверх §6, приняты при утверждении плана):**

1. **`HeroHeader` уезжает при прокрутке** — липнет только полоса «Настройки». Баннер остаётся
   обычным элементом потока, `position: sticky` есть только у `SetupHeader`.
2. **В ужатой шапке остаются: кузов, сводка, режим погрузки с галочкой, «Рассчитать».** «Демо» и
   «Сброс» видны только в полной шапке — они нужны в начале работы, а «Сброс» ещё и разрушителен.
3. **Режим погрузки (`loadingMode`) и «Плотность важнее группировки» (`orderGrouping`) переезжают
   в шапку «Настройки»** — сегодня их можно выбрать только на готовом ладеплане, то есть уже после
   расчёта. Одно состояние на оба экрана: владеет им `App`, шапка «Настройки» его меняет **без**
   пересчёта (плана может ещё не быть), а «Рассчитать» считает с ним; переключатели на ладеплане
   сохраняют своё поведение (мгновенный пересчёт) и пишут в то же состояние. Контракт `Load` уже
   несёт оба поля — движка это не касается.

## Глобальные ограничения

- **Ни одной пользовательской строки в коде** — только ключи локалей (`useT()` / `tt(key)`).
  Единицы длины — `formatLength(mm, locale)`, счётчики — шаблон с подстановкой через
  `fillTemplate`, не конкатенация (в русском нужны падежи).
- **Ни одного цвета/размера вне шкалы** `docs/design/design-system.md` (никаких `text-[13px]`,
  `w-[20rem]`, hex-литералов).
- **Перевод компоненты берут сами** через `useT()` / `useLocale()`, а не пропом `tt`.
- **`packages/engine` и контракт `0.14.0` — не трогать.** Новых полей нет, это чистая презентация.
- **Персистентность не меняется:** ключ `ladungsplaner.setup`, форма `PersistedSetup`, миграция
  legacy-поля `stepHeight`. Выбранная строка и состояние шапки не персистятся.
- **Локали правятся парой de+ru**; после правки словарей обязателен
  `npm run build -w @shadrin-v/i18n` — тесты читают словарь из собранного `dist`.
- **Флейк `LKWkalk-bmi`/`LKWkalk-w9j`** (`userEvent` + debounce/fake timers в
  `SetupScreen.test.tsx`) жив; его нельзя путать с регрессией. Точечный прогон —
  `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`.
- **Коммит после каждой задачи**, при зелёных тестах. Ветка — `feat/5nb-setup-stage2`.

## Структура файлов

| Файл | Ответственность | Задача |
|---|---|---|
| `packages/i18n/src/keys.ts` | + ключи §6 | 1 |
| `packages/i18n/src/dictionaries/{de,ru}.ts` | + строки §6 | 1 |
| `apps/web/src/screens/setup/setupValidation.ts` | **создать** — чистая функция «заказы + кузов → сводка и сообщения» | 2 |
| `apps/web/src/screens/setup/setupValidation.test.ts` | **создать** — таблицы на каждый код | 2 |
| `apps/web/src/screens/setup/LoadSummary.tsx` | **создать** — пустое состояние панели: сводка + список сообщений | 3 |
| `apps/web/src/screens/setup/LoadSummary.test.tsx` | **создать** | 3 |
| `apps/web/src/screens/setup/useStickyCompact.ts` | **создать** — хук «шапка ужалась» (IntersectionObserver) | 4 |
| `apps/web/src/screens/setup/useStickyCompact.test.ts` | **создать** | 4 |
| `apps/web/src/screens/setup/SetupHeader.tsx` | **создать** — липкая шапка: кузов, сводка, действия | 4 |
| `apps/web/src/screens/setup/SetupHeader.test.tsx` | **создать** | 4 |
| `apps/web/src/screens/SetupScreen.tsx` | тонкий координатор: убрать секцию кузова и нижнюю панель действий, новое поведение «Рассчитать», клик по сообщению, стратегия из пропов | 5 |
| `apps/web/src/ui/OrderGroupingToggle.tsx` | **создать** — галочка «Плотность важнее группировки», одна на два экрана | 4 |
| `apps/web/src/screens/LadeplanScreen.tsx` | галочка заменяется общим компонентом | 4 |
| `apps/web/src/App.tsx` | единственный владелец `loadingMode`/`orderGrouping` для обоих экранов | 5 |
| `apps/web/src/screens/SetupScreen.test.tsx` | + сценарии §6, миграция существующих | 5 |
| `apps/web/src/screens/setup/RulesPanel.tsx` | пустое состояние делегируется `LoadSummary` | 3 |
| `docs/CHANGELOG.md`, спека §12 | реконсиляция doc↔реальность | 6 |

---

### Задача 1: ключи и строки §6

**Файлы:**
- Изменить: `packages/i18n/src/keys.ts`
- Изменить: `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`
- Тест: `packages/i18n/src/dictionaries/completeness.test.ts` (уже есть, ловит пропуски)

**Интерфейсы:**
- Отдаёт: ключи `setup.msg.*`, `setup.summary.*`, `setup.header.*`, `unit.m3` — они же значения
  типа `SetupMessageCode` в задаче 2.

- [ ] **Шаг 1: добавить ключи в `keys.ts`** (в блок `setup.*`, рядом с `setup.panel.*`)

```ts
  // Этап 2 (§6): сводка загрузки и сообщения.
  'setup.summary.title',
  'setup.summary.orders',
  'setup.summary.positions',
  'setup.summary.units',
  'setup.summary.volume',
  'setup.summary.ofVehicle',
  'setup.msg.errors',
  'setup.msg.warnings',
  'setup.msg.none',
  'setup.msg.stepInvalid',
  'setup.msg.dimsMissing',
  'setup.msg.tooTall',
  'setup.msg.volumeOver',
  'setup.msg.zeroQuantity',
  'setup.msg.goToPosition',
  'setup.header.calcBlocked',
  'unit.m3',
```

- [ ] **Шаг 2: прогнать тест полноты — он должен упасть**

Запуск: `npx vitest run packages/i18n/src/dictionaries/completeness.test.ts`
Ожидание: FAIL — `de missing setup.summary.title` (и далее по списку).

- [ ] **Шаг 3: добавить строки в `de.ts`**

```ts
  'setup.summary.title': 'Ladung',
  'setup.summary.orders': 'Aufträge',
  'setup.summary.positions': 'Positionen',
  'setup.summary.units': 'Einheiten',
  'setup.summary.volume': 'Ladevolumen',
  'setup.summary.ofVehicle': 'von {vehicle}',
  'setup.msg.errors': 'Berechnung nicht möglich',
  'setup.msg.warnings': 'Hinweise',
  'setup.msg.none': 'Alles bereit zur Berechnung.',
  'setup.msg.stepInvalid': 'Verschachtelungsschritt fehlt oder ist ungültig',
  'setup.msg.dimsMissing': 'Maße unvollständig',
  'setup.msg.tooTall': 'Höher als der Laderaum',
  'setup.msg.volumeOver': 'Ladevolumen übersteigt den Laderaum — es bleibt etwas stehen',
  'setup.msg.zeroQuantity': 'Menge 0 — wird nicht gerechnet',
  'setup.msg.goToPosition': 'Zur Position springen',
  'setup.header.calcBlocked': 'Berechnung nicht möglich: {n} Fehler',
  'unit.m3': 'm³',
```

- [ ] **Шаг 4: добавить строки в `ru.ts`**

```ts
  'setup.summary.title': 'Груз',
  'setup.summary.orders': 'Заказы',
  'setup.summary.positions': 'Позиции',
  'setup.summary.units': 'Единицы',
  'setup.summary.volume': 'Объём груза',
  'setup.summary.ofVehicle': 'из {vehicle}',
  'setup.msg.errors': 'Расчёт невозможен',
  'setup.msg.warnings': 'Предупреждения',
  'setup.msg.none': 'Всё готово к расчёту.',
  'setup.msg.stepInvalid': 'Шаг вложения не задан или некорректен',
  'setup.msg.dimsMissing': 'Габариты заполнены не полностью',
  'setup.msg.tooTall': 'Выше кузова',
  'setup.msg.volumeOver': 'Объём груза больше объёма кузова — что-то останется',
  'setup.msg.zeroQuantity': 'Количество 0 — в расчёт не идёт',
  'setup.msg.goToPosition': 'Перейти к позиции',
  'setup.header.calcBlocked': 'Расчёт невозможен: ошибок — {n}',
  'unit.m3': 'м³',
```

- [ ] **Шаг 5: написать падающий тест на `formatVolume`**

Файл `packages/i18n/src/format.test.ts` (дописать в существующий describe):

```ts
  it('formats cubic millimetres as m³ with one decimal', () => {
    expect(formatVolume(18_400_000_000, 'de')).toBe('18,4 m³');
    expect(formatVolume(18_400_000_000, 'ru')).toBe('18,4 м³');
    expect(formatVolume(0, 'de')).toBe('0 m³');
  });
```

- [ ] **Шаг 6: прогнать — FAIL** (`formatVolume is not exported`)

Запуск: `npx vitest run packages/i18n/src/format.test.ts`

- [ ] **Шаг 7: реализовать `formatVolume`** в `packages/i18n/src/format.ts`

```ts
/** Объём из внутренних мм³ (ADR 002) в м³ для показа: один знак после запятой, локальные
 *  разделители, единица из словаря. Целое печатается без дробной части — «0 m³», не «0,0 m³». */
export function formatVolume(mm3: number, locale: Locale): string {
  const m3 = mm3 / 1_000_000_000;
  const number = new Intl.NumberFormat(INTL_LOCALE_TAG[locale], {
    maximumFractionDigits: 1,
  }).format(m3);
  return `${number} ${t('unit.m3', locale)}`;
}
```

и экспортировать из `packages/i18n/src/index.ts`:

```ts
export { formatLength, formatVolume } from './format';
```

- [ ] **Шаг 8: прогнать оба теста — PASS, собрать словарь**

```bash
npx vitest run packages/i18n
npm run build -w @shadrin-v/i18n
```

- [ ] **Шаг 9: коммит**

```bash
git add packages/i18n
git commit -m "feat(i18n): ключи сводки и сообщений экрана «Настройка» + formatVolume (5nb)"
```

---

### Задача 2: `setupValidation.ts` — сводка и сообщения

**Файлы:**
- Создать: `apps/web/src/screens/setup/setupValidation.ts`
- Создать: `apps/web/src/screens/setup/setupValidation.test.ts`

**Интерфейсы:**
- Использует: `OrderState`, `PositionState`, `numOr0`, `dimsComplete`, `activeStep` из
  `./setupState`; `stepInvalid` из `../components/stackFormula`; `Vehicle` из `@shadrin-v/engine`.
- Отдаёт: `SetupMessage`, `SetupMessageCode`, `SetupSummary`, `setupSummary()`, `setupMessages()`,
  `firstError()` — их потребляют задачи 3, 4, 5.

Тексты сообщений **не содержат чисел**: адрес строки («SO-1001 · EPAL 1») и человеческая причина
достаточны, а числа стоят рядом в сводке. Это снимает вопрос форматирования длин в чистом модуле —
`vars` не нужны вовсе.

- [ ] **Шаг 1: написать падающие тесты**

```ts
import { describe, it, expect } from 'vitest';
import type { Vehicle } from '@shadrin-v/engine';
import { setupSummary, setupMessages, firstError } from './setupValidation';
import type { OrderState, PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 };

const pos = (p: Partial<PositionState> = {}): PositionState => ({
  id: 'p1', name: 'EPAL 1', length: 1200, width: 800, height: 144, quantity: 10,
  state: 'entschachtelt', rotation: 'yawOnly', nestStepPairwise: '', nestStepSequential: '',
  nestingMode: 'pairwise', maxNested: '', allowUnpairedTop: false, maxTiers: '', ...p,
});
const order = (positions: PositionState[], orderId = 'SO-1001'): OrderState => ({
  key: 'o1', orderId, colorIndex: 0, positions,
});

describe('setupSummary', () => {
  it('считает заказы, позиции, единицы и объёмы', () => {
    const s = setupSummary([order([pos(), pos({ id: 'p2', quantity: 5 })])], vehicle);
    expect(s).toEqual({
      orders: 1,
      positions: 2,
      units: 15,
      cargoVolume: 1200 * 800 * 144 * 15,
      vehicleVolume: 13600 * 2450 * 2450,
    });
  });

  it('пустое количество и незаполненные габариты считает нулём, а не NaN', () => {
    const s = setupSummary([order([pos({ quantity: '', length: '' })])], vehicle);
    expect(s.units).toBe(0);
    expect(s.cargoVolume).toBe(0);
  });
});

describe('setupMessages', () => {
  it('нет сообщений на здоровой заявке', () => {
    expect(setupMessages([order([pos()])], vehicle)).toEqual([]);
  });

  it('ошибка: verschachtelt без шага', () => {
    const [m] = setupMessages([order([pos({ state: 'verschachtelt' })])], vehicle);
    expect(m).toMatchObject({
      code: 'setup.msg.stepInvalid', level: 'error',
      where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1',
    });
  });

  it('ошибка: незаполненные габариты', () => {
    const [m] = setupMessages([order([pos({ width: '' })])], vehicle);
    expect(m).toMatchObject({ code: 'setup.msg.dimsMissing', level: 'error' });
  });

  it('предупреждение: позиция выше кузова', () => {
    const [m] = setupMessages([order([pos({ height: 2600 })])], vehicle);
    expect(m).toMatchObject({ code: 'setup.msg.tooTall', level: 'warning' });
  });

  it('предупреждение: количество 0 — расчёт не блокируется', () => {
    const ms = setupMessages([order([pos({ quantity: 0 })])], vehicle);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ code: 'setup.msg.zeroQuantity', level: 'warning' });
    expect(firstError(ms)).toBeNull();
  });

  it('предупреждение про объём — про весь план, без адреса строки', () => {
    const ms = setupMessages([order([pos({ quantity: 100000 })])], vehicle);
    const m = ms.find((x) => x.code === 'setup.msg.volumeOver');
    expect(m).toMatchObject({ level: 'warning' });
    expect(m?.where).toBeUndefined();
  });

  it('ошибки идут раньше предупреждений, порядок строк сохраняется', () => {
    const ms = setupMessages(
      [order([pos({ id: 'p1', quantity: 0 }), pos({ id: 'p2', state: 'verschachtelt' })])],
      vehicle,
    );
    expect(ms.map((m) => m.code)).toEqual(['setup.msg.stepInvalid', 'setup.msg.zeroQuantity']);
  });

  it('firstError возвращает первую ошибку с адресом', () => {
    const ms = setupMessages(
      [order([pos({ id: 'p1', width: '' }), pos({ id: 'p2', state: 'verschachtelt' })])],
      vehicle,
    );
    expect(firstError(ms)?.where).toEqual({ orderKey: 'o1', positionId: 'p1' });
  });
});
```

- [ ] **Шаг 2: прогнать — FAIL**

Запуск: `npx vitest run apps/web/src/screens/setup/setupValidation.test.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: реализовать модуль**

```ts
// Сводка загрузки и сообщения экрана «Настройка» (LKWkalk-5nb, спека §6). Чистый модуль: ни DOM,
// ни перевода — коды и адреса строк, текст подставляет компонент (та же граница, что у
// positionRules и stackFormula).
import type { Vehicle } from '@shadrin-v/engine';
import { stepInvalid } from '../components/stackFormula';
import { activeStep, dimsComplete, numOr0, type OrderState } from './setupState';

/** Коды сообщений = ключи локалей: строку выбирает компонент, модуль их не знает. */
export type SetupMessageCode =
  | 'setup.msg.stepInvalid'
  | 'setup.msg.dimsMissing'
  | 'setup.msg.tooTall'
  | 'setup.msg.volumeOver'
  | 'setup.msg.zeroQuantity';

/** Адрес строки: ключ заказа + id позиции — ровно то, чем экран выбирает строку (`Selection`). */
export interface SetupMessageWhere {
  orderKey: string;
  positionId: string;
}

export interface SetupMessage {
  code: SetupMessageCode;
  /** error — расчёт невозможен; warning — расчёт возможен, результат предсказуемо неполный. */
  level: 'error' | 'warning';
  /** Нет у сообщений про весь план (объём): им некуда вести. */
  where?: SetupMessageWhere;
  orderId?: string;
  name?: string;
}

export interface SetupSummary {
  orders: number;
  positions: number;
  units: number;
  /** мм³ (ADR 002); в м³ переводит formatVolume на границе UI. */
  cargoVolume: number;
  vehicleVolume: number;
}

export function setupSummary(orders: OrderState[], vehicle: Vehicle): SetupSummary {
  let positions = 0;
  let units = 0;
  let cargoVolume = 0;
  for (const o of orders) {
    for (const p of o.positions) {
      positions += 1;
      const q = numOr0(p.quantity);
      units += q;
      cargoVolume += numOr0(p.length) * numOr0(p.width) * numOr0(p.height) * q;
    }
  }
  return {
    orders: orders.length,
    positions,
    units,
    cargoVolume,
    vehicleVolume: vehicle.length * vehicle.width * vehicle.height,
  };
}

export function setupMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[] {
  const errors: SetupMessage[] = [];
  const warnings: SetupMessage[] = [];
  for (const o of orders) {
    for (const p of o.positions) {
      const at = { where: { orderKey: o.key, positionId: p.id }, orderId: o.orderId, name: p.name };
      if (!dimsComplete(p)) errors.push({ code: 'setup.msg.dimsMissing', level: 'error', ...at });
      if (stepInvalid(p.state, activeStep(p), p.height))
        errors.push({ code: 'setup.msg.stepInvalid', level: 'error', ...at });
      if (numOr0(p.height) > vehicle.height)
        warnings.push({ code: 'setup.msg.tooTall', level: 'warning', ...at });
      // Обнулить количество — законный способ временно исключить позицию, не удаляя её (§6).
      if (numOr0(p.quantity) === 0)
        warnings.push({ code: 'setup.msg.zeroQuantity', level: 'warning', ...at });
    }
  }
  const s = setupSummary(orders, vehicle);
  if (s.cargoVolume > s.vehicleVolume)
    warnings.push({ code: 'setup.msg.volumeOver', level: 'warning' });
  return [...errors, ...warnings];
}

/** Первая ошибка, к которой есть куда вести. Это и есть адрес, куда прыгает «Рассчитать» (§6). */
export function firstError(messages: SetupMessage[]): SetupMessage | null {
  return messages.find((m) => m.level === 'error' && m.where) ?? null;
}
```

- [ ] **Шаг 4: прогнать — PASS**

Запуск: `npx vitest run apps/web/src/screens/setup/setupValidation.test.ts`

- [ ] **Шаг 5: коммит**

```bash
git add apps/web/src/screens/setup/setupValidation.ts apps/web/src/screens/setup/setupValidation.test.ts
git commit -m "feat(setup): чистый модуль setupValidation — сводка и сообщения (5nb этап 2)"
```

---

### Задача 3: `LoadSummary.tsx` — пустое состояние панели

**Файлы:**
- Создать: `apps/web/src/screens/setup/LoadSummary.tsx`
- Создать: `apps/web/src/screens/setup/LoadSummary.test.tsx`
- Изменить: `apps/web/src/screens/setup/RulesPanel.tsx:46-52` (пустое состояние делегируется)

**Интерфейсы:**
- Использует: `SetupMessage`, `SetupSummary` (задача 2), `formatVolume` (задача 1), `useT`,
  `useLocale`, `fillTemplate`.
- Отдаёт: `<LoadSummary summary messages onGoTo />`, где
  `onGoTo: (where: SetupMessageWhere) => void`.

- [ ] **Шаг 1: написать падающий тест**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { LoadSummary } from './LoadSummary';
import type { SetupMessage, SetupSummary } from './setupValidation';

const summary: SetupSummary = {
  orders: 2, positions: 3, units: 40,
  cargoVolume: 18_400_000_000, vehicleVolume: 81_644_000_000,
};
const renderIt = (messages: SetupMessage[] = [], onGoTo = vi.fn()) => {
  render(
    <LocaleProvider initialLocale="de">
      <LoadSummary summary={summary} messages={messages} onGoTo={onGoTo} />
    </LocaleProvider>,
  );
  return onGoTo;
};

describe('LoadSummary', () => {
  it('показывает счётчики и объём груза против объёма кузова', () => {
    renderIt();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Aufträge')).toBeInTheDocument();
    expect(screen.getByText(/18,4 m³/)).toBeInTheDocument();
    expect(screen.getByText(/81,6 m³/)).toBeInTheDocument();
  });

  it('без сообщений говорит, что всё готово', () => {
    renderIt();
    expect(screen.getByText('Alles bereit zur Berechnung.')).toBeInTheDocument();
  });

  it('ошибка и предупреждение стоят под своими заголовками', () => {
    renderIt([
      { code: 'setup.msg.dimsMissing', level: 'error', where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1' },
      { code: 'setup.msg.zeroQuantity', level: 'warning', where: { orderKey: 'o1', positionId: 'p2' }, orderId: 'SO-1001', name: 'EPAL 2' },
    ]);
    expect(screen.getByText('Berechnung nicht möglich')).toBeInTheDocument();
    expect(screen.getByText('Hinweise')).toBeInTheDocument();
    expect(screen.getByText(/Maße unvollständig/)).toBeInTheDocument();
  });

  it('клик по сообщению ведёт к его строке', async () => {
    const onGoTo = renderIt([
      { code: 'setup.msg.dimsMissing', level: 'error', where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /EPAL 1/ }));
    expect(onGoTo).toHaveBeenCalledWith({ orderKey: 'o1', positionId: 'p1' });
  });

  it('сообщение про весь план не кликабельно — вести некуда', () => {
    renderIt([{ code: 'setup.msg.volumeOver', level: 'warning' }]);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/übersteigt den Laderaum/)).toBeInTheDocument();
  });
});
```

- [ ] **Шаг 2: прогнать — FAIL** (модуль не найден)

Запуск: `npx vitest run apps/web/src/screens/setup/LoadSummary.test.tsx`

- [ ] **Шаг 3: реализовать компонент**

```tsx
// Пустое состояние панели разбора (LKWkalk-5nb, спека §6): пока строка не выбрана, панель занята
// делом — показывает сводку заявки и то, что мешает или испортит расчёт. Каждое сообщение с адресом
// кликабельно и ведёт к своей строке.
import { formatVolume } from '@shadrin-v/i18n';
import { useT, useLocale } from '../../i18n/LocaleContext';
import { fillTemplate } from '../components/stackFormula';
import type { SetupMessage, SetupMessageWhere, SetupSummary } from './setupValidation';

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-title font-[700] leading-none tabular-nums text-brand">{value}</div>
      <div className="mt-1 text-label uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function MessageList({
  title,
  messages,
  danger,
  onGoTo,
}: {
  title: string;
  messages: SetupMessage[];
  danger: boolean;
  onGoTo: (where: SetupMessageWhere) => void;
}) {
  const tt = useT();
  if (messages.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <span className={`text-label uppercase font-semibold ${danger ? 'text-danger' : 'text-warning'}`}>
        {title}
      </span>
      <ul className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const text = tt(m.code);
          const address = m.orderId && m.name ? `${m.orderId} · ${m.name}` : null;
          return (
            <li key={`${m.code}-${m.where?.positionId ?? 'plan'}-${i}`} className="text-caption">
              {m.where ? (
                <button
                  type="button"
                  className="text-left underline decoration-line underline-offset-2 hover:text-brand"
                  aria-label={`${address}: ${text} — ${tt('setup.msg.goToPosition')}`}
                  onClick={() => onGoTo(m.where!)}
                >
                  <span className="font-semibold">{address}</span> — {text}
                </button>
              ) : (
                <span>{text}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LoadSummary({
  summary,
  messages,
  onGoTo,
}: {
  summary: SetupSummary;
  messages: SetupMessage[];
  onGoTo: (where: SetupMessageWhere) => void;
}) {
  const tt = useT();
  const { locale } = useLocale();
  const errors = messages.filter((m) => m.level === 'error');
  const warnings = messages.filter((m) => m.level === 'warning');
  return (
    <aside className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-card">
      <span className="text-label uppercase font-semibold text-faint">{tt('setup.summary.title')}</span>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Figure value={String(summary.orders)} label={tt('setup.summary.orders')} />
        <Figure value={String(summary.positions)} label={tt('setup.summary.positions')} />
        <Figure value={String(summary.units)} label={tt('setup.summary.units')} />
      </div>
      <div className="text-caption text-muted">
        <span className="font-semibold text-ink">{formatVolume(summary.cargoVolume, locale)}</span>{' '}
        {fillTemplate(tt('setup.summary.ofVehicle'), {
          vehicle: formatVolume(summary.vehicleVolume, locale),
        })}
        <div className="text-label uppercase tracking-wide text-faint">{tt('setup.summary.volume')}</div>
      </div>
      <MessageList title={tt('setup.msg.errors')} messages={errors} danger onGoTo={onGoTo} />
      <MessageList title={tt('setup.msg.warnings')} messages={warnings} danger={false} onGoTo={onGoTo} />
      {messages.length === 0 && <p className="text-caption text-muted">{tt('setup.msg.none')}</p>}
    </aside>
  );
}
```

- [ ] **Шаг 4: прогнать — PASS**

Запуск: `npx vitest run apps/web/src/screens/setup/LoadSummary.test.tsx`

- [ ] **Шаг 5: подключить как пустое состояние `RulesPanel`**

`RulesPanel` получает два необязательных пропа и отдаёт им пустое состояние (`RulesPanel.tsx:46-52`
заменяется целиком):

```tsx
  if (!p) {
    // Пустое состояние — не заглушка: панель показывает сводку заявки и список сообщений (§6).
    // Пропы необязательные: старые тесты рендерят панель без них и должны продолжать работать.
    if (summary && messages && onGoTo) {
      return <LoadSummary summary={summary} messages={messages} onGoTo={onGoTo} />;
    }
    return (
      <aside className="rounded-card bg-card p-4 shadow-card">
        <p className="text-caption text-muted">{tt('setup.panel.empty')}</p>
      </aside>
    );
  }
```

в `RulesPanelProps` добавить:

```ts
  /** Пустое состояние панели (§6): сводка и сообщения. Без них панель остаётся с прежней заглушкой. */
  summary?: SetupSummary;
  messages?: SetupMessage[];
  onGoTo?: (where: SetupMessageWhere) => void;
```

- [ ] **Шаг 6: прогнать тесты панели — PASS**

Запуск: `npx vitest run apps/web/src/screens/setup/RulesPanel.test.tsx apps/web/src/screens/setup/LoadSummary.test.tsx`

- [ ] **Шаг 7: коммит**

```bash
git add apps/web/src/screens/setup/LoadSummary.tsx apps/web/src/screens/setup/LoadSummary.test.tsx apps/web/src/screens/setup/RulesPanel.tsx
git commit -m "feat(setup): сводка загрузки и список сообщений в пустом состоянии панели (5nb этап 2)"
```

---

### Задача 4: липкая шапка

**Файлы:**
- Создать: `apps/web/src/screens/setup/useStickyCompact.ts`
- Создать: `apps/web/src/screens/setup/useStickyCompact.test.ts`
- Создать: `apps/web/src/screens/setup/SetupHeader.tsx`
- Создать: `apps/web/src/screens/setup/SetupHeader.test.tsx`

**Интерфейсы:**
- Отдаёт: `useStickyCompact(): [boolean, (el: HTMLElement | null) => void]` — флаг «шапка ужалась»
  и ref-колбэк для маячка над ней;
  `<SetupHeader vehicle onVehicleChange summary errorCount compact loadingMode orderGrouping
  onLoadingModeChange onOrderGroupingChange onDemo onReset onCalculate />`.
- Использует: `VEHICLE_PRESETS`, `Measure`, `Select`, `Button`, `formatVolume`,
  `LoadingModeSwitch` и новый `OrderGroupingToggle` — оба общие с ладепланом.
- Отдаёт: `OrderGroupingToggle` — его же начинает использовать `LadeplanScreen`.

`useIsWide` (этап 1) — образец для хука: тот же приём с подпиской и тем же стилем теста.

- [ ] **Шаг 1: написать падающий тест хука**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStickyCompact } from './useStickyCompact';

type Cb = (entries: { isIntersecting: boolean }[]) => void;
let cb: Cb | null = null;

class FakeObserver {
  constructor(c: Cb) { cb = c; }
  observe() {}
  disconnect() {}
}

afterEach(() => { cb = null; });

describe('useStickyCompact', () => {
  it('пока маячок виден — шапка полная', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useStickyCompact());
    act(() => result.current[1](document.createElement('div')));
    act(() => cb?.([{ isIntersecting: true }]));
    expect(result.current[0]).toBe(false);
  });

  it('маячок ушёл за верх — шапка ужимается', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useStickyCompact());
    act(() => result.current[1](document.createElement('div')));
    act(() => cb?.([{ isIntersecting: false }]));
    expect(result.current[0]).toBe(true);
  });

  it('без IntersectionObserver шапка остаётся полной, а не падает', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useStickyCompact());
    act(() => result.current[1](document.createElement('div')));
    expect(result.current[0]).toBe(false);
  });
});
```

- [ ] **Шаг 2: прогнать — FAIL**

Запуск: `npx vitest run apps/web/src/screens/setup/useStickyCompact.test.ts`

- [ ] **Шаг 3: реализовать хук**

```ts
// «Шапка ужалась» (LKWkalk-5nb, спека §6). Наблюдаем не за скроллом, а за МАЯЧКОМ над шапкой:
// обработчик скролла на каждый кадр — это работа в главном потоке ради одного булева, а
// IntersectionObserver отвечает ровно на нужный вопрос («видно ли ещё то, что было над шапкой»).
// Без IntersectionObserver (старый браузер, jsdom без стаба) шапка просто остаётся полной.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useStickyCompact(): [boolean, (el: HTMLElement | null) => void] {
  const [compact, setCompact] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setCompact(!e.isIntersecting);
    });
    io.observe(el);
    observer.current = io;
  }, []);
  return [compact, ref];
}
```

- [ ] **Шаг 4: прогнать — PASS**

Запуск: `npx vitest run apps/web/src/screens/setup/useStickyCompact.test.ts`

- [ ] **Шаг 5: написать падающий тест шапки**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { SetupHeader } from './SetupHeader';
import type { SetupSummary } from './setupValidation';

const vehicle: Vehicle = { id: 'v', name: 'LKW Standard', length: 13600, width: 2450, height: 2450 };
const summary: SetupSummary = {
  orders: 2, positions: 3, units: 40, cargoVolume: 18_400_000_000, vehicleVolume: 81_644_000_000,
};

const renderHeader = (props: Partial<React.ComponentProps<typeof SetupHeader>> = {}) => {
  const handlers = {
    onVehicleChange: vi.fn(), onDemo: vi.fn(), onReset: vi.fn(), onCalculate: vi.fn(),
    onLoadingModeChange: vi.fn(), onOrderGroupingChange: vi.fn(),
  };
  render(
    <LocaleProvider initialLocale="de">
      <SetupHeader
        vehicle={vehicle} summary={summary} errorCount={0} compact={false}
        loadingMode="combined" orderGrouping="strict" {...handlers} {...props}
      />
    </LocaleProvider>,
  );
  return handlers;
};

describe('SetupHeader', () => {
  it('в полном виде показывает кузов, габариты и сводку', () => {
    renderHeader();
    expect(screen.getByLabelText('Fahrzeug')).toHaveValue('LKW Standard');
    expect(screen.getByLabelText('Länge')).toHaveValue(13600);
    expect(screen.getByText(/18,4 m³/)).toBeInTheDocument();
  });

  it('в ужатом виде остаются кузов, сводка, режим погрузки с галочкой и «Рассчитать»', () => {
    renderHeader({ compact: true });
    expect(screen.getByText('LKW Standard')).toBeInTheDocument();
    expect(screen.queryByLabelText('Länge')).toBeNull();       // габариты уходят
    expect(screen.queryByRole('button', { name: 'Demo' })).toBeNull(); // «Демо» и «Сброс» тоже
    expect(screen.getByRole('group', { name: 'Belademodus' })).toBeInTheDocument();
    expect(screen.getByLabelText('Dichte vor Auftragstrennung')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Berechnen' })).toBeInTheDocument();
  });

  it('режим погрузки и галочка группировки зовут свои колбэки, а не считают сами', async () => {
    const h = renderHeader();
    // Segmented — это role="group" из <button>, а не радиогруппа (ui/primitives.tsx).
    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    await userEvent.click(screen.getByLabelText('Dichte vor Auftragstrennung'));
    expect(h.onLoadingModeChange).toHaveBeenCalledWith('rear');
    expect(h.onOrderGroupingChange).toHaveBeenCalledWith('densityFirst');
    expect(h.onCalculate).not.toHaveBeenCalled();
  });

  it('«Рассчитать» НЕ гаснет при ошибках, но объявляет их числом', () => {
    renderHeader({ errorCount: 2 });
    const calc = screen.getByRole('button', { name: /Berechnen/ });
    expect(calc).toBeEnabled();
    expect(screen.getByText('Berechnung nicht möglich: 2 Fehler')).toBeInTheDocument();
  });

  it('действия зовут свои колбэки', async () => {
    const h = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
    expect(h.onCalculate).toHaveBeenCalledOnce();
    expect(h.onDemo).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Шаг 6: прогнать — FAIL**

Запуск: `npx vitest run apps/web/src/screens/setup/SetupHeader.test.tsx`

- [ ] **Шаг 6б: вынести галочку группировки в общий компонент**

Разметка галочки с подсказкой уже живёт в `LadeplanScreen.tsx:593-604`. Копировать её в шапку
нельзя — это пятнадцать строк, в которых спрятана неочевидная грабля (`InfoHint` — кнопка, и
внутри `<label>` клик по подсказке переключал бы галочку). Создать
`apps/web/src/ui/OrderGroupingToggle.tsx`:

```tsx
// Галочка «Плотность важнее группировки» (ADR 017) — одна на два экрана: шапку «Настройки»
// (выбор ДО расчёта) и панель действий ладеплана (пересчёт готового плана).
// InfoHint — кнопка, и она обязана стоять ВНЕ <label>: внутри него клик по подсказке
// активировал бы label и переключал галочку, то есть менял стратегию при попытке её прочитать.
import type { OrderGrouping } from '@shadrin-v/engine';
import { useT } from '../i18n/LocaleContext';
import { InfoHint } from './primitives';

export function OrderGroupingToggle({
  value,
  onChange,
}: {
  value: OrderGrouping;
  onChange: (g: OrderGrouping) => void;
}) {
  const tt = useT();
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          aria-label={tt('ladeplan.orderGrouping')}
          checked={value === 'densityFirst'}
          onChange={(e) => onChange(e.target.checked ? 'densityFirst' : 'strict')}
        />
        <span className="truncate">{tt('ladeplan.orderGrouping')}</span>
      </label>
      <InfoHint ariaLabel={tt('ladeplan.orderGrouping')} text={tt('ladeplan.orderGroupingHint')} />
    </span>
  );
}
```

и заменить им блок в `LadeplanScreen.tsx:593-604` — там поведение сохраняется дословно, включая
`withDiscardGuard` вокруг `onChange` (его оставить на месте вызова, в компонент он не переезжает:
на ладеплане смена стратегии выбрасывает ручные правки, а в «Настройке» выбрасывать нечего).
Прогнать `npx vitest run apps/web/src/screens/LadeplanScreen.test.tsx` — сценарии переключателя
должны остаться зелёными без правок.

- [ ] **Шаг 7: реализовать шапку**

```tsx
// Липкая шапка экрана «Настройка» (LKWkalk-5nb, спека §6): кузов, сводка и действия на виду при
// прокрутке. Кнопка расчёта жила под последним заказом — при шести заказах до неё надо было домотать.
// В ужатом виде остаётся одна строка «кузов · сводка · Рассчитать»; за переключение отвечает
// useStickyCompact, шапка только рисует то, что ей сказали.
import type { LoadingMode, OrderGrouping, Vehicle } from '@shadrin-v/engine';
import { formatVolume } from '@shadrin-v/i18n';
import { useT, useLocale } from '../../i18n/LocaleContext';
import { fillTemplate } from '../components/stackFormula';
import { Button, Measure, Select } from '../../ui/primitives';
import { LoadingModeSwitch } from '../../ui/LoadingModeSwitch';
import { OrderGroupingToggle } from '../../ui/OrderGroupingToggle';
import { VEHICLE_PRESETS } from '../../data/presets';
import { numOr0, type Num } from './setupState';
import type { SetupSummary } from './setupValidation';

export interface SetupHeaderProps {
  vehicle: Vehicle;
  summary: SetupSummary;
  /** Сколько сообщений уровня error — кнопка не гаснет, но говорит, что расчёта не будет. */
  errorCount: number;
  compact: boolean;
  /** Стратегия расчёта (решение владельца 3): одно состояние на оба экрана, владеет App. Здесь она
   *  ТОЛЬКО выбирается — пересчёт делает «Рассчитать», потому что плана может ещё не быть. */
  loadingMode: LoadingMode;
  orderGrouping: OrderGrouping;
  onLoadingModeChange: (m: LoadingMode) => void;
  onOrderGroupingChange: (g: OrderGrouping) => void;
  onVehicleChange: (v: Vehicle) => void;
  onDemo: () => void;
  onReset: () => void;
  onCalculate: () => void;
}

function MeasureField({ label, value, onChange }: { label: string; value: Num; onChange: (v: Num) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label uppercase font-semibold text-faint">{label}</span>
      <span className="w-24">
        <Measure ariaLabel={label} value={value} onChange={onChange} />
      </span>
    </label>
  );
}

export function SetupHeader({
  vehicle, summary, errorCount, compact, loadingMode, orderGrouping,
  onLoadingModeChange, onOrderGroupingChange, onVehicleChange, onDemo, onReset, onCalculate,
}: SetupHeaderProps) {
  const tt = useT();
  const { locale } = useLocale();
  const volumes = `${formatVolume(summary.cargoVolume, locale)} / ${formatVolume(summary.vehicleVolume, locale)}`;

  return (
    {/* NB: в плане тут стояло `bg-paper/95 … backdrop-blur`. Так делать НЕЛЬЗЯ: токены темы
        объявлены голым `var(--paper)`, и Tailwind 3.4 молча не выпускает правило с модификатором
        прозрачности — шапка оказывается полностью прозрачной. В коде — сплошной `bg-paper`
        (находка C1 финального ревью, сторож — apps/web/src/theme-alpha.test.ts). */}
    <div className="sticky top-0 z-20 -mx-5 mb-6 border-b border-line bg-paper px-5 py-3 sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-end gap-4">
        {compact ? (
          <span className="text-body font-semibold">{vehicle.name}</span>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint">{tt('vehicle.label')}</span>
              <Select
                ariaLabel={tt('vehicle.label')}
                value={vehicle.name}
                onChange={(name) => {
                  const p = VEHICLE_PRESETS.find((v) => v.name === name);
                  onVehicleChange(
                    p
                      ? { id: p.key, name: p.name, length: p.length, width: p.width, height: p.height }
                      : { ...vehicle, name: tt('setup.vehiclePreset.custom') },
                  );
                }}
                options={[
                  { value: tt('setup.vehiclePreset.custom'), label: tt('setup.vehiclePreset.custom') },
                  ...VEHICLE_PRESETS.map((p) => ({ value: p.name, label: p.name })),
                ]}
              />
            </div>
            <MeasureField label={tt('field.length')} value={vehicle.length} onChange={(v) => onVehicleChange({ ...vehicle, length: numOr0(v) })} />
            <MeasureField label={tt('field.width')} value={vehicle.width} onChange={(v) => onVehicleChange({ ...vehicle, width: numOr0(v) })} />
            <MeasureField label={tt('field.height')} value={vehicle.height} onChange={(v) => onVehicleChange({ ...vehicle, height: numOr0(v) })} />
          </>
        )}

        <span className="text-caption text-muted" data-testid="header-summary">
          {volumes}
        </span>

        {/* Стратегия расчёта — здесь, а не только на готовом плане: выбирать «как грузим» логично
            до расчёта, а не после него. Пересчёта отсюда нет — считает «Рассчитать». */}
        <div className="flex flex-wrap items-center gap-2">
          <LoadingModeSwitch value={loadingMode} onChange={onLoadingModeChange} />
          <OrderGroupingToggle value={orderGrouping} onChange={onOrderGroupingChange} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!compact && (
            <>
              <Button variant="ghost" onClick={onDemo}>{tt('action.demo')}</Button>
              <Button variant="secondary" onClick={onReset}>{tt('action.reset')}</Button>
            </>
          )}
          <Button variant="primary" onClick={onCalculate}>{tt('action.calculate')}</Button>
        </div>
      </div>
      {errorCount > 0 && (
        // Кнопка не гаснет (§6): погашенная не фокусируется и не объявляется скринридером, поэтому
        // причина живёт рядом с ней текстом, а нажатие ведёт к первой ошибочной строке.
        <p role="status" className="mx-auto mt-1 max-w-[1120px] text-caption font-semibold text-danger">
          {fillTemplate(tt('setup.header.calcBlocked'), { n: errorCount })}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Шаг 8: прогнать — PASS**

Запуск: `npx vitest run apps/web/src/screens/setup/SetupHeader.test.tsx apps/web/src/screens/setup/useStickyCompact.test.ts`

- [ ] **Шаг 9: коммит**

```bash
git add apps/web/src/screens/setup/SetupHeader.tsx apps/web/src/screens/setup/SetupHeader.test.tsx apps/web/src/screens/setup/useStickyCompact.ts apps/web/src/screens/setup/useStickyCompact.test.ts
git commit -m "feat(setup): липкая шапка с кузовом, сводкой и действиями (5nb этап 2)"
```

---

### Задача 5: сборка в `SetupScreen` и новое поведение «Рассчитать»

**Файлы:**
- Изменить: `apps/web/src/screens/SetupScreen.tsx` (секция кузова `:356-378` и нижняя панель
  действий `:503-506` уезжают в шапку; `handleCalculate` `:345-349`; шапка заказов `:381-387`)
- Изменить: `apps/web/src/App.tsx` (владелец стратегии, `:63-90`)
- Изменить: `apps/web/src/screens/SetupScreen.test.tsx`, `apps/web/src/App.test.tsx`

**Интерфейсы:**
- Использует: `setupSummary`, `setupMessages`, `firstError` (задача 2), `LoadSummary` через
  `RulesPanel` (задача 3), `SetupHeader`, `useStickyCompact` (задача 4).

- [ ] **Шаг 1: написать падающие тесты поведения**

Дописать в `SetupScreen.test.tsx`:

```tsx
  it('«Рассчитать» не гаснет при ошибке, а выбирает первую ошибочную позицию', async () => {
    const onCalculate = vi.fn();
    renderSetup({ onCalculate, initialOrders: [
      order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', state: 'verschachtelt' })]),
    ] });
    const calc = screen.getByRole('button', { name: 'Berechnen' });
    expect(calc).toBeEnabled();
    await userEvent.click(calc);
    expect(onCalculate).not.toHaveBeenCalled();
    // панель разбора открылась именно на этой строке
    expect(await screen.findByRole('region', { name: 'Regeln' })).toBeInTheDocument();
    expect(screen.getByLabelText('Artikel')).toHaveValue('EPAL 1');
  });

  it('без ошибок «Рассчитать» считает', async () => {
    const onCalculate = vi.fn();
    renderSetup({ onCalculate });
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('предупреждение расчёт не блокирует', async () => {
    const onCalculate = vi.fn();
    renderSetup({ onCalculate, initialOrders: [
      order('SO-1001', [position({ id: 'p1', quantity: 0 })]),
    ] });
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('клик по сообщению в сводке открывает его строку', async () => {
    renderSetup({ initialOrders: [
      order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', width: '' })]),
    ] });
    await userEvent.click(screen.getByRole('button', { name: /EPAL 1.*Maße unvollständig/ }));
    expect(screen.getByLabelText('Artikel')).toHaveValue('EPAL 1');
  });
```

(`renderSetup`, `order`, `position` — существующие хелперы файла; если их нет под этими именами,
взять фактические из начала `SetupScreen.test.tsx` и не изобретать новых.)

- [ ] **Шаг 2: прогнать — FAIL**

Запуск: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`
Ожидание: FAIL — кнопка «Berechnen» отключена / сообщений нет.

- [ ] **Шаг 3: подключить шапку и сводку в `SetupScreen`**

```tsx
  // §6: сводка и сообщения — чистые функции от того же состояния, что уходит в Load.
  const summary = setupSummary(orders, vehicle);
  const messages = setupMessages(orders, vehicle);
  const errors = messages.filter((m) => m.level === 'error');
  const [compact, sentinelRef] = useStickyCompact();

  /** Открыть строку по адресу из сообщения — общий путь для клика по сообщению и для «Рассчитать»
   *  с ошибками: выбрать строку, открыть её панель, увести туда фокус. */
  const goTo = (where: SetupMessageWhere) => {
    setSelection({ orderKey: where.orderKey, positionId: where.positionId });
    // Фокус — в поле артикула строки: это её первое поле, и с него естественно продолжить правку.
    // requestAnimationFrame, потому что в drawer-режиме панель только что смонтировалась.
    requestAnimationFrame(() => nameRefs.current.get(where.positionId)?.focus());
  };

  const handleCalculate = () => {
    // Кнопка больше не гаснет (§6): при ошибке нажатие не считает, а ведёт к первой ошибочной строке.
    const first = firstError(messages);
    if (first?.where) {
      goTo(first.where);
      return;
    }
    const cargo = orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId)));
    onCalculate({ vehicle, cargo }, { orderColors: buildOrderColors(orders) });
  };
```

В разметке: `<div ref={sentinelRef} aria-hidden className="h-px" />` — маячок ПЕРЕД шапкой; затем

```tsx
      <SetupHeader
        vehicle={vehicle}
        summary={summary}
        errorCount={errors.length}
        compact={compact}
        onVehicleChange={setVehicle}
        onDemo={handleDemo}
        onReset={handleReset}
        onCalculate={handleCalculate}
      />
```

Секция кузова (`:356-378`) и нижняя панель действий (`:503-506`) удаляются — они переехали.
Кнопка «Демо» из шапки заказов (`:384`) тоже уходит: она теперь в шапке экрана.
Обоим экземплярам `RulesPanel` (широкий `<aside>` и drawer) добавляются пропы:

```tsx
              summary={summary}
              messages={messages}
              onGoTo={goTo}
```

- [ ] **Шаг 3б: стратегия — одно состояние на оба экрана (решение владельца 3)**

`SetupScreenProps` получает четыре новых пропа:

```ts
  /** Стратегия расчёта — владеет `App`, шапка «Настройки» и ладеплан правят одно и то же. */
  loadingMode: LoadingMode;
  orderGrouping: OrderGrouping;
  onLoadingModeChange: (m: LoadingMode) => void;
  onOrderGroupingChange: (g: OrderGrouping) => void;
```

`handleCalculate` кладёт их в `Load` явно (иначе сработает fallback `App` на прежний план и выбор
в шапке молча пропадёт):

```ts
    onCalculate({ vehicle, cargo, loadingMode, orderGrouping }, { orderColors: buildOrderColors(orders) });
```

В `App.tsx` появляется само состояние; прежние `onLoadingModeChange`/`onOrderGroupingChange`
ладеплана пишут в него же и по-прежнему пересчитывают, если план уже есть:

```tsx
  // Стратегия расчёта живёт здесь, а не в результате: её выбирают ДО первого расчёта, в шапке
  // «Настройки» (5nb этап 2), и после — переключателями на ладеплане. Один источник, два места
  // правки; иначе экраны показывали бы разное значение одной настройки.
  const [loadingMode, setLoadingMode] = useState<LoadingMode>(() => loadPersistedResult()?.load.loadingMode ?? 'combined');
  const [orderGrouping, setOrderGrouping] = useState<OrderGrouping>(() => loadPersistedResult()?.load.orderGrouping ?? 'strict');

  const onLoadingModeChange = (mode: LoadingMode) => {
    setLoadingMode(mode);
    if (!result) return; // плана ещё нет — выбор просто ждёт «Рассчитать»
    onCalculate({ ...result.load, loadingMode: mode }, { persist: !result.transient });
  };

  const onOrderGroupingChange = (grouping: OrderGrouping) => {
    setOrderGrouping(grouping);
    if (!result) return;
    onCalculate({ ...result.load, orderGrouping: grouping }, { persist: !result.transient });
  };
```

и оба прокидываются в `SetupScreen`. Вызов `loadPersistedResult()` в инициализаторах — тот же
разбор localStorage, что уже делает `result`; чтобы не читать хранилище трижды, поднять его в
одну `const persisted = loadPersistedResult()` над тремя `useState`.

- [ ] **Шаг 3в: тест на общий источник стратегии** (`App.test.tsx`)

```tsx
  it('режим погрузки, выбранный в шапке «Настройки», уходит в расчёт', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    // на ладеплане тот же режим отмечен активным — значение одно на оба экрана
    expect(screen.getByRole('button', { name: 'Von hinten', pressed: true })).toBeInTheDocument();
  });
```

(Если `Segmented` помечает активную кнопку не через `aria-pressed`, а иначе — взять фактический
атрибут из `ui/primitives.tsx`, а не менять компонент ради теста.)

- [ ] **Шаг 4: прогнать — PASS**

Запуск: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`
Если падают старые сценарии, которые искали кнопки на прежних местах, — чинить **запрос в тесте**
(кнопка та же, место другое), а не возвращать разметку.

- [ ] **Шаг 5: коммит**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx
git commit -m "feat(setup): «Рассчитать» ведёт к первой ошибке, шапка и сводка на экране (5nb этап 2)"
```

---

### Задача 6: гейты, проверка в браузере, документация

**Файлы:**
- Изменить: `docs/CHANGELOG.md`
- Изменить: `docs/superpowers/specs/2026-07-28-5nb-setup-redesign-design.md` (§12 — отметить, что
  этап 2 реализован)

- [ ] **Шаг 1: полный фронтовый прогон**

```bash
npm run typecheck && npm run lint && npx vitest run apps/web packages
```

Ожидание: зелено. Единственное допустимое падение — флейк `SetupScreen.test.tsx` под нагрузкой
(`LKWkalk-bmi`); перепроверить отдельным прогоном файла.

- [ ] **Шаг 2: проверить в настоящем Chrome**

```bash
cd apps/web && npm run dev            # :5173
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile about:blank &
```

Через CDP (`Emulation.setDeviceMetricsOverride` + `Runtime.evaluate` + `Input.dispatchMouseEvent`)
проверить руками то, чего jsdom не покажет:
1. шапка липнет и ужимается при прокрутке (1440×900 и 1280×800);
2. на 1024 px и 375 px шапка не рвётся и кнопки не наезжают;
3. ужатая шапка не перекрывает первую карточку заказа.

- [ ] **Шаг 3: записать в CHANGELOG** (раздел `## [Unreleased]`, новой датой)

Абзац о том, что изменилось для пользователя: действия и сводка всегда на виду; «Рассчитать» не
гаснет, а ведёт к первой ошибочной позиции; список ошибок и предупреждений в панели кликабелен.

- [ ] **Шаг 4: обновить спеку** — §6 дополнить решениями владельца (состав ужатой шапки; режим
  погрузки и галочка группировки живут в шапке «Настройки», состояние — в `App`), §12 отметить
  этап 2 реализованным со ссылкой на PR.

- [ ] **Шаг 5: коммит и PR**

```bash
git add docs
git commit -m "docs(setup): этап 2 «Настройки» — CHANGELOG и статус спеки (5nb)"
git push -u origin feat/5nb-setup-stage2
gh pr create --title "feat(setup): шапка, сводка и сообщения экрана «Настройка», этап 2 (5nb)" --body "..."
```

- [ ] **Шаг 6: дождаться зелёного CI, спросить владельца** — мерж в `main` = выкладка на прод
  (ADR 023), решение владельца, не исполнителя.

---

## Самопроверка плана

**Покрытие спеки §6:**

| Требование §6 | Задача |
|---|---|
| Липкая шапка: кузов, сводка, действия | 4, 5 |
| Ужимается при скролле до одной строки | 4 (`compact`), 5 (`useStickyCompact`) |
| Сводка: заказов · позиций · единиц · объём против объёма кузова | 2 (`setupSummary`), 3 (`LoadSummary`), 4 (шапка) |
| Ошибки: шаг вложения, незаполненные габариты | 2 (`setup.msg.stepInvalid`, `setup.msg.dimsMissing`) |
| Предупреждения: выше кузова, объём больше кузова, количество 0 | 2 (`tooTall`, `volumeOver`, `zeroQuantity`) |
| Предупреждения ничего не блокируют | 2 (тест «предупреждение расчёт не блокирует»), 5 |
| «Рассчитать» не гаснет | 4 (тест), 5 (`handleCalculate`) |
| Нажатие при ошибках → первая ошибочная позиция, панель, фокус | 5 (`goTo`) |
| Каждая запись списка кликабельна и ведёт к строке | 3 (`MessageList`), 5 (`onGoTo`) |
| `setupValidation.ts` извлекается на этапе 2 | 2 |

**Сверх §6 — по решениям владельца от 2026-07-29** (см. шапку плана): режим погрузки и галочка
«Плотность важнее группировки» переезжают в шапку «Настройки» (задачи 4 и 5), состояние стратегии
поднимается в `App`. Спеку §6 обновить в задаче 6 — доки идут впереди кода, и это изменение состава
шапки, а не деталь реализации.

**Что осталось за границей этапа:** `LKWkalk-0il` (a11y `ArticleCombobox`), `LKWkalk-tn9` (полная
модальность drawer), `LKWkalk-y5j` (гейт против литералов), `LKWkalk-e2g` (выпадашка комбобокса на
375 px) — отдельными диффами, как договорено в §13 спеки.
