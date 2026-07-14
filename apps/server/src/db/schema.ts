import Database from 'better-sqlite3';

/** Open (or create) the SQLite database at `path` and ensure the schema is migrated. */
export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

/** Idempotent schema creation (CREATE TABLE IF NOT EXISTS). */
export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      length INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loading_plan (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      vehicle_json TEXT NOT NULL,
      load_input_json TEXT NOT NULL,
      layout_result_json TEXT NOT NULL,
      erpnext_refs_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT
    );
  `);
}
