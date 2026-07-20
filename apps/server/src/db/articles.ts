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
