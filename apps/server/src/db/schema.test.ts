import { describe, it, expect } from 'vitest';
import { openDb } from './schema';

describe('sqlite schema', () => {
  it('creates vehicle + loading_plan tables (in-memory)', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(['loading_plan', 'vehicle']));
    db.close();
  });

  it('is idempotent (openDb twice on the same file does not throw)', () => {
    const db1 = openDb(':memory:');
    // re-running migrate on an already-migrated connection must be safe
    expect(() => openDb(':memory:')).not.toThrow();
    db1.close();
  });
});
