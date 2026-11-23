import { renameSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { exportCatalog } from './exportCatalog';

// Usage: npm run export:catalog --workspace @app/server -- <db-path> <out.json>
// Exit code: 0 = all articles exported, 2 = some were skipped (listed on stderr), 1 = usage/error.
const [dbPath, outPath] = process.argv.slice(2);
if (!dbPath || !outPath) {
  process.stderr.write('usage: export:catalog <db-path> <out.json>\n');
  process.exit(1);
}
// Not openDb(): it creates tables. A one-off export must never modify the database.
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
let skippedCount = 0;
try {
  const { articles, skipped } = exportCatalog(db);
  // Temp file + rename: a failed write leaves no half-written export behind.
  const tmp = `${outPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(articles, null, 2)}\n`);
  renameSync(tmp, outPath);
  for (const s of skipped) process.stderr.write(`${s.itemCode}: ${s.reason}\n`);
  process.stderr.write(`exported ${articles.length} articles, skipped ${skipped.length}\n`);
  skippedCount = skipped.length;
} finally {
  db.close();
}
process.exit(skippedCount > 0 ? 2 : 0);
