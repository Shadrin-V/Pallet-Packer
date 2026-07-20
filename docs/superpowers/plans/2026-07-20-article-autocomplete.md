# Article Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preset dropdown and the separate name field in a position row with one article combobox backed by a server-side article catalogue, and let the user save an article's dimensions and rules to that catalogue.

**Architecture:** A new `article` table in `apps/server` (SQLite) holds the catalogue. The SPA reaches it only through the `DataProvider` seam (`searchArticles` / `upsertArticle`). The catalogue splits fields into *constructive* (dimensions, two nesting increments — read-only once ERPNext supplied them) and *free* (packing rules — always local). The engine and the API contract do not change: the position form keeps feeding a single `nesting.stepHeight` to the engine, picking whichever of the two stored increments matches the selected nesting mode.

**Tech Stack:** TypeScript, Fastify + better-sqlite3 (`apps/server`), Vite + React 18 + Testing Library (`apps/web`), Vitest across the monorepo, workspaces `packages/*` + `apps/*`.

**Spec:** `docs/superpowers/specs/2026-07-20-article-autocomplete-design.md`
**Issue:** `LKWkalk-8a0` (closes `LKWkalk-rgv.8` as well)

## Global Constraints

- Внутренние единицы — целые миллиметры (ADR 002). Никаких дробных размеров в БД и DTO.
- Ни одной пользовательской строки в коде: только ключи локалей. Новый ключ добавляется в `packages/i18n/src/keys.ts` И в оба словаря `dictionaries/de.ts`, `dictionaries/ru.ts` — иначе падает `keys.test.ts`.
- Движок (`packages/engine`) и `docs/api-contract.md` в этом плане НЕ меняются. Если задача требует их изменить — остановись и сообщи: нужен ADR.
- SPA не обращается к ERPNext и к `fetch` напрямую — только через `DataProvider` (ADR 015).
- Комментарии и идентификаторы — по-английски, как в существующих файлах. Ответы пользователю — по-русски.
- Тесты запускаются из корня репозитория: `npm test` (vitest run по всем workspace'ам).
- Коммиты атомарные, после зелёных тестов, сообщение на английском.

---

### Task 1: DTO каталога артикулов

**Files:**
- Modify: `packages/contracts/src/dto.ts`
- Test: `packages/contracts/src/dto.test.ts`

**Interfaces:**
- Consumes: `NestingState`, `NestingMode`, `RotationRule`, `ForkAccess`, `ForkAxis` из `@shadrin-v/engine`.
- Produces: типы `ArticleRules`, `ArticleSource`, `Article`, `ArticleInput` — их используют все последующие задачи.

- [ ] **Step 1: Write the failing test**

В конец `packages/contracts/src/dto.test.ts` добавь:

```ts
import type { Article, ArticleInput } from './dto';

describe('Article DTO', () => {
  it('accepts an ERP article with locked constructive fields and free rules', () => {
    const a: Article = {
      itemCode: 'ABB101',
      name: 'Einweg-Holzpalette 600x800 mm IPPC + KD',
      length: 800,
      width: 600,
      height: 144,
      nestStepPairwise: 22,
      nestStepSequential: 30,
      rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly', allowUnpairedTop: true },
      source: 'erp',
      syncedAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
    };
    expect(a.itemCode).toBe('ABB101');
  });

  it('accepts a local article with no dimensions yet (nothing is required but the identity)', () => {
    const input: ArticleInput = {
      itemCode: 'BOX-9',
      name: 'Sonderkiste',
      rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    };
    expect(input.length).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/contracts/src/dto.test.ts`
Expected: FAIL — `Module './dto' has no exported member 'Article'`.

- [ ] **Step 3: Write minimal implementation**

В `packages/contracts/src/dto.ts` расширь импорт из движка и добавь типы в конец файла:

```ts
import type {
  Vehicle,
  Load,
  Layout,
  NestingState,
  NestingMode,
  RotationRule,
  ForkAccess,
  ForkAxis,
} from '@shadrin-v/engine';

/** Packing rules of an article — always local: ERPNext does not know them and never overwrites them. */
export interface ArticleRules {
  state: NestingState;
  nestingMode: NestingMode;
  rotation: RotationRule;
  maxNested?: number;
  maxTiers?: number;
  allowUnpairedTop?: boolean;
  forkAccess?: ForkAccess;
  forkAxis?: ForkAxis;
}

/** 'erp' — constructive fields come from ERPNext and are read-only; 'local' — entered in the app. */
export const ARTICLE_SOURCES = ['erp', 'local'] as const;
export type ArticleSource = (typeof ARTICLE_SOURCES)[number];

/**
 * A catalogue article. Constructive fields (dimensions + both nesting increments) are physical
 * properties of the pallet: once ERPNext supplied them they are locked in the UI. `undefined`
 * means "not filled in yet" — the user may enter it by hand, no error (spec Q5).
 */
export interface Article {
  itemCode: string;
  name: string;
  length?: number;
  width?: number;
  height?: number;
  /** Nesting increment when nesting pairwise = thickness of the top deck board. */
  nestStepPairwise?: number;
  /** Nesting increment when nesting one-into-one (sequential). */
  nestStepSequential?: number;
  rules: ArticleRules;
  source: ArticleSource;
  syncedAt?: string;
  updatedAt: string;
}

/** What the client sends to PUT /api/articles/:itemCode — the server stamps source/updatedAt. */
export type ArticleInput = Omit<Article, 'source' | 'syncedAt' | 'updatedAt'>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/contracts/src/dto.test.ts`
Expected: PASS. Затем `npm run typecheck` — без ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/dto.ts packages/contracts/src/dto.test.ts
git commit -m "feat(contracts): Article DTO — constructive fields apart from packing rules"
```

---

### Task 2: Таблица `article` и репозиторий

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/articles.ts`
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/db/articles.test.ts`

**Interfaces:**
- Consumes: `Article`, `ArticleInput` (Task 1); `openDb` из `./schema`.
- Produces:
  - `upsertArticle(db: Database.Database, input: ArticleInput, opts: { now: string }): Article`
  - `upsertFromErp(db: Database.Database, erp: ErpArticleFields, opts: { now: string }): Article`
  - `getArticle(db: Database.Database, itemCode: string): Article | undefined`
  - `searchArticles(db: Database.Database, query: string, limit?: number): Article[]`
  - `interface ErpArticleFields { itemCode: string; name: string; length?: number; width?: number; height?: number }`

- [ ] **Step 1: Write the failing schema test**

В `apps/server/src/db/schema.test.ts` замени первый тест на:

```ts
  it('creates vehicle + loading_plan + article tables (in-memory)', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(['article', 'loading_plan', 'vehicle']));
    db.close();
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/server/src/db/schema.test.ts`
Expected: FAIL — в списке таблиц нет `article`.

- [ ] **Step 3: Add the table**

В `apps/server/src/db/schema.ts`, внутри `migrate`, после определения `loading_plan` добавь:

```sql
    CREATE TABLE IF NOT EXISTS article (
      item_code            TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      length               INTEGER,
      width                INTEGER,
      height               INTEGER,
      nest_step_pairwise   INTEGER,
      nest_step_sequential INTEGER,
      rules_json           TEXT NOT NULL DEFAULT '{}',
      source               TEXT NOT NULL DEFAULT 'local',
      synced_at            TEXT,
      updated_at           TEXT NOT NULL
    );
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run apps/server/src/db/schema.test.ts`
Expected: PASS (оба теста).

- [ ] **Step 5: Write the failing repo test**

Создай `apps/server/src/db/articles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { openDb } from './schema';
import { upsertArticle, upsertFromErp, getArticle, searchArticles } from './articles';

const NOW = '2026-07-20T10:00:00.000Z';
const RULES = { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } as const;

describe('article repo', () => {
  it('inserts a local article and reads it back', () => {
    const db = openDb(':memory:');
    const saved = upsertArticle(
      db,
      { itemCode: 'ABB101', name: 'Palette', length: 800, width: 600, height: 144, nestStepPairwise: 22, rules: { ...RULES } },
      { now: NOW },
    );
    expect(saved).toMatchObject({ itemCode: 'ABB101', length: 800, nestStepPairwise: 22, source: 'local', updatedAt: NOW });
    expect(getArticle(db, 'ABB101')).toEqual(saved);
    db.close();
  });

  it('keeps ERP-filled constructive fields on a local upsert, but fills the empty ones', () => {
    const db = openDb(':memory:');
    upsertFromErp(db, { itemCode: 'ABB101', name: 'Palette ERP', length: 800, width: 600, height: 144 }, { now: NOW });
    const saved = upsertArticle(
      db,
      // the user tries to change the ERP length and to fill the still-empty pairwise step
      { itemCode: 'ABB101', name: 'Meine Palette', length: 999, width: 600, height: 144, nestStepPairwise: 22, rules: { ...RULES } },
      { now: '2026-07-20T11:00:00.000Z' },
    );
    expect(saved.length).toBe(800); // locked: came from ERP
    expect(saved.nestStepPairwise).toBe(22); // was empty → accepted
    expect(saved.rules.state).toBe('verschachtelt'); // free field: always accepted
    expect(saved.source).toBe('erp'); // provenance survives a local edit
    db.close();
  });

  it('an ERP upsert overwrites constructive fields but never the local rules', () => {
    const db = openDb(':memory:');
    upsertArticle(db, { itemCode: 'X1', name: 'local', length: 100, width: 100, height: 100, rules: { ...RULES, maxTiers: 3 } }, { now: NOW });
    const synced = upsertFromErp(db, { itemCode: 'X1', name: 'ERP name', length: 800, width: 600, height: 144 }, { now: NOW });
    expect(synced).toMatchObject({ name: 'ERP name', length: 800, source: 'erp', syncedAt: NOW });
    expect(synced.rules.maxTiers).toBe(3);
    db.close();
  });

  it('an ERP upsert without dimensions does not wipe what is already stored', () => {
    const db = openDb(':memory:');
    upsertArticle(db, { itemCode: 'X2', name: 'local', length: 800, width: 600, height: 144, rules: { ...RULES } }, { now: NOW });
    const synced = upsertFromErp(db, { itemCode: 'X2', name: 'ERP name' }, { now: NOW });
    expect(synced.length).toBe(800);
    db.close();
  });

  it('search ranks exact code first, then code prefix, then name match; case-insensitive', () => {
    const db = openDb(':memory:');
    const mk = (itemCode: string, name: string) =>
      upsertArticle(db, { itemCode, name, rules: { ...RULES } }, { now: NOW });
    mk('ZZ9', 'Enthält abb im Namen');
    mk('ABB101X', 'Prefix-Treffer');
    mk('ABB101', 'Exakter Treffer');
    expect(searchArticles(db, 'abb101').map((a) => a.itemCode)).toEqual(['ABB101', 'ABB101X']);
    expect(searchArticles(db, 'ABB').map((a) => a.itemCode)).toEqual(['ABB101', 'ABB101X', 'ZZ9']);
    db.close();
  });

  it('an empty query returns the catalogue head, capped by the limit', () => {
    const db = openDb(':memory:');
    for (let i = 0; i < 25; i++) upsertArticle(db, { itemCode: `A${i}`, name: `n${i}`, rules: { ...RULES } }, { now: NOW });
    expect(searchArticles(db, '')).toHaveLength(20);
    expect(searchArticles(db, '', 5)).toHaveLength(5);
    db.close();
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run apps/server/src/db/articles.test.ts`
Expected: FAIL — `Cannot find module './articles'`.

- [ ] **Step 7: Implement the repo**

Создай `apps/server/src/db/articles.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Article, ArticleInput, ArticleRules, ArticleSource } from '@shadrin-v/contracts';

/** The subset ERPNext can supply. Rules are never part of it — ERPNext does not model them. */
export interface ErpArticleFields {
  itemCode: string;
  name: string;
  length?: number;
  width?: number;
  height?: number;
}

interface Row {
  item_code: string;
  name: string;
  length: number | null;
  width: number | null;
  height: number | null;
  nest_step_pairwise: number | null;
  nest_step_sequential: number | null;
  rules_json: string;
  source: string;
  synced_at: string | null;
  updated_at: string;
}

const num = (v: number | null): number | undefined => (v === null ? undefined : v);
const orNull = (v: number | undefined): number | null => (v === undefined ? null : v);

function toArticle(r: Row): Article {
  return {
    itemCode: r.item_code,
    name: r.name,
    length: num(r.length),
    width: num(r.width),
    height: num(r.height),
    nestStepPairwise: num(r.nest_step_pairwise),
    nestStepSequential: num(r.nest_step_sequential),
    rules: JSON.parse(r.rules_json) as ArticleRules,
    source: r.source as ArticleSource,
    syncedAt: r.synced_at ?? undefined,
    updatedAt: r.updated_at,
  };
}

export function getArticle(db: Database.Database, itemCode: string): Article | undefined {
  const row = db.prepare('SELECT * FROM article WHERE item_code = ?').get(itemCode) as Row | undefined;
  return row ? toArticle(row) : undefined;
}

function write(db: Database.Database, a: Article): Article {
  db.prepare(
    `INSERT INTO article (item_code, name, length, width, height, nest_step_pairwise,
                          nest_step_sequential, rules_json, source, synced_at, updated_at)
     VALUES (@item_code, @name, @length, @width, @height, @nest_step_pairwise,
             @nest_step_sequential, @rules_json, @source, @synced_at, @updated_at)
     ON CONFLICT(item_code) DO UPDATE SET
       name = @name, length = @length, width = @width, height = @height,
       nest_step_pairwise = @nest_step_pairwise, nest_step_sequential = @nest_step_sequential,
       rules_json = @rules_json, source = @source, synced_at = @synced_at, updated_at = @updated_at`,
  ).run({
    item_code: a.itemCode,
    name: a.name,
    length: orNull(a.length),
    width: orNull(a.width),
    height: orNull(a.height),
    nest_step_pairwise: orNull(a.nestStepPairwise),
    nest_step_sequential: orNull(a.nestStepSequential),
    rules_json: JSON.stringify(a.rules),
    source: a.source,
    synced_at: a.syncedAt ?? null,
    updated_at: a.updatedAt,
  });
  return a;
}

/**
 * Local write from the app. A constructive field that ERPNext already filled is locked: the stored
 * value wins (spec Q5). Empty ones accept the user's value. Rules are always taken from the input.
 */
export function upsertArticle(db: Database.Database, input: ArticleInput, opts: { now: string }): Article {
  const prev = getArticle(db, input.itemCode);
  const locked = prev?.source === 'erp';
  const keep = (stored: number | undefined, incoming: number | undefined): number | undefined =>
    locked && stored !== undefined ? stored : incoming;
  return write(db, {
    itemCode: input.itemCode,
    name: locked && prev ? prev.name : input.name,
    length: keep(prev?.length, input.length),
    width: keep(prev?.width, input.width),
    height: keep(prev?.height, input.height),
    nestStepPairwise: keep(prev?.nestStepPairwise, input.nestStepPairwise),
    nestStepSequential: keep(prev?.nestStepSequential, input.nestStepSequential),
    rules: input.rules,
    source: prev?.source ?? 'local',
    syncedAt: prev?.syncedAt,
    updatedAt: opts.now,
  });
}

/**
 * Write from ERPNext (order import today, the sync button after LKWkalk-k06). ERPNext owns the
 * constructive fields; an absent value means "not filled in over there" and must not wipe ours.
 * Rules stay whatever the user configured locally.
 */
export function upsertFromErp(db: Database.Database, erp: ErpArticleFields, opts: { now: string }): Article {
  const prev = getArticle(db, erp.itemCode);
  const take = (incoming: number | undefined, stored: number | undefined): number | undefined =>
    incoming ?? stored;
  return write(db, {
    itemCode: erp.itemCode,
    name: erp.name,
    length: take(erp.length, prev?.length),
    width: take(erp.width, prev?.width),
    height: take(erp.height, prev?.height),
    nestStepPairwise: prev?.nestStepPairwise,
    nestStepSequential: prev?.nestStepSequential,
    rules: prev?.rules ?? { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    source: 'erp',
    syncedAt: opts.now,
    updatedAt: opts.now,
  });
}

/** Suggestions for the article combobox: exact code, then code prefix, then name match. */
export function searchArticles(db: Database.Database, query: string, limit = 20): Article[] {
  const q = query.trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT * FROM article
       WHERE lower(item_code) LIKE @like OR lower(name) LIKE @like
       ORDER BY CASE
                  WHEN lower(item_code) = @q THEN 0
                  WHEN lower(item_code) LIKE @prefix THEN 1
                  ELSE 2
                END,
                item_code
       LIMIT @limit`,
    )
    .all({ q, like: `%${q}%`, prefix: `${q}%`, limit }) as Row[];
  return rows.map(toArticle);
}
```

- [ ] **Step 8: Run it to make sure it passes**

Run: `npx vitest run apps/server/src/db/articles.test.ts`
Expected: PASS (6 тестов).

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/schema.test.ts apps/server/src/db/articles.ts apps/server/src/db/articles.test.ts
git commit -m "feat(server): article catalogue table and repo with ERP-locked constructive fields"
```

---

### Task 3: REST-роуты каталога

**Files:**
- Create: `apps/server/src/routes/articles.ts`
- Modify: `apps/server/src/app.ts:20-27`
- Test: `apps/server/src/routes/routes.test.ts`

**Interfaces:**
- Consumes: `searchArticles`, `upsertArticle` (Task 2).
- Produces: `articlesRoutes(app: FastifyInstance, db: Database.Database): void`; HTTP `GET /api/articles?q=`, `PUT /api/articles/:itemCode`.

- [ ] **Step 1: Write the failing test**

В `apps/server/src/routes/routes.test.ts` добавь новый блок в конец `describe('REST routes', ...)`:

```ts
  it('PUT then GET /api/articles searches the catalogue', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    const put = await app.inject({
      method: 'PUT',
      url: '/api/articles/ABB101',
      payload: {
        itemCode: 'ABB101',
        name: 'Einwegpalette',
        length: 800,
        width: 600,
        height: 144,
        nestStepPairwise: 22,
        rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ itemCode: 'ABB101', source: 'local' });

    const res = await app.inject({ method: 'GET', url: '/api/articles?q=abb' });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((a: { itemCode: string }) => a.itemCode)).toEqual(['ABB101']);
    await app.close();
  });

  it('the path param wins over the body itemCode (no smuggling a different article)', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    await app.inject({
      method: 'PUT',
      url: '/api/articles/REAL',
      payload: { itemCode: 'FAKE', name: 'n', rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/articles?q=' });
    expect(res.json().map((a: { itemCode: string }) => a.itemCode)).toEqual(['REAL']);
    await app.close();
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/server/src/routes/routes.test.ts`
Expected: FAIL — 404 на `/api/articles/ABB101`.

- [ ] **Step 3: Implement the routes**

Создай `apps/server/src/routes/articles.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { ArticleInput } from '@shadrin-v/contracts';
import { searchArticles, upsertArticle } from '../db/articles';

/** Article catalogue endpoints — the source of the position-row autocomplete. */
export function articlesRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/articles', async (req) => {
    const { q } = req.query as { q?: string };
    return searchArticles(db, q ?? '');
  });

  app.put('/api/articles/:itemCode', async (req) => {
    const { itemCode } = req.params as { itemCode: string };
    const body = req.body as ArticleInput;
    // The path identifies the article; a mismatching body code is ignored, not honoured.
    return upsertArticle(db, { ...body, itemCode }, { now: new Date().toISOString() });
  });
}
```

В `apps/server/src/app.ts` добавь импорт `import { articlesRoutes } from './routes/articles';` и внутри `if (opts.db) { ... }` строку `articlesRoutes(app, opts.db);`.

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run apps/server/src/routes/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/articles.ts apps/server/src/app.ts apps/server/src/routes/routes.test.ts
git commit -m "feat(server): GET/PUT /api/articles"
```

---

### Task 4: Автопополнение каталога при импорте заказа

**Files:**
- Modify: `apps/server/src/routes/orders.ts`, `apps/server/src/app.ts:20-27`
- Test: `apps/server/src/routes/orders.test.ts`

**Interfaces:**
- Consumes: `upsertFromErp` (Task 2), `OrderSource` (`apps/server/src/erpnext/adapter.ts:8`).
- Produces: изменённая сигнатура `ordersRoutes(app: FastifyInstance, erpnext?: OrderSource, db?: Database.Database): void`.

Импорт остаётся в адаптере без доступа к БД — пополнение делает слой роутов, у которого есть и то и другое.

- [ ] **Step 1: Write the failing test**

В `apps/server/src/routes/orders.test.ts` добавь:

```ts
  it('importing an order seeds the article catalogue and keeps local rules', async () => {
    const db = openDb(':memory:');
    // an article the user already configured by hand
    upsertArticle(
      db,
      { itemCode: 'ABB101', name: 'Meine Palette', rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly', maxTiers: 4 } },
      { now: '2026-07-20T09:00:00.000Z' },
    );
    const erpnext = {
      importOrder: async () => ({
        orderId: 'SO-1',
        positions: [
          { itemCode: 'ABB101', itemName: 'Einwegpalette 600x800', quantity: 10, length: 800, width: 600, height: 144, dimensionsSource: 'erpnext-field' as const },
          { itemCode: 'NEW-1', itemName: 'Ohne Maße', quantity: 2, dimensionsSource: 'manual' as const },
        ],
      }),
      searchOrders: async () => [],
    };
    const app = buildApp({ db, erpnext });

    const res = await app.inject({ method: 'GET', url: '/api/orders/SO-1' });
    expect(res.statusCode).toBe(200);

    const abb = getArticle(db, 'ABB101')!;
    expect(abb).toMatchObject({ length: 800, width: 600, height: 144, source: 'erp' });
    expect(abb.rules.maxTiers).toBe(4); // local rules survive the import
    const fresh = getArticle(db, 'NEW-1')!;
    expect(fresh.name).toBe('Ohne Maße');
    expect(fresh.length).toBeUndefined(); // no dimensions in ERPNext yet — no error, just empty
    await app.close();
  });
```

Добавь в шапку файла недостающие импорты: `import { openDb } from '../db/schema';` и `import { upsertArticle, getArticle } from '../db/articles';`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/server/src/routes/orders.test.ts`
Expected: FAIL — `getArticle(db, 'NEW-1')` возвращает `undefined`.

- [ ] **Step 3: Implement the seeding**

Замени `apps/server/src/routes/orders.ts` на:

```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import type { OrderSource } from '../erpnext/adapter';
import { upsertFromErp } from '../db/articles';

/**
 * ERPNext order endpoints. `erpnext` is undefined when secrets are not configured (today's local
 * test mode) — then every call returns 503 ERR_ERPNEXT_UNCONFIGURED instead of failing obscurely.
 * Importing an order also seeds the article catalogue: those are exactly the articles the user
 * works with, and they arrive with whatever dimensions ERPNext holds.
 */
export function ordersRoutes(app: FastifyInstance, erpnext?: OrderSource, db?: Database.Database): void {
  const unconfigured = (reply: FastifyReply) =>
    reply.code(503).send({ code: 'ERR_ERPNEXT_UNCONFIGURED' });

  app.get('/api/orders', async (req, reply) => {
    if (!erpnext) return unconfigured(reply);
    const { q } = req.query as { q?: string };
    return erpnext.searchOrders(q ?? '');
  });

  app.get('/api/orders/:id', async (req, reply) => {
    if (!erpnext) return unconfigured(reply);
    const { id } = req.params as { id: string };
    const zone = await erpnext.importOrder(id);
    if (db) {
      const now = new Date().toISOString();
      for (const p of zone.positions) {
        upsertFromErp(
          db,
          { itemCode: p.itemCode, name: p.itemName, length: p.length, width: p.width, height: p.height },
          { now },
        );
      }
    }
    return zone;
  });
}
```

В `apps/server/src/app.ts` замени вызов на `ordersRoutes(app, opts.erpnext, opts.db);`.

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run apps/server/src/routes/orders.test.ts`
Expected: PASS (включая существующие тесты про 503).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/orders.ts apps/server/src/app.ts apps/server/src/routes/orders.test.ts
git commit -m "feat(server): seed the article catalogue from imported orders"
```

---

### Task 5: DataProvider — поиск и сохранение артикула

**Files:**
- Modify: `apps/web/src/data/DataProvider.ts`, `apps/web/src/data/HttpDataProvider.ts`, `apps/web/src/data/DataProviderContext.tsx`, `apps/web/src/main.tsx`
- Test: `apps/web/src/data/HttpDataProvider.test.ts`

**Interfaces:**
- Consumes: `Article`, `ArticleInput` (Task 1); эндпоинты (Task 3).
- Produces:
  - `DataProvider.searchArticles(query: string): Promise<Article[]>`
  - `DataProvider.upsertArticle(a: ArticleInput): Promise<Article>`
  - `useOptionalDataProvider(): DataProvider | null` — возвращает `null` вне провайдера (существующие тесты экранов рендерят их без него).

- [ ] **Step 1: Write the failing test**

В `apps/web/src/data/HttpDataProvider.test.ts` добавь:

```ts
  it('GET /api/articles?q= → searchArticles', async () => {
    const articles = [{ itemCode: 'ABB101', name: 'Palette', rules: {}, source: 'local', updatedAt: 'x' }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(articles), { status: 200 }));
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.searchArticles('abb 1')).resolves.toEqual(articles);
    expect(fetchMock).toHaveBeenCalledWith('/api/articles?q=abb%201', expect.objectContaining({ method: 'GET' }));
  });

  it('PUT /api/articles/:itemCode encodes the code and sends the body', async () => {
    const a = { itemCode: 'A/1', name: 'n', rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(a), { status: 200 }));
    const dp = new HttpDataProvider('', fetchMock);
    await dp.upsertArticle(a as never);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles/A%2F1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(a) }),
    );
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/web/src/data/HttpDataProvider.test.ts`
Expected: FAIL — `dp.searchArticles is not a function`.

- [ ] **Step 3: Implement**

В `apps/web/src/data/DataProvider.ts` добавь `Article`, `ArticleInput` в импорт типов и два метода в интерфейс:

```ts
  searchArticles(query: string): Promise<Article[]>;
  upsertArticle(a: ArticleInput): Promise<Article>;
```

В `apps/web/src/data/HttpDataProvider.ts` — тот же импорт и методы:

```ts
  searchArticles(query: string) {
    return this.req<Article[]>(`/api/articles?q=${encodeURIComponent(query)}`);
  }
  upsertArticle(a: ArticleInput) {
    return this.req<Article>(`/api/articles/${encodeURIComponent(a.itemCode)}`, this.json('PUT', a));
  }
```

В `apps/web/src/data/DataProviderContext.tsx` добавь мягкий хук:

```ts
/** Null outside a provider: the article combobox then falls back to the built-in pallet presets. */
export function useOptionalDataProvider(): DataProvider | null {
  return useContext(Ctx);
}
```

В `apps/web/src/main.tsx` подключи провайдер (сейчас шов не подключён вовсе):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DataProviderProvider } from './data/DataProviderContext';
import { HttpDataProvider } from './data/HttpDataProvider';
import './theme.css';

const dataProvider = new HttpDataProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProviderProvider value={dataProvider}>
      <App />
    </DataProviderProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run apps/web/src/data/ && npm run typecheck`
Expected: PASS, типы чистые.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/data apps/web/src/main.tsx
git commit -m "feat(web): article search/upsert on the DataProvider seam, wire the provider into the app"
```

---

### Task 6: Компонент ArticleCombobox

**Files:**
- Create: `apps/web/src/screens/components/ArticleCombobox.tsx`
- Create: `apps/web/src/screens/components/ArticleCombobox.test.tsx`
- Modify: `packages/i18n/src/keys.ts`, `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`

**Interfaces:**
- Consumes: `useOptionalDataProvider` (Task 5), `PALLET_PRESETS` (`apps/web/src/data/presets.ts:24`), `Article` (Task 1).
- Produces:
  - `interface ArticleSuggestion { itemCode?: string; name: string; length?: number; width?: number; height?: number; nestStepPairwise?: number; nestStepSequential?: number; rules?: Partial<ArticleRules>; origin: 'erp' | 'local' | 'standard' }`
  - `<ArticleCombobox value onChange onPick ariaLabel className />`, где `onPick: (s: ArticleSuggestion) => void`.

Новые ключи локалей: `article.label`, `article.source.erp`, `article.source.local`, `article.source.standard`, `article.noMatches`.

- [ ] **Step 1: Add the locale keys**

В `packages/i18n/src/keys.ts` добавь в блок Setup screen:

```ts
  'article.label',
  'article.source.erp',
  'article.source.local',
  'article.source.standard',
  'article.noMatches',
```

В `packages/i18n/src/dictionaries/de.ts`:

```ts
  'article.label': 'Artikel',
  'article.source.erp': 'ERP',
  'article.source.local': 'lokal',
  'article.source.standard': 'Standard',
  'article.noMatches': 'Keine Treffer — Maße bitte eingeben',
```

В `packages/i18n/src/dictionaries/ru.ts`:

```ts
  'article.label': 'Артикул',
  'article.source.erp': 'ERP',
  'article.source.local': 'локально',
  'article.source.standard': 'стандарт',
  'article.noMatches': 'Совпадений нет — введите размеры',
```

Run: `npx vitest run packages/i18n` — должно быть PASS (`keys.test.ts` проверяет полноту словарей).

- [ ] **Step 2: Write the failing test**

Создай `apps/web/src/screens/components/ArticleCombobox.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Article } from '@shadrin-v/contracts';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { DataProviderProvider } from '../../data/DataProviderContext';
import type { DataProvider } from '../../data/DataProvider';
import { ArticleCombobox, type ArticleSuggestion } from './ArticleCombobox';

const ABB: Article = {
  itemCode: 'ABB101',
  name: 'Einwegpalette 600x800',
  length: 800,
  width: 600,
  height: 144,
  nestStepPairwise: 22,
  rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
  source: 'erp',
  updatedAt: 'x',
};

function renderBox(opts: { search?: (q: string) => Promise<Article[]>; onPick?: (s: ArticleSuggestion) => void } = {}) {
  const dp = { searchArticles: opts.search ?? (async () => [ABB]) } as unknown as DataProvider;
  const onPick = opts.onPick ?? vi.fn();
  render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>
        <ArticleCombobox value="" onChange={() => {}} onPick={onPick} ariaLabel="Artikel" />
      </DataProviderProvider>
    </LocaleProvider>,
  );
  return { onPick };
}

describe('ArticleCombobox', () => {
  it('suggests catalogue articles as the user types', async () => {
    renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await waitFor(() => expect(screen.getByRole('option', { name: /ABB101/ })).toBeInTheDocument());
  });

  it('picking a suggestion reports the whole article, dimensions and rules included', async () => {
    const { onPick } = renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'ABB101', length: 800, nestStepPairwise: 22, origin: 'erp' }),
    );
  });

  it('offers the built-in pallet presets even when the catalogue has no match', async () => {
    renderBox({ search: async () => [] });
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'EPAL 1');
    const option = await screen.findByRole('option', { name: /EPAL 1/ });
    expect(option).toBeInTheDocument();
  });

  it('survives a failing catalogue request (offline) by showing the built-ins only', async () => {
    renderBox({ search: async () => { throw new Error('offline'); } });
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'EPAL 2');
    expect(await screen.findByRole('option', { name: /EPAL 2/ })).toBeInTheDocument();
  });

  it('navigates with arrow keys and picks with Enter, closes with Escape', async () => {
    const { onPick } = renderBox();
    const input = screen.getByRole('combobox', { name: 'Artikel' });
    await userEvent.type(input, 'abb');
    await screen.findByRole('option', { name: /ABB101/ });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ itemCode: 'ABB101' }));
    await userEvent.type(input, 'abb');
    await screen.findByRole('option', { name: /ABB101/ });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run apps/web/src/screens/components/ArticleCombobox.test.tsx`
Expected: FAIL — `Cannot find module './ArticleCombobox'`.

- [ ] **Step 4: Implement the component**

Создай `apps/web/src/screens/components/ArticleCombobox.tsx`:

```tsx
// One input replaces the old preset <select> + name field (LKWkalk-8a0, closes rgv.8). Suggestions
// come from the server catalogue via the DataProvider seam, plus the built-in pallet presets as a
// static fallback that works offline and outside a provider.
import { useEffect, useId, useRef, useState } from 'react';
import type { Article, ArticleRules } from '@shadrin-v/contracts';
import { useOptionalDataProvider } from '../../data/DataProviderContext';
import { PALLET_PRESETS } from '../../data/presets';
import { useT } from '../../i18n/LocaleContext';

export interface ArticleSuggestion {
  itemCode?: string;
  name: string;
  length?: number;
  width?: number;
  height?: number;
  nestStepPairwise?: number;
  nestStepSequential?: number;
  rules?: Partial<ArticleRules>;
  /** 'standard' = built-in EPAL preset: no article code, never saved to the catalogue. */
  origin: 'erp' | 'local' | 'standard';
}

const DEBOUNCE_MS = 200;

function builtinMatches(q: string): ArticleSuggestion[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return PALLET_PRESETS.filter((p) => p.name.toLowerCase().includes(needle)).map((p) => ({
    name: p.name,
    length: p.length,
    width: p.width,
    height: p.height,
    origin: 'standard' as const,
  }));
}

function toSuggestion(a: Article): ArticleSuggestion {
  return {
    itemCode: a.itemCode,
    name: a.name,
    length: a.length,
    width: a.width,
    height: a.height,
    nestStepPairwise: a.nestStepPairwise,
    nestStepSequential: a.nestStepSequential,
    rules: a.rules,
    origin: a.source,
  };
}

export function ArticleCombobox({
  value,
  onChange,
  onPick,
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: ArticleSuggestion) => void;
  ariaLabel: string;
  className?: string;
}) {
  const tt = useT();
  const dp = useOptionalDataProvider();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArticleSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced lookup. A failing request (offline, no server) must not break typing — the built-in
  // presets stay available, so the row is still usable.
  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      let fromCatalogue: ArticleSuggestion[] = [];
      try {
        fromCatalogue = dp ? (await dp.searchArticles(query)).map(toSuggestion) : [];
      } catch {
        fromCatalogue = [];
      }
      if (cancelled) return;
      setItems([...fromCatalogue, ...builtinMatches(query)]);
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, dp]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const pick = (s: ArticleSuggestion) => {
    onPick(s);
    setOpen(false);
    setQuery('');
  };

  const originLabel = (o: ArticleSuggestion['origin']) =>
    tt(o === 'erp' ? 'article.source.erp' : o === 'local' ? 'article.source.local' : 'article.source.standard');

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="w-full min-w-0 rounded-ctl border border-line bg-card px-2 py-1.5 text-body font-semibold outline-none focus:border-brand"
        value={value}
        placeholder={tt('article.label')}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(items[active >= 0 ? active : 0]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-80 overflow-auto rounded-ctl border border-line bg-card shadow-lg"
        >
          {items.map((s, i) => (
            <li
              key={`${s.itemCode ?? s.name}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-baseline gap-2 px-2 py-1.5 text-body ${i === active ? 'bg-sub' : ''}`}
              onClick={() => pick(s)}
            >
              {s.itemCode && <span className="font-semibold">{s.itemCode}</span>}
              <span className="truncate">{s.name}</span>
              {s.length !== undefined && s.width !== undefined && s.height !== undefined && (
                <span className="ml-auto shrink-0 text-caption text-muted">
                  {s.length}×{s.width}×{s.height}
                </span>
              )}
              <span className="shrink-0 text-label uppercase text-faint">{originLabel(s.origin)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run it to make sure it passes**

Run: `npx vitest run apps/web/src/screens/components/ArticleCombobox.test.tsx`
Expected: PASS (5 тестов).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/components/ArticleCombobox.tsx apps/web/src/screens/components/ArticleCombobox.test.tsx packages/i18n/src
git commit -m "feat(web): article combobox with catalogue + built-in preset suggestions"
```

---

### Task 7: Два конструктивных прироста в модели формы

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx:36-52,107-122,139-165,255-270,505-525,655-670`, `apps/web/src/data/demo.ts:18,47,49,56,94,104`
- Test: `apps/web/src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: `PositionState` (тот же файл), `stepInvalid` (`apps/web/src/screens/components/stackFormula.ts:34`).
- Produces:
  - `PositionState.nestStepPairwise: Num`, `PositionState.nestStepSequential: Num` (поле `stepHeight` удаляется);
  - `export function activeStep(p: PositionState): Num` — прирост, соответствующий текущему `nestingMode`.

Смысл: сегодня одно поле `stepHeight` означает разное в разных режимах, и переключение режима молча оставляет чужую цифру. Ядро при этом не меняется — `toCargo` кладёт в `nesting.stepHeight` результат `activeStep`.

- [ ] **Step 1: Write the failing test**

В `apps/web/src/screens/SetupScreen.test.tsx` добавь:

```tsx
  it('keeps a separate constructive step per nesting mode (pairwise ≠ sequential)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // switch the row to verschachtelt → the nesting panel with the step field appears
    const STEP = 'Höhenzuwachs je Palette (Δh)';
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.type(screen.getByLabelText(STEP), '22'); // pairwise is the default mode
    await userEvent.selectOptions(screen.getByLabelText('Verschachtelungsmodus'), 'sequential');
    // the sequential step is its own field and starts empty, it does not inherit 22
    expect((screen.getByLabelText(STEP) as HTMLInputElement).value).toBe('');
    await userEvent.type(screen.getByLabelText(STEP), '30');
    await userEvent.selectOptions(screen.getByLabelText('Verschachtelungsmodus'), 'pairwise');
    expect((screen.getByLabelText(STEP) as HTMLInputElement).value).toBe('22');

    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    // the engine still receives a single stepHeight — the one matching the selected mode
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });
```

Подписи взяты из `packages/i18n/src/dictionaries/de.ts`: `cargoType.nesting.stepHeightSeq` = «Höhenzuwachs je Palette (Δh)», `cargoType.nesting.mode` = «Verschachtelungsmodus», `setup.state.ver` = «Ver». `Höhe` в строке позиции — второй элемент (первый принадлежит кузову), отсюда `getAllByLabelText(...)[1]`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx -t 'constructive step'`
Expected: FAIL — поле сохраняет 22 после переключения режима.

- [ ] **Step 3: Implement the split**

В `apps/web/src/screens/SetupScreen.tsx`:

1. В `PositionState` замени `stepHeight: Num;` на:

```ts
  /** Constructive nesting increments (spec Q6): pairwise = top deck board thickness, sequential =
   *  the one-into-one increment. Both are physical properties, both come from the article. */
  nestStepPairwise: Num;
  nestStepSequential: Num;
```

2. Добавь после `numOr0`:

```ts
/** The increment that belongs to the position's current nesting mode. */
export function activeStep(p: PositionState): Num {
  return p.nestingMode === 'pairwise' ? p.nestStepPairwise : p.nestStepSequential;
}

/** Which PositionState field the single on-screen step input writes to. */
function activeStepField(p: PositionState): 'nestStepPairwise' | 'nestStepSequential' {
  return p.nestingMode === 'pairwise' ? 'nestStepPairwise' : 'nestStepSequential';
}
```

3. В `emptyPosition()` замени `stepHeight: '',` на `nestStepPairwise: '', nestStepSequential: '',`.

4. В `toCargo` замени две строки:

```ts
  const step = numOr0(activeStep(p));
  const nestable = p.state === 'verschachtelt' && step > 0;
```

и в объекте `nesting` — `stepHeight: step,`.

5. В строке 265 замени `stepInvalid(p.state, p.stepHeight, p.height)` на `stepInvalid(p.state, activeStep(p), p.height)`; то же в строке 517.

6. В поле ввода прироста (строки ~661-668) замени `value` и `onChange`:

```tsx
                      value={activeStep(p)}
                      onChange={(v) => onChange({ [activeStepField(p)]: v })}
```

7. Миграция сохранённого черновика: в `loadSetup()`, в ветке успешного разбора, преобразуй позиции старого формата:

```ts
      // Drafts saved before the two constructive steps existed carry a single `stepHeight`.
      const orders = parsed.orders.map((o, i) => ({
        ...o,
        colorIndex: o.colorIndex ?? i,
        positions: o.positions.map((p) => {
          const legacy = (p as PositionState & { stepHeight?: Num }).stepHeight;
          if (legacy === undefined) return p;
          const { stepHeight: _drop, ...rest } = p as PositionState & { stepHeight?: Num };
          return p.nestingMode === 'sequential'
            ? { ...rest, nestStepSequential: legacy, nestStepPairwise: '' as Num }
            : { ...rest, nestStepPairwise: legacy, nestStepSequential: '' as Num };
        }),
      }));
```

8. В `apps/web/src/data/demo.ts`: в базовой позиции (строка 18) замени `stepHeight: '',` на `nestStepPairwise: '', nestStepSequential: '',`, а в вариантах — `stepHeight: 22` → `nestStepPairwise: 22`, `stepHeight: 30` (режим `sequential`) → `nestStepSequential: 30`, `stepHeight: 20` → `nestStepPairwise: 20`. Правило простое: `pairwise` → `nestStepPairwise`, `sequential` → `nestStepSequential`.

- [ ] **Step 4: Run the whole web suite**

Run: `npx vitest run apps/web && npm run typecheck`
Expected: PASS — новый тест зелёный, существующие тесты про вложение тоже (они вводят прирост через ту же подпись поля).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/SetupScreen.tsx apps/web/src/screens/SetupScreen.test.tsx apps/web/src/data/demo.ts
git commit -m "fix(web): one constructive nesting step per mode — switching modes no longer reuses a foreign increment"
```

---

### Task 8: Комбобокс в строке позиции, запертые поля, сохранение артикула

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx:29-31,36-52,107-122,325-340,490-575,686-712`
- Delete: `apps/web/src/data/userPresets.ts`
- Test: `apps/web/src/screens/SetupScreen.test.tsx`
- Modify: `packages/i18n/src/keys.ts`, `packages/i18n/src/dictionaries/de.ts`, `packages/i18n/src/dictionaries/ru.ts`

**Interfaces:**
- Consumes: `ArticleCombobox`, `ArticleSuggestion` (Task 6); `activeStep` (Task 7); `useOptionalDataProvider` (Task 5).
- Produces: `PositionState.articleCode?: string`, `PositionState.locked?: LockedFields`, где
  `type LockedFields = Partial<Record<'length' | 'width' | 'height' | 'nestStepPairwise' | 'nestStepSequential', true>>`.

Новые ключи локалей: `article.save`, `article.update`, `article.lockedHint`.

- [ ] **Step 1: Add the locale keys**

`packages/i18n/src/keys.ts` — добавь `'article.save'`, `'article.update'`, `'article.lockedHint'`.
`de.ts`: `'article.save': 'Artikel in die Datenbank speichern'`, `'article.update': 'Artikel aktualisieren'`, `'article.lockedHint': 'Konstruktionsmaß aus ERPNext — dort ändern'`.
`ru.ts`: `'article.save': 'Сохранить артикул в базу'`, `'article.update': 'Обновить артикул'`, `'article.lockedHint': 'Конструктивный размер из ERPNext — меняется там'`.

Удали ставшие ненужными ключи `'setup.savePreset'` и `'setup.deletePreset'` из `keys.ts` и обоих словарей.

Run: `npx vitest run packages/i18n` → PASS.

- [ ] **Step 2: Write the failing test**

В `apps/web/src/screens/SetupScreen.test.tsx` добавь хелпер и тесты. Хелпер оборачивает экран в провайдер-заглушку (существующий `renderSetup` оставь как есть — он проверяет работу без провайдера):

```tsx
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import type { Article } from '@shadrin-v/contracts';

const ERP_ARTICLE: Article = {
  itemCode: 'ABB101',
  name: 'Einwegpalette 600x800',
  length: 800,
  width: 600,
  height: 144,
  nestStepPairwise: 22,
  rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly', maxTiers: 5 },
  source: 'erp',
  updatedAt: 'x',
};

function renderSetupWithCatalogue(dpOverrides: Partial<DataProvider> = {}) {
  const upsertArticle = vi.fn(async (a: unknown) => a as Article);
  const dp = { searchArticles: async () => [ERP_ARTICLE], upsertArticle, ...dpOverrides } as unknown as DataProvider;
  render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>
        <SetupScreen onCalculate={() => {}} />
      </DataProviderProvider>
    </LocaleProvider>,
  );
  return { upsertArticle };
}

describe('SetupScreen article combobox', () => {
  it('has no preset dropdown and no separate name field any more (rgv.8)', () => {
    renderSetup(() => {});
    expect(screen.queryByLabelText('Ladungsart')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Artikel' })).toBeInTheDocument();
  });

  it('picking an article fills dimensions, both steps and the rules', async () => {
    renderSetupWithCatalogue();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    expect((screen.getAllByLabelText('Länge')[1] as HTMLInputElement).value).toBe('800');
    expect((screen.getAllByLabelText('Höhe')[1] as HTMLInputElement).value).toBe('144');
    // rules came along: the row switched to verschachtelt and carries the pairwise step
    expect((screen.getByLabelText('Höhenzuwachs je Palette (Δh)') as HTMLInputElement).value).toBe('22');
  });

  it('dimensions that came from ERP are read-only, empty ones stay editable', async () => {
    renderSetupWithCatalogue({ searchArticles: async () => [{ ...ERP_ARTICLE, height: undefined }] } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    expect(screen.getAllByLabelText('Länge')[1]).toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Höhe')[1]).not.toHaveAttribute('readonly');
  });

  it('saves a typed-in article to the catalogue', async () => {
    const { upsertArticle } = renderSetupWithCatalogue({ searchArticles: async () => [] } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));
    expect(upsertArticle).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'NEU-1', length: 1200, width: 800, height: 144 }),
    );
  });

  it('a row without a picked article still computes (free text, manual dimensions)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'Sonderkiste');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '500');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.cargo[0].name).toBe('Sonderkiste');
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run apps/web/src/screens/SetupScreen.test.tsx -t 'article combobox'`
Expected: FAIL — комбобокса нет, есть `Ladungstyp`.

- [ ] **Step 4: Implement the row**

В `apps/web/src/screens/SetupScreen.tsx`:

1. Импорты: убери строку 30 (`loadUserPallets, addUserPallet, ...`), из строки 29 убери `PALLET_PRESETS` (остаётся `VEHICLE_PRESETS`, `DimPreset`), добавь:

```ts
import { ArticleCombobox, type ArticleSuggestion } from './components/ArticleCombobox';
import { useOptionalDataProvider } from '../data/DataProviderContext';
```

2. В `PositionState` добавь:

```ts
  /** Catalogue article this row is bound to; undefined = free text, not saved anywhere. */
  articleCode?: string;
  /** Constructive fields ERPNext already filled — read-only in the form (spec Q5). */
  locked?: LockedFields;
```

и рядом с типом:

```ts
export type LockedField = 'length' | 'width' | 'height' | 'nestStepPairwise' | 'nestStepSequential';
export type LockedFields = Partial<Record<LockedField, true>>;
```

3. Удали состояние `userPallets` (строка 176) и все пропсы `userPallets` / `onSavePreset` / `onDeletePreset` в цепочке `SetupScreen → OrderCard → PositionRow` (строки 332-333, 378-379, 392-394, 463-464, 493-494, 503-505).

4. Функция применения подсказки — добавь рядом с `toCargo`:

```ts
/** Apply a picked suggestion to a position: name, constructive fields, rules; quantity untouched. */
export function applySuggestion(s: ArticleSuggestion): Partial<PositionState> {
  const locked: LockedFields = {};
  if (s.origin === 'erp') {
    for (const f of ['length', 'width', 'height', 'nestStepPairwise', 'nestStepSequential'] as LockedField[]) {
      if (s[f] !== undefined) locked[f] = true;
    }
  }
  const r = s.rules ?? {};
  return {
    articleCode: s.itemCode,
    name: s.name,
    length: s.length ?? '',
    width: s.width ?? '',
    height: s.height ?? '',
    nestStepPairwise: s.nestStepPairwise ?? '',
    nestStepSequential: s.nestStepSequential ?? '',
    ...(r.state ? { state: r.state } : {}),
    ...(r.nestingMode ? { nestingMode: r.nestingMode } : {}),
    ...(r.rotation ? { rotation: r.rotation } : {}),
    ...(r.forkAccess ? { forkAccess: r.forkAccess } : {}),
    ...(r.forkAxis ? { forkAxis: r.forkAxis } : {}),
    ...(r.maxNested !== undefined ? { maxNested: r.maxNested } : {}),
    ...(r.maxTiers !== undefined ? { maxTiers: r.maxTiers } : {}),
    ...(r.allowUnpairedTop !== undefined ? { allowUnpairedTop: r.allowUnpairedTop } : {}),
    locked,
  };
}
```

5. В `PositionRow` замени `Select` пресетов и `TextField` имени (строки 549-572) на:

```tsx
        <span className="w-64 shrink-0">
          <ArticleCombobox
            ariaLabel={tt('article.label')}
            value={p.name}
            onChange={(name) => onChange({ name, articleCode: undefined, locked: {} })}
            onPick={(s) => {
              onSetOpen(false); // picking another article collapses the nesting panel (E16)
              onChange(applySuggestion(s));
            }}
            className="w-full"
          />
        </span>
```

6. Три поля габаритов получают `readOnly` и подсказку. Для этого добавь в `Measure` (`apps/web/src/ui/primitives.tsx`) необязательный проп `readOnly?: boolean`, пробрасываемый в `<input readOnly={readOnly}>`, и используй:

```tsx
        <span className="w-24"><Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length })} readOnly={!!p.locked?.length} /></span>
        <span className="w-24"><Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width })} readOnly={!!p.locked?.width} /></span>
        <span className="w-24"><Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height })} readOnly={!!p.locked?.height} /></span>
```

Поле прироста (Task 7, шаг 6) получает `readOnly={!!p.locked?.[activeStepField(p)]}` и рядом `<InfoHint ariaLabel={tt('article.label')} text={tt('article.lockedHint')} />`, когда поле заперто.

7. Кнопка сохранения (заменяет блок 686-712 целиком):

```tsx
          {dimsPresent && p.name.trim() !== '' && (
            <div>
              <Button variant="ghost" onClick={onSaveArticle}>
                {tt(p.articleCode ? 'article.update' : 'article.save')}
              </Button>
            </div>
          )}
```

Обработчик поднимается на уровень `SetupScreen`, где доступен провайдер:

```tsx
  const dp = useOptionalDataProvider();
  const saveArticle = async (p: PositionState) => {
    if (!dp) return;
    const itemCode = (p.articleCode ?? p.name).trim();
    if (!itemCode || !dimsComplete(p)) return;
    await dp.upsertArticle({
      itemCode,
      name: p.name.trim(),
      length: numOr0(p.length),
      width: numOr0(p.width),
      height: numOr0(p.height),
      ...(numOr0(p.nestStepPairwise) > 0 ? { nestStepPairwise: numOr0(p.nestStepPairwise) } : {}),
      ...(numOr0(p.nestStepSequential) > 0 ? { nestStepSequential: numOr0(p.nestStepSequential) } : {}),
      rules: {
        state: p.state,
        nestingMode: p.nestingMode,
        rotation: p.rotation,
        ...(p.forkAccess ? { forkAccess: p.forkAccess } : {}),
        ...(p.forkAxis ? { forkAxis: p.forkAxis } : {}),
        ...(numOr0(p.maxNested) > 0 ? { maxNested: numOr0(p.maxNested) } : {}),
        ...(numOr0(p.maxTiers) > 0 ? { maxTiers: numOr0(p.maxTiers) } : {}),
        ...(p.nestingMode === 'pairwise' ? { allowUnpairedTop: p.allowUnpairedTop } : {}),
      },
    });
  };
```

с хелпером рядом с `numOr0`:

```ts
const dimsComplete = (p: PositionState): boolean =>
  numOr0(p.length) > 0 && numOr0(p.width) > 0 && numOr0(p.height) > 0;
```

Проброс: `SetupScreen` → `OrderCard` → `PositionRow` новым пропом `onSaveArticle: () => void` (в `OrderCard` — `onSaveArticle={() => onSaveArticle(pos)}`), ровно там, где раньше шли `onSavePreset`/`onDeletePreset`.

8. Удали файл каталога в localStorage:

```bash
git rm apps/web/src/data/userPresets.ts
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS. Если падают старые тесты, обращавшиеся к `Ladungstyp` (селект пресетов) или к `setup.savePreset` — перепиши их на комбобокс; такие тесты устарели вместе с полем, это ожидаемая часть задачи.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src packages/i18n/src
git commit -m "feat(web): article combobox replaces the preset select and the name field; save articles to the catalogue"
```

---

### Task 9: Документация и закрытие задач

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `CLAUDE.md` (раздел «Технические договорённости» — хранение справочников)

- [ ] **Step 1: Update the changelog**

Добавь в `docs/CHANGELOG.md` запись текущей версии:

```markdown
### Added
- Каталог артикулов на сервере (`article`): поиск-автокомплит в строке позиции, сохранение артикула
  с габаритами и правилами, автопополнение при импорте заказа из ERPNext.

### Changed
- Строка позиции: одно поле «Артикул» вместо выбора пресета и отдельного поля названия (LKWkalk-rgv.8).
- Прирост вложения разделён на два конструктивных поля (парное = толщина верхнего настила,
  «один в один»); переключение режима больше не подставляет чужую цифру. Контракт движка не изменился.

### Removed
- Пользовательские пресеты в localStorage (`apps/web/src/data/userPresets.ts`) — записи без артикула
  не участвуют в подсказках и синхронизации.
```

- [ ] **Step 2: Fix the storage line in CLAUDE.md**

В разделе «Технические договорённости» строку про хранение справочников дополни: справочник артикулов живёт в SQLite на `apps/server`, ERPNext — источник истины для конструктивных полей.

- [ ] **Step 3: Commit and close the issues**

```bash
git add docs/CHANGELOG.md CLAUDE.md
git commit -m "docs: changelog for the article catalogue"
bd close LKWkalk-rgv.8 --reason "Закрыто вместе с LKWkalk-8a0: поле пресета и поле названия заменены одним комбобоксом артикула"
bd close LKWkalk-8a0 --reason "Каталог артикулов + автокомплит + сохранение в базу; синк с ERP — отдельной задачей после k06"
```

- [ ] **Step 4: File the follow-up**

```bash
bd create "Кнопка синхронизации каталога артикулов с ERPNext (source=erp, synced_at)" -p 2 -t feature \
  -d "Схема и репозиторий готовы (upsertFromErp, поля source/synced_at). Нужен роут POST /api/articles/sync, метод DataProvider.syncArticlesFromErp() и кнопка в UI. Габариты приезжают из кастом-полей custom_length_mm/width/height — поэтому зависит от LKWkalk-k06." \
  --deps "blocked-by:LKWkalk-k06"
```

---

## Self-Review

**Покрытие спеки:**

| Требование спеки | Задача |
|---|---|
| Таблица `article` с конструктивными и свободными полями | Task 2 |
| Запирание конструктивных полей только при значении из ERP | Task 2 (репозиторий), Task 8 (форма) |
| Два конструктивных прироста, ядро не меняется | Task 1 (DTO), Task 7 (форма) |
| `searchArticles` / `upsertArticle` на шве DataProvider | Task 5 |
| Порядок выдачи: точное → префикс → название, лимит 20 | Task 2 |
| Автопополнение из импорта заказа, локальные правила не затираются | Task 4 |
| Комбобокс вместо пресета и поля названия | Task 6, Task 8 |
| Подстановка габаритов и правил при выборе | Task 8 |
| Кнопка «Сохранить артикул в базу» / «Обновить артикул» | Task 8 |
| Клавиатура: стрелки, Enter, Escape | Task 6 |
| Встроенные EPAL остаются подсказками «стандарт» | Task 6 |
| Удаление `userPresets.ts` | Task 8 |
| i18n de/ru для всех новых строк | Task 6, Task 8 |
| Синк с ERP — вне рамок, отдельная задача | Task 9 |

Пробелов нет. Заглушек в шагах нет — каждый шаг с кодом содержит код. Имена и сигнатуры сквозные: `upsertArticle`/`upsertFromErp`/`searchArticles`/`getArticle` (Task 2) используются в Tasks 3–4 в том же виде; `ArticleSuggestion.origin` (Task 6) читается в `applySuggestion` (Task 8); `activeStep`/`activeStepField` (Task 7) используются в Task 8.
