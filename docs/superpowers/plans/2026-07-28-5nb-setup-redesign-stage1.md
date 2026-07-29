# Экран «Настройка», этап 1 «Каркас» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пересобрать экран «Настройка» в мастер-деталь: худая строка позиции с чипом правил слева,
панель разбора справа, правила объяснены фразами вместо селектов.

**Architecture:** Вся работа — презентация в `apps/web`. Из `SetupScreen.tsx` (1046 строк)
извлекаются два чистых модуля без DOM (`setupState.ts`, `positionRules.ts`) и три компонента
(`PositionRow`, `RulesPanel`, `OrderCard`). Числа по-прежнему считает `computeStack` из движка;
новый код только выбирает шаблон текста и подставляет операнды `StackPreview`. Движок, контракт
`0.14.0` и форма сохранённого черновика не трогаются.

**Tech Stack:** TypeScript, React 18, Vite, Tailwind (токены design-system), vitest +
@testing-library/react, `@shadrin-v/engine`, `@shadrin-v/i18n`.

**Спека:** `docs/superpowers/specs/2026-07-28-5nb-setup-redesign-design.md`. Этап 2 (липкая шапка,
сводка загрузки, ошибки/предупреждения, поведение «Рассчитать») — отдельный план, в этот не входит.

## Global Constraints

- **Ни одного литерала пользовательского текста.** Только `tt('key')` + `fillTemplate`. Новый
  `aria-label`, `title`, `placeholder`, текстовый узел — всё через ключи. Ключ добавляется в
  `packages/i18n/src/keys.ts` И в `de.ts`, И в `ru.ts` — иначе падает `completeness.test.ts`.
- **После правки локалей — `npm run build -w @shadrin-v/i18n`.** Тесты читают словарь из собранного
  `dist`; без сборки тест имени падает на пустой строке и выглядит как баг компонента.
- **Ни одного цвета или размера вне шкалы `docs/design/design-system.md`.** Никаких hex в JSX,
  никаких `text-[10px]`. `font-[650]` шкалой разрешён.
- **Единицы длины — только `formatLength(mm, locale)`** из `@shadrin-v/i18n`. Строка `' mm'` в коде
  запрещена.
- **Движок и контракт не трогаются.** Никаких новых полей в `CargoType`, `Load`, `PositionState`
  сверх тех, что уже есть. Высоту стопки считает `computeStack`, не UI.
- **Форма черновика неизменна:** ключ `ladungsplaner.setup`, интерфейс `PersistedSetup`, миграция
  legacy-поля `stepHeight`. Выбранная строка НЕ персистится.
- **Тесты — `npm test -- <фильтр пути>` из корня.** `npm test -w apps/web` не существует.
- **Флейк `LKWkalk-w9j`** (`userEvent` под `vi.useFakeTimers()`) жив: `App.test`/`SetupScreen` могут
  дать до 3 падений не по вине задачи. Проверять по мерж-базе, прежде чем чинить.
- **Коммит после каждой зелёной задачи**, сообщение по-английски, тело — по-русски допустимо.

## File Structure

| Файл | Ответственность |
|------|-----------------|
| `apps/web/src/screens/setup/setupState.ts` | чистые функции состояния: типы `PositionState`/`OrderState`, `emptyPosition`, `emptyOrder`, `nextOrderNumber`, `nextColorIndex`, `activeStep`, `activeStepField`, `numOr0`, `dimsComplete`, `toCargo`, `buildOrderColors`, `lockedFieldsFrom`, `applySuggestion`, `loadSetup`, `saveSetup` |
| `apps/web/src/screens/setup/positionRules.ts` | чистые функции текста: `ruleChip`, `ruleSentences` |
| `apps/web/src/screens/setup/PositionRow.tsx` | строка позиции: артикул, Д·Ш·В, количество, чип, удаление |
| `apps/web/src/screens/setup/RulesPanel.tsx` | панель разбора: правила, «как считается», каталог |
| `apps/web/src/screens/setup/OrderCard.tsx` | карточка заказа: шапка, строки, «+ Position» |
| `apps/web/src/screens/SetupScreen.tsx` | координатор: состояние, выбор строки, персистентность, сборка `Load`, раскладка в две колонки / drawer |
| `packages/i18n/src/keys.ts`, `dictionaries/{de,ru}.ts` | новые ключи |

Существующие `ArticleCombobox`, `ArmedDelete`, `StackDiagram`, `stackFormula`, `orientationChoice`
переиспользуются без изменений.

---

### Task 1: Чистый модуль текста правил `positionRules.ts`

Модуль решает, ЧТО написано на чипе и какими фразами объясняется расчёт. Возвращает ключи и
подстановки, а не готовые строки, — переводит вызывающий компонент.

**Files:**
- Create: `apps/web/src/screens/setup/positionRules.ts`
- Create: `apps/web/src/screens/setup/positionRules.test.ts`
- Modify: `packages/i18n/src/keys.ts`
- Modify: `packages/i18n/src/dictionaries/de.ts`
- Modify: `packages/i18n/src/dictionaries/ru.ts`

**Interfaces:**
- Consumes: `StackPreview` из `@shadrin-v/engine`; `PositionState` — пока импортируется из
  `../SetupScreen` (в Task 2 переедет в `setupState.ts`, импорт правится там же);
  `orientationChoiceOf` из `../components/orientationChoice`.
- Produces:

```ts
export interface RuleText { key: TranslationKey; vars: Record<string, string | number>; }
export interface RuleChip { text: RuleText; restricted: boolean; count: number | null; }
export function ruleChip(p: PositionState, preview: StackPreview | null): RuleChip;
export function ruleSentences(p: PositionState, preview: StackPreview | null): RuleText[];
```

- [ ] **Step 1: Добавить ключи в `packages/i18n/src/keys.ts`**

В массив `TRANSLATION_KEYS`, в блок Setup screen, после `'setup.deleteOrder'`:

```ts
  // Setup: chip + rule sentences (LKWkalk-5nb)
  'setup.chip.nested',
  'setup.chip.nestedNoStep',
  'setup.chip.stackLimited',
  'setup.chip.stack',
  'setup.chip.restricted',
  'setup.chip.perStack',
  'setup.rule.entschachtelt',
  'setup.rule.sequential',
  'setup.rule.pairwise',
  'setup.rule.pairwiseUnpaired',
  'setup.rule.notStackable',
  'setup.rule.capTiers',
  'setup.rule.capNested',
  'setup.rule.orientFixed',
  'setup.rule.orientFree',
  'setup.rule.orientTwoSidedLength',
  'setup.rule.orientTwoSidedWidth',
```

Ось захода вил разведена на два ключа вместо подстановки `{axis}`: подстановка потребовала бы
переводить значение внутри значения, а это единственный способ гарантировать верный падеж в ru.

- [ ] **Step 2: Добавить переводы в `packages/i18n/src/dictionaries/de.ts`**

```ts
  'setup.chip.nested': 'Verschachtelt · {step}',
  'setup.chip.nestedNoStep': 'Verschachtelt · Schritt fehlt',
  'setup.chip.stackLimited': 'Stapel bis {cap}',
  'setup.chip.stack': 'Stapel',
  'setup.chip.restricted': 'Orientierung eingeschränkt',
  'setup.chip.perStack': '{count} pro Stapel',
  'setup.rule.entschachtelt': 'Werden ganz aufeinander gestellt, je {base} mm. Es passen {count}.',
  'setup.rule.sequential': 'Jedes weitere Stück sitzt im vorherigen und legt {step} mm drauf. Das unterste ist {base} mm hoch.',
  'setup.rule.pairwise': 'Werden paarweise verschachtelt: das unterste steht ganz, jedes weitere Paar legt {base} + {step} mm drauf.',
  'setup.rule.pairwiseUnpaired': 'Oben ist ein einzelnes Stück erlaubt.',
  'setup.rule.notStackable': 'Nicht stapelbar — nur eine Lage.',
  'setup.rule.capTiers': 'Manuell begrenzt: höchstens {cap} Lagen.',
  'setup.rule.capNested': 'Begrenzt: höchstens {cap} verschachtelte Stück.',
  'setup.rule.orientFixed': 'Orientierung fest — darf nicht gedreht werden.',
  'setup.rule.orientFree': 'Darf um die Hochachse gedreht werden (Länge ↔ Breite).',
  'setup.rule.orientTwoSidedLength': 'Gabeln kommen nur von zwei Seiten, längs.',
  'setup.rule.orientTwoSidedWidth': 'Gabeln kommen nur von zwei Seiten, quer.',
```

- [ ] **Step 3: Добавить переводы в `packages/i18n/src/dictionaries/ru.ts`**

```ts
  'setup.chip.nested': 'Вложение · {step}',
  'setup.chip.nestedNoStep': 'Вложение · нет шага',
  'setup.chip.stackLimited': 'Штабель до {cap}',
  'setup.chip.stack': 'Штабель',
  'setup.chip.restricted': 'Ориентация ограничена',
  'setup.chip.perStack': '{count} в стопке',
  'setup.rule.entschachtelt': 'Ставятся друг на друга целиком, по {base} мм. Помещается {count}.',
  'setup.rule.sequential': 'Каждая следующая садится в предыдущую и добавляет {step} мм. Нижняя — {base} мм.',
  'setup.rule.pairwise': 'Складываются парами: нижняя стоит целиком, каждая следующая пара добавляет {base} + {step} мм.',
  'setup.rule.pairwiseUnpaired': 'Сверху разрешена одиночная.',
  'setup.rule.notStackable': 'Не штабелируется — только один ярус.',
  'setup.rule.capTiers': 'Ограничено вручную: не выше {cap} ярусов.',
  'setup.rule.capNested': 'Ограничено: не больше {cap} вложенных.',
  'setup.rule.orientFixed': 'Ориентация фиксирована — поворачивать нельзя.',
  'setup.rule.orientFree': 'Можно разворачивать вокруг вертикали (длина ↔ ширина).',
  'setup.rule.orientTwoSidedLength': 'Вилы заходят только с двух сторон, вдоль длины.',
  'setup.rule.orientTwoSidedWidth': 'Вилы заходят только с двух сторон, вдоль ширины.',
```

- [ ] **Step 4: Собрать словарь и убедиться, что полнота зелёная**

```bash
npm run build -w @shadrin-v/i18n
npm test -- completeness
```

Ожидаемо: PASS. Если падает `de missing …` / `ru missing …` — ключ добавлен не во все три файла.

- [ ] **Step 5: Написать падающий тест `positionRules.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { StackPreview } from '@shadrin-v/engine';
import { ruleChip, ruleSentences } from './positionRules';
import type { PositionState } from '../SetupScreen';

const base = (over: Partial<PositionState> = {}): PositionState => ({
  id: 'p1', name: 'Gestell A', length: 2400, width: 1000, height: 1900, quantity: 4,
  state: 'entschachtelt', rotation: 'yawOnly', forkAxis: 'length',
  nestStepPairwise: '', nestStepSequential: '', nestingMode: 'pairwise',
  maxNested: '', allowUnpairedTop: false, maxTiers: '', ...over,
});

const preview = (over: Partial<StackPreview> = {}): StackPreview => ({
  count: 4, height: 7600, mode: 'entschachtelt', base: 1900, hold: 2700, rawCount: 4, ...over,
} as StackPreview);

describe('ruleChip', () => {
  it('nested position shows the step', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120 });
    expect(ruleChip(p, preview({ mode: 'sequential', stepHeight: 120, count: 5 }))).toEqual({
      text: { key: 'setup.chip.nested', vars: { step: 120 } }, restricted: false, count: 5,
    });
  });

  it('nested without a step says the step is missing', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: '' });
    expect(ruleChip(p, null).text).toEqual({ key: 'setup.chip.nestedNoStep', vars: {} });
  });

  it('a tier limit is named on the chip', () => {
    expect(ruleChip(base({ maxTiers: 3 }), preview({ count: 3 })).text).toEqual({
      key: 'setup.chip.stackLimited', vars: { cap: 3 },
    });
  });

  it('plain stacking has no number', () => {
    expect(ruleChip(base(), preview()).text).toEqual({ key: 'setup.chip.stack', vars: {} });
  });

  it('count is null while there is no preview', () => {
    expect(ruleChip(base({ length: '' }), null).count).toBeNull();
  });

  it('restricted is true for fixed and for two-sided, false for free', () => {
    expect(ruleChip(base({ rotation: 'none' }), null).restricted).toBe(true);
    expect(ruleChip(base({ forkAccess: 'twoSides' }), null).restricted).toBe(true);
    expect(ruleChip(base(), null).restricted).toBe(false);
  });
});

describe('ruleSentences', () => {
  it('explains plain stacking with the unit height and the count', () => {
    expect(ruleSentences(base(), preview())[0]).toEqual({
      key: 'setup.rule.entschachtelt', vars: { base: 1900, count: 4 },
    });
  });

  it('explains sequential nesting with the increment', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120 });
    expect(ruleSentences(p, preview({ mode: 'sequential', stepHeight: 120, count: 5 }))[0]).toEqual({
      key: 'setup.rule.sequential', vars: { step: 120, base: 1900 },
    });
  });

  it('explains pairwise nesting and the unpaired top when allowed', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'pairwise', nestStepPairwise: 22, allowUnpairedTop: true });
    const out = ruleSentences(p, preview({ mode: 'pairwise', stepHeight: 22, count: 5 }));
    expect(out[0]).toEqual({ key: 'setup.rule.pairwise', vars: { base: 1900, step: 22 } });
    expect(out[1]).toEqual({ key: 'setup.rule.pairwiseUnpaired', vars: {} });
  });

  it('names the cap that actually bit', () => {
    const out = ruleSentences(base({ maxTiers: 2 }), preview({ cappedBy: 'maxTiers', cap: 2, count: 2 }));
    expect(out).toContainEqual({ key: 'setup.rule.capTiers', vars: { cap: 2 } });
  });

  it('a not-stackable preview replaces the vertical sentence', () => {
    const out = ruleSentences(base(), preview({ cappedBy: 'notStackable', count: 1 }));
    expect(out[0]).toEqual({ key: 'setup.rule.notStackable', vars: {} });
  });

  it('always ends with the orientation sentence', () => {
    expect(ruleSentences(base(), null)).toEqual([{ key: 'setup.rule.orientFree', vars: {} }]);
    expect(ruleSentences(base({ rotation: 'none' }), null)).toEqual([
      { key: 'setup.rule.orientFixed', vars: {} },
    ]);
    expect(ruleSentences(base({ forkAccess: 'twoSides', forkAxis: 'width' }), null)).toEqual([
      { key: 'setup.rule.orientTwoSidedWidth', vars: {} },
    ]);
  });
});
```

- [ ] **Step 6: Прогнать тест и убедиться, что он падает**

Run: `npm test -- positionRules`
Ожидаемо: FAIL, `Failed to resolve import "./positionRules"`.

- [ ] **Step 7: Написать `positionRules.ts`**

```ts
// Текст правил позиции: чип в строке и объясняющие фразы в панели (LKWkalk-5nb, спека §3 и §5).
// Возвращает КЛЮЧИ и подстановки, не готовые строки: перевод — дело компонента, как в stackFormula.
import type { StackPreview } from '@shadrin-v/engine';
import type { TranslationKey } from '@shadrin-v/i18n';
import type { PositionState } from '../SetupScreen';
import { activeStep } from '../SetupScreen';
import { orientationChoiceOf } from '../components/orientationChoice';

export interface RuleText {
  key: TranslationKey;
  vars: Record<string, string | number>;
}

export interface RuleChip {
  text: RuleText;
  /** Ориентация отличается от умолчания (`free`) — строка рисует маркер ⊘. */
  restricted: boolean;
  /** Единиц в одной стопке, или null, пока предпросмотра нет (спека §3: ноль читался бы как
   *  «не влезает ни одной»). */
  count: number | null;
}

const num = (v: number | ''): number => (v === '' ? 0 : v);

export function ruleChip(p: PositionState, preview: StackPreview | null): RuleChip {
  const step = num(activeStep(p));
  const cap = num(p.maxTiers);
  let text: RuleText;
  if (p.state === 'verschachtelt') {
    text = step > 0
      ? { key: 'setup.chip.nested', vars: { step } }
      : { key: 'setup.chip.nestedNoStep', vars: {} };
  } else if (cap > 0) {
    text = { key: 'setup.chip.stackLimited', vars: { cap } };
  } else {
    text = { key: 'setup.chip.stack', vars: {} };
  }
  return {
    text,
    restricted: orientationChoiceOf(p.rotation, p.forkAccess) !== 'free',
    count: preview ? preview.count : null,
  };
}

export function ruleSentences(p: PositionState, preview: StackPreview | null): RuleText[] {
  const out: RuleText[] = [];
  if (preview) {
    if (preview.cappedBy === 'notStackable') {
      out.push({ key: 'setup.rule.notStackable', vars: {} });
    } else if (preview.mode === 'sequential') {
      out.push({ key: 'setup.rule.sequential', vars: { step: preview.stepHeight ?? 0, base: preview.base } });
    } else if (preview.mode === 'pairwise') {
      out.push({ key: 'setup.rule.pairwise', vars: { base: preview.base, step: preview.stepHeight ?? 0 } });
      if (p.allowUnpairedTop) out.push({ key: 'setup.rule.pairwiseUnpaired', vars: {} });
    } else {
      out.push({ key: 'setup.rule.entschachtelt', vars: { base: preview.base, count: preview.count } });
    }
    if (preview.cappedBy === 'maxTiers') out.push({ key: 'setup.rule.capTiers', vars: { cap: preview.cap ?? 0 } });
    if (preview.cappedBy === 'maxNested') out.push({ key: 'setup.rule.capNested', vars: { cap: preview.cap ?? 0 } });
  }
  const choice = orientationChoiceOf(p.rotation, p.forkAccess);
  if (choice === 'fixed') out.push({ key: 'setup.rule.orientFixed', vars: {} });
  else if (choice === 'twoSided')
    out.push({
      key: p.forkAxis === 'width' ? 'setup.rule.orientTwoSidedWidth' : 'setup.rule.orientTwoSidedLength',
      vars: {},
    });
  else out.push({ key: 'setup.rule.orientFree', vars: {} });
  return out;
}
```

- [ ] **Step 8: Прогнать тесты и типы**

```bash
npm test -- positionRules
npm run typecheck
```
Ожидаемо: PASS оба.

- [ ] **Step 9: Коммит**

```bash
git add apps/web/src/screens/setup/positionRules.ts apps/web/src/screens/setup/positionRules.test.ts \
        packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(setup): rule chip and explanation sentences as pure text keys (5nb)"
```

---

### Task 2: Извлечь состояние в `setupState.ts`

Чистый переезд без изменения поведения. Цель — чтобы всё, что можно проверить без DOM, проверялось
без DOM, и чтобы `SetupScreen.tsx` перестал быть свалкой.

**Files:**
- Create: `apps/web/src/screens/setup/setupState.ts`
- Create: `apps/web/src/screens/setup/setupState.test.ts`
- Modify: `apps/web/src/screens/SetupScreen.tsx` (удалить перенесённое, импортировать из нового модуля, ре-экспортировать для совместимости)
- Modify: `apps/web/src/screens/setup/positionRules.ts` (импорт `PositionState` и `activeStep` — из `./setupState`)

**Interfaces:**
- Consumes: ничего нового.
- Produces (все с теми же сигнатурами, что сейчас в `SetupScreen.tsx`):

```ts
export type Num = number | '';
export type LockedFields = Partial<Record<ArticleErpField, true>>;
export interface PositionState { /* поля без изменений */ }
export interface OrderState { key: string; orderId: string; colorIndex: number; positions: PositionState[]; }
export interface PersistedSetup { vehicle: Vehicle; orders: OrderState[]; }
export const SETUP_STORAGE_KEY = 'ladungsplaner.setup';
export function emptyPosition(): PositionState;
export function emptyOrder(n: number, colorIndex?: number): OrderState;
export function nextOrderNumber(os: OrderState[]): number;
export function nextColorIndex(os: OrderState[]): number;
export function numOr0(v: Num): number;
export function dimsComplete(p: PositionState): boolean;
export function activeStep(p: PositionState): Num;
export function activeStepField(p: PositionState): 'nestStepPairwise' | 'nestStepSequential';
export function toCargo(p: PositionState, orderId: string): CargoType;
export function buildOrderColors(os: OrderState[]): Record<string, number>;
export function lockedFieldsFrom(fields: readonly ArticleErpField[]): LockedFields;
export function applySuggestion(s: ArticleSuggestion): Partial<PositionState>;
export function loadSetup(): PersistedSetup | null;
export function saveSetup(s: PersistedSetup): void;
```

- [ ] **Step 1: Написать падающий тест `setupState.test.ts`**

Покрываются ровно те инварианты, которые сегодня объяснены длинными комментариями в
`SetupScreen.tsx` и держатся только на них.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SETUP_STORAGE_KEY, emptyOrder, emptyPosition, loadSetup, nextColorIndex, nextOrderNumber, toCargo,
} from './setupState';

describe('nextOrderNumber', () => {
  it('is the highest SO-n plus one, so a deletion frees no number', () => {
    const os = [emptyOrder(1), emptyOrder(2)];
    expect(nextOrderNumber([os[1]])).toBe(3);
  });
  it('ignores orders renamed away from SO-n', () => {
    expect(nextOrderNumber([{ ...emptyOrder(1), orderId: 'AB-77' }])).toBe(1);
  });
});

describe('nextColorIndex', () => {
  it('is the lowest free slot, independent of the order id', () => {
    const renamed = { ...emptyOrder(1), orderId: 'AB-77', colorIndex: 0 };
    expect(nextColorIndex([renamed])).toBe(1);
  });
});

describe('toCargo', () => {
  it('drops nesting when the step is missing, even in verschachtelt', () => {
    const p = { ...emptyPosition(), height: 100, state: 'verschachtelt' as const, nestStepPairwise: '' as const };
    expect(toCargo(p, 'SO-1').nesting).toEqual({ nestable: false });
  });
  it('keeps forkAxis only for two-sided access', () => {
    const p = { ...emptyPosition(), forkAccess: 'twoSides' as const, forkAxis: 'width' as const };
    expect(toCargo(p, 'SO-1')).toMatchObject({ forkAccess: 'twoSides', forkAxis: 'width' });
    expect(toCargo(emptyPosition(), 'SO-1')).not.toHaveProperty('forkAxis');
  });
});

describe('loadSetup', () => {
  beforeEach(() => globalThis.localStorage?.clear());

  it('migrates a legacy draft that carries a single stepHeight', () => {
    const legacy = {
      vehicle: { id: 'v', name: 'v', length: 1, width: 1, height: 1 },
      orders: [{ key: 'k', orderId: 'SO-1', positions: [{ ...emptyPosition(), nestingMode: 'sequential', stepHeight: 120 }] }],
    };
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(legacy));
    const p = loadSetup()!.orders[0].positions[0];
    expect(p.nestStepSequential).toBe(120);
    expect(p).not.toHaveProperty('stepHeight');
  });

  it('backfills colorIndex by list position for drafts saved before stable colours', () => {
    const draft = {
      vehicle: { id: 'v', name: 'v', length: 1, width: 1, height: 1 },
      orders: [
        { key: 'a', orderId: 'SO-1', positions: [emptyPosition()] },
        { key: 'b', orderId: 'SO-2', positions: [emptyPosition()] },
      ],
    };
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(draft));
    expect(loadSetup()!.orders.map((o) => o.colorIndex)).toEqual([0, 1]);
  });

  it('returns null on a corrupt draft instead of throwing', () => {
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, '{not json');
    expect(loadSetup()).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- setupState`
Ожидаемо: FAIL, `Failed to resolve import "./setupState"`.

- [ ] **Step 3: Перенести код**

Вырезать из `apps/web/src/screens/SetupScreen.tsx` строки 36–303 (от `// ---- state model ----` до
конца `applySuggestion`), кроме `keepsArmed` и `ARM_TIMEOUT_MS` — они про UI и остаются на месте.
Вставить в `apps/web/src/screens/setup/setupState.ts` **дословно, вместе со всеми комментариями**:
они объясняют инварианты (`nextColorIndex` против переименованного заказа, `applySuggestion` против
провенанса ADR 022) и без них правки будут ошибочны. Добавить в начало файла:

```ts
// Состояние экрана «Настройка» без DOM (LKWkalk-5nb): типы, умолчания, персистентность, сборка
// CargoType. Извлечено из SetupScreen.tsx дословно — поведение не менялось.
import type { CargoType, NestingMode, NestingState, RotationRule, ForkAccess, ForkAxis, Vehicle } from '@shadrin-v/engine';
import type { ArticleErpField } from '@shadrin-v/contracts';
import type { ArticleSuggestion } from '../components/ArticleCombobox';
```

- [ ] **Step 4: Починить импорты в `SetupScreen.tsx`**

Заменить вырезанное на импорт и ре-экспорт (существующие тесты импортируют `PositionState`,
`applySuggestion`, `lockedFieldsFrom`, `toCargo`, `activeStep` из `./SetupScreen` — ре-экспорт
оставляет их зелёными без правки):

```ts
import {
  activeStep, activeStepField, applySuggestion, buildOrderColors, dimsComplete, emptyOrder,
  emptyPosition, loadSetup, lockedFieldsFrom, nextColorIndex, nextOrderNumber, numOr0, saveSetup,
  SETUP_STORAGE_KEY, toCargo,
  type LockedFields, type Num, type OrderState, type PersistedSetup, type PositionState,
} from './setup/setupState';

export {
  activeStep, applySuggestion, lockedFieldsFrom, toCargo,
  type LockedFields, type OrderState, type PositionState,
};
```

- [ ] **Step 5: Переключить `positionRules.ts` на новый модуль**

```ts
import type { PositionState } from './setupState';
import { activeStep } from './setupState';
```

- [ ] **Step 6: Прогнать тесты и типы**

```bash
npm test -- setupState positionRules SetupScreen
npm run typecheck
```
Ожидаемо: PASS. `SetupScreen.test.tsx` не правился и обязан остаться зелёным — это и есть
доказательство, что переезд дословный. Помнить про флейк `w9j`: до 3 падений в `SetupScreen`
проверить на мерж-базе, прежде чем считать регрессией.

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/screens/setup/setupState.ts apps/web/src/screens/setup/setupState.test.ts \
        apps/web/src/screens/setup/positionRules.ts apps/web/src/screens/SetupScreen.tsx
git commit -m "refactor(setup): extract DOM-free setup state into setupState.ts (5nb)"
```

---

### Task 3: Худая строка позиции `PositionRow.tsx`

**Files:**
- Create: `apps/web/src/screens/setup/PositionRow.tsx`
- Create: `apps/web/src/screens/setup/PositionRow.test.tsx`
- Modify: `packages/i18n/src/keys.ts`, `dictionaries/{de,ru}.ts` (ключ заголовка колонки «Regeln»)

**Interfaces:**
- Consumes: `ruleChip` (Task 1), `PositionState`/`activeStep`/`dimsComplete`/`toCargo` (Task 2),
  `ArticleCombobox`, `ArmedDelete`, `Measure`, `InfoHint` из `../../ui/primitives`,
  `OrderSwatch` из `../../lib/swatch`, `computeStack` из `@shadrin-v/engine`.
- Produces:

```ts
export interface PositionRowProps {
  position: PositionState;
  index: number;            // палитра заказа
  vehicle: Vehicle;
  selected: boolean;
  tt: (k: TranslationKey) => string;
  onSelect: () => void;     // клик по чипу — выбрать строку и открыть панель
  onChange: (patch: Partial<PositionState>) => void;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
  /** Регистрируют чип и поле имени в картах родителя: чип нужен Task 6 (возврат фокуса при
   *  закрытии drawer), поле имени — Task 7 (фокус на соседнюю строку после удаления). Объявлены
   *  здесь сразу, чтобы поздние задачи не меняли интерфейс компонента.
   *  ВНИМАНИЕ: `nameRef` доедет до `<input>` только после того, как Task 7 добавит
   *  `ArticleCombobox` необязательный проп `inputRef` — сегодня компонент ref не принимает.
   *  В Task 3 проп объявляется и прокидывается, но до Task 7 никуда не крепится. */
  chipRef?: (el: HTMLButtonElement | null) => void;
  nameRef?: (el: HTMLInputElement | null) => void;
}
export function PositionRow(props: PositionRowProps): JSX.Element;
```

- [ ] **Step 1: Добавить ключ заголовка колонки**

`keys.ts`: `'setup.col.rules',`. `de.ts`: `'setup.col.rules': 'Regeln',`. `ru.ts`:
`'setup.col.rules': 'Правила',`. Затем `npm run build -w @shadrin-v/i18n`.

- [ ] **Step 2: Написать падающий тест `PositionRow.test.tsx`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { PositionRow } from './PositionRow';
import { emptyPosition, type PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

function renderRow(over: Partial<PositionState> = {}, props: Partial<Parameters<typeof PositionRow>[0]> = {}) {
  const onSelect = vi.fn();
  const onChange = vi.fn();
  render(
    <LocaleProvider initial="de">
      <PositionRow
        position={{ ...emptyPosition(), name: 'Gestell A', length: 2400, width: 1000, height: 1900, ...over }}
        index={0} vehicle={vehicle} selected={false} tt={(k) => k as string}
        onSelect={onSelect} onChange={onChange} armed={false} onArm={() => {}} onRemove={() => {}}
        {...props}
      />
    </LocaleProvider>,
  );
  return { onSelect, onChange };
}

describe('PositionRow', () => {
  it('shows the plain stacking chip and the units per stack', () => {
    renderRow();
    const chip = screen.getByTestId('rule-chip');
    expect(chip).toHaveTextContent('Stapel');
    expect(chip).toHaveTextContent('1');           // 2700 / 1900 → 1
  });

  it('names the nesting step on the chip', () => {
    renderRow({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120 });
    expect(screen.getByTestId('rule-chip')).toHaveTextContent('120');
  });

  it('omits the count while dimensions are incomplete', () => {
    renderRow({ height: '' });
    expect(screen.getByTestId('rule-chip')).not.toHaveTextContent('0');
  });

  it('selects the position when the chip is pressed', async () => {
    const { onSelect } = renderRow();
    await userEvent.click(screen.getByTestId('rule-chip'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('no longer renders the orientation select or the state toggle', () => {
    renderRow();
    expect(screen.queryByRole('combobox', { name: 'cargoType.orientation.label' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'cargoType.nesting.label' })).toBeNull();
  });

  it('has no hardcoded English label left', () => {
    renderRow();
    expect(screen.queryByLabelText('details')).toBeNull();
  });
});
```

- [ ] **Step 3: Прогнать тест и убедиться, что он падает**

Run: `npm test -- PositionRow`
Ожидаемо: FAIL, `Failed to resolve import "./PositionRow"`.

- [ ] **Step 4: Написать `PositionRow.tsx`**

```tsx
// Строка позиции (LKWkalk-5nb, спека §2): только то, что вбивается руками, плюс чип правил.
// Правила, объяснение расчёта и каталог живут в RulesPanel — сюда они не возвращаются.
import { computeStack, type StackPreview, type Vehicle } from '@shadrin-v/engine';
import type { TranslationKey } from '@shadrin-v/i18n';
import { ArticleCombobox } from '../components/ArticleCombobox';
import { ArmedDelete } from '../components/ArmedDelete';
import { fillTemplate, stepInvalid } from '../components/stackFormula';
import { Measure, InfoHint } from '../../ui/primitives';
import { OrderSwatch } from '../../lib/swatch';
import { ruleChip } from './positionRules';
import { activeStep, applySuggestion, dimsComplete, toCargo, type PositionState } from './setupState';

export interface PositionRowProps {
  position: PositionState;
  index: number;
  vehicle: Vehicle;
  selected: boolean;
  tt: (k: TranslationKey) => string;
  onSelect: () => void;
  onChange: (patch: Partial<PositionState>) => void;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
}

export function PositionRow({
  position: p, index, vehicle, selected, tt, onSelect, onChange, armed, onArm, onRemove,
}: PositionRowProps) {
  const invalid = stepInvalid(p.state, activeStep(p), p.height);
  let preview: StackPreview | null = null;
  if (dimsComplete(p) && !invalid) {
    try {
      preview = computeStack(toCargo(p, 'preview'), vehicle);
    } catch {
      preview = null;
    }
  }
  const chip = ruleChip(p, preview);
  const lockedHint = fillTemplate(tt('article.lockedHint'), { code: p.articleCode ?? '' });

  return (
    <div className={`flex min-w-0 items-center gap-1.5 px-4 py-2.5 ${selected ? 'bg-sub' : ''}`}>
      <OrderSwatch index={index} width={12} height={26} />
      <span className="inline-flex w-64 shrink-0 items-center gap-1">
        <ArticleCombobox
          ariaLabel={tt('article.label')}
          value={p.name}
          onChange={(name) =>
            onChange({
              name,
              articleCode: undefined,
              locked: {},
              unboundFromErp:
                p.unboundFromErp ??
                (p.articleCode && p.locked?.name ? { itemCode: p.articleCode, name: p.name } : undefined),
            })
          }
          onPick={(s) => {
            onChange(applySuggestion(s));
            onSelect(); // правила подхваченного артикула стоит показать сразу
          }}
          className="w-full"
        />
        {p.locked?.name && <InfoHint ariaLabel={tt('article.label')} text={lockedHint} />}
      </span>
      <span className="w-24"><Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length })} readOnly={!!p.locked?.length} /></span>
      <span className="w-24"><Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width })} readOnly={!!p.locked?.width} /></span>
      <span className="w-24"><Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height })} readOnly={!!p.locked?.height} /></span>
      <span className="w-20"><Measure ariaLabel={tt('field.quantity')} unit="×" value={p.quantity} onChange={(quantity) => onChange({ quantity })} align="left" /></span>

      <button
        type="button"
        data-testid="rule-chip"
        aria-pressed={selected}
        onClick={onSelect}
        className={`ml-auto inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-caption transition-colors ${
          invalid ? 'border-danger text-danger'
            : selected ? 'border-brand text-brand' : 'border-line bg-sub text-muted hover:border-brand hover:text-brand'
        }`}
      >
        <span>{fillTemplate(tt(chip.text.key), chip.text.vars)}</span>
        {chip.restricted && <span aria-label={tt('setup.chip.restricted')}>⊘</span>}
        {chip.count !== null && (
          <span className="font-semibold tabular-nums text-ink" aria-label={fillTemplate(tt('setup.chip.perStack'), { count: chip.count })}>
            ↕ {chip.count}
          </span>
        )}
      </button>

      <ArmedDelete
        armed={armed}
        onArm={onArm}
        onConfirm={onRemove}
        label={tt('setup.deletePosition')}
        confirmLabel={tt('action.confirmDelete')}
      />
    </div>
  );
}
```

- [ ] **Step 5: Прогнать тесты и типы**

```bash
npm test -- PositionRow
npm run typecheck
```
Ожидаемо: PASS.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/setup/PositionRow.tsx apps/web/src/screens/setup/PositionRow.test.tsx \
        packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(setup): slim position row with a rule chip (5nb)"
```

---

### Task 4: Панель разбора `RulesPanel.tsx`

**Files:**
- Create: `apps/web/src/screens/setup/RulesPanel.tsx`
- Create: `apps/web/src/screens/setup/RulesPanel.test.tsx`
- Modify: `packages/i18n/src/keys.ts`, `dictionaries/{de,ru}.ts`

**Interfaces:**
- Consumes: `ruleSentences` (Task 1), `PositionState`/`activeStep`/`activeStepField`/`toCargo`/
  `dimsComplete`/`lockedFieldsFrom` (Task 2), `StackDiagram`, `formulaKey`/`formulaVars`/
  `fillTemplate`/`stepInvalid`, `ORIENTATION_CHOICES`/`orientationChoiceOf`/`orientationFieldsFor`,
  `formatLength` из `@shadrin-v/i18n`.
- Produces:

```ts
export interface RulesPanelProps {
  position: PositionState | null;   // null — ничего не выбрано
  orderId: string | null;
  index: number;
  vehicle: Vehicle;
  locale: Locale;
  tt: (k: TranslationKey) => string;
  onChange: (patch: Partial<PositionState>) => void;
  onSaveArticle: () => Promise<Article | undefined>;
  onClose?: () => void;             // задан только в режиме drawer (Task 6)
}
export function RulesPanel(props: RulesPanelProps): JSX.Element;
```

- [ ] **Step 1: Добавить ключи блоков панели**

`keys.ts`: `'setup.panel.rules',` `'setup.panel.calc',` `'setup.panel.catalogue',`
`'setup.panel.empty',` `'setup.panel.close',`.

`de.ts`:
```ts
  'setup.panel.rules': 'Regeln',
  'setup.panel.calc': 'So wird gerechnet',
  'setup.panel.catalogue': 'Katalog',
  'setup.panel.empty': 'Position auswählen, um ihre Regeln zu sehen.',
  'setup.panel.close': 'Regeln schließen',
```
`ru.ts`:
```ts
  'setup.panel.rules': 'Правила',
  'setup.panel.calc': 'Как это считается',
  'setup.panel.catalogue': 'Каталог',
  'setup.panel.empty': 'Выберите позицию, чтобы увидеть её правила.',
  'setup.panel.close': 'Закрыть правила',
```
Затем `npm run build -w @shadrin-v/i18n`.

- [ ] **Step 2: Написать падающий тест `RulesPanel.test.tsx`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { RulesPanel } from './RulesPanel';
import { emptyPosition, type PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

function renderPanel(position: PositionState | null, onChange = vi.fn()) {
  render(
    <LocaleProvider initial="ru">
      <RulesPanel
        position={position} orderId={position ? 'SO-1' : null} index={0} vehicle={vehicle}
        locale="ru" tt={(k) => k as string} onChange={onChange}
        onSaveArticle={async () => undefined}
      />
    </LocaleProvider>,
  );
  return onChange;
}

const nested = (): PositionState => ({
  ...emptyPosition(), name: 'Gestell A', length: 2400, width: 1000, height: 1900,
  state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120,
});

describe('RulesPanel', () => {
  it('shows the empty hint when nothing is selected', () => {
    renderPanel(null);
    expect(screen.getByText('setup.panel.empty')).toBeInTheDocument();
  });

  it('explains sequential nesting in words, not only as a formula', () => {
    renderPanel(nested());
    expect(screen.getByTestId('rule-sentences')).toHaveTextContent('setup.rule.sequential');
  });

  it('states the orientation as a sentence', () => {
    renderPanel({ ...nested(), rotation: 'none' });
    expect(screen.getByTestId('rule-sentences')).toHaveTextContent('setup.rule.orientFixed');
  });

  it('edits the nesting step through the panel', async () => {
    const onChange = renderPanel(nested());
    const step = screen.getByLabelText('cargoType.nesting.stepHeightSeq');
    await userEvent.clear(step);
    await userEvent.type(step, '80');
    expect(onChange).toHaveBeenCalledWith({ nestStepSequential: 80 });
  });

  it('switches orientation through the panel', async () => {
    const onChange = renderPanel(nested());
    await userEvent.selectOptions(screen.getByLabelText('cargoType.orientation.label'), 'fixed');
    expect(onChange).toHaveBeenCalledWith({ rotation: 'none', forkAccess: 'all4' });
  });

  it('formats the stack height through formatLength, never a hardcoded unit', () => {
    renderPanel(nested());
    expect(screen.getByTestId('stack-result')).toHaveTextContent('мм');
    expect(screen.getByTestId('stack-result')).not.toHaveTextContent('mm');
  });
});
```

- [ ] **Step 3: Прогнать тест и убедиться, что он падает**

Run: `npm test -- RulesPanel`
Ожидаемо: FAIL, `Failed to resolve import "./RulesPanel"`.

- [ ] **Step 4: Написать `RulesPanel.tsx`**

Панель состоит из четырёх частей; всё содержимое — перенос нынешнего раскрывающегося блока из
`SetupScreen.tsx`: это JSX внутри `{open && (…)}` в самом конце функции `PositionRow`, от
`<div className="mt-2 flex flex-col gap-3 border-t border-dashed …">` до конца файла. Номера строк
не привожу: Task 2 уже сдвинул их примерно на 270 вверх. Плюс новая секция фраз. Каркас:

```tsx
// Панель разбора позиции (LKWkalk-5nb, спека §4): правила редактируются здесь и только здесь.
import { useState } from 'react';
import { computeStack, FORK_AXES, type StackPreview, type Vehicle } from '@shadrin-v/engine';
import type { Article } from '@shadrin-v/contracts';   // НЕ из engine — каталог живёт в контрактах
import { formatLength, type Locale, type TranslationKey } from '@shadrin-v/i18n';
import { StackDiagram } from '../components/StackDiagram';
import { fillTemplate, formulaKey, formulaVars, stepInvalid } from '../components/stackFormula';
import { ORIENTATION_CHOICES, orientationChoiceOf, orientationFieldsFor, type OrientationChoice } from '../components/orientationChoice';
import { Measure, Segmented, Select, Button, InfoHint } from '../../ui/primitives';
import { orderColorToken } from '../../lib/orderColor';
import { ruleSentences } from './positionRules';
import { activeStep, activeStepField, dimsComplete, lockedFieldsFrom, toCargo, type PositionState } from './setupState';

export function RulesPanel({ position: p, orderId, index, vehicle, locale, tt, onChange, onSaveArticle, onClose }: RulesPanelProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!p) {
    return (
      <aside className="rounded-card bg-card p-4 shadow-card">
        <p className="text-caption text-muted">{tt('setup.panel.empty')}</p>
      </aside>
    );
  }
  const invalid = stepInvalid(p.state, activeStep(p), p.height);
  let preview: StackPreview | null = null;
  if (dimsComplete(p) && !invalid) {
    try { preview = computeStack(toCargo(p, 'preview'), vehicle); } catch { preview = null; }
  }
  // …далее четыре секции…
}
```

Секции по порядку:

1. **Шапка** — `OrderSwatch`, имя позиции, `orderId`, и — если задан `onClose` — кнопка закрытия с
   `aria-label={tt('setup.panel.close')}`.
2. **`setup.panel.rules`** — `Segmented` Ent/Ver (перенос из строки, `ariaLabel={tt('cargoType.nesting.label')}`),
   при `verschachtelt` — `Select` режима, `Measure` шага (`invalid={invalid}`), `Measure` макс.
   вложений, чекбокс `allowUnpairedTop` при `pairwise`; затем `Measure` макс. ярусов, `Select`
   ориентации по `ORIENTATION_CHOICES`, при `twoSided` — `Select` оси по `FORK_AXES` и `InfoHint`
   с `cargoType.orientation.twoSidedHint`. Обработчики — ровно те же, что в старом коде.
3. **`setup.panel.calc`** — `<div data-testid="rule-sentences">` со списком
   `ruleSentences(p, preview).map(s => fillTemplate(tt(s.key), s.vars))`; ниже — прежняя формула и
   `StackDiagram`. Результат:

```tsx
<div data-testid="stack-result" className="text-caption text-muted">
  {fillTemplate(tt('stack.result'), { count: preview.count, height: formatLength(preview.height, locale) })}
</div>
```

   Именно `formatLength`, а не `` `${preview.height} mm` `` — это закрывает пункт 2 `LKWkalk-5gi`.
4. **`setup.panel.catalogue`** — кнопка `article.save`/`article.update` с прежним условием
   `saveDisabled`, обработка ошибки в `saveError`, заметка `article.renameInErp` при
   `p.unboundFromErp`. Логика `handleSaveArticle` переносится дословно, включая привязку строки к
   сохранённому артикулу через `lockedFieldsFrom(saved.erpFields)`.

- [ ] **Step 5: Прогнать тесты и типы**

```bash
npm test -- RulesPanel
npm run typecheck
```
Ожидаемо: PASS.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/setup/RulesPanel.tsx apps/web/src/screens/setup/RulesPanel.test.tsx \
        packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(setup): rules panel with plain-language explanations (5nb)"
```

---

### Task 5: Собрать экран в две колонки

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx`
- Create: `apps/web/src/screens/setup/OrderCard.tsx`
- Modify: `apps/web/src/screens/SetupScreen.test.tsx` (правятся только сценарии, завязанные на
  исчезнувшие контролы)

**Interfaces:**
- Consumes: `PositionRow` (Task 3), `RulesPanel` (Task 4).
- Produces:

```ts
/** Какая строка разбирается в панели. Не персистится — состояние вида, не содержимое плана. */
interface Selection { orderKey: string; positionId: string }
```

- [ ] **Step 1: Написать падающий тест — добавить в `SetupScreen.test.tsx`**

```ts
it('opens the rules panel for the position whose chip was pressed', async () => {
  renderSetup(() => {});
  await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
  expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
});

it('keeps the panel on the selected position while another row is edited', async () => {
  renderSetup(() => {});
  await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
  await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
  expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
});

it('does not persist the selection across a remount', async () => {
  const { unmount } = renderSetup(() => {});
  await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
  unmount();
  renderSetup(() => {});
  expect(screen.getByText('Position auswählen, um ihre Regeln zu sehen.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npm test -- SetupScreen`
Ожидаемо: FAIL — `rule-chip` в экране ещё нет.

- [ ] **Step 3: Вынести `OrderCard.tsx`**

Перенести компонент `OrderCard` из `SetupScreen.tsx` в `apps/web/src/screens/setup/OrderCard.tsx`.
Изменения против старого: рендерит `PositionRow` вместо внутреннего, прокидывает `selectedId`,
`onSelectPosition`; строка заголовков колонок теряет `hidden xl:` (спека §2: заголовки видны всегда)
и получает шестую колонку `{tt('setup.col.rules')}`; аккордеон `openId` удаляется целиком — его
роль перешла к выбору строки.

- [ ] **Step 4: Ввести выбор и раскладку в `SetupScreen.tsx`**

```tsx
const [selection, setSelection] = useState<Selection | null>(null);
const selectedOrder = orders.find((o) => o.key === selection?.orderKey) ?? null;
const selectedPosition = selectedOrder?.positions.find((p) => p.id === selection?.positionId) ?? null;
// Выбор мог указывать на удалённую строку — тогда панель показывает пустое состояние, а не падает.
```

Раскладка вместо нынешнего одноколоночного `<div className="flex flex-col gap-4">`:

```tsx
<div className="flex flex-col gap-4 xl:flex-row xl:items-start">
  <div className="flex min-w-0 flex-1 flex-col gap-4">{/* карточки заказов */}</div>
  <div className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[20rem]">
    <RulesPanel
      position={selectedPosition}
      orderId={selectedOrder?.orderId ?? null}
      index={selectedOrder?.colorIndex ?? 0}
      vehicle={vehicle}
      locale={locale}
      tt={tt}
      onChange={(patch) => selection && patchPosition(selection.orderKey, selection.positionId, patch)}
      onSaveArticle={() => (selectedPosition ? saveArticle(selectedPosition) : Promise.resolve(undefined))}
    />
  </div>
</div>
```

`xl:w-[20rem]` — это ≈320 px из спеки §7; порог `xl` = 1280 px там же.

- [ ] **Step 5: Починить сценарии старых тестов**

В `SetupScreen.test.tsx` сценарии, которые кликали `aria-label="details"` или меняли ориентацию
прямо в строке, переписать на «нажать чип → работать в панели». Сценарии демо, каскадного удаления,
стабильных цветов и замков ERP **не трогать** — они обязаны пройти как есть.

- [ ] **Step 6: Прогнать фронт целиком и типы**

```bash
npm test -- apps/web packages
npm run typecheck && npm run lint
```
Ожидаемо: PASS, кроме известного флейка `w9j` — сверить с мерж-базой.

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/setup/OrderCard.tsx apps/web/src/screens/SetupScreen.test.tsx
git commit -m "feat(setup): master-detail layout with a persistent rules panel (5nb)"
```

---

### Task 6: Панель как drawer на узком экране

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx`
- Modify: `apps/web/src/screens/setup/RulesPanel.tsx` (кнопка закрытия уже предусмотрена `onClose`)
- Create: `apps/web/src/screens/setup/useIsWide.ts`
- Create: `apps/web/src/screens/setup/useIsWide.test.ts`

**Interfaces:**
- Produces: `export function useIsWide(): boolean` — `true` при `matchMedia('(min-width: 1280px)')`.

- [ ] **Step 1: Написать падающий тест `useIsWide.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsWide } from './useIsWide';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches, media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  return listeners;
}
afterEach(() => vi.unstubAllGlobals());

describe('useIsWide', () => {
  it('is true above the two-column threshold', () => {
    stubMatchMedia(true);
    expect(renderHook(() => useIsWide()).result.current).toBe(true);
  });
  it('is false below it', () => {
    stubMatchMedia(false);
    expect(renderHook(() => useIsWide()).result.current).toBe(false);
  });
  it('drops its listener on unmount', () => {
    const listeners = stubMatchMedia(true);
    renderHook(() => useIsWide()).unmount();
    expect(listeners.size).toBe(0);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npm test -- useIsWide`
Ожидаемо: FAIL, модуля нет.

- [ ] **Step 3: Написать `useIsWide.ts`**

```ts
// Порог двух колонок (спека §7): xl = 1280 px. Выше — панель колонкой, ниже — drawer.
import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1280px)';

export function useIsWide(): boolean {
  const [wide, setWide] = useState(() => globalThis.matchMedia?.(QUERY).matches ?? true);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}
```

- [ ] **Step 4: Написать падающий тест drawer — в `SetupScreen.test.tsx`**

```ts
it('closes the narrow-screen drawer on Escape and returns focus to the chip', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
  renderSetup(() => {});
  const chip = screen.getAllByTestId('rule-chip')[0];
  await userEvent.click(chip);
  expect(screen.getByRole('dialog', { name: 'Regeln' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(chip).toHaveFocus();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 5: Прогнать и убедиться, что падает**

Run: `npm test -- SetupScreen`
Ожидаемо: FAIL — `dialog` не рендерится.

- [ ] **Step 6: Развести два режима в `SetupScreen.tsx`**

```tsx
const wide = useIsWide();
const chipRefs = useRef(new Map<string, HTMLButtonElement>());   // positionId → чип, для возврата фокуса
const closePanel = () => {
  const id = selection?.positionId;
  setSelection(null);
  if (id) chipRefs.current.get(id)?.focus();
};
```

При `wide` — колонка как в Task 5. Иначе — оверлей поверх списка:

```tsx
{!wide && selectedPosition && (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={tt('setup.panel.rules')}
    className="fixed inset-y-0 right-0 z-30 w-full max-w-sm overflow-y-auto bg-card shadow-pop"
    onKeyDown={(e) => { if (e.key === 'Escape') closePanel(); }}
  >
    <RulesPanel /* …те же пропсы… */ onClose={closePanel} />
  </div>
)}
```

`PositionRow` получает `chipRef` и кладёт себя в карту по `p.id`; при закрытии фокус возвращается на
чип, с которого панель открыли, — иначе клавиатурный пользователь остаётся в `<body>` (та же ошибка,
что чинили в `LKWkalk-yxn`).

- [ ] **Step 7: Прогнать фронт и типы**

```bash
npm test -- apps/web packages
npm run typecheck && npm run lint
```
Ожидаемо: PASS (кроме флейка `w9j`).

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/screens/setup/useIsWide.ts apps/web/src/screens/setup/useIsWide.test.ts \
        apps/web/src/screens/setup/PositionRow.tsx apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx
git commit -m "feat(setup): rules panel becomes a drawer below the two-column threshold (5nb)"
```

---

### Task 7: Фокус после удаления позиции (`LKWkalk-78x`)

Сегодня любой исход удаления уводит фокус на «+ Auftrag hinzufügen» — наружу из карточки, в которой
работал пользователь. Раньше это был единственный контрол, переживающий все три исхода; теперь
исходы можно различить.

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx`
- Modify: `apps/web/src/screens/setup/PositionRow.tsx`
- Modify: `apps/web/src/screens/components/ArticleCombobox.tsx` (только новый необязательный проп)
- Modify: `apps/web/src/screens/SetupScreen.test.tsx`

- [ ] **Step 0: Дать `ArticleCombobox` необязательный `inputRef`**

Компонент сегодня ref не принимает, а фокус после удаления должен попасть именно в поле артикула
соседней строки. Это трёхстрочное дополнение, а не переписывание (a11y-долг `LKWkalk-0il` остаётся
отдельной задачей и здесь не трогается):

```tsx
export function ArticleCombobox({ value, onChange, onPick, ariaLabel, className = '', inputRef }: {
  // …прежние пропсы…
  /** Наружу — сам <input>, чтобы родитель мог вернуть в него фокус (LKWkalk-78x). */
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
```
и на самом `<input>`: `ref={inputRef}`.

`PositionRow` прокидывает свой `nameRef` в этот проп.

- [ ] **Step 1: Написать падающий тест**

```ts
it('after deleting a position focus lands on the next row of the same order', async () => {
  renderSetup(() => {});
  await userEvent.click(screen.getByLabelText('Position hinzufügen'));   // вторая позиция в SO-1
  const rows = screen.getAllByLabelText('Artikel');
  await userEvent.click(screen.getAllByLabelText('Position aus der Berechnung nehmen')[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));
  expect(rows[1]).toHaveFocus();
});

it('after deleting the last position of an order focus lands on add-order', async () => {
  renderSetup(() => {});
  await userEvent.click(screen.getAllByLabelText('Position aus der Berechnung nehmen')[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));
  expect(screen.getAllByRole('button', { name: /Auftrag hinzufügen/ })[0]).toHaveFocus();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npm test -- SetupScreen`
Ожидаемо: FAIL на первом тесте — фокус на «+ Auftrag».

- [ ] **Step 3: Различить исходы в `removePosition`**

```tsx
const removePosition = (okey: string, pid: string) => {
  setArmed(null);
  if (selection?.positionId === pid) setSelection(null);  // панель не должна разбирать удалённое
  const order = orders.find((o) => o.key === okey);
  const i = order?.positions.findIndex((p) => p.id === pid) ?? -1;
  // Соседняя строка: следующая, а если удаляли последнюю — предыдущая. Обе внутри той же карточки,
  // в отличие от «+ Auftrag», куда фокус уезжал раньше (LKWkalk-78x).
  const neighbour = order && order.positions.length > 1
    ? (order.positions[i + 1] ?? order.positions[i - 1])
    : undefined;
  setOrders(/* …как сейчас… */);
  if (neighbour) nameRefs.current.get(neighbour.id)?.focus();
  else addOrderRef.current?.focus();
};
```

`nameRefs` — такая же карта `positionId → HTMLInputElement`, как `chipRefs` в Task 6; заполняется
`PositionRow` через проп `nameRef`.

- [ ] **Step 4: Прогнать фронт и типы**

```bash
npm test -- apps/web packages
npm run typecheck && npm run lint
```
Ожидаемо: PASS (кроме флейка `w9j`).

- [ ] **Step 5: Коммит и закрытие задач**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/setup/PositionRow.tsx apps/web/src/screens/SetupScreen.test.tsx
git commit -m "fix(setup): keep focus inside the order card after deleting a position (78x)"
bd close LKWkalk-78x --reason "Фокус после удаления позиции уходит на соседнюю строку той же карточки; на «+ Auftrag» — только когда заказ исчез целиком."
```

---

## Проверка перед мержем

- [ ] `npm run typecheck && npm run lint && npm test` — зелено, кроме известных `apps/server`
      (`better-sqlite3` под чужой `NODE_MODULE_VERSION`, в CI зелено) и флейка `w9j`.
- [ ] Ручная проверка в настоящем Chrome: чип открывает панель; правка правил в панели меняет чип и
      схему; на 1200 px панель становится drawer и закрывается по `Esc` с возвратом фокуса.
- [ ] `grep -rn 'aria-label="' apps/web/src/screens/setup` — ни одного литерала.
- [ ] `grep -rn "' mm'\|\" mm\"" apps/web/src` — пусто.
- [ ] `bd close LKWkalk-5gi` — пункты 1 и 3 закрыты этапом 1; пункт 2 (` mm`) закрыт в Task 4.
- [ ] Мерж в `main` = выкладка на прод (ADR 023). Проверить live по смене маркера сборки:
      `curl -s https://ladungsplaner.holz-schaefer.de/ | grep -o '/assets/[^"]*\.js'`.
