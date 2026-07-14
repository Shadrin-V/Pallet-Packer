import { buildApp } from './app';
import { openDb } from './db/schema';
import { ErpNextAdapter, type OrderSource } from './erpnext/adapter';

const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? '/app/data/app.db');

// Construct the ERPNext adapter only when all secrets are present; otherwise /api/orders returns 503.
const { ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET } = process.env;
let erpnext: OrderSource | undefined;
if (ERPNEXT_URL && ERPNEXT_API_KEY && ERPNEXT_API_SECRET) {
  erpnext = new ErpNextAdapter({
    baseUrl: ERPNEXT_URL,
    apiKey: ERPNEXT_API_KEY,
    apiSecret: ERPNEXT_API_SECRET,
  });
}

const app = buildApp({ db, staticDir: process.env.STATIC_DIR, erpnext });

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
