import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/schema';
import { upsertArticle } from '../db/articles';

const cli = join(__dirname, 'exportCatalogCli.ts');
const run = (db: string, out: string) =>
  spawnSync('npx', ['tsx', cli, db, out], { encoding: 'utf8', cwd: join(__dirname, '../..') });

describe('export CLI', () => {
  it('missing database: error, no database file created, no output file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exp-'));
    const r = run(join(dir, 'nope.db'), join(dir, 'out.json'));
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, 'nope.db'))).toBe(false);
    expect(existsSync(join(dir, 'out.json'))).toBe(false);
  }, 30000);

  it('skipped records: reported on stderr, exit 2, valid ones written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exp-'));
    const dbPath = join(dir, 'c.db');
    const db = openDb(dbPath);
    const rules = { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } as const;
    upsertArticle(db, { itemCode: 'A1', name: 'P', length: 1200, rules }, { now: 'x' });
    upsertArticle(db, { itemCode: 'B2', name: 'K', length: 0, rules }, { now: 'x' });
    db.close();
    const r = run(dbPath, join(dir, 'out.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('B2: DIMENSION_OUT_OF_RANGE');
    expect(r.stderr).toContain('exported 1 articles, skipped 1');
    expect((JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as { itemCode: string }[]).map((a) => a.itemCode)).toEqual(['A1']);
  }, 30000);

  it('no skipped records: exit 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exp-'));
    const dbPath = join(dir, 'c.db');
    const db = openDb(dbPath);
    const rules = { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } as const;
    upsertArticle(db, { itemCode: 'A1', name: 'P', length: 1200, rules }, { now: 'x' });
    db.close();
    const r = run(dbPath, join(dir, 'out.json'));
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('exported 1 articles, skipped 0');
  }, 30000);

  it('failed rename leaves no .tmp file behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exp-'));
    const dbPath = join(dir, 'c.db');
    openDb(dbPath).close();
    mkdirSync(join(dir, 'out.json')); // a directory at the target: rename of a file onto it fails
    const r = run(dbPath, join(dir, 'out.json'));
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, 'out.json.tmp'))).toBe(false);
  }, 30000);
});
