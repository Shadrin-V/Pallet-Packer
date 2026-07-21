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

  it('lets the user correct a nesting increment more than once on an ERP-sourced article', () => {
    const db = openDb(':memory:');
    upsertFromErp(db, { itemCode: 'ABB101', name: 'Palette ERP', length: 800, width: 600, height: 144 }, { now: NOW });
    // ERP never supplies the increments, so they must stay editable no matter how many times
    // the user changes their mind — the lock only ever applies to dimensions.
    upsertArticle(
      db,
      { itemCode: 'ABB101', name: 'Palette ERP', length: 800, width: 600, height: 144, nestStepPairwise: 22, rules: { ...RULES } },
      { now: '2026-07-20T11:00:00.000Z' },
    );
    const corrected = upsertArticle(
      db,
      { itemCode: 'ABB101', name: 'Palette ERP', length: 800, width: 600, height: 144, nestStepPairwise: 25, rules: { ...RULES } },
      { now: '2026-07-20T12:00:00.000Z' },
    );
    expect(corrected.nestStepPairwise).toBe(25);
    db.close();
  });

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

  it('lets the user correct a locally-filled dimension that ERPNext left blank, more than once', () => {
    const db = openDb(':memory:');
    // ERPNext supplies length only; height is genuinely absent over there (ErpArticleFields.height is optional).
    upsertFromErp(db, { itemCode: 'H1', name: 'Palette', length: 800 }, { now: NOW });
    const filled = upsertArticle(
      db,
      { itemCode: 'H1', name: 'Palette', length: 800, width: 600, height: 500, rules: { ...RULES } },
      { now: '2026-07-20T11:00:00.000Z' },
    );
    expect(filled.height).toBe(500); // empty field accepts the user's value
    const corrected = upsertArticle(
      db,
      { itemCode: 'H1', name: 'Palette', length: 800, width: 600, height: 550, rules: { ...RULES } },
      { now: '2026-07-20T12:00:00.000Z' },
    );
    expect(corrected.height).toBe(550); // a field ERPNext never supplied must stay editable indefinitely
    expect(corrected.length).toBe(800); // meanwhile the ERP-supplied field stays locked throughout
    db.close();
  });

  it('keeps an ERP-supplied dimension locked even when a sibling field is user-editable', () => {
    const db = openDb(':memory:');
    upsertFromErp(db, { itemCode: 'H2', name: 'Palette', length: 800 }, { now: NOW });
    const saved = upsertArticle(
      db,
      { itemCode: 'H2', name: 'Palette', length: 999, width: 600, height: 500, rules: { ...RULES } },
      { now: '2026-07-20T11:00:00.000Z' },
    );
    expect(saved.length).toBe(800); // ERP supplied it: locked, the local 999 is discarded
    expect(saved.height).toBe(500); // ERP never supplied it: accepted
    db.close();
  });

  it('a later ERP write that omits a previously-supplied field keeps it locked and does not wipe its value', () => {
    const db = openDb(':memory:');
    upsertFromErp(db, { itemCode: 'H3', name: 'Palette', length: 800, width: 600, height: 144 }, { now: NOW });
    // second sync only re-sends the name (e.g. ERPNext dropped the custom fields from this payload)
    const synced = upsertFromErp(db, { itemCode: 'H3', name: 'Palette v2' }, { now: '2026-07-20T11:00:00.000Z' });
    expect(synced.length).toBe(800); // omission must not wipe the stored value
    const attempt = upsertArticle(
      db,
      { itemCode: 'H3', name: 'Palette v2', length: 999, width: 600, height: 144, rules: { ...RULES } },
      { now: '2026-07-20T12:00:00.000Z' },
    );
    expect(attempt.length).toBe(800); // omission must not un-record it either: still locked
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

  it('reports the ERP-supplied field list on getArticle and searchArticles for an ERP-sourced article', () => {
    const db = openDb(':memory:');
    upsertFromErp(db, { itemCode: 'ERP1', name: 'Palette', length: 800, width: 600 }, { now: NOW });
    // ERPNext always supplies a name (ADR 022), so it always joins the provenance list alongside
    // whichever dimensions were sent. Sort both sides: this pins the *set* of required members,
    // not the declaration order of ARTICLE_ERP_FIELDS.
    expect([...(getArticle(db, 'ERP1')?.erpFields ?? [])].sort()).toEqual(['length', 'name', 'width']);
    expect([...searchArticles(db, 'ERP1')[0].erpFields].sort()).toEqual(['length', 'name', 'width']);
    db.close();
  });

  it('reports an empty erpFields list for a purely local article', () => {
    const db = openDb(':memory:');
    upsertArticle(db, { itemCode: 'LOC1', name: 'Palette', length: 800, rules: { ...RULES } }, { now: NOW });
    expect(getArticle(db, 'LOC1')?.erpFields).toEqual([]);
    expect(searchArticles(db, 'LOC1')[0].erpFields).toEqual([]);
    db.close();
  });

  // Finding 4 (final review wave): ErpArticleFields.name is typed `string`, not `string |
  // undefined` — an empty item_name from ERPNext would otherwise pass the `erp[f] !== undefined`
  // supplied-check and permanently lock the article's name to ''. An empty/whitespace name must be
  // treated the same as an absent dimension: "ERPNext did not actually supply this".
  it('does not lock the name when ERPNext supplies an empty/whitespace name', () => {
    const db = openDb(':memory:');
    const out = upsertFromErp(db, { itemCode: 'EMPTY1', name: '   ', length: 800 }, { now: NOW });
    expect(out.erpFields).not.toContain('name');
    expect(out.erpFields).toEqual(['length']);
    db.close();
  });

  it('does not overwrite a stored name with an empty/whitespace name from ERPNext', () => {
    const db = openDb(':memory:');
    upsertFromErp(db, { itemCode: 'EMPTY2', name: 'Palette', length: 800 }, { now: NOW });
    const out = upsertFromErp(db, { itemCode: 'EMPTY2', name: '', length: 900 }, { now: '2026-07-20T11:00:00.000Z' });
    expect(out.name).toBe('Palette'); // the blank sync must not wipe the real name
    expect(out.length).toBe(900); // meanwhile a genuinely supplied dimension still updates
    db.close();
  });

  it('maps a row written before erp_fields_json existed (falling back to the column DEFAULT) to an empty list', () => {
    const db = openDb(':memory:');
    // Simulate a pre-migration row: insert without erp_fields_json, relying on the schema DEFAULT '[]'.
    db.prepare(
      `INSERT INTO article (item_code, name, rules_json, source, updated_at)
       VALUES ('OLD1', 'Alte Palette', '{}', 'local', @updated_at)`,
    ).run({ updated_at: NOW });
    expect(getArticle(db, 'OLD1')?.erpFields).toEqual([]);
    db.close();
  });

  it('a row seeded before this change (source erp, no name in provenance) still renames', () => {
    const db = openDb(':memory:');
    // Pre-ADR-022 row: source is 'erp' (it came from an old sync) but erp_fields_json is the
    // column DEFAULT '[]' — ERPNext never recorded having supplied a name for it (ADR 022
    // §Последствия: no migration backfills this, so it stays renameable until the next import).
    // The forbidden rule `source === 'erp' && name` would lock this row's name; the correct rule
    // (name only locks when 'name' is actually in erp_fields_json) must not.
    db.prepare(
      `INSERT INTO article (item_code, name, rules_json, source, updated_at)
       VALUES ('OLD2', 'Alte ERP-Palette', '{}', 'erp', @updated_at)`,
    ).run({ updated_at: NOW });
    const out = upsertArticle(db, { itemCode: 'OLD2', name: 'Neu', rules: { ...RULES } }, { now: NOW });
    expect(out.name).toBe('Neu');
    db.close();
  });
});
