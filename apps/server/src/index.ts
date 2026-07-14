import { buildApp } from './app';
import { openDb } from './db/schema';

const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? '/app/data/app.db');
const app = buildApp({ db, staticDir: process.env.STATIC_DIR });

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
