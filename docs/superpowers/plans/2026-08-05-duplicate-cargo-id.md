# Уникальность `cargo.id` в `validateLoad` — план реализации (LKWkalk-p3p.15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `validateLoad` отвергает `Load`, в котором два элемента `cargo` делят один `id`, кодом `ERR_DUPLICATE_CARGO_ID` — по одной ошибке на каждый задвоенный id.

**Architecture:** Проверка живёт только в ядре (`packages/engine/src/validation/`), отдельным проходом по `load.cargo` до построчного цикла. Всё остальное срабатывает по уже готовым механикам: `calculateLayout` возвращает пустой layout с `errors`, предохранитель `App` его не принимает, `engineMessages` адресует код строке по `details.cargoTypeId`. Кода в `apps/web` не пишем — только тест и актуализация комментария.

**Tech Stack:** TypeScript (workspaces), vitest, пакеты `@shadrin-v/engine` и `@shadrin-v/i18n`.

**Спека:** [docs/superpowers/specs/2026-08-05-duplicate-cargo-id-design.md](../specs/2026-08-05-duplicate-cargo-id-design.md) — читать целиком перед началом.

## Global Constraints

- **Порядок задач менять нельзя.** Кросс-пакетный гейт `apps/web/src/screens/setup/setupValidation.test.ts:254` требует, чтобы каждый член `VALIDATION_ERROR_CODES` был в `TRANSLATION_KEYS`. Поэтому ключ локали (задача 2) добавляется **до** кода в движке (задача 3), иначе задача 3 закончится с красным гейтом.
- **Документация раньше кода** (CLAUDE.md): контракт и таблица кодов правятся в задаче 1.
- Единицы — целые миллиметры (ADR 002). Пользовательских строк в коде нет, только ключи локалей (ADR 006).
- Гейты гоняются **с корня репозитория**: `npm test`, `npm run typecheck`, `npm run lint`. У воркспейсов скрипта `test` НЕТ — vitest объявлен только в корневом `package.json`, поэтому `npm test --workspace <name>` падает с `Missing script: "test"`. Точечный прогон — путём: `npm test -- <путь к файлу или каталогу>`.
- Пакеты `@shadrin-v/i18n` и `@shadrin-v/engine` резолвятся в `dist`. После правок в них **обязательна пересборка**, иначе `apps/web` тестирует старый код:
  ```bash
  npm run build --workspace @shadrin-v/i18n && npm run build --workspace @shadrin-v/engine
  ```
- **Мутационное доказательство обязательно для каждого нового теста** (урок p3p.16): убрать проверяемую строку производственного кода → прогнать → увидеть FAIL → вернуть → увидеть PASS. В отчёте по задаче показать вывод обеих команд. Зелёный тест без этого доказательства не принимается.
- Тексты сообщений — дословно из спеки, менять формулировки нельзя:
  - de: `Zwei Ladungspositionen haben dieselbe interne Kennung. Bitte die Zeile löschen und neu anlegen.`
  - ru: `Две позиции заявки имеют одинаковый внутренний идентификатор. Удалите строку и создайте её заново.`
- Версия контракта после работы: **`0.18.0`** (сейчас `0.17.0`).

## File Structure

| Файл | Ответственность | Задача |
|---|---|---|
| `docs/api-contract.md` | таблица кодов §3 + история версий | 1 |
| `docs/CHANGELOG.md` | запись версии | 1 |
| `docs/INFRASTRUKTUR-ladungsplaner.md` | пример ответа `/api/health` | 1 |
| `packages/i18n/src/keys.ts` | канонический список ключей перевода | 2 |
| `packages/i18n/src/dictionaries/de.ts`, `ru.ts` | тексты | 2 |
| `packages/i18n/src/dictionaries/index.test.ts` | гейт полноты словарей (перечисление `ERR_*` в нём — ручное) | 2 |
| `packages/engine/src/validation/codes.ts` | перечисление кодов валидации | 3 |
| `packages/engine/src/validation/validate.ts` | сама проверка | 3 |
| `packages/engine/src/validation/validate.test.ts` | тесты движка | 3 |
| `packages/engine/src/index.ts`, `index.test.ts` | версия контракта | 3 |
| `apps/web/src/screens/setup/setupValidation.ts` | комментарий-оговорка про дубли `p.id` (кода не меняем) | 4 |
| `apps/web/src/screens/setup/setupValidation.test.ts` | тест доставки кода до панели | 4 |

---

### Task 1: Документы контракта (сначала документация)

**Files:**
- Modify: `docs/api-contract.md` (таблица кодов §3, строка ~386; история версий, строка ~413)
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/INFRASTRUKTUR-ladungsplaner.md:147`

**Interfaces:**
- Consumes: ничего.
- Produces: имя кода `ERR_DUPLICATE_CARGO_ID` и форма `details: { cargoTypeId: string; count: number }` — задачи 2–4 обязаны совпадать с этим дословно.

- [ ] **Step 1: Добавить строку в таблицу кодов §3**

Найти в `docs/api-contract.md` строку таблицы с `ERR_INVALID_COMPARTMENTS` и добавить сразу под ней:

```markdown
| `ERR_DUPLICATE_CARGO_ID`    | два элемента `cargo` делят один `id`. Движок группирует размещения и остатки по `cargoTypeId`, поэтому дубль молча портит счётчики `requested/placed/unplaced`. Одна ошибка на каждый задвоенный id, `details: { cargoTypeId, count }`; сравнение точное, без обрезки пробелов (`LKWkalk-p3p.15`) |
```

- [ ] **Step 2: Обновить версию контракта в шапке файла**

В `docs/api-contract.md` строка 5: заменить `Версия контракта: `0.17.0`` на `Версия контракта: `0.18.0``.

- [ ] **Step 3: Добавить запись в историю версий**

В разделе «История версий» — новая запись **над** записью `0.17.0`:

```markdown
- `0.18.0` — добавлен код `ERR_DUPLICATE_CARGO_ID`: `validateLoad` отвергает `Load`, в котором два
  элемента `cargo` делят один `id` (`LKWkalk-p3p.15`). Аддитивно по форме — расширение
  `VALIDATION_ERROR_CODES`. По поведению это ужесточение валидации: такой `Load` раньше принимался,
  но результат на нём был неверен (счётчики группируются по `cargoTypeId`, дубль перезаписывал
  чужие), поэтому ломающим изменение не считается.
```

- [ ] **Step 4: Обновить пример health**

`docs/INFRASTRUKTUR-ladungsplaner.md:147` — заменить `0.17.0` на `0.18.0` в примере ответа `/api/health`.

- [ ] **Step 5: Запись в CHANGELOG**

В `docs/CHANGELOG.md`, в стиле соседних записей (посмотреть запись про `0.16.0 → 0.17.0`, строка ~29), добавить абзац о бампе `0.17.0` → `0.18.0` и новом коде `ERR_DUPLICATE_CARGO_ID` со ссылкой на `LKWkalk-p3p.15`.

- [ ] **Step 6: Проверить, что ничего кроме документов не тронуто**

```bash
git status --short
```
Ожидание: только три файла из раздела **Files**.

- [ ] **Step 7: Commit**

```bash
git add docs/api-contract.md docs/CHANGELOG.md docs/INFRASTRUKTUR-ladungsplaner.md
git commit -m "docs(contract): ERR_DUPLICATE_CARGO_ID + контракт 0.18.0 (LKWkalk-p3p.15)"
```

---

### Task 2: Ключ и тексты локалей

**Files:**
- Modify: `packages/i18n/src/keys.ts` (список `TRANSLATION_KEYS`, рядом с `ERR_INVALID_COMPARTMENTS`)
- Modify: `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`
- Modify: `packages/i18n/src/dictionaries/index.test.ts` (перечисление `ERR_*` в тесте — ручное, само не обновится)

**Interfaces:**
- Consumes: имя кода `ERR_DUPLICATE_CARGO_ID` из задачи 1.
- Produces: ключ перевода `ERR_DUPLICATE_CARGO_ID` в `TRANSLATION_KEYS` — от него зависит кросс-гейт в задаче 3.

**Почему это до движка:** `apps/web/src/screens/setup/setupValidation.test.ts:254` требует, чтобы каждый `VALIDATION_ERROR_CODES` был в `TRANSLATION_KEYS`. Обратной зависимости нет: лишний ключ перевода без кода в движке ни один гейт не ломает (так же, как давно живущий `ERR_UNKNOWN_VEHICLE`).

- [ ] **Step 1: Обновить гейт словарей (падающий тест)**

В `packages/i18n/src/dictionaries/index.test.ts`, в тесте `translates every engine validation error code into both locales`, добавить в ожидаемый массив сразу после `'ERR_INVALID_COMPARTMENTS'`:

```ts
      // duplicate cargo id (contract 0.18.0, LKWkalk-p3p.15)
      'ERR_DUPLICATE_CARGO_ID',
```

- [ ] **Step 2: Прогнать — тест должен упасть**

```bash
npm test -- packages/i18n
```
Ожидание: FAIL — фактический список ключей не содержит `ERR_DUPLICATE_CARGO_ID`.

- [ ] **Step 3: Добавить ключ в `keys.ts`**

В `packages/i18n/src/keys.ts` сразу после строки `'ERR_INVALID_COMPARTMENTS',`:

```ts
  // Дубль cargo.id (contract 0.18.0, LKWkalk-p3p.15): движок группирует размещения и остатки по
  // cargoTypeId, поэтому два груза с одним id портят счётчики друг друга.
  'ERR_DUPLICATE_CARGO_ID',
```

- [ ] **Step 4: Добавить тексты в оба словаря**

`packages/i18n/src/dictionaries/de.ts` — рядом с `ERR_INVALID_COMPARTMENTS`:

```ts
  ERR_DUPLICATE_CARGO_ID:
    'Zwei Ladungspositionen haben dieselbe interne Kennung. Bitte die Zeile löschen und neu anlegen.',
```

`packages/i18n/src/dictionaries/ru.ts` — там же:

```ts
  ERR_DUPLICATE_CARGO_ID:
    'Две позиции заявки имеют одинаковый внутренний идентификатор. Удалите строку и создайте её заново.',
```

- [ ] **Step 5: Прогнать — тесты пакета зелёные**

```bash
npm test -- packages/i18n && npm run typecheck
```
Ожидание: PASS. Гейты «словарь определяет ровно канонические ключи» и «у каждого ключа непустой текст в de и ru» подтверждают, что ключ есть в обоих словарях.

- [ ] **Step 6: Мутационное доказательство**

Убрать строку `ERR_DUPLICATE_CARGO_ID: …` из `ru.ts`, прогнать `npm test -- packages/i18n` — ожидание FAIL; вернуть, прогнать снова — ожидание PASS. Вывод обеих команд приложить к отчёту.

- [ ] **Step 7: Commit**

```bash
git add packages/i18n
git commit -m "feat(i18n): текст ERR_DUPLICATE_CARGO_ID для de и ru (LKWkalk-p3p.15)"
```

---

### Task 3: Проверка в движке

**Files:**
- Modify: `packages/engine/src/validation/codes.ts`
- Modify: `packages/engine/src/validation/validate.ts`
- Modify: `packages/engine/src/validation/validate.test.ts`
- Modify: `packages/engine/src/index.ts` (`ENGINE_CONTRACT_VERSION`), `packages/engine/src/index.test.ts`

**Interfaces:**
- Consumes: ключ перевода из задачи 2; имя кода и форму `details` из задачи 1.
- Produces: член `'ERR_DUPLICATE_CARGO_ID'` в `VALIDATION_ERROR_CODES`; `validateLoad` выпускает `{ code: 'ERR_DUPLICATE_CARGO_ID', details: { cargoTypeId: string, count: number } }`. На это опирается задача 4.

- [ ] **Step 1: Написать падающие тесты**

В `packages/engine/src/validation/validate.test.ts` добавить блок в конец файла. Фикстуры `baseCargo`/`baseLoad`/`codes` уже определены в шапке файла — использовать их, не заводить свои.

```ts
// Дубли cargo.id (LKWkalk-p3p.15, контракт 0.18.0). Движок группирует placements/unplaced по
// cargoTypeId, поэтому второй элемент с тем же id молча портит счётчики первого.
describe('ERR_DUPLICATE_CARGO_ID (contract 0.18.0)', () => {
  it('rejects two cargo entries sharing an id, with the occurrence count', () => {
    const load = baseLoad([baseCargo(), baseCargo({ name: 'EPAL 1 (Kopie)' })]);
    expect(validateLoad(load)).toEqual([
      { code: 'ERR_DUPLICATE_CARGO_ID', details: { cargoTypeId: 'epal1', count: 2 } },
    ]);
  });

  it('reports three occurrences of one id as a single error with count 3', () => {
    const load = baseLoad([baseCargo(), baseCargo(), baseCargo()]);
    expect(validateLoad(load)).toEqual([
      { code: 'ERR_DUPLICATE_CARGO_ID', details: { cargoTypeId: 'epal1', count: 3 } },
    ]);
  });

  it('reports each duplicated id once, in order of first occurrence', () => {
    const load = baseLoad([
      baseCargo({ id: 'gitter' }),
      baseCargo({ id: 'epal1' }),
      baseCargo({ id: 'gitter' }),
      baseCargo({ id: 'epal1' }),
    ]);
    expect(validateLoad(load)).toEqual([
      { code: 'ERR_DUPLICATE_CARGO_ID', details: { cargoTypeId: 'gitter', count: 2 } },
      { code: 'ERR_DUPLICATE_CARGO_ID', details: { cargoTypeId: 'epal1', count: 2 } },
    ]);
  });

  // Точное сравнение, без trim: для движка id — ключ группировки как есть, «epal1» и « epal1 »
  // дают разные колонки и разные остатки, то есть работают корректно.
  it('treats ids differing only in whitespace as distinct', () => {
    const load = baseLoad([baseCargo(), baseCargo({ id: ' epal1 ' })]);
    expect(codes(load)).not.toContain('ERR_DUPLICATE_CARGO_ID');
  });

  // Дубль ничего не говорит о габаритах, поэтому построчные коды остаются.
  it('does not suppress per-cargo codes on the duplicated rows', () => {
    const load = baseLoad([baseCargo(), baseCargo({ height: 0 })]);
    expect(codes(load)).toEqual(
      expect.arrayContaining(['ERR_DUPLICATE_CARGO_ID', 'ERR_INVALID_DIMENSION']),
    );
  });

  it('says nothing about a load whose ids are unique', () => {
    expect(codes(baseLoad([baseCargo(), baseCargo({ id: 'gitter' })]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать — тесты должны упасть**

```bash
npm test -- packages/engine/src/validation/validate.test.ts
```
Ожидание: FAIL. Пять тестов падают на отсутствии кода; тест про пробелы и тест про уникальные id проходят и сейчас (они стерегут отсутствие ложных срабатываний, а не наличие кода).

- [ ] **Step 3: Добавить код в перечисление**

`packages/engine/src/validation/codes.ts` — новый член после `'ERR_INVALID_COMPARTMENTS'`:

```ts
  'ERR_DUPLICATE_CARGO_ID',
```

- [ ] **Step 4: Реализовать проверку**

`packages/engine/src/validation/validate.ts` — функция рядом с `compartmentErrors` (над `validateLoad`):

```ts
/** Дубли `cargo.id`. Движок группирует placements/unplaced по `cargoTypeId` (`getLayoutReport`,
 *  колонки метрик, остатки упаковщика), поэтому второй элемент с тем же id молча портит счётчики
 *  первого. Одна ошибка на КАЖДЫЙ задвоенный id, а не на каждое повторное вхождение: адрес у
 *  вхождений общий, а владельцу нужно увидеть все сломанные id за один прогон. Сравнение точное,
 *  без `trim`: «epal1» и « epal1 » — разные ключи группировки, они работают корректно. */
function duplicateCargoIdErrors(cargo: readonly CargoType[]): EngineError[] {
  const counts = new Map<string, number>();
  for (const c of cargo) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const errors: EngineError[] = [];
  const emitted = new Set<string>();
  for (const c of cargo) {
    const count = counts.get(c.id) ?? 0;
    if (count < 2 || emitted.has(c.id)) continue;
    emitted.add(c.id);
    errors.push({ code: 'ERR_DUPLICATE_CARGO_ID', details: { cargoTypeId: c.id, count } });
  }
  return errors;
}
```

Вызов — в `validateLoad` сразу после блока `ERR_EMPTY_LOAD` и **до** построчного цикла `for (const c of cargo)`:

```ts
  // Порядок фиксирован: сначала претензии к кузову и к заявке целиком, потом к отдельным строкам —
  // от него зависит, к какой строке прыгает «Рассчитать» (firstError на стороне UI).
  errors.push(...duplicateCargoIdErrors(cargo));
```

- [ ] **Step 5: Прогнать тесты движка**

```bash
npm test -- packages/engine
```
Ожидание: PASS, включая шесть новых.

- [ ] **Step 6: Мутационное доказательство**

Закомментировать строку `errors.push(...duplicateCargoIdErrors(cargo));` → `npm test -- packages/engine/src/validation/validate.test.ts` → ожидание FAIL на пяти тестах; вернуть → прогнать → ожидание PASS. Вывод обеих команд приложить к отчёту.

- [ ] **Step 7: Бампнуть версию контракта**

`packages/engine/src/index.ts`: `export const ENGINE_CONTRACT_VERSION = '0.18.0';`
`packages/engine/src/index.test.ts`: заменить `0.17.0` на `0.18.0` в названии теста и в `expect`.

- [ ] **Step 8: Пересобрать пакеты и прогнать все гейты с корня**

```bash
npm run build --workspace @shadrin-v/i18n && npm run build --workspace @shadrin-v/engine
npm test && npm run typecheck && npm run lint
```
Ожидание: всё зелёное. Кросс-гейт `setupValidation.test.ts:254` (каждый `VALIDATION_ERROR_CODES` есть в `TRANSLATION_KEYS`) проходит благодаря задаче 2 — если он красный, значит пересборка `@shadrin-v/i18n` не выполнена.

- [ ] **Step 9: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): ERR_DUPLICATE_CARGO_ID в validateLoad + контракт 0.18.0 (LKWkalk-p3p.15)"
```

---

### Task 4: Доставка кода до экрана «Настройка»

Продакшн-кода в `apps/web` не пишем: `engineMessages` уже адресует строке любой код с `details.cargoTypeId`. Задача доказывает это тестом и снимает устаревшую оговорку в комментарии.

**Files:**
- Modify: `apps/web/src/screens/setup/setupValidation.test.ts`
- Modify: `apps/web/src/screens/setup/setupValidation.ts` (только комментарий над `engineMessages`, ~строка 112)

**Interfaces:**
- Consumes: код `ERR_DUPLICATE_CARGO_ID` из задачи 3 (собранный `dist` движка).
- Produces: ничего для последующих задач.

- [ ] **Step 1: Написать падающий тест**

В `apps/web/src/screens/setup/setupValidation.test.ts` добавить блок в конец файла. Фикстуры `pos`, `order`, `vehicle` определены в шапке — использовать их. Обе строки берут дефолтный `id: 'p1'` — это ровно форма испорченного черновика из спеки.

```ts
// Дубль cargo.id (LKWkalk-p3p.15): испорченный черновик в localStorage — единственный путь, каким
// две строки одного id доезжают до движка из интерфейса (обычно id = crypto.randomUUID()).
describe('ERR_DUPLICATE_CARGO_ID на экране', () => {
  it('две строки с одним id дают адресуемую ошибку движка', () => {
    const msgs = allMessages([order([pos(), pos({ name: 'Копия' })])], vehicle);
    expect(msgs.find((m) => m.code === 'ERR_DUPLICATE_CARGO_ID')).toMatchObject({
      level: 'error',
      where: { orderKey: 'o1', positionId: 'p1' },
    });
  });

  it('«Рассчитать» ведёт к этой строке: у первой ошибки есть адрес', () => {
    const msgs = allMessages([order([pos(), pos({ name: 'Копия' })])], vehicle);
    expect(firstError(msgs)).toMatchObject({ code: 'ERR_DUPLICATE_CARGO_ID' });
  });

  // Принятая граница (спека §3): локальная ошибка строки глушит коды движка по ней же, поэтому
  // задвоенная И недозаполненная строка покажет «укажите размеры». Расчёт всё равно заблокирован —
  // молчаливого успеха нет; после дозаполнения строки код о дубле проявится.
  it('локальная ошибка той же строки глушит код о дубле, но расчёт остаётся заблокирован', () => {
    const msgs = allMessages([order([pos({ length: '' }), pos({ name: 'Копия' })])], vehicle);
    expect(msgs.some((m) => m.code === 'ERR_DUPLICATE_CARGO_ID')).toBe(false);
    expect(msgs.some((m) => m.code === 'setup.msg.dimsMissing' && m.level === 'error')).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать — тест должен упасть, если dist не собран**

```bash
npm run build --workspace @shadrin-v/i18n && npm run build --workspace @shadrin-v/engine
npm test -- apps/web/src/screens/setup/setupValidation.test.ts
```
Ожидание: PASS (код движка уже есть после задачи 3). Если FAIL — не собран `dist`; собрать и повторить.

- [ ] **Step 3: Мутационное доказательство**

В `packages/engine/src/validation/validate.ts` закомментировать `errors.push(...duplicateCargoIdErrors(cargo));`, пересобрать движок, прогнать `npm test -- apps/web/src/screens/setup/setupValidation.test.ts` — ожидание FAIL на первых двух новых тестах (третий стережёт глушение и остаётся зелёным — так и должно быть) (это доказывает, что тест проверяет доставку кода, а не сам себя); вернуть строку, пересобрать, прогнать — ожидание PASS. Вывод обеих команд приложить к отчёту.

- [ ] **Step 4: Снять устаревшую оговорку в комментарии**

В `apps/web/src/screens/setup/setupValidation.ts` в docblock над `engineMessages` заменить абзац, начинающийся словами «Адрес честен ровно настолько…», на:

```ts
 *  Дубль `p.id` в испорченном черновике теперь сам является ошибкой движка
 *  (`ERR_DUPLICATE_CARGO_ID`, контракт 0.18.0, LKWkalk-p3p.15), а не молчаливым состоянием. Адрес у
 *  такой ошибки ведёт к ПОСЛЕДНЕМУ вхождению — `addressOf` хранит один адрес на id; чинится удалением
 *  любой из двух строк, поэтому уточнять адрес незачем.
```

- [ ] **Step 5: Все гейты с корня**

```bash
npm test && npm run typecheck && npm run lint
```
Ожидание: всё зелёное, тестов на 9 больше исходных 1116 (6 в движке + 3 в вебе).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "test(web): дубль cargo.id доезжает до панели причин с адресом (LKWkalk-p3p.15)"
```

---

## Проверка перед PR

- [ ] `npm test && npm run typecheck && npm run lint` с корня — зелено, тестов 1125.
- [ ] `git log --oneline` — четыре коммита задач плюс коммит спеки.
- [ ] Мутационные доказательства из задач 2, 3, 4 приложены к отчёту.
- [ ] `bd close LKWkalk-p3p.15` с комментарием о результате — после мержа.
