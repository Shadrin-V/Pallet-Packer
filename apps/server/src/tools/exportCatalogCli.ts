import { writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { exportCatalog } from './exportCatalog';

// Usage: npm run export:catalog --workspace @app/server -- <db-path> <out.json>
const [dbPath, outPath] = process.argv.slice(2);
if (!dbPath || !outPath) {
  process.stderr.write('usage: export:catalog <db-path> <out.json>\n');
  process.exit(1);
}
// Not openDb(): it creates tables. A one-off export must never modify the database.
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const articles = exportCatalog(db);
  writeFileSync(outPath, `${JSON.stringify(articles, null, 2)}\n`);
  process.stderr.write(`exported ${articles.length} articles\n`);
} finally {
  db.close();
}
