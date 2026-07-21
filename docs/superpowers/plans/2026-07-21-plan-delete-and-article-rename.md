# Delete From The Plan + Article Name Provenance — Implementation Plan (LKWkalk-yxn)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator remove a position or a whole order from the calculation, and stop the name field from silently forking a second catalogue article.

**Architecture:** Deletion lives entirely in the Setup screen's draft state — no server call, no ERPNext write (the app has no ERP write path at all). A single `armed` value on `SetupScreen` makes "exactly one delete button is armed" true by construction. The rename fix moves `name` into the same per-field ERP provenance list that already guards dimensions, renaming the type `ArticleConstructiveField` → `ArticleErpField` across contracts, server and web.

**Tech Stack:** TypeScript (strict), React 18, Vitest + Testing Library, Fastify + better-sqlite3, npm workspaces monorepo, Tailwind.

## Global Constraints

- **The app must never write to ERPNext.** The adapter (`apps/server/src/erpnext/adapter.ts:41`) issues GET only. Creating, renaming and deleting articles in ERP happens in ERP. Nothing in this plan may add a write path.
- Deletion is **from the calculation only** — the catalogue row in SQLite is untouched, and the article keeps being suggested by the combobox.
- **Local article deletion is out of scope.** Do not add a DELETE route or a `deleteArticle` provider method.
- **Invariant: the Setup screen is never empty.** No "order with no positions" state may exist.
- No user-facing string literals in `apps/web` — locale keys only, present in BOTH `de` and `ru` (ADR 006). `packages/i18n` publishes from a gitignored `dist/`: after adding a key run `npm run build --workspace packages/i18n`.
- `packages/contracts` also publishes from a gitignored `dist/` (`tsup`): after changing it run `npm run build --workspace packages/contracts`, or consumers keep seeing the old types.
- **The field-lock condition is not to be touched.** A field is locked when and only when ERPNext actually supplied it (`erp_fields_json`) — never inferred from `source` plus "value is non-empty". This has been broken and re-fixed three times.
- A breaking contract change requires an ADR **before** the code. Note WHICH contract: `docs/api-contract.md` is the ENGINE contract and its version line must always equal `ENGINE_CONTRACT_VERSION` in `packages/engine/src/index.ts` (it has, at 0.12.0/0.13.0/0.14.0). Article DTOs live in `packages/contracts` and are specced in `docs/superpowers/specs/2026-07-20-article-autocomplete-design.md` — changing them must NOT bump the engine contract.
- Tests run from the repo root: `npm test`. Web tests use German strings.
- Commit messages in English; docs prose in Russian.

## File Structure

| File | Responsibility |
|---|---|
| `docs/adr/022-article-name-provenance-and-confirm-patterns.md` | *new* — why `name` joins ERP provenance, and which confirmation pattern to use where |
| `docs/superpowers/specs/2026-07-20-article-autocomplete-design.md` | the article DTO contract — `ArticleErpField`, `erpFields` may contain `'name'` |
| `packages/contracts/src/dto.ts` | the renamed constant/type and the widened `erpFields` doc |
| `apps/server/src/db/articles.ts` | `upsertArticle` keeps an ERP-supplied name; `upsertFromErp` records `'name'` |
| `apps/web/src/screens/components/ArmedDelete.tsx` | *new* — presentational two-step delete control; owns no arming state |
| `apps/web/src/screens/SetupScreen.tsx` | `armed` state + disarm effect, `removePosition` / `removeOrder`, `unboundFromErp`, prop threading |
| `apps/web/src/App.tsx` | *untouched* — `orderColors` is rebuilt per calculate, nothing to prune |
| `apps/web/src/ui/primitives.tsx` | `Button` gains a `danger` variant |
| `packages/i18n/src/keys.ts`, `dictionaries/{de,ru}.ts` | four new keys — 3 in Task 3, 1 in Task 4 |

---

### Task 1: ADR and contract (documentation first)

**Files:**
- Create: `docs/adr/022-article-name-provenance-and-confirm-patterns.md`
- Modify: `docs/superpowers/specs/2026-07-20-article-autocomplete-design.md` (the article DTO section)
- Revert: `docs/api-contract.md` — it documents the ENGINE contract only and must go back to `0.14.0`

**Interfaces:**
- Consumes: nothing.
- Produces: the documented contract Task 2 implements —
  - `ARTICLE_ERP_FIELDS = ['length', 'width', 'height', 'name'] as const`
  - `type ArticleErpField = (typeof ARTICLE_ERP_FIELDS)[number]`
  - `Article.erpFields: readonly ArticleErpField[]`
  - `ARTICLE_CONSTRUCTIVE_FIELDS` / `ArticleConstructiveField` cease to exist.
  - `docs/api-contract.md` stays at `0.14.0` — the packing engine is untouched by this work.

- [ ] **Step 1: Write ADR 022**

Read `docs/adr/021-group-layout-edits.md` first and match its header format exactly. Then create `docs/adr/022-article-name-provenance-and-confirm-patterns.md`:

```markdown
# ADR 022 — Имя артикула в провенансе ERPNext; два паттерна подтверждения

- Статус: принято
- Дата: 2026-07-21
- Задача: `LKWkalk-yxn`
- Контракт: DTO `packages/contracts` (ломающее: переименование типа). Контракт движка не меняется.
- Связано: `docs/superpowers/specs/2026-07-20-article-autocomplete-design.md`

## Контекст

Каталог артикулов уже хранит провенанс по полям: `erp_fields_json` перечисляет конструктивные
поля, которые ERPNext фактически прислал, и только они заперты от правки локально. Имя в этот
список не входило, и `upsertArticle` всегда брал его из входа.

Из-за этого правка имени в комбобоксе создавала ВТОРУЮ запись вместо обновления: правка текста
отвязывает строку (`articleCode: undefined`), а сохранение ключуется по `articleCode ?? name`,
то есть по новому имени.

Владелец решил (2026-07-20): имя артикула правится исключительно в ERPNext. Приложение физически
не может писать в ERPNext — адаптер ходит наружу только GET-ом.

## Решение

1. `name` входит в тот же список провенанса, что и габариты. У артикула, чьё имя пришло из
   ERPNext, `upsertArticle` имя не меняет; у локального артикула переименование работает как
   раньше — оно там законно. `upsertFromErp` имя ставит: он и есть источник.
2. Тип `ArticleConstructiveField` переименовывается в `ArticleErpField`, константа
   `ARTICLE_CONSTRUCTIVE_FIELDS` — в `ARTICLE_ERP_FIELDS`. Имя не конструктивное поле, и
   оставить старое название значило бы соврать в типе.
3. Замок на имени не делает поле `readOnly`. Поле имени — это поисковая строка комбобокса;
   запретить в неё печатать значит убить подбор артикула. Поэтому замок имени показывается
   пояснением, а не запретом ввода.

Условие замка не меняется: поле заперто тогда и только тогда, когда ERPNext фактически его
прислал, а НЕ когда «запись из ERP и значение непустое».

## Два паттерна подтверждения

В приложении появляется точечное удаление (позиции и заказа из расчёта), и для него нативный
`window.confirm` не годится: он блокирует поток и выглядит чужеродно для действия внутри строки.
Появляется второй паттерн, и граница между ними фиксируется здесь, чтобы два способа не выглядели
случайностью:

- **`window.confirm`** — действие сносит весь экран или всю работу: сброс черновика
  (`SetupScreen`), отказ от ручных правок раскладки (`LadeplanScreen`).
- **Взвод → подтверждение** — точечное удаление одной сущности внутри списка. Первое нажатие
  превращает корзину в явную «Подтвердить удаление», второе удаляет.

Взведена всегда ровно одна кнопка на экран: состояние хранится одним значением на уровне экрана,
а не флагом в каждой строке — тогда инвариант держится по построению, а не проверкой.
Разоружение: повторный взвод другой кнопки, `Escape`, клик вне и таймаут 4 с. Таймаут не
украшение — забытая взведённая кнопка ждала бы следующего случайного клика, а это ровно тот класс
ошибки, от которого подтверждение и защищает.

## Последствия

- Существующие строки БД не мигрируются: у артикулов, засеянных до этого изменения,
  `erp_fields_json` не содержит `'name'`, и имя останется редактируемым до следующего импорта
  заказа, который добавит `'name'` объединением. Отдельная миграция не нужна — список провенанса
  и так только растёт.
- Удаление из расчёта не трогает каталог: убранный артикул остаётся в SQLite и продолжает
  предлагаться комбобоксом.
- Локального удаления артикула по-прежнему нет. Если понадобится — отдельная задача, и там
  всплывёт, что удалённый артикул вернётся при следующем импорте заказа: импорт засевает каталог.

## Отвергнутые альтернативы

- **Отдельный флаг `nameFromErp`** вместо расширения списка. Локальнее, но заводит второй механизм
  провенанса рядом с существующим — два места, которые обязаны согласовываться.
- **Сделать поле имени `readOnly` при замке.** Убивает подбор артикула: это та же строка, в
  которую печатают запрос.
- **Разрешить переименование из формы.** Прямо противоречит решению владельца и разошлось бы с
  ERPNext как источником истины.
```

- [ ] **Step 2: Update the API contract**

In `docs/api-contract.md`, change the version on line 5 from `0.14.0` to `0.15.0`.

Find the article section (search for `ARTICLE_CONSTRUCTIVE_FIELDS` / `erpFields`) and update it so it reads:

```markdown
```ts
/** Поля, которые ERPNext способен прислать для артикула. */
const ARTICLE_ERP_FIELDS = ['length', 'width', 'height', 'name'] as const;
type ArticleErpField = (typeof ARTICLE_ERP_FIELDS)[number];
```

`Article.erpFields: readonly ArticleErpField[]` — какие поля ERPNext ФАКТИЧЕСКИ прислал для этого
артикула; эти и только эти заперты от локальной правки. Поле, отсутствующее в списке, редактируется
всегда, даже у артикула с `source: 'erp'`. Список решает сервер; клиент не имеет права выводить его
из `source` плюс «значение непустое».

`'name'` в списке означает, что имя пришло из ERPNext и `upsertArticle` его не перезапишет.
Переименование локального артикула (имени в списке нет) продолжает работать.
```

Add at the top of the version-history list:

```markdown
- `0.15.0` — **ломающее (типы, не провод):** `ARTICLE_CONSTRUCTIVE_FIELDS` → `ARTICLE_ERP_FIELDS`,
  `ArticleConstructiveField` → `ArticleErpField`, и в список добавлено `'name'`. На проводе
  `erpFields` остаётся массивом строк, но теперь может содержать `"name"` — потребитель, который
  исчерпывающе разбирает это поле, обязан обновиться. Провенанс имени делает переименование
  ERP-артикула через `upsertArticle` невозможным (`LKWkalk-yxn`).
```

- [ ] **Step 3: Verify nothing else claims the old contract version**

Run: `grep -rn "0\.14\.0" docs/api-contract.md packages/engine/src/index.ts | head`
Expected: the engine's `ENGINE_CONTRACT_VERSION` is a SEPARATE version line for the packing engine — leave it alone. Only `docs/api-contract.md`'s own header and history mention the DTO contract. If the grep shows the engine constant, that is correct and must not be changed by this task.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass (531 at branch point) — this task changes documentation only.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/022-article-name-provenance-and-confirm-patterns.md docs/api-contract.md
git commit -m "docs(contracts): article name provenance + confirm patterns, contract 0.15.0 (LKWkalk-yxn)"
```

---

### Task 2: Contracts and server — `name` provenance

**Files:**
- Modify: `packages/contracts/src/dto.ts:97-99` and `:131`
- Modify: `apps/server/src/db/articles.ts:1-6`, `:32-37`, `:107-135`, `:137-160`
- Modify: `apps/web/src/screens/SetupScreen.tsx:33`, `:40`, `:210` (type rename only)
- Modify: `apps/web/src/screens/components/ArticleCombobox.tsx:5`, `:20` (type rename only)
- Test: `apps/server/src/db/articles.test.ts`

**Interfaces:**
- Consumes: the contract from Task 1.
- Produces:
  - `ARTICLE_ERP_FIELDS: readonly ['length','width','height','name']`
  - `type ArticleErpField = 'length' | 'width' | 'height' | 'name'`
  - `Article.erpFields: readonly ArticleErpField[]`
  - `upsertArticle` keeps the stored `name` when `'name'` is in the article's `erpFields`.
  - Task 4 relies on `Article.erpFields.includes('name')` being the signal that a name is ERP-owned.

- [ ] **Step 1: Write the failing tests**

Append to `apps/server/src/db/articles.test.ts`. Read the file's existing helpers first (`NOW`, `RULES`, the `openDb(':memory:')` per-test pattern) and reuse them.

Also FIND the existing rename test (around line 56, it asserts that `upsertArticle` changes the name) and **split** it rather than deleting it — the local half stays true:

```ts
it('renames a LOCAL article — its name is nobody else’s', () => {
  const db = openDb(':memory:');
  upsertArticle(db, { itemCode: 'LOC1', name: 'Alt', length: 1200, width: 800, height: 144, rules: RULES }, { now: NOW });

  const out = upsertArticle(db, { itemCode: 'LOC1', name: 'Neu', length: 1200, width: 800, height: 144, rules: RULES }, { now: NOW });

  expect(out.name).toBe('Neu');
  expect(out.erpFields).not.toContain('name');
  db.close();
});

it('refuses to rename an article whose name came from ERPNext', () => {
  const db = openDb(':memory:');
  upsertFromErp(db, { itemCode: 'ABB101', name: 'Gitterbox', length: 1200, width: 800, height: 970 }, { now: NOW });

  const out = upsertArticle(db, { itemCode: 'ABB101', name: 'Gitterbox NEU', length: 1200, width: 800, height: 970, rules: RULES }, { now: NOW });

  expect(out.name).toBe('Gitterbox'); // the ERP name stands
  expect(out.erpFields).toContain('name');
  db.close();
});

it('records name in the provenance list on an ERP write', () => {
  const db = openDb(':memory:');
  const out = upsertFromErp(db, { itemCode: 'A', name: 'Palette', length: 1200 }, { now: NOW });
  // ERPNext always supplies a name; dimensions it omitted stay unlocked.
  expect([...out.erpFields].sort()).toEqual(['length', 'name']);
  db.close();
});

it('lets a later ERP sync change the name — ERPNext owns it', () => {
  const db = openDb(':memory:');
  upsertFromErp(db, { itemCode: 'A', name: 'Alt' }, { now: NOW });
  const out = upsertFromErp(db, { itemCode: 'A', name: 'Neu' }, { now: NOW });
  expect(out.name).toBe('Neu');
  db.close();
});

it('keeps the name lock across a local edit of unlocked fields', () => {
  const db = openDb(':memory:');
  upsertFromErp(db, { itemCode: 'A', name: 'ERP-Name', length: 1200 }, { now: NOW });

  // the user fills a dimension ERPNext left blank, and tries to rename in the same write
  const out = upsertArticle(db, { itemCode: 'A', name: 'Mein Name', length: 1200, width: 800, height: 144, rules: RULES }, { now: NOW });

  expect(out.name).toBe('ERP-Name'); // rename refused
  expect(out.width).toBe(800); // unlocked field accepted
  expect(out.erpFields).toContain('name');
  db.close();
});

it('does not lock the name of an article ERPNext has never touched', () => {
  const db = openDb(':memory:');
  const out = upsertArticle(db, { itemCode: 'LOC2', name: 'Eigen', length: 1000, width: 1000, height: 100, rules: RULES }, { now: NOW });
  expect(out.erpFields).toEqual([]);
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/db/articles.test.ts`
Expected: FAIL — the ERP-rename test gets `'Gitterbox NEU'`, and the provenance tests get `['length']` without `'name'`.

- [ ] **Step 3: Rename the type in the contract package**

In `packages/contracts/src/dto.ts`, replace lines 97-99:

```ts
/** The fields ERPNext is able to supply for an article. `name` included: ERPNext owns it. */
export const ARTICLE_ERP_FIELDS = ['length', 'width', 'height', 'name'] as const;
export type ArticleErpField = (typeof ARTICLE_ERP_FIELDS)[number];
```

and line 131:

```ts
  erpFields: readonly ArticleErpField[];
```

Update the `Article` doc comment above it: the sentence claiming "`name` is never supplied by ERPNext, so it is always locally editable" is now FALSE — replace that clause with: a name ERPNext supplied is locked like any other supplied field, and is changed in ERPNext only.

- [ ] **Step 4: Update the server repository**

In `apps/server/src/db/articles.ts`, change the imports on lines 1-6 from `ARTICLE_CONSTRUCTIVE_FIELDS as CONSTRUCTIVE_FIELDS` / `ArticleConstructiveField as ConstructiveField` to `ARTICLE_ERP_FIELDS as ERP_FIELDS` / `ArticleErpField as ErpField`, and update every use of the old aliases (line 32 comment, lines 36-37, line 111).

In `upsertArticle`, the `keep` helper is typed for numbers and cannot carry the name. Add the name rule beside it:

```ts
  const locked = new Set(erpFieldsOf(prevRow));
  const keep = (field: ErpField, stored: number | undefined, incoming: number | undefined): number | undefined =>
    locked.has(field) ? stored : incoming;
  // The name is ERPNext's when ERPNext supplied it (ADR 022): a local write may not rename such an
  // article. A local article has no 'name' in its provenance, so renaming it still works.
  const name = locked.has('name') && prev ? prev.name : input.name;
```

and use `name` instead of `input.name` in the `write(db, { … })` call.

In `upsertFromErp`, the `supplied` filter must now handle a non-numeric field:

```ts
  const supplied = ERP_FIELDS.filter((f) => erp[f] !== undefined);
```

`ErpArticleFields.name` is a required `string`, so `'name'` always joins the set — which is correct: an ERP write always carries the name. Leave the dimension `take()` calls as they are; `name: erp.name` stays.

- [ ] **Step 5: Update the two web type references (rename only)**

`apps/web/src/screens/SetupScreen.tsx` line 33 (`import type { Article, ArticleConstructiveField }`), line 40 (`LockedFields`) and line 210 (`lockedFieldsFrom`) — swap `ArticleConstructiveField` for `ArticleErpField`.
`apps/web/src/screens/components/ArticleCombobox.tsx` lines 5 and 20 — same swap.

No behaviour change here: `locked.name` will now be settable, but nothing reads it yet (Task 4 does). Critically, do NOT wire `locked.name` to any `readOnly` — the name field is the combobox's search input.

- [ ] **Step 6: Rebuild the contracts package**

`packages/contracts` publishes from a gitignored `dist/`, so consumers keep seeing the old type until it is rebuilt.

Run: `npm run build --workspace packages/contracts`

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run apps/server && npm run typecheck`
Expected: server tests PASS; typecheck clean across all workspaces (this is what proves the rename reached every reference).

- [ ] **Step 8: Full suite and lint**

Run: `npm test && npm run lint`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/dto.ts apps/server/src/db/articles.ts apps/server/src/db/articles.test.ts apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/components/ArticleCombobox.tsx
git commit -m "feat(contracts,server): article name joins ERP provenance, ArticleErpField (LKWkalk-yxn)"
```

---

### Task 3: Web — delete a position or an order from the plan

**Files:**
- Create: `apps/web/src/screens/components/ArmedDelete.tsx`
- Create: `apps/web/src/screens/components/ArmedDelete.test.tsx`
- Modify: `apps/web/src/ui/primitives.tsx:182-207` (`Button` gains `danger`)
- Modify: `apps/web/src/screens/SetupScreen.tsx` (state, mutators, threading, both call sites)
- Modify: `packages/i18n/src/keys.ts`, `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`
- Test: `apps/web/src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (independent of them).
- Produces:
  - `ArmedDelete` component, props `{ armed: boolean; onArm: () => void; onConfirm: () => void; label: string; confirmLabel: string }`
  - `Button` variant `'danger'`
  - `SetupScreen` internals `removePosition(okey: string, pid: string)`, `removeOrder(okey: string)`
  - Locale keys `action.confirmDelete`, `setup.deletePosition`, `setup.deleteOrder`

- [ ] **Step 1: Add the locale keys**

In `packages/i18n/src/keys.ts`, add after `'article.saveError',`:

```ts
  'action.confirmDelete',
  'setup.deletePosition',
  'setup.deleteOrder',
```

In `packages/i18n/src/dictionaries/de.ts`, at the matching position:

```ts
  'action.confirmDelete': 'Löschen bestätigen',
  'setup.deletePosition': 'Position aus der Berechnung entfernen',
  'setup.deleteOrder': 'Auftrag aus der Berechnung entfernen',
```

In `packages/i18n/src/dictionaries/ru.ts`:

```ts
  'action.confirmDelete': 'Подтвердить удаление',
  'setup.deletePosition': 'Убрать позицию из расчёта',
  'setup.deleteOrder': 'Убрать заказ из расчёта',
```

Note the wording: "из расчёта", not "удалить артикул" — the catalogue is untouched and the label must not imply otherwise.

Run: `npm run build --workspace packages/i18n`

- [ ] **Step 2: Write the failing test for the component**

Create `apps/web/src/screens/components/ArmedDelete.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArmedDelete } from './ArmedDelete';

const props = { label: 'Entfernen', confirmLabel: 'Löschen bestätigen' };

describe('ArmedDelete', () => {
  it('shows the trash affordance when not armed and never deletes on its own', () => {
    const onConfirm = vi.fn();
    render(<ArmedDelete armed={false} onArm={vi.fn()} onConfirm={onConfirm} {...props} />);

    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('arms rather than deletes on the first press', async () => {
    const onArm = vi.fn();
    const onConfirm = vi.fn();
    render(<ArmedDelete armed={false} onArm={onArm} onConfirm={onConfirm} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));

    expect(onArm).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('deletes on the press that follows arming', async () => {
    const onConfirm = vi.fn();
    render(<ArmedDelete armed onArm={vi.fn()} onConfirm={onConfirm} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps its own clicks from reaching the document, so arming does not immediately disarm', async () => {
    const onDocClick = vi.fn();
    document.addEventListener('click', onDocClick);
    render(<ArmedDelete armed={false} onArm={vi.fn()} onConfirm={vi.fn()} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));

    expect(onDocClick).not.toHaveBeenCalled();
    document.removeEventListener('click', onDocClick);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/screens/components/ArmedDelete.test.tsx`
Expected: FAIL — cannot resolve `./ArmedDelete`.

- [ ] **Step 4: Implement the component**

Create `apps/web/src/screens/components/ArmedDelete.tsx`:

```tsx
// Two-step delete for one row of a list (ADR 022): the first press only ARMS the control, the
// second one deletes. window.confirm stays for actions that wipe the whole screen; inside a dense
// row it blocks the thread and reads as foreign.
//
// This component owns no arming state — the screen does, as a single value, so "exactly one button
// is armed" holds by construction rather than by keeping per-row flags in step.
import { Button } from '../../ui/primitives';

export function ArmedDelete({
  armed,
  onArm,
  onConfirm,
  label,
  confirmLabel,
}: {
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
  /** Accessible name of the resting (trash) affordance. */
  label: string;
  /** Visible text and accessible name once armed. */
  confirmLabel: string;
}) {
  return (
    // The screen disarms on any document click. Stopping propagation here keeps the very click that
    // armed this button from travelling on and disarming it again in the same gesture.
    <span onClick={(e) => e.stopPropagation()} className="inline-flex shrink-0">
      {armed ? (
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={onArm}
          className="rounded-ctl p-1.5 text-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.5 6.5v5M9.5 6.5v5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 5: Add the `danger` Button variant**

In `apps/web/src/ui/primitives.tsx`, extend the `variant` prop type (line 191) and the `styles` map (lines 198-201):

```ts
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
```

```ts
    danger: 'bg-danger text-[color:var(--danger-ink)] hover:opacity-90',
```

Both tokens already exist: `apps/web/tailwind.config.js:22` maps `danger` to `var(--danger)`, and `apps/web/src/theme.css:31` defines `--danger: #b3261e` alongside `--danger-ink: #ffffff`. Do not invent a new token.

- [ ] **Step 6: Run the component test to verify it passes**

Run: `npx vitest run apps/web/src/screens/components/ArmedDelete.test.tsx`
Expected: PASS, 4/4.

- [ ] **Step 7: Write the failing screen tests**

Append to `apps/web/src/screens/SetupScreen.test.tsx`, reusing the file's existing render helpers and German strings:

```tsx
describe('SetupScreen — removing from the calculation', () => {
  const trashes = () => screen.getAllByRole('button', { name: 'Position aus der Berechnung entfernen' });
  const rows = () => screen.getAllByLabelText('Artikel');

  it('does NOT delete on the first press — that press only arms', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    const before = rows().length;

    await userEvent.click(trashes()[0]);

    expect(rows()).toHaveLength(before);
    expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();
  });

  it('deletes on the second press', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    const before = rows().length;

    await userEvent.click(trashes()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(rows()).toHaveLength(before - 1);
  });

  it('arms exactly one button at a time', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));

    await userEvent.click(trashes()[0]);
    await userEvent.click(trashes()[0]); // the first trash is now the SECOND row's, since row 0 is armed
    expect(screen.getAllByRole('button', { name: 'Löschen bestätigen' })).toHaveLength(1);
  });

  it('disarms on Escape', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await userEvent.click(trashes()[0]);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
  });

  it('disarms on a click elsewhere', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await userEvent.click(trashes()[0]);

    await userEvent.click(screen.getByLabelText('Länge'));

    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
  });

  it('disarms itself after the timeout', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      renderSetup();
      await user.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
      await user.click(trashes()[0]);
      expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removing the last position takes the order with it', async () => {
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Auftrag hinzufügen' }));
    const ordersBefore = screen.getAllByLabelText('Auftragsnummer').length;
    expect(ordersBefore).toBe(2);

    // the second order has exactly one position
    const t = trashes();
    await userEvent.click(t[t.length - 1]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(screen.getAllByLabelText('Auftragsnummer')).toHaveLength(1);
  });

  it('removing the last order leaves a fresh empty one — the screen is never empty', async () => {
    renderSetup();

    await userEvent.click(screen.getByRole('button', { name: 'Auftrag aus der Berechnung entfernen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(screen.getAllByLabelText('Auftragsnummer')).toHaveLength(1);
    expect(screen.getAllByLabelText('Artikel')).toHaveLength(1);
    expect((screen.getByLabelText('Artikel') as HTMLInputElement).value).toBe('');
  });
});
```

Adjust the German aria-label strings (`'Auftragsnummer'`, `'Position hinzufügen'`, `'Auftrag hinzufügen'`, `'Länge'`) to whatever `packages/i18n/src/dictionaries/de.ts` actually contains for `field.orderId`, `setup.addPosition`, `setup.addOrder` and `field.length` — read the dictionary and use the real values. Import `act` from `@testing-library/react` and `vi` from `vitest` if the file does not already.

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`
Expected: FAIL — no trash buttons exist.

- [ ] **Step 9: Add the arming state and mutators to `SetupScreen`**

In `apps/web/src/screens/SetupScreen.tsx`, near the other module constants:

```ts
/** How long an armed delete waits before disarming itself (ADR 022). */
const ARM_TIMEOUT_MS = 4000;
```

Inside `SetupScreen`, beside the other state:

```tsx
  // Exactly one delete may be armed at a time — one value for the whole screen, so that invariant
  // holds by construction instead of by keeping a flag per row in step (ADR 022).
  const [armed, setArmed] = useState<{ kind: 'position' | 'order'; key: string } | null>(null);
  useEffect(() => {
    if (!armed) return;
    const disarm = () => setArmed(null);
    const timer = setTimeout(disarm, ARM_TIMEOUT_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disarm();
    };
    // ArmedDelete stops its own clicks, so this only ever sees clicks somewhere else.
    document.addEventListener('click', disarm);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', disarm);
      document.removeEventListener('keydown', onKey);
    };
  }, [armed]);
```

Add the two mutators next to `addPosition` / `addOrder`:

```tsx
  /** Remove one position from the calculation. The catalogue article is untouched — this says
   *  "not on this truck", not "no such article". An order that loses its last position goes too:
   *  an order with no positions is a state nothing can compute (ADR 022). */
  const removePosition = (okey: string, pid: string) => {
    setArmed(null);
    setOrders((os) => {
      const next = os
        .map((o) => (o.key === okey ? { ...o, positions: o.positions.filter((p) => p.id !== pid) } : o))
        .filter((o) => o.positions.length > 0);
      return next.length > 0 ? next : [emptyOrder(1)];
    });
  };

  /** Remove a whole order. The last one is replaced by a fresh empty order, never left empty. */
  const removeOrder = (okey: string) => {
    setArmed(null);
    setOrders((os) => {
      const next = os.filter((o) => o.key !== okey);
      return next.length > 0 ? next : [emptyOrder(1)];
    });
  };
```

- [ ] **Step 10: Thread the props and render the controls**

Pass to each `<OrderCard>` (beside `onAddPosition`):

```tsx
            armed={armed}
            onArm={(a: { kind: 'position' | 'order'; key: string }) => setArmed(a)}
            onRemoveOrder={() => removeOrder(o.key)}
            onRemovePosition={(pid: string) => removePosition(o.key, pid)}
```

In `OrderCard`'s prop type add:

```ts
  armed: { kind: 'position' | 'order'; key: string } | null;
  onArm: (a: { kind: 'position' | 'order'; key: string }) => void;
  onRemoveOrder: () => void;
  onRemovePosition: (pid: string) => void;
```

In the order header, after the reorder controls, render:

```tsx
        <ArmedDelete
          armed={armed?.kind === 'order' && armed.key === order.key}
          onArm={() => onArm({ kind: 'order', key: order.key })}
          onConfirm={onRemoveOrder}
          label={tt('setup.deleteOrder')}
          confirmLabel={tt('action.confirmDelete')}
        />
```

Give `PositionRow` the two props `armed: boolean` and `onArm: () => void` plus `onRemove: () => void`, pass them from `OrderCard`:

```tsx
            armed={armed?.kind === 'position' && armed.key === p.id}
            onArm={() => onArm({ kind: 'position', key: p.id })}
            onRemove={() => onRemovePosition(p.id)}
```

and render at the END of the position row's flex container, after the details chevron:

```tsx
        <ArmedDelete
          armed={armed}
          onArm={onArm}
          onConfirm={onRemove}
          label={tt('setup.deletePosition')}
          confirmLabel={tt('action.confirmDelete')}
        />
```

Import `ArmedDelete` at the top of `SetupScreen.tsx`.

- [ ] **Step 11: Confirm `orderColors` needs NO change — do not "fix" it**

`buildOrderColors` (`SetupScreen.tsx:174`) is `Object.fromEntries(os.map((o) => [o.orderId, o.colorIndex]))` — rebuilt from the CURRENT order list on every calculate (`SetupScreen.tsx:372`, and `:291` for the demo). A deleted order is simply absent from that list, so its entry cannot survive; the persisted copy in `localStorage` is overwritten by the next calculate.

Add a regression test in `apps/web/src/screens/SetupScreen.test.tsx` pinning that a SURVIVING order keeps its colour slot after another order is removed — that is the property worth protecting, and it is what a future "let's merge instead of rebuild" refactor would break:

```tsx
it('a surviving order keeps its colour slot when another order is removed', async () => {
  const onCalculate = vi.fn();
  renderSetup({ onCalculate });
  await userEvent.click(screen.getByRole('button', { name: 'Auftrag hinzufügen' }));

  // remove the FIRST order, then compute
  await userEvent.click(screen.getAllByRole('button', { name: 'Auftrag aus der Berechnung entfernen' })[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

  const colors = onCalculate.mock.calls.at(-1)?.[1]?.orderColors ?? {};
  expect(Object.keys(colors)).toHaveLength(1);
});
```

Fill in the real props `renderSetup` needs and the real German label for `action.calculate`; the binding assertion is that the map contains only orders that still exist.

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx vitest run apps/web`
Expected: PASS, including every pre-existing Setup test.

- [ ] **Step 13: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/screens/components/ArmedDelete.tsx apps/web/src/screens/components/ArmedDelete.test.tsx apps/web/src/ui/primitives.tsx apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(web): remove a position or an order from the calculation, armed confirm (LKWkalk-yxn)"
```

---

### Task 4: Web — say that the name is changed in ERPNext

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx` (`PositionState`, the combobox `onChange`, `applySuggestion`, the save panel)
- Modify: `packages/i18n/src/keys.ts`, `dictionaries/de.ts`, `dictionaries/ru.ts`
- Test: `apps/web/src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: `ArticleErpField` and `Article.erpFields` possibly containing `'name'` (Task 2).
- Produces: `PositionState.unboundFromErp?: { itemCode: string; name: string }`; locale key `article.renameInErp`.

- [ ] **Step 1: Add the locale key**

`packages/i18n/src/keys.ts`, after `'article.saveError',`:

```ts
  'article.renameInErp',
```

`de.ts`:

```ts
  'article.renameInErp': 'Der Name wird in ERPNext geändert. Speichern legt einen NEUEN Artikel an.',
```

`ru.ts`:

```ts
  'article.renameInErp': 'Имя меняется в ERPNext. Сохранение создаст НОВЫЙ артикул.',
```

Run: `npm run build --workspace packages/i18n`

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/src/screens/SetupScreen.test.tsx`. The file already has `renderSetupWithCatalogue(dpOverrides)` and an `ERP_ARTICLE` fixture — read them and reuse. `ERP_ARTICLE` must have `'name'` in its `erpFields` for these tests; if it does not, add a second fixture rather than mutating the existing one (other tests depend on it).

```tsx
describe('SetupScreen — the name belongs to ERPNext', () => {
  const ERP_NAMED = {
    itemCode: 'ABB101',
    name: 'Gitterbox',
    length: 1200,
    width: 800,
    height: 970,
    rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    source: 'erp',
    updatedAt: '2026-07-21T00:00:00.000Z',
    erpFields: ['length', 'width', 'height', 'name'],
  } as const;

  it('explains where the name is changed once the user edits it away from an ERP article', async () => {
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([ERP_NAMED]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'ABB');
    await userEvent.click(await screen.findByText('Gitterbox'));
    await userEvent.type(box, ' NEU');

    expect(screen.getByText(/ERPNext/)).toBeInTheDocument();
  });

  it('says nothing for an article whose name ERPNext never supplied', async () => {
    const LOCAL = { ...ERP_NAMED, itemCode: 'LOC1', name: 'Eigenbau', source: 'local', erpFields: [] } as const;
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([LOCAL]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'Eig');
    await userEvent.click(await screen.findByText('Eigenbau'));
    await userEvent.type(box, ' 2');

    expect(screen.queryByText(/ERPNext/)).toBeNull();
  });

  it('still lets a brand-new local article be created from free text', async () => {
    const upsertArticle = vi.fn().mockImplementation(async (a) => ({ ...a, source: 'local', updatedAt: 'x', erpFields: [] }));
    renderSetupWithCatalogue({ upsertArticle, searchArticles: vi.fn().mockResolvedValue([]) });

    await userEvent.type(screen.getByLabelText('Artikel'), 'Sonderpalette');
    await userEvent.type(screen.getByLabelText('Länge'), '1340');
    await userEvent.type(screen.getByLabelText('Breite'), '890');
    await userEvent.type(screen.getByLabelText('Höhe'), '178');
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

    expect(upsertArticle).toHaveBeenCalledOnce();
    expect(upsertArticle.mock.calls[0][0].itemCode).toBe('Sonderpalette');
  });

  it('picking a suggestion clears a previous ERPNext notice', async () => {
    const LOCAL = { ...ERP_NAMED, itemCode: 'LOC1', name: 'Eigenbau', source: 'local', erpFields: [] } as const;
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([ERP_NAMED, LOCAL]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'ABB');
    await userEvent.click(await screen.findByText('Gitterbox'));
    await userEvent.type(box, ' NEU');
    expect(screen.getByText(/ERPNext/)).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, 'Eig');
    await userEvent.click(await screen.findByText('Eigenbau'));

    expect(screen.queryByText(/ERPNext/)).toBeNull();
  });
});
```

Replace the German aria-labels with whatever `de.ts` actually holds for `field.length`, `field.width`, `field.height` and `article.save`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`
Expected: FAIL — no ERPNext notice is rendered.

- [ ] **Step 4: Carry the previous binding**

In `apps/web/src/screens/SetupScreen.tsx`, add to `PositionState` (near `articleCode`, around line 62):

```ts
  /** Where this row was bound when the user started editing the name, and only when that article's
   *  name came from ERPNext. Drives the "the name is changed in ERPNext" notice — without it the
   *  row would simply look like free text and a save would fork a second article silently. */
  unboundFromErp?: { itemCode: string; name: string };
```

In `applySuggestion` (around line 217-238), clear it on every pick:

```ts
    unboundFromErp: undefined,
```

In the combobox's `onChange` (line 659), record it while unbinding:

```tsx
            onChange={(name) =>
              onChange({
                name,
                articleCode: undefined,
                locked: {},
                // Keep the first binding we left, not the latest keystroke's.
                unboundFromErp:
                  p.unboundFromErp ??
                  (p.articleCode && p.locked?.name ? { itemCode: p.articleCode, name: p.name } : undefined),
              })
            }
```

`p.locked.name` is populated by `lockedFieldsFrom(s.erpFields)` and is true exactly when ERPNext supplied the name (Task 2). Do NOT give the name field `readOnly` — it is the combobox's search input.

Also clear it after a successful save (the `onChange({ articleCode: saved.itemCode, … })` at line 609): add `unboundFromErp: undefined`.

- [ ] **Step 5: Render the notice**

In the details/nesting panel beside the save button (around lines 798-803), add above or below the existing `saveError` line:

```tsx
        {p.unboundFromErp && p.name.trim() !== p.unboundFromErp.name && (
          <p className="text-caption text-muted">{tt('article.renameInErp')}</p>
        )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 7: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx packages/i18n/src/keys.ts packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(web): say the article name is changed in ERPNext instead of forking a duplicate (LKWkalk-yxn)"
```

---

### Task 5: Changelog

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add the entry**

Read the most recent entry at the top of `docs/CHANGELOG.md` and match its heading style and date format. Then add above it:

```markdown
### Удаление из расчёта и провенанс имени артикула (`LKWkalk-yxn`)

- Позицию и заказ можно убрать из расчёта: корзина в строке, второе нажатие — «Подтвердить
  удаление». Взведена всегда одна кнопка; разоружается по Escape, клику вне и таймауту 4 с.
- Каталог артикулов при этом не трогается: убранный артикул остаётся в базе и продолжает
  предлагаться комбобоксом. Это «не грузим в этот рейс», а не «такого артикула нет».
- Экран настройки больше не может остаться пустым: заказ без позиций схлопывается, последний
  заказ заменяется чистым.
- Имя артикула вошло в провенанс ERPNext ([ADR 022](adr/022-article-name-provenance-and-confirm-patterns.md)):
  правка имени в форме больше не создаёт молча второй артикул, а объясняет, что имя меняется в
  ERPNext. Переименование локального артикула по-прежнему работает.
- Контракт `0.15.0` — ломающее переименование типа: `ArticleConstructiveField` → `ArticleErpField`,
  `ARTICLE_CONSTRUCTIVE_FIELDS` → `ARTICLE_ERP_FIELDS`, в списке появилось `'name'`.
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean. Record the actual test count in the commit body.

- [ ] **Step 3: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): delete from the plan + article name provenance (LKWkalk-yxn)"
```

---

## Notes for the reviewer of each task

- **The app must never gain a write path to ERPNext.** If any task adds a non-GET call to the ERPNext adapter, that is a blocking defect regardless of what it does.
- **Deletion must not touch the catalogue.** No DELETE route, no `deleteArticle` on the provider, no SQLite row removal. A test that asserts an article disappears from the catalogue after a position is deleted is asserting the wrong thing.
- **The lock condition is sacred:** a field is locked when and only when it appears in `erpFields`. Never `source === 'erp' && value != null`.
- **The name field must stay editable.** It is the combobox's search input; making it `readOnly` when locked would kill article lookup. The lock shows as a notice, not a prohibition.
- **"Exactly one armed" must hold by construction** — one value on the screen, not a flag per row. A reviewer seeing per-row arming state should reject it.
- Watch for a test that passes because the first click both armed AND deleted; the "does NOT delete on the first press" test is the one that matters most.
