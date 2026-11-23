import { describe, it, expect } from 'vitest';
import { openDb } from '../db/schema';
import { upsertArticle } from '../db/articles';
import { exportCatalog } from './exportCatalog';

const seed = () => {
  const db = openDb(':memory:');
  upsertArticle(
    db,
    { itemCode: 'B2', name: 'Kiste', rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'none' } },
    { now: 'x' },
  );
  upsertArticle(
    db,
    {
      itemCode: 'A1',
      name: 'Palette',
      length: 1200,
      width: 800,
      height: 144,
      nestStepPairwise: 22,
      nestStepSequential: 30,
      rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    },
    { now: 'x' },
  );
  return db;
};

describe('exportCatalog', () => {
  it('orders by item code, emits only ArticleInput keys, omits empty dimensions', () => {
    const db = seed();
    const { articles: out, skipped } = exportCatalog(db);
    expect(skipped).toEqual([]);
    expect(out.map((a) => a.itemCode)).toEqual(['A1', 'B2']);
    expect(Object.keys(out[1]).sort()).toEqual(['itemCode', 'name', 'rules']);
    expect(Object.keys(out[0]).sort()).toEqual(
      ['height', 'itemCode', 'length', 'name', 'nestStepPairwise', 'nestStepSequential', 'rules', 'width'],
    );
    expect(out[0]).not.toHaveProperty('erpFields');
    expect(out[0]).not.toHaveProperty('source');
    db.close();
  });

  it('legacy empty rules fall back to the defaults', () => {
    const db = seed();
    db.prepare("UPDATE article SET rules_json='{}' WHERE item_code='A1'").run();
    expect(exportCatalog(db).articles[0].rules).toEqual({ state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' });
    db.close();
  });

  it('keeps optional rule fields of a complete rules object', () => {
    const db = seed();
    const rules = { state: 'verschachtelt', nestingMode: 'sequential', rotation: 'none', maxNested: 5 };
    db.prepare('UPDATE article SET rules_json=? WHERE item_code=?').run(JSON.stringify(rules), 'A1');
    expect(exportCatalog(db).articles[0].rules).toEqual(rules);
    db.close();
  });

  const setRules = (db: ReturnType<typeof seed>, json: string) =>
    db.prepare('UPDATE article SET rules_json=? WHERE item_code=?').run(json, 'A1');
  const skippedOf = (db: ReturnType<typeof seed>) => exportCatalog(db).skipped;

  it('partial rules are skipped, not completed with invented defaults', () => {
    const db = seed();
    setRules(db, '{"state":"verschachtelt"}');
    const r = exportCatalog(db);
    expect(r.skipped).toEqual([{ itemCode: 'A1', reason: 'RULES_INCOMPLETE' }]);
    expect(r.articles.map((a) => a.itemCode)).toEqual(['B2']);
    db.close();
  });

  it('unknown rule key is skipped, not silently dropped', () => {
    const db = seed();
    setRules(db, '{"state":"verschachtelt","nestingMode":"pairwise","rotation":"yawOnly","bogus":1}');
    expect(skippedOf(db)).toEqual([{ itemCode: 'A1', reason: 'RULES_UNKNOWN_KEY' }]);
    db.close();
  });

  it('prototype-property names are unknown rule keys', () => {
    const db = seed();
    setRules(db, '{"state":"verschachtelt","nestingMode":"pairwise","rotation":"yawOnly","toString":1}');
    expect(skippedOf(db)).toEqual([{ itemCode: 'A1', reason: 'RULES_UNKNOWN_KEY' }]);
    db.close();
  });

  it('bad rule value is skipped', () => {
    const db = seed();
    setRules(db, '{"state":"x","nestingMode":"pairwise","rotation":"yawOnly"}');
    expect(skippedOf(db)).toEqual([{ itemCode: 'A1', reason: 'RULES_BAD_VALUE' }]);
    setRules(db, '{"state":"verschachtelt","nestingMode":"pairwise","rotation":"yawOnly","maxNested":0}');
    expect(skippedOf(db)).toEqual([{ itemCode: 'A1', reason: 'RULES_BAD_VALUE' }]);
    db.close();
  });

  it('broken rules JSON is skipped with the item code, the rest is exported', () => {
    const db = seed();
    setRules(db, '{not json');
    const r = exportCatalog(db);
    expect(r.skipped).toEqual([{ itemCode: 'A1', reason: 'RULES_NOT_JSON' }]);
    expect(r.articles.map((a) => a.itemCode)).toEqual(['B2']);
    db.close();
  });

  it.each([0, -5, 1200.5, 20001])('dimension %s is skipped', (v) => {
    const db = seed();
    db.prepare('UPDATE article SET length=? WHERE item_code=?').run(v, 'A1');
    expect(skippedOf(db)).toEqual([{ itemCode: 'A1', reason: 'DIMENSION_OUT_OF_RANGE' }]);
    db.close();
  });

  it('nesting steps are range-checked too, 20000 is the inclusive maximum', () => {
    const db = seed();
    db.prepare('UPDATE article SET nest_step_pairwise=0 WHERE item_code=?').run('A1');
    expect(skippedOf(db)).toEqual([{ itemCode: 'A1', reason: 'DIMENSION_OUT_OF_RANGE' }]);
    db.prepare('UPDATE article SET nest_step_pairwise=20000, height=1 WHERE item_code=?').run('A1');
    expect(skippedOf(db)).toEqual([]);
    db.close();
  });

  it('empty item code is skipped', () => {
    const db = seed();
    db.prepare("UPDATE article SET item_code='' WHERE item_code='B2'").run();
    const r = exportCatalog(db);
    expect(r.skipped).toEqual([{ itemCode: '', reason: 'EMPTY_CODE' }]);
    expect(r.articles.map((a) => a.itemCode)).toEqual(['A1']);
    db.close();
  });
});
