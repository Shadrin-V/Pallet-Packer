# Deep-link импорта заказа (`?order=SO-####`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** открытие `/?order=SO-1234` добавляет импортированный из ERPNext заказ в черновик экрана
«Настройка»; ссылка срабатывает один раз, неудача не мешает работать.

**Architecture:** импорт живёт внутри `SetupScreen` — экран уже держит `useOptionalDataProvider()` и
владеет состоянием `orders`, а `initialOrders` засеять ответом сети нельзя (ленивый `useState`
читается один раз при монтировании). Три слоя: чистый разбор URL (`setup/orderDeepLink.ts`), чистое
отображение зоны в состояние (`orderStateFromZone` в `setup/setupState.ts`), и эффект монтирования в
`SetupScreen`, который их связывает. Серверная часть не трогается.

**Tech Stack:** TypeScript, React 18, vitest + @testing-library/react (jsdom), Tailwind,
`@shadrin-v/i18n`.

## Global Constraints

- **Спека — `docs/superpowers/specs/2026-08-06-s17-order-deep-link-design.md`.** Она источник истины;
  расхождение решается в её пользу.
- **`apps/server` и `packages/*` не меняются.** Работа целиком в `apps/web`, плюс ключи локалей в
  `packages/i18n` (это единственное исключение — словари живут там).
- **Ни одной пользовательской строки в коде** — только ключи локалей (`de` и `ru`), CLAUDE.md §3.
  Действует eslint-правило `local/no-untranslated-text` (`eslint.config.js:23`).
- **Ссылка срабатывает ОДИН раз:** после успешного импорта `?order=` вычищается из URL через
  `history.replaceState`; заказ с уже присутствующим `orderId` повторно не импортируется. При ошибке
  `?order=` НЕ вычищается — F5 повторяет попытку.
- **Импорт ДОБАВЛЯЕТ заказ**, не заменяет черновик.
- **Габариты из ERPNext не лочатся** (`locked` не выставляется), `dimensionsSource` в состояние
  экрана не переносится.
- Все команды — из корня репозитория. У воркспейсов скрипта `test` нет; точечно —
  `npm test -- <путь>`. Гейты: `npm test` (сейчас 1141/1141, 87 файлов), `npm run typecheck`,
  `npm run lint`.
- Ветка: `feat/s17-order-deep-link` (уже создана, спека в ней закоммичена).

## File Structure

| Файл | Роль |
|---|---|
| `apps/web/src/screens/setup/orderDeepLink.ts` | НОВЫЙ. Чистый разбор адреса: `orderParam`, `urlWithoutOrderParam`. Без React и без DOM-глобалей — принимает строки, возвращает строки |
| `apps/web/src/screens/setup/orderDeepLink.test.ts` | НОВЫЙ. Тесты разбора |
| `apps/web/src/screens/setup/setupState.ts` | `orderStateFromZone(zone, colorIndex)` рядом с `emptyOrder`/`emptyPosition` |
| `apps/web/src/screens/setup/setupState.test.ts` | Тесты отображения зоны |
| `apps/web/src/screens/SetupScreen.tsx` | Эффект монтирования + состояние заметки + её разметка |
| `apps/web/src/screens/SetupScreen.deepLink.test.tsx` | НОВЫЙ. Сценарии deep-link с фейковым провайдером |
| `packages/i18n/src/keys.ts` | Три новых ключа |
| `packages/i18n/src/dictionaries/de.ts`, `ru.ts` | Их переводы |

Разбор URL вынесен отдельным модулем, а не спрятан в `SetupScreen`: это единственная часть, которую
можно проверить без рендера, и она же самая ошибкоопасная (сохранение прочих параметров, пустая
строка, отсутствие параметра).

---

### Task 1: Чистый слой — разбор адреса и отображение зоны

**Files:**
- Create: `apps/web/src/screens/setup/orderDeepLink.ts`
- Create: `apps/web/src/screens/setup/orderDeepLink.test.ts`
- Modify: `apps/web/src/screens/setup/setupState.ts` — после `emptyOrder` (строка ~127)
- Modify: `apps/web/src/screens/setup/setupState.test.ts` — добавить блок в конец

**Interfaces:**
- Consumes: `OrderZone`, `OrderPosition` из `@shadrin-v/contracts` (в `setupState.ts` уже есть импорт
  `ArticleErpField` оттуда — добавить типы к нему, а не заводить второй импорт); файловые `uid`,
  `emptyPosition`.
- Produces (использует задача 2):
  - `orderParam(search: string): string | null`
  - `urlWithoutOrderParam(href: string): string`
  - `orderStateFromZone(zone: OrderZone, colorIndex: number): OrderState`

- [ ] **Step 1: Написать тесты разбора адреса**

Создать `apps/web/src/screens/setup/orderDeepLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { orderParam, urlWithoutOrderParam } from './orderDeepLink';

describe('orderParam', () => {
  it('достаёт номер заказа', () => {
    expect(orderParam('?order=SO-1234')).toBe('SO-1234');
  });

  it('не путается в соседних параметрах и порядке', () => {
    expect(orderParam('?lang=de&order=SO-7&x=1')).toBe('SO-7');
  });

  it('пустое значение и отсутствие параметра дают null', () => {
    expect(orderParam('?order=')).toBeNull();
    expect(orderParam('?order=%20%20')).toBeNull(); // пробелы — не номер заказа
    expect(orderParam('?lang=de')).toBeNull();
    expect(orderParam('')).toBeNull();
  });

  it('обрезает пробелы по краям — ссылку могли скопировать с хвостом', () => {
    expect(orderParam('?order=%20SO-9%20')).toBe('SO-9');
  });
});

describe('urlWithoutOrderParam', () => {
  it('убирает order, сохраняя путь, прочие параметры и якорь', () => {
    expect(urlWithoutOrderParam('https://h.de/app?lang=de&order=SO-1#plan')).toBe(
      '/app?lang=de#plan',
    );
  });

  it('после удаления единственного параметра не оставляет висячего «?»', () => {
    expect(urlWithoutOrderParam('https://h.de/?order=SO-1')).toBe('/');
  });

  it('адрес без order возвращается как есть', () => {
    expect(urlWithoutOrderParam('https://h.de/?lang=de')).toBe('/?lang=de');
  });
});
```

- [ ] **Step 2: Прогнать — обязан упасть на отсутствии модуля**

Run: `npm test -- apps/web/src/screens/setup/orderDeepLink.test.ts`
Expected: FAIL, `Failed to resolve import "./orderDeepLink"`.

- [ ] **Step 3: Написать модуль**

Создать `apps/web/src/screens/setup/orderDeepLink.ts`:

```ts
// Разбор адреса для deep-link импорта заказа (LKWkalk-s17). Отдельно от SetupScreen и без обращения
// к глобалям: принимает строки, возвращает строки — единственная часть механизма, проверяемая без
// рендера, и самая ошибкоопасная (прочие параметры, пустое значение, висячий «?»).

/** Номер заказа из строки запроса. Пустое значение и одни пробелы — не номер, а отсутствие. */
export function orderParam(search: string): string | null {
  const raw = new URLSearchParams(search).get('order');
  const value = raw?.trim() ?? '';
  return value === '' ? null : value;
}

/**
 * Тот же адрес без `?order=`, прочие параметры и якорь на месте. Возвращается относительная форма
 * (путь + запрос + якорь): `history.replaceState` её понимает, а origin менять мы не вправе.
 */
export function urlWithoutOrderParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('order');
  return `${u.pathname}${u.search}${u.hash}`;
}
```

- [ ] **Step 4: Прогнать — обязан позеленеть**

Run: `npm test -- apps/web/src/screens/setup/orderDeepLink.test.ts`
Expected: PASS (7 тестов).

- [ ] **Step 5: Написать тесты отображения зоны**

Добавить в конец `apps/web/src/screens/setup/setupState.test.ts` (импорт `orderStateFromZone`
дописать к существующему импорту из `./setupState`):

```ts
describe('orderStateFromZone (s17)', () => {
  const zone = {
    orderId: 'SO-1234',
    positions: [
      {
        itemCode: 'ABB101',
        itemName: 'Einwegpalette',
        quantity: 12,
        length: 800,
        width: 600,
        height: 144,
        dimensionsSource: 'erpnext-field' as const,
      },
      {
        itemCode: 'X-9',
        itemName: 'Sonderteil',
        quantity: 3,
        dimensionsSource: 'manual' as const,
      },
    ],
  };

  it('переносит номер заказа, слот палитры и все позиции', () => {
    const o = orderStateFromZone(zone, 2);

    expect(o.orderId).toBe('SO-1234');
    expect(o.colorIndex).toBe(2);
    expect(o.positions).toHaveLength(2);
    expect(o.key).toBeTruthy();
  });

  it('переносит имя, количество и код артикула позиции', () => {
    const [p] = orderStateFromZone(zone, 0).positions;

    expect(p.name).toBe('Einwegpalette');
    expect(p.quantity).toBe(12);
    expect(p.articleCode).toBe('ABB101');
  });

  it('габариты из ERPNext переносятся числами', () => {
    const [p] = orderStateFromZone(zone, 0).positions;

    expect([p.length, p.width, p.height]).toEqual([800, 600, 144]);
  });

  it('позиция без габаритов даёт пустые поля, а не нули', () => {
    // Пустое поле — это «нужен ручной ввод»: setupValidation даёт по такой строке ошибку
    // «укажите размеры» с адресом. Ноль был бы ЗАПОЛНЕННЫМ неверным размером и прошёл бы мимо неё.
    const p = orderStateFromZone(zone, 0).positions[1];

    expect([p.length, p.width, p.height]).toEqual(['', '', '']);
  });

  it('правила остаются умолчаниями, поля не лочатся', () => {
    // locked описывает провенанс полей АРТИКУЛА из каталога (ADR 022), а не строку Sales Order:
    // залочить — значит лишить логиста возможности поправить размер, неверно заполненный в ERPNext.
    const [p] = orderStateFromZone(zone, 0).positions;
    const d = emptyPosition();

    expect(p.locked).toBeUndefined();
    expect(p.rotation).toBe(d.rotation);
    expect(p.state).toBe(d.state);
    expect(p.nestingMode).toBe(d.nestingMode);
  });

  it('у позиций разные id — иначе строки склеятся в адресации сообщений', () => {
    const [a, b] = orderStateFromZone(zone, 0).positions;

    expect(a.id).not.toBe(b.id);
  });

  it('заказ без позиций даёт пустую карточку, а не падение', () => {
    expect(orderStateFromZone({ orderId: 'SO-0', positions: [] }, 0).positions).toEqual([]);
  });
});
```

- [ ] **Step 6: Прогнать — обязан упасть на отсутствии функции**

Run: `npm test -- apps/web/src/screens/setup/setupState.test.ts`
Expected: FAIL, `orderStateFromZone is not a function` (или ошибка импорта).

- [ ] **Step 7: Написать `orderStateFromZone`**

В `apps/web/src/screens/setup/setupState.ts`, сразу после `emptyOrder`:

```ts
/**
 * Импортированный из ERPNext заказ → состояние экрана (LKWkalk-s17).
 *
 * Пустые габариты остаются ПУСТЫМИ, а не нулями: пустое поле уже даёт по строке локальную ошибку
 * «укажите размеры» с адресом, и «Рассчитать» к ней прыгает (`setupValidation`), тогда как ноль —
 * это заполненный неверный размер, который мимо неё пройдёт.
 *
 * `dimensionsSource` в состояние не переносится: «нужен ввод» выводится из пустых габаритов, а не
 * из тега (см. комментарий к нему в contracts/dto.ts), и второй источник той же истины разошёлся бы
 * с первым. `locked` не выставляется — он описывает провенанс полей АРТИКУЛА из каталога (ADR 022),
 * а не строку Sales Order.
 */
export function orderStateFromZone(zone: OrderZone, colorIndex: number): OrderState {
  return {
    key: uid(),
    orderId: zone.orderId,
    colorIndex,
    positions: zone.positions.map((p) => ({
      ...emptyPosition(),
      name: p.itemName,
      quantity: p.quantity,
      length: p.length ?? '',
      width: p.width ?? '',
      height: p.height ?? '',
      articleCode: p.itemCode,
    })),
  };
}
```

Импорт типа дописать к существующей строке `import type { ArticleErpField } from '@shadrin-v/contracts';`:

```ts
import type { ArticleErpField, OrderZone } from '@shadrin-v/contracts';
```

- [ ] **Step 8: Прогнать оба файла, типы и линт**

Run: `npm test -- apps/web/src/screens/setup/setupState.test.ts apps/web/src/screens/setup/orderDeepLink.test.ts && npm run typecheck && npm run lint`
Expected: всё зелёное.

- [ ] **Step 9: Коммит**

```bash
git add apps/web/src/screens/setup/orderDeepLink.ts apps/web/src/screens/setup/orderDeepLink.test.ts apps/web/src/screens/setup/setupState.ts apps/web/src/screens/setup/setupState.test.ts
git commit -m "feat(web): разбор ?order= и отображение зоны заказа в состояние экрана (LKWkalk-s17)"
```

---

### Task 2: Эффект монтирования — импорт, добавление, очистка адреса

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx`
- Create: `apps/web/src/screens/SetupScreen.deepLink.test.tsx`

**Interfaces:**
- Consumes: `orderParam`, `urlWithoutOrderParam` (задача 1), `orderStateFromZone` (задача 1),
  файловые `nextColorIndex`, `dp = useOptionalDataProvider()` (`SetupScreen.tsx:113`), `orders`/
  `setOrders` (`:110`).
- Produces (использует задача 3): состояние `importFailure` — `{ orderId: string; code?: string }`
  или `null`, и его сеттер `setImportFailure`.

В этой задаче заметка ещё НЕ рисуется: `importFailure` заводится и заполняется, но ничего не
отображает. Это осознанно — задача 3 добавляет разметку и ключи локалей и закрывает пробел. Ветка
целиком уходит одним PR, состояние «ошибка молча проглочена» наружу не попадает.

- [ ] **Step 1: Написать тесты трёх сценариев**

Создать `apps/web/src/screens/SetupScreen.deepLink.test.tsx`:

```tsx
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { OrderZone } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import { SetupScreen } from './SetupScreen';
import { SETUP_STORAGE_KEY, emptyOrder, type OrderState } from './setup/setupState';

const ZONE: OrderZone = {
  orderId: 'SO-1234',
  positions: [
    { itemCode: 'ABB101', itemName: 'Einwegpalette', quantity: 12, length: 800, width: 600, height: 144, dimensionsSource: 'erpnext-field' },
  ],
};

/** Провайдер-заглушка: реализован ровно тот метод, который трогает deep-link. */
function fakeProvider(importOrder: DataProvider['importOrder']): DataProvider {
  return { importOrder } as unknown as DataProvider;
}

function renderSetup(dp: DataProvider | null, initialOrders?: OrderState[]) {
  return render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>
        <SetupScreen
          initialOrders={initialOrders}
          onCalculate={() => true}
          loadingMode="combined"
          orderGrouping="strict"
          onLoadingModeChange={() => {}}
          onOrderGroupingChange={() => {}}
        />
      </DataProviderProvider>
    </LocaleProvider>,
  );
}

describe('SetupScreen — deep-link импорта заказа (s17)', () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(SETUP_STORAGE_KEY);
    globalThis.history.replaceState(null, '', '/');
  });

  it('импортирует заказ из ?order=, добавляет его к черновику и вычищает параметр', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(screen.getByDisplayValue('SO-1234')).toBeInTheDocument());
    // Черновик ДОПОЛНЕН, а не заменён: стартовый SO-1 на месте.
    expect(screen.getByDisplayValue('SO-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Einwegpalette')).toBeInTheDocument();
    expect(importOrder).toHaveBeenCalledTimes(1);
    expect(importOrder).toHaveBeenCalledWith('SO-1234');
    expect(globalThis.location.search).toBe('');
  });

  it('не импортирует заказ, который уже есть в черновике, и в ERPNext не ходит', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);
    const existing: OrderState[] = [{ ...emptyOrder(1), orderId: 'SO-1234' }];

    renderSetup(fakeProvider(importOrder), existing);

    // Дубль отсекается ДО запроса, поэтому проверяем и вызов, и очистку параметра.
    await waitFor(() => expect(globalThis.location.search).toBe(''));
    expect(importOrder).not.toHaveBeenCalled();
    expect(screen.getAllByDisplayValue('SO-1234')).toHaveLength(1);
  });

  it('без ?order= в ERPNext не ходит', async () => {
    const importOrder = vi.fn().mockResolvedValue(ZONE);

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(screen.getByDisplayValue('SO-1')).toBeInTheDocument());
    expect(importOrder).not.toHaveBeenCalled();
  });

  it('при ошибке импорта черновик и адрес не трогаются — F5 повторит попытку', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockRejectedValue({ code: 'ERR_ERPNEXT_UNCONFIGURED' });

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(importOrder).toHaveBeenCalledTimes(1));
    expect(screen.queryByDisplayValue('SO-1234')).not.toBeInTheDocument();
    expect(globalThis.location.search).toBe('?order=SO-1234');
  });
});
```

- [ ] **Step 2: Прогнать — обязан упасть**

Run: `npm test -- apps/web/src/screens/SetupScreen.deepLink.test.tsx`
Expected: FAIL. Первый тест не находит `SO-1234` (импорта нет), тест про дубль не дожидается очистки
параметра. Если какой-то тест ПРОШЁЛ — значит он не проверяет предмет; разобраться, а не идти дальше.

- [ ] **Step 3: Добавить эффект в `SetupScreen`**

Импорты дописать к существующим:

```ts
import { orderParam, urlWithoutOrderParam } from './setup/orderDeepLink';
```
и `orderStateFromZone` — к существующему импорту из `./setup/setupState`.

Рядом с прочими `useState` (после `const [armed, …]`, строка ~156):

```ts
  /** Заказ, который не удалось импортировать по ссылке (LKWkalk-s17). `code` — из конверта
   *  {code, details}, который бросает HttpDataProvider; его может не быть вовсе (см. эффект). */
  const [importFailure, setImportFailure] = useState<{ orderId: string; code?: string } | null>(null);
```

Эффект — рядом с прочими `useEffect`, после эффекта персистентности (строка ~243):

```ts
  // Deep-link импорта заказа (LKWkalk-s17): ссылка из ERPNext срабатывает ОДИН раз. Караулит ref, а
  // не пустой список зависимостей: StrictMode монтирует эффекты дважды, и без него разработочная
  // сборка импортировала бы заказ дважды. Отмены запроса нет намеренно — она бы и сработала как раз
  // на этом двойном монтировании и отменила единственную настоящую попытку; setState после
  // размонтирования в React 18 безвреден.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current) return;
    const orderId = orderParam(globalThis.location?.search ?? '');
    if (!orderId) {
      deepLinkDoneRef.current = true;
      return;
    }
    const stripParam = () =>
      globalThis.history?.replaceState(null, '', urlWithoutOrderParam(globalThis.location.href));
    // Дубль отсекается ДО запроса: незачем ходить в ERPNext, чтобы выбросить ответ. Повторный
    // приход по той же ссылке не должен ни плодить копий, ни затирать вписанные руками габариты.
    if (orders.some((o) => o.orderId === orderId)) {
      deepLinkDoneRef.current = true;
      stripParam();
      return;
    }
    // Провайдера нет (экран отрендерен вне DataProviderProvider) — импортировать нечем. Ref НЕ
    // взводим: провайдер может приехать следующим рендером, и тогда попытка состоится.
    if (!dp) return;
    deepLinkDoneRef.current = true;
    void dp
      .importOrder(orderId)
      .then((zone) => {
        setOrders((os) =>
          os.some((o) => o.orderId === zone.orderId)
            ? os
            : [...os, orderStateFromZone(zone, nextColorIndex(os))],
        );
        stripParam();
      })
      .catch((e: unknown) => {
        // Параметр НЕ вычищаем: F5 обязан повторить попытку. Тело ошибки — то, что бросил
        // HttpDataProvider; поля `code` в нём может не быть вовсе (неизвестный заказ приходит как
        // дефолтная 500 Fastify — LKWkalk-w0k), поэтому читаем его осторожно.
        const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
        setImportFailure({ orderId, code: typeof code === 'string' ? code : undefined });
      });
  }, [orders, dp]);
```

- [ ] **Step 4: Прогнать — обязан позеленеть**

Run: `npm test -- apps/web/src/screens/SetupScreen.deepLink.test.tsx`
Expected: PASS (4 теста).

Если тест про дубль падает на `getAllByDisplayValue('SO-1234')` длиной 2 — проверка дубля не
сработала до запроса; чинить эффект, не тест.

- [ ] **Step 5: Полный набор, типы, линт**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное. Особое внимание: тесты `SetupScreen.test.tsx` и `App.test.tsx` не должны
падать — они рендерят экран без `?order=`, эффект обязан выходить сразу.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.deepLink.test.tsx
git commit -m "feat(web): импорт заказа по ?order= с однократным срабатыванием ссылки (LKWkalk-s17)"
```

---

### Task 3: Заметка о неудачном импорте

**Files:**
- Modify: `packages/i18n/src/keys.ts` — три ключа в блок Setup
- Modify: `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`
- Modify: `apps/web/src/screens/SetupScreen.tsx` — разметка заметки
- Modify: `apps/web/src/screens/SetupScreen.deepLink.test.tsx` — тесты заметки

**Interfaces:**
- Consumes: состояние `importFailure` и сеттер `setImportFailure` (задача 2); файловые `tt`
  (`useT()`), `fillTemplate` (уже импортирован в `SetupScreen.tsx`).
- Produces: ничего для последующих задач.

- [ ] **Step 1: Добавить ключи локалей**

В `packages/i18n/src/keys.ts`, в блок `// Setup screen (order/position editor)` (после
`'setup.emptyOrders'`):

```ts
  // Setup: deep-link импорта заказа (LKWkalk-s17)
  'setup.import.failed',
  'setup.import.unconfigured',
  'setup.import.dismiss',
```

В `packages/i18n/src/dictionaries/de.ts` (рядом с прочими `setup.*`):

```ts
  'setup.import.failed': 'Auftrag {orderId} konnte nicht importiert werden.',
  'setup.import.unconfigured': 'ERPNext ist nicht eingerichtet — der Auftrag konnte nicht importiert werden.',
  'setup.import.dismiss': 'Hinweis schließen',
```

В `packages/i18n/src/dictionaries/ru.ts`:

```ts
  'setup.import.failed': 'Заказ {orderId} не импортирован.',
  'setup.import.unconfigured': 'ERPNext не настроен — заказ не импортирован.',
  'setup.import.dismiss': 'Закрыть заметку',
```

- [ ] **Step 2: Прогнать тест полноты словарей**

Run: `npm test -- packages/i18n`
Expected: PASS. Если `completeness.test.ts` красный — ключ добавлен не во все словари; дописать
недостающий.

- [ ] **Step 3: Написать тесты заметки**

Дописать в `apps/web/src/screens/SetupScreen.deepLink.test.tsx`:

```ts
  it('при отказе ERPNext показывает заметку про настройку', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockRejectedValue({ code: 'ERR_ERPNEXT_UNCONFIGURED' });

    renderSetup(fakeProvider(importOrder));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('ERPNext');
  });

  it('тело без кода даёт общую заметку с номером заказа', async () => {
    // Неизвестный заказ сейчас приходит дефолтной 500 Fastify, где поля code нет вовсе
    // (LKWkalk-w0k). Общая ветка — не подстраховка, а самый частый случай: опечатка в номере.
    globalThis.history.replaceState(null, '', '/?order=SO-9999');
    const importOrder = vi.fn().mockRejectedValue({ statusCode: 500, message: 'boom' });

    renderSetup(fakeProvider(importOrder));

    expect(await screen.findByRole('status')).toHaveTextContent('SO-9999');
  });

  it('заметку можно закрыть', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-9999');
    const importOrder = vi.fn().mockRejectedValue({ statusCode: 500 });

    renderSetup(fakeProvider(importOrder));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Hinweis schließen' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
```

Импорт `userEvent` дописать в шапку файла:

```ts
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 4: Прогнать — обязан упасть**

Run: `npm test -- apps/web/src/screens/SetupScreen.deepLink.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "status"`.

- [ ] **Step 5: Нарисовать заметку**

В `apps/web/src/screens/SetupScreen.tsx`, непосредственно ПЕРЕД блоком master-detail
(`<div className="flex flex-col gap-4 xl:flex-row xl:items-start">`, строка ~525):

```tsx
      {/* Неудачный импорт по ссылке (LKWkalk-s17) не мешает работать: черновик не тронут, экран
          обычный, причина — заметкой. role="status", а не "alert": логист не обязан бросать ввод
          ради неё, и вежливое объявление не перебивает то, что он печатает. */}
      {importFailure && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-danger bg-sub p-3"
        >
          <p className="min-w-0 flex-1 text-caption text-danger">
            {importFailure.code === 'ERR_ERPNEXT_UNCONFIGURED'
              ? tt('setup.import.unconfigured')
              : fillTemplate(tt('setup.import.failed'), { orderId: importFailure.orderId })}
          </p>
          <button
            type="button"
            aria-label={tt('setup.import.dismiss')}
            onClick={() => setImportFailure(null)}
            className="px-1 text-muted hover:text-brand"
          >
            ✕
          </button>
        </div>
      )}
```

- [ ] **Step 6: Прогнать — обязан позеленеть**

Run: `npm test -- apps/web/src/screens/SetupScreen.deepLink.test.tsx`
Expected: PASS (7 тестов).

Если `local/no-untranslated-text` ругается на `✕` — глиф-ребёнок оформляется так же, как стрелки
`↑`/`↓` в `OrderCard.tsx:97,106`; посмотреть, как правило пропускает их, и повторить.

- [ ] **Step 7: Полный набор, типы, линт**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное. Число тестов записать ФАКТИЧЕСКОЕ из вывода раннера.

- [ ] **Step 8: Запись в CHANGELOG**

В `docs/CHANGELOG.md`, в `## [Unreleased]` первым блоком:

```markdown
### 2026-08-06 — Импорт заказа по ссылке из ERPNext (`LKWkalk-s17`)

Контракт движка не менялся (`0.18.0`), серверная часть не менялась.

- `/?order=SO-1234` добавляет импортированный заказ к черновику «Настройки»; позиции без габаритов
  приходят пустыми и попадают в существующую ошибку «укажите размеры» с адресом.
- Ссылка срабатывает один раз: после успеха `?order=` вычищается из адреса, а заказ с уже
  присутствующим `orderId` повторно не импортируется. F5 и повторный клик по ссылке не плодят копий
  и не затирают вписанные руками габариты.
- Неудачный импорт не мешает работать: черновик не тронут, сверху — закрываемая заметка с причиной,
  `?order=` остаётся, поэтому F5 повторяет попытку.
```

- [ ] **Step 9: Коммит**

```bash
git add packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.deepLink.test.tsx docs/CHANGELOG.md
git commit -m "feat(web): заметка о неудачном импорте заказа по ссылке (LKWkalk-s17)"
```

---

## Self-Review

**Покрытие спеки:**

| Требование спеки | Задача |
|---|---|
| Импорт внутри `SetupScreen`, `initialOrders` не трогается | 2 |
| `?order=` читается один раз при монтировании; пусто → выход | 1 (разбор), 2 (эффект) |
| Дубль `orderId` → запроса нет, параметр вычищается | 2 |
| Успех → заказ в конец `orders`, параметр вычищается | 2 |
| Ошибка → черновик и параметр не тронуты, заметка | 2 (состояние), 3 (разметка) |
| `orderStateFromZone`: пустые габариты → `''`, `articleCode`, умолчания правил, без `locked` | 1 |
| `dimensionsSource` не переносится | 1 (не переносится по коду; проверяется тестом умолчаний) |
| Ветка `ERR_ERPNEXT_UNCONFIGURED` и общая ветка без `code` | 3 |
| Ключи локалей `de`/`ru`, полнота словарей | 3 |
| Отдельная подсветка позиций без габаритов НЕ пишется | — (осознанно отсутствует; обосновано в комментарии задачи 1 шаг 7) |

**Плейсхолдеры:** нет — каждый шаг несёт готовый код или точную команду.

**Согласованность имён:** `orderParam`, `urlWithoutOrderParam`, `orderStateFromZone`,
`importFailure`/`setImportFailure`, `deepLinkDoneRef`, ключи `setup.import.failed` /
`setup.import.unconfigured` / `setup.import.dismiss` — одинаковы во всех задачах и в тестах.
