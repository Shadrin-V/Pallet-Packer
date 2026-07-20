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
