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
    const out = exportCatalog(db);
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
    expect(exportCatalog(db)[0].rules).toEqual({ state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' });
    db.close();
  });

  it('keeps optional rule fields of a complete rules object', () => {
    const db = seed();
    const rules = { state: 'verschachtelt', nestingMode: 'sequential', rotation: 'none', maxNested: 5 };
    db.prepare('UPDATE article SET rules_json=? WHERE item_code=?').run(JSON.stringify(rules), 'A1');
    expect(exportCatalog(db)[0].rules).toEqual(rules);
    db.close();
  });
});
