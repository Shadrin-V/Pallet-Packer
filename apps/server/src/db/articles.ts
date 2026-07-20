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

/** The constructive (dimension) fields ERPNext can supply — the only ones eligible for a lock. */
const CONSTRUCTIVE_FIELDS = ['length', 'width', 'height'] as const;
type ConstructiveField = (typeof CONSTRUCTIVE_FIELDS)[number];

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
  /** JSON array of ConstructiveField names ERPNext actually supplied — the field-level lock set. */
  erp_fields_json: string;
}

/** Row-level input to `write`: the public Article plus the internal per-field lock set. */
type WriteInput = Article & { erpFields: ConstructiveField[] };

const erpFieldsOf = (row: Row | undefined): ConstructiveField[] =>
  row ? (JSON.parse(row.erp_fields_json) as ConstructiveField[]) : [];

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

function getRow(db: Database.Database, itemCode: string): Row | undefined {
  return db.prepare('SELECT * FROM article WHERE item_code = ?').get(itemCode) as Row | undefined;
}

export function getArticle(db: Database.Database, itemCode: string): Article | undefined {
  const row = getRow(db, itemCode);
  return row ? toArticle(row) : undefined;
}

function write(db: Database.Database, a: WriteInput): Article {
  db.prepare(
    `INSERT INTO article (item_code, name, length, width, height, nest_step_pairwise,
                          nest_step_sequential, rules_json, source, synced_at, updated_at, erp_fields_json)
     VALUES (@item_code, @name, @length, @width, @height, @nest_step_pairwise,
             @nest_step_sequential, @rules_json, @source, @synced_at, @updated_at, @erp_fields_json)
     ON CONFLICT(item_code) DO UPDATE SET
       name = @name, length = @length, width = @width, height = @height,
       nest_step_pairwise = @nest_step_pairwise, nest_step_sequential = @nest_step_sequential,
       rules_json = @rules_json, source = @source, synced_at = @synced_at, updated_at = @updated_at,
       erp_fields_json = @erp_fields_json`,
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
    erp_fields_json: JSON.stringify(a.erpFields),
  });
  const { erpFields: _erpFields, ...article } = a;
  return article;
}

/**
 * Local write from the app. A dimension is locked only if ERPNext actually supplied it for this
 * article — tracked field-by-field in `erp_fields_json`, not inferred from `source`. A dimension
 * ERPNext left blank accepts the user's value and stays editable indefinitely, even after being
 * filled once (spec: "пустое поле принимает значение пользователя без ошибки — и остаётся
 * редактируемым дальше"). Nesting increments are never supplied by ERPNext (see
 * `ErpArticleFields`), so they are always locally editable regardless of source, and so is the
 * name — it is not a constructive field. Rules are always taken from the input.
 */
export function upsertArticle(db: Database.Database, input: ArticleInput, opts: { now: string }): Article {
  const prevRow = getRow(db, input.itemCode);
  const prev = prevRow ? toArticle(prevRow) : undefined;
  const locked = new Set(erpFieldsOf(prevRow));
  const keep = (field: ConstructiveField, stored: number | undefined, incoming: number | undefined): number | undefined =>
    locked.has(field) ? stored : incoming;
  return write(db, {
    itemCode: input.itemCode,
    name: input.name,
    length: keep('length', prev?.length, input.length),
    width: keep('width', prev?.width, input.width),
    height: keep('height', prev?.height, input.height),
    nestStepPairwise: input.nestStepPairwise,
    nestStepSequential: input.nestStepSequential,
    rules: input.rules,
    source: prev?.source ?? 'local',
    syncedAt: prev?.syncedAt,
    updatedAt: opts.now,
    erpFields: [...locked],
  });
}

/**
 * Write from ERPNext (order import today, the sync button after LKWkalk-k06). ERPNext owns
 * whichever constructive fields it actually sends; an absent value means "not filled in over
 * there" and must not wipe ours. The set of fields ERPNext has ever supplied for this article is
 * recorded and only ever grows by union — a later sync that omits a field neither un-records it
 * (it stays locked) nor wipes its previously stored value. Rules stay whatever the user
 * configured locally.
 */
export function upsertFromErp(db: Database.Database, erp: ErpArticleFields, opts: { now: string }): Article {
  const prevRow = getRow(db, erp.itemCode);
  const prev = prevRow ? toArticle(prevRow) : undefined;
  const supplied = CONSTRUCTIVE_FIELDS.filter((f) => erp[f] !== undefined);
  const erpFields = [...new Set([...erpFieldsOf(prevRow), ...supplied])];
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
    erpFields,
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
