# Ladungsplaner-App (B: Vite SPA + Fastify + SQLite + ERPNext) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack Ladungsplaner web app (Vite React SPA + thin Fastify/SQLite backend, one Docker container) that reuses `@shadrin-v/engine` + `@shadrin-v/i18n`, persists vehicles and loading plans, and imports orders from ERPNext by one click.

**Architecture:** Monorepo (npm workspaces `packages/*` + `apps/*`). SPA runs the packing engine in the browser and reaches all data through a single `DataProvider` seam (HTTP → `apps/server`), so the future B→A migration to a Frappe backend is localized. The server is thin: SQLite persistence + ERPNext REST adapter + it serves the built SPA. One process, one port, behind Traefik.

**Tech Stack:** TypeScript (ESM, strict), Vite + React 18, Fastify 5, better-sqlite3, Vitest (+ jsdom + @testing-library/react), Tailwind (design-system tokens), Docker (Node 22 multi-stage), Coolify/Hetzner.

## Global Constraints

- **Internal units are integer millimetres** (ADR 002). Conversion/formatting only at the UI boundary via `@shadrin-v/i18n` (`formatLength`).
- **No user-facing string literals in code** (ADR 006). Only i18n keys; locales `de` (default) + `ru`. Engine returns `ERR_*` codes; UI translates.
- **All domain logic lives in `packages/engine`.** UI and server never re-implement packing/validation/metrics. UI calls `calculateLayout`, `computeStack`, `orientedDims`, `findGeometryViolations`, `validateLoad`, `getLayoutReport`.
- **SPA touches data only through `DataProvider`.** Never `fetch` ERPNext or SQLite directly from a component.
- **Design tokens only** (`docs/lovable/design-system.md`) — no hex literals in JSX/TSX. Light theme only (MVP). Font: Inter.
- **Geometry validator on every rendered/saved layout:** `findGeometryViolations(layout, vehicle)` must return `[]`.
- **TDD:** failing test → minimal code → green → commit. Small atomic commits after green.
- **Reused engine API surface (verbatim signatures, `@shadrin-v/engine` 0.0.6, contract 0.9.0):**
  - `calculateLayout(load: Load): Layout`
  - `getLayoutReport(layout: Layout): Report`
  - `computeStack(cargo: CargoType, vehicle: Vehicle): StackPreview`
  - `orientedDims(...)`, `validateLoad(load: Load)`, `findGeometryViolations(layout, vehicle): GeometryViolation[]`
  - Types: `Vehicle`, `CargoType`, `CargoStacking`, `CargoNesting`, `Load`, `Placement`, `Layout`, `LayoutMetrics`, `UnplacedCount`, `Report`, `EngineError`.
- **i18n API:** `t(key: TranslationKey, locale: Locale): string`, `formatLength(mm: number, locale: Locale): string`, `SUPPORTED_LOCALES`, `Locale`.
- **Secrets** (ERPNext URL/key/secret) only via env vars — never in git.
- **Autonomy directive (memory `autonomy-directive-2026-07-10`):** branch per task → green gates → merge to main; team-maintainer beads (auto commit/push/`bd dolt push`/close on green).

---

## File Structure

```
package.json                         — extend workspaces to ["packages/*","apps/*"]
vitest.config.ts                     — include apps/*; jsdom env for apps/web
tsconfig.base.json                   — (unchanged) strict ESM base

packages/engine                      — REUSE (unchanged)
packages/i18n                        — REUSE (unchanged)
packages/contracts                   — NEW: @shadrin-v/contracts — shared API DTOs (web+server)
  src/index.ts                       — re-exports
  src/dto.ts                         — LoadingPlan(Input/Summary), OrderZone, OrderRef, OrderPosition, ApiError
  src/dto.test.ts

apps/server                          — NEW: Fastify + better-sqlite3 + ERPNext adapter
  package.json
  tsconfig.json
  src/index.ts                       — bootstrap: build app, listen
  src/app.ts                         — buildApp(deps): Fastify instance (health, /api, static)
  src/app.test.ts
  src/db/schema.ts                   — openDb(path): Database; migrate()
  src/db/schema.test.ts
  src/db/vehicles.ts                 — vehicle repo
  src/db/plans.ts                    — loading_plan repo
  src/db/repos.test.ts
  src/routes/vehicles.ts
  src/routes/plans.ts
  src/routes/orders.ts               — ERPNext import/search endpoints
  src/routes/routes.test.ts
  src/erpnext/adapter.ts             — ErpNextAdapter (REST client)
  src/erpnext/parseDimensions.ts     — "1200x800 mm" → {length,width,height?}
  src/erpnext/parseDimensions.test.ts
  src/erpnext/adapter.test.ts
  scripts/backup.sh                  — SQLite .backup + tar rotation

apps/web                             — NEW: Vite React SPA
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/main.tsx
  src/App.tsx
  src/theme.css                      — design-system tokens (:root vars)
  tailwind.config.js
  postcss.config.js
  src/i18n/LocaleContext.tsx         — locale provider + useT()
  src/data/DataProvider.ts           — interface (client seam)
  src/data/HttpDataProvider.ts       — fetch impl → apps/server
  src/data/HttpDataProvider.test.ts
  src/data/DataProviderContext.tsx
  src/lib/orderColor.ts              — order index → series token + hatch id
  src/lib/swatch.tsx                 — order swatch SVG (color + hatch)
  src/screens/SetupScreen.tsx        — эталон setup-reference.html
  src/screens/SetupScreen.test.tsx
  src/screens/LadeplanScreen.tsx     — эталон ladeplan-reference.html
  src/screens/LadeplanScreen.test.tsx
  src/screens/components/*.tsx        — VehicleBar, OrderCard, PositionRow, CrossSection, Legend, Metrics

Dockerfile                           — multi-stage: build engine+i18n+contracts+web → runtime Fastify
.dockerignore
docs/INFRASTRUKTUR-*.md              — deploy runbook append (task 9)
```

**Dependency order (matches epic LKWkalk-66g):** Task 1–3 scaffold (96y) → Task 4 contracts+DataProvider (6cy) → Task 5 server+SQLite (r13) → Task 6 Setup screen (gxp) → Task 7 Ladeplan screen (73u) → Task 8 ERPNext adapter (uvf) → Task 9 deploy (62x).

---

## Task 1: Extend workspaces + scaffold `apps/server` (Fastify health)

**bd:** LKWkalk-96y (part a) · **Branch:** `feat/96y-scaffold-server`

**Files:**
- Modify: `package.json` (workspaces, root scripts)
- Modify: `vitest.config.ts` (include apps)
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/app.ts`, `apps/server/src/index.ts`
- Test: `apps/server/src/app.test.ts`

**Interfaces:**
- Produces: `buildApp(opts?: { staticDir?: string }): FastifyInstance` — Fastify app with `GET /api/health` → `{ status: 'ok', contract: string }`. Later tasks add routes onto this app via plugins.

- [ ] **Step 1: Extend workspaces and root scripts**

In `package.json` set:
```json
"workspaces": ["packages/*", "apps/*"],
```
Add scripts:
```json
"dev:server": "npm run dev --workspace apps/server",
"dev:web": "npm run dev --workspace apps/web",
"build": "npm run build --workspaces --if-present"
```

- [ ] **Step 2: Extend vitest to cover apps + jsdom for web**

Replace `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['apps/web/**', 'jsdom']],
  },
});
```

- [ ] **Step 3: Create `apps/server/package.json`**

```json
{
  "name": "@app/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --clean",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fastify/static": "^8.0.0",
    "@shadrin-v/contracts": "*",
    "@shadrin-v/engine": "*",
    "better-sqlite3": "^11.7.0",
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```
Then run `npm install` from repo root.

- [ ] **Step 4: Create `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"] },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Write the failing test** — `apps/server/src/app.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from './app';

describe('server app', () => {
  it('answers GET /api/health with ok + contract version', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    expect(typeof res.json().contract).toBe('string');
    await app.close();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- app.test`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 7: Write minimal implementation** — `apps/server/src/app.ts`

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';

export interface BuildAppOptions {
  staticDir?: string;
}

export function buildApp(_opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ status: 'ok', contract: ENGINE_CONTRACT_VERSION }));
  return app;
}
```

- [ ] **Step 8: Create `apps/server/src/index.ts` (bootstrap, not unit-tested)**

```ts
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const app = buildApp({ staticDir: process.env.STATIC_DIR });
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Run tests + typecheck**

Run: `npm test -- app.test` → Expected: PASS
Run: `npm run typecheck --workspace apps/server` → Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add package.json vitest.config.ts apps/server package-lock.json
git commit -m "feat(96y): scaffold apps/server (Fastify health) + apps/* workspaces"
```

---

## Task 2: Scaffold `apps/web` (Vite React + engine/i18n smoke + theme tokens)

**bd:** LKWkalk-96y (part b) · **Branch:** `feat/96y-scaffold-web`

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/theme.css`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces: `<App />` root component rendering the app shell; imports `@shadrin-v/engine` and `@shadrin-v/i18n` to prove workspace resolution.

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@app/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shadrin-v/engine": "*",
    "@shadrin-v/i18n": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.7"
  }
}
```
Run `npm install` from root.

- [ ] **Step 2: Config files**

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```
`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*"]
}
```
`apps/web/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```
`apps/web/tailwind.config.js` — colors/radii/fonts from `design-system.md` §2:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)', card: 'var(--card)', sub: 'var(--sub)',
        ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)',
        line: 'var(--line)', 'line-strong': 'var(--line-strong)',
        primary: 'var(--primary)', 'primary-ink': 'var(--primary-ink)',
        accent: 'var(--accent)', danger: 'var(--danger)',
        series: { 1: 'var(--s1)', 2: 'var(--s2)', 3: 'var(--s3)', 4: 'var(--s4)',
                  5: 'var(--s5)', 6: 'var(--s6)', 7: 'var(--s7)', 8: 'var(--s8)' },
      },
      borderRadius: { card: 'var(--r-card)', ctl: 'var(--r-ctl)', pill: 'var(--r-pill)' },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: `apps/web/src/theme.css`** — copy the `:root{…}` token block verbatim from `docs/lovable/design-system.md` §1, then append Tailwind directives:
```css
/* :root tokens copied verbatim from docs/lovable/design-system.md §1 */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: `apps/web/index.html`**
```html
<!doctype html>
<html lang="de">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ladungsplaner</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

- [ ] **Step 5: Write the failing test** — `apps/web/src/App.test.tsx`
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App shell', () => {
  it('renders the localized app title (de default)', () => {
    render(<App />);
    // "app.title" resolves via @shadrin-v/i18n; proves engine+i18n wiring
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- App.test`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 7: Minimal `App.tsx` + `main.tsx`**

`apps/web/src/App.tsx`:
```tsx
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';
import { t } from '@shadrin-v/i18n';

export function App() {
  // Reuse an existing i18n key as a smoke test; screens replace this in later tasks.
  return (
    <main className="min-h-screen bg-paper text-ink font-sans p-6">
      <h1 className="text-[20px] font-[650]">{t('unit.mm', 'de') ? 'Ladungsplaner' : ''}</h1>
      <p className="text-faint text-xs">engine {ENGINE_CONTRACT_VERSION}</p>
    </main>
  );
}
```
> Note: use a real `TranslationKey` (`unit.mm` exists). A dedicated `app.title` key is added in Task 6 when the Setup screen lands.

`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

- [ ] **Step 8: Add jsdom test setup for `@testing-library/jest-dom`**

`apps/web/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```
Add to `vitest.config.ts` test block: `setupFiles: ['apps/web/src/test-setup.ts'],`

- [ ] **Step 9: Run tests + build**

Run: `npm test -- App.test` → Expected: PASS
Run: `npm run build --workspace apps/web` → Expected: `dist/` produced, no TS errors

- [ ] **Step 10: Commit**
```bash
git add apps/web vitest.config.ts package-lock.json
git commit -m "feat(96y): scaffold apps/web (Vite React) + design tokens + engine/i18n smoke"
```

---

## Task 3: Multi-stage Dockerfile — server serves built SPA

**bd:** LKWkalk-96y (part c) · **Branch:** `feat/96y-docker`

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `apps/server/src/app.ts` (register `@fastify/static` when `staticDir` set)
- Test: `apps/server/src/app.test.ts` (add static-serving case)

**Interfaces:**
- Consumes: `buildApp({ staticDir })` from Task 1.
- Produces: single container that runs `node apps/server/dist/index.js`, serving `/api/*` and the SPA (`index.html` fallback for client routing).

- [ ] **Step 1: Failing test — SPA fallback served when staticDir set**

Add to `apps/server/src/app.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('serves index.html for a non-API route when staticDir is configured', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ladungsplaner</title>');
  const app = buildApp({ staticDir: dir });
  const res = await app.inject({ method: 'GET', url: '/some/client/route' });
  expect(res.statusCode).toBe(200);
  expect(res.body).toContain('Ladungsplaner');
  await app.close();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app.test` → Expected: FAIL (404 for unknown route).

- [ ] **Step 3: Implement static serving in `app.ts`**
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';

export interface BuildAppOptions { staticDir?: string; }

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ status: 'ok', contract: ENGINE_CONTRACT_VERSION }));
  if (opts.staticDir) {
    app.register(fastifyStatic, { root: opts.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app.test` → Expected: PASS

- [ ] **Step 5: `.dockerignore`**
```
node_modules
**/node_modules
**/dist
.git
.beads
.dolt
*.db
docs
```

- [ ] **Step 6: `Dockerfile` (Node 22 multi-stage)**
```dockerfile
# --- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
RUN npm run build --workspace @shadrin-v/i18n \
 && npm run build --workspace @shadrin-v/engine \
 && npm run build --workspace @shadrin-v/contracts \
 && npm run build --workspace @app/web \
 && npm run build --workspace @app/server

# --- runtime ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/web
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/server/package.json ./apps/server/package.json
RUN npm ci --omit=dev --workspace @app/server --include-workspace-root
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./web
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
```
> `better-sqlite3` compiles native bindings during `npm ci` in the runtime stage (build-essential is present in `node:22-slim`? if not, add `RUN apt-get update && apt-get install -y python3 make g++` before `npm ci`). Verify at build time.

- [ ] **Step 7: Build the image locally**

Run: `docker build -t ladungsplaner:dev .`
Expected: build succeeds; final image runnable. Smoke: `docker run --rm -p 3000:3000 ladungsplaner:dev &` then `curl localhost:3000/api/health` → `{"status":"ok",...}`.

- [ ] **Step 8: Commit + merge scaffold to main**
```bash
git add Dockerfile .dockerignore apps/server/src/app.ts
git commit -m "feat(96y): multi-stage Dockerfile; server serves SPA static"
# after Task 4 contracts exist the Dockerfile @shadrin-v/contracts build resolves;
# if merging Task 3 before Task 4, drop the contracts build line and re-add in Task 4.
```
> **MILESTONE 1:** scaffold assembled, gates green (typecheck + lint + engine tests + docker build). Merge `feat/96y-*` → `main`, close LKWkalk-96y.

---

## Task 4: `packages/contracts` DTOs + `DataProvider` seam + `HttpDataProvider`

**bd:** LKWkalk-6cy · **Branch:** `feat/6cy-dataprovider`

**Files:**
- Create: `packages/contracts/package.json`, `tsconfig.json`, `src/index.ts`, `src/dto.ts`, `src/dto.test.ts`
- Create: `apps/web/src/data/DataProvider.ts`, `HttpDataProvider.ts`, `HttpDataProvider.test.ts`, `DataProviderContext.tsx`

**Interfaces:**
- Consumes: engine types `Vehicle`, `Load`, `Layout` (re-exported/referenced from `@shadrin-v/engine`).
- Produces:
  - DTOs (`@shadrin-v/contracts`):
    ```ts
    export interface OrderPosition {
      itemCode: string; itemName: string; quantity: number;
      length?: number; width?: number; height?: number;   // mm; undefined → needs manual entry
      dimensionsSource: 'erpnext-field' | 'parsed-name' | 'manual' | 'unknown';
    }
    export interface OrderZone { orderId: string; positions: OrderPosition[]; }
    export interface OrderRef { orderId: string; customer?: string; }
    export interface LoadingPlanInput {
      name: string; load: Load; erpnextOrderIds: string[]; notes?: string;
    }
    export interface LoadingPlanSummary {
      id: string; name: string; createdAt: string; updatedAt: string;
    }
    export interface LoadingPlan extends LoadingPlanSummary {
      load: Load; layout: Layout; erpnextOrderIds: string[]; notes?: string;
    }
    export interface ApiError { code: string; details?: Record<string, unknown>; }
    ```
  - `DataProvider` interface (client seam, `apps/web/src/data/DataProvider.ts`):
    ```ts
    export interface DataProvider {
      listVehicles(): Promise<Vehicle[]>;
      upsertVehicle(v: Vehicle): Promise<Vehicle>;
      saveLoadingPlan(p: LoadingPlanInput): Promise<LoadingPlan>;
      listLoadingPlans(): Promise<LoadingPlanSummary[]>;
      getLoadingPlan(id: string): Promise<LoadingPlan>;
      importOrder(erpOrderId: string): Promise<OrderZone>;
      searchOrders(query: string): Promise<OrderRef[]>;
    }
    ```

- [ ] **Step 1: `packages/contracts/package.json`**
```json
{
  "name": "@shadrin-v/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": { "build": "tsup src/index.ts --format esm --dts --clean", "typecheck": "tsc --noEmit" },
  "dependencies": { "@shadrin-v/engine": "*" }
}
```
`packages/contracts/tsconfig.json`: same shape as engine's (`extends ../../tsconfig.base.json`, `include ["src/**/*"]`). Run `npm install`.

- [ ] **Step 2: Failing test** — `packages/contracts/src/dto.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { DIMENSION_SOURCES } from './dto';

describe('contracts DTOs', () => {
  it('enumerates dimension provenance sources', () => {
    expect(DIMENSION_SOURCES).toEqual(['erpnext-field', 'parsed-name', 'manual', 'unknown']);
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- dto.test` → FAIL (no `./dto`).

- [ ] **Step 4: Implement `src/dto.ts`** (the interfaces from the Produces block above) + the runtime constant:
```ts
import type { Vehicle, Load, Layout } from '@shadrin-v/engine';
export const DIMENSION_SOURCES = ['erpnext-field', 'parsed-name', 'manual', 'unknown'] as const;
export type DimensionSource = (typeof DIMENSION_SOURCES)[number];
export interface OrderPosition { /* …as above… */ }
// …remaining interfaces verbatim from Produces block…
export type { Vehicle, Load, Layout };
```
`src/index.ts`: `export * from './dto';`

- [ ] **Step 5: Run to verify it passes** — `npm test -- dto.test` → PASS. Build: `npm run build --workspace @shadrin-v/contracts`.

- [ ] **Step 6: Failing test for `HttpDataProvider`** — `apps/web/src/data/HttpDataProvider.test.ts`
```tsx
import { describe, it, expect, vi } from 'vitest';
import { HttpDataProvider } from './HttpDataProvider';

describe('HttpDataProvider', () => {
  it('GET /api/vehicles → listVehicles', async () => {
    const vehicles = [{ id: 'v1', name: 'LKW', length: 13600, width: 2480, height: 2700 }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(vehicles), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.listVehicles()).resolves.toEqual(vehicles);
    expect(fetchMock).toHaveBeenCalledWith('/api/vehicles', expect.objectContaining({ method: 'GET' }));
  });

  it('throws ApiError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'ERR_NOT_FOUND' }), { status: 404 }),
    );
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.getLoadingPlan('nope')).rejects.toMatchObject({ code: 'ERR_NOT_FOUND' });
  });
});
```

- [ ] **Step 7: Run to verify it fails** — `npm test -- HttpDataProvider` → FAIL.

- [ ] **Step 8: Implement `DataProvider.ts` + `HttpDataProvider.ts`**
```ts
// HttpDataProvider.ts
import type {
  OrderZone, OrderRef, LoadingPlan, LoadingPlanInput, LoadingPlanSummary, Vehicle,
} from '@shadrin-v/contracts';
import type { DataProvider } from './DataProvider';

type Fetch = typeof fetch;

export class HttpDataProvider implements DataProvider {
  constructor(private base = '', private fetchImpl: Fetch = fetch) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(this.base + path, { method: 'GET', ...init });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ code: 'ERR_HTTP', details: { status: res.status } }));
      throw body;
    }
    return res.json() as Promise<T>;
  }
  private json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  }

  listVehicles() { return this.req<Vehicle[]>('/api/vehicles'); }
  upsertVehicle(v: Vehicle) { return this.req<Vehicle>('/api/vehicles', this.json('PUT', v)); }
  saveLoadingPlan(p: LoadingPlanInput) { return this.req<LoadingPlan>('/api/plans', this.json('POST', p)); }
  listLoadingPlans() { return this.req<LoadingPlanSummary[]>('/api/plans'); }
  getLoadingPlan(id: string) { return this.req<LoadingPlan>(`/api/plans/${encodeURIComponent(id)}`); }
  importOrder(id: string) { return this.req<OrderZone>(`/api/orders/${encodeURIComponent(id)}`); }
  searchOrders(q: string) { return this.req<OrderRef[]>(`/api/orders?q=${encodeURIComponent(q)}`); }
}
```

- [ ] **Step 9: Run tests** — `npm test -- HttpDataProvider` → PASS. `npm run typecheck --workspace apps/web` → clean.

- [ ] **Step 10: `DataProviderContext.tsx`** — React context providing a `DataProvider` instance to screens:
```tsx
import { createContext, useContext } from 'react';
import type { DataProvider } from './DataProvider';
const Ctx = createContext<DataProvider | null>(null);
export const DataProviderProvider = Ctx.Provider;
export function useDataProvider(): DataProvider {
  const dp = useContext(Ctx);
  if (!dp) throw new Error('DataProvider not provided');
  return dp;
}
```

- [ ] **Step 11: Commit + merge** — gates green → merge `feat/6cy-*` → main, close LKWkalk-6cy.
```bash
git add packages/contracts apps/web/src/data package-lock.json
git commit -m "feat(6cy): DataProvider seam + @shadrin-v/contracts DTOs + HttpDataProvider"
```

---

## Task 5: `apps/server` — SQLite schema + REST endpoints + backup

**bd:** LKWkalk-r13 · **Branch:** `feat/r13-server-sqlite`

**Files:**
- Create: `apps/server/src/db/schema.ts`, `db/vehicles.ts`, `db/plans.ts`, `db/schema.test.ts`, `db/repos.test.ts`
- Create: `apps/server/src/routes/vehicles.ts`, `routes/plans.ts`, `routes/routes.test.ts`
- Modify: `apps/server/src/app.ts` (register route plugins with a `Db` dependency), `src/index.ts` (open DB at `/app/data/app.db`)
- Create: `apps/server/scripts/backup.sh`

**Interfaces:**
- Consumes: DTOs from `@shadrin-v/contracts`; `buildApp` from Task 1/3.
- Produces:
  - `openDb(path: string): Database` (better-sqlite3), runs `migrate(db)` (idempotent `CREATE TABLE IF NOT EXISTS`).
  - Vehicle repo: `listVehicles(db)`, `upsertVehicle(db, v)`.
  - Plan repo: `savePlan(db, input, layout)`, `listPlans(db)`, `getPlan(db, id)`.
  - REST: `GET/PUT /api/vehicles`, `GET/POST /api/plans`, `GET /api/plans/:id`.
  - `buildApp` gains option `{ db?: Database }`; `index.ts` passes the real DB.

- [ ] **Step 1: Failing schema test** — `apps/server/src/db/schema.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { openDb } from './schema';

describe('sqlite schema', () => {
  it('creates vehicle + loading_plan tables (in-memory)', () => {
    const db = openDb(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all().map((r: { name: string }) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['loading_plan', 'vehicle']));
    db.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- schema.test` → FAIL.

- [ ] **Step 3: Implement `db/schema.ts`**
```ts
import Database from 'better-sqlite3';

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      length INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loading_plan (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      vehicle_json TEXT NOT NULL, load_input_json TEXT NOT NULL,
      layout_result_json TEXT NOT NULL, erpnext_refs_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT
    );
  `);
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- schema.test` → PASS.

- [ ] **Step 5: Failing repo test** — `apps/server/src/db/repos.test.ts` covers upsert vehicle roundtrip + save/list/get plan (snapshot of `Load` + `Layout`). Use in-memory db. (Full test: insert vehicle, read back equal; save a plan with a minimal `Load`+`Layout`, `getPlan` returns parsed JSON equal to input.)
```ts
import { describe, it, expect } from 'vitest';
import { openDb } from './schema';
import { upsertVehicle, listVehicles } from './vehicles';
import { savePlan, getPlan, listPlans } from './plans';

const V = { id: 'v1', name: 'LKW', length: 13600, width: 2480, height: 2700 };

describe('repos', () => {
  it('upserts + lists a vehicle', () => {
    const db = openDb(':memory:');
    upsertVehicle(db, V);
    upsertVehicle(db, { ...V, name: 'LKW-2' }); // update, not duplicate
    expect(listVehicles(db)).toEqual([{ ...V, name: 'LKW-2' }]);
    db.close();
  });

  it('saves a plan snapshot and reads it back', () => {
    const db = openDb(':memory:');
    const load = { vehicle: V, cargo: [] };
    const layout = { placements: [], unplaced: [], metrics: {
      totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
      contractVersion: '0.9.0' };
    const saved = savePlan(db, { name: 'P1', load, erpnextOrderIds: ['SO-1'] }, layout,
      { id: 'p1', now: '2026-07-14T00:00:00Z' });
    expect(saved.id).toBe('p1');
    expect(getPlan(db, 'p1')).toMatchObject({ name: 'P1', load, layout, erpnextOrderIds: ['SO-1'] });
    expect(listPlans(db).map((p) => p.id)).toEqual(['p1']);
    db.close();
  });
});
```

- [ ] **Step 6: Run to verify it fails** — `npm test -- repos.test` → FAIL.

- [ ] **Step 7: Implement `db/vehicles.ts` and `db/plans.ts`**
```ts
// vehicles.ts
import type Database from 'better-sqlite3';
import type { Vehicle } from '@shadrin-v/contracts';
export function upsertVehicle(db: Database.Database, v: Vehicle): Vehicle {
  db.prepare(`INSERT INTO vehicle (id,name,length,width,height) VALUES (@id,@name,@length,@width,@height)
    ON CONFLICT(id) DO UPDATE SET name=@name,length=@length,width=@width,height=@height`).run(v);
  return v;
}
export function listVehicles(db: Database.Database): Vehicle[] {
  return db.prepare('SELECT id,name,length,width,height FROM vehicle ORDER BY name').all() as Vehicle[];
}
```
```ts
// plans.ts
import type Database from 'better-sqlite3';
import type { Layout } from '@shadrin-v/engine';
import type { LoadingPlan, LoadingPlanInput, LoadingPlanSummary } from '@shadrin-v/contracts';
export function savePlan(
  db: Database.Database, input: LoadingPlanInput, layout: Layout,
  meta: { id: string; now: string },
): LoadingPlan {
  db.prepare(`INSERT INTO loading_plan
    (id,name,created_at,updated_at,vehicle_json,load_input_json,layout_result_json,erpnext_refs_json,notes)
    VALUES (@id,@name,@now,@now,@vehicle,@load,@layout,@refs,@notes)`).run({
    id: meta.id, name: input.name, now: meta.now,
    vehicle: JSON.stringify(input.load.vehicle), load: JSON.stringify(input.load),
    layout: JSON.stringify(layout), refs: JSON.stringify(input.erpnextOrderIds),
    notes: input.notes ?? null,
  });
  return getPlan(db, meta.id);
}
export function getPlan(db: Database.Database, id: string): LoadingPlan {
  const row = db.prepare('SELECT * FROM loading_plan WHERE id = ?').get(id) as any;
  if (!row) { const e: any = new Error('not found'); e.code = 'ERR_NOT_FOUND'; throw e; }
  return {
    id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at,
    load: JSON.parse(row.load_input_json), layout: JSON.parse(row.layout_result_json),
    erpnextOrderIds: JSON.parse(row.erpnext_refs_json), notes: row.notes ?? undefined,
  };
}
export function listPlans(db: Database.Database): LoadingPlanSummary[] {
  return db.prepare('SELECT id,name,created_at as createdAt,updated_at as updatedAt FROM loading_plan ORDER BY updated_at DESC')
    .all() as LoadingPlanSummary[];
}
```
> **Server computes the layout snapshot from the submitted `Load` via `calculateLayout`** (single source of truth), so a saved plan is reproducible. The route (not the repo) calls the engine; the repo persists the result.

- [ ] **Step 8: Run to verify it passes** — `npm test -- repos.test` → PASS.

- [ ] **Step 9: Failing route test** — `apps/server/src/routes/routes.test.ts` builds the app with an in-memory db and exercises the endpoints via `app.inject`. Cover: `PUT /api/vehicles` then `GET /api/vehicles`; `POST /api/plans` (server runs `calculateLayout`) returns `{ id, layout }`; `GET /api/plans/:id`.
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../app';
import { openDb } from '../db/schema';

const V = { id: 'v1', name: 'LKW', length: 2000, width: 2000, height: 2000 };

describe('REST routes', () => {
  it('PUT then GET /api/vehicles', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    await app.inject({ method: 'PUT', url: '/api/vehicles', payload: V });
    const res = await app.inject({ method: 'GET', url: '/api/vehicles' });
    expect(res.json()).toEqual([V]);
    await app.close();
  });

  it('POST /api/plans computes + persists a layout', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    const load = { vehicle: V, cargo: [{
      id: 'c1', name: 'Box', length: 1000, width: 1000, height: 1000, quantity: 8,
      rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false }, state: 'entschachtelt',
    }] };
    const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { name: 'P', load, erpnextOrderIds: [] } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.layout.metrics.totalPlaced).toBe(8); // 2×2×2 hold, 1×1×1 boxes → 8
    const got = await app.inject({ method: 'GET', url: `/api/plans/${body.id}` });
    expect(got.json().name).toBe('P');
    await app.close();
  });
});
```

- [ ] **Step 10: Run to verify it fails** — `npm test -- routes.test` → FAIL.

- [ ] **Step 11: Implement routes + wire into `buildApp`.** Add `db?` to `BuildAppOptions`; register `vehicles`/`plans` route plugins only when `db` present. Plan POST route: `const layout = calculateLayout(input.load); savePlan(db, input, layout, { id: newId(), now: nowIso() })`. Generate id (`crypto.randomUUID()`) and timestamp inside the route (not in the pure repo/engine). Import `calculateLayout` from `@shadrin-v/engine`.

- [ ] **Step 12: Run to verify it passes** — `npm test -- routes.test` → PASS. Typecheck server.

- [ ] **Step 13: `index.ts` opens the real DB**
```ts
import { openDb } from './db/schema';
const db = openDb(process.env.DB_PATH ?? '/app/data/app.db');
const app = buildApp({ db, staticDir: process.env.STATIC_DIR });
```

- [ ] **Step 14: `scripts/backup.sh`** (SQLite `.backup` + tar the volume, 14-day rotation — model of `/root/backup-arminia.sh`):
```bash
#!/usr/bin/env bash
set -euo pipefail
DB=${DB_PATH:-/app/data/app.db}
OUT=${BACKUP_DIR:-/app/data/backups}
mkdir -p "$OUT"
ts=$(date +%Y%m%d-%H%M%S)
sqlite3 "$DB" ".backup '$OUT/app-$ts.db'"
tar -czf "$OUT/app-$ts.tar.gz" -C "$OUT" "app-$ts.db" && rm -f "$OUT/app-$ts.db"
find "$OUT" -name 'app-*.tar.gz' -mtime +14 -delete
```

- [ ] **Step 15: Commit + merge** — gates green → merge `feat/r13-*` → main, close LKWkalk-r13.
```bash
git add apps/server/src apps/server/scripts package-lock.json
git commit -m "feat(r13): SQLite schema + REST /api/vehicles+/api/plans + backup script"
```

---

## Task 6: Setup screen (`apps/web`) — эталон `setup-reference.html`

**bd:** LKWkalk-gxp · **Branch:** `feat/gxp-setup-screen`

**Files:**
- Create: `apps/web/src/screens/SetupScreen.tsx` + `components/VehicleBar.tsx`, `OrderCard.tsx`, `PositionRow.tsx`
- Create: `apps/web/src/i18n/LocaleContext.tsx`, `src/lib/orderColor.ts`, `src/lib/swatch.tsx`
- Add i18n keys to `packages/i18n` (de+ru) for all new UI strings
- Test: `apps/web/src/screens/SetupScreen.test.tsx`, `src/lib/orderColor.test.ts`
- Reference: open `docs/lovable/setup-reference.html` + `design-system.md` §4 (component recipes) before building.

**Interfaces:**
- Consumes: `useDataProvider()` (Task 4), engine `computeStack`, `validateLoad`; `CargoType`, `Vehicle`, `Load`.
- Produces:
  - `orderColorToken(index: number): { series: 1|2|3|4|5|6|7|8; hatchId: string }` — order index → design-system series token + hatch pattern id (design-system §5, 8 patterns).
  - `<SetupScreen onCalculate={(load: Load) => void} />` — builds a `Load` from vehicle + order zones + position rows; segmented `[Ent | Ver]` sets `CargoType.state`; live stack preview via `computeStack`.

- [ ] **Step 1: Failing test — orderColor mapping** — `src/lib/orderColor.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { orderColorToken } from './orderColor';
describe('orderColorToken', () => {
  it('maps order index to a 1..8 series token, wrapping', () => {
    expect(orderColorToken(0).series).toBe(1);
    expect(orderColorToken(7).series).toBe(8);
    expect(orderColorToken(8).series).toBe(1); // wrap
  });
  it('gives a stable hatch id per index', () => {
    expect(orderColorToken(0).hatchId).toBe('pat-1');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- orderColor` → FAIL.

- [ ] **Step 3: Implement `src/lib/orderColor.ts`**
```ts
export function orderColorToken(index: number): { series: number; hatchId: string } {
  const series = (index % 8) + 1;
  return { series, hatchId: `pat-${series}` };
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- orderColor` → PASS.

- [ ] **Step 5: Add i18n keys (TDD in `packages/i18n`).** For each new UI string add a key to `TRANSLATION_KEYS` + de + ru dictionary entries; the existing `dictionaries/index.test.ts` enforces parity. Keys (minimum): `app.title`, `setup.vehicle`, `setup.addOrder`, `setup.position.name`, `setup.position.qty`, `setup.state.ent`, `setup.state.ver`, `setup.rotation`, `setup.stackChip`, `action.calculate`. Follow the existing key-addition pattern in `packages/i18n/src/keys.ts` and `dictionaries/{de,ru}.ts`. Run `npm test -- i18n` green, then `npm run build --workspace @shadrin-v/i18n`.

- [ ] **Step 6: Failing SetupScreen test** — `SetupScreen.test.tsx` (jsdom): renders with a fake `DataProvider`, asserts the vehicle bar + one order card render, and clicking "Berechnen" calls `onCalculate` with a well-formed `Load` (vehicle + ≥1 cargo). Use `@testing-library/react` + `userEvent`. Assert the emitted `Load.cargo[0].state` toggles when the `[Ent|Ver]` segment is clicked.

- [ ] **Step 7: Run to verify it fails** — FAIL (no `SetupScreen`).

- [ ] **Step 8: Implement `LocaleContext.tsx` (provides `locale` + `useT()` bound to `@shadrin-v/i18n`), `swatch.tsx` (order SVG swatch per design-system §5), then `SetupScreen.tsx` + components** — tokens only (no hex), compact PositionRow per design-system §4, `[Ent|Ver]` segmented sets `state`, live `computeStack` preview chip. Build the `Load` object and call `onCalculate`.

- [ ] **Step 9: Run tests + typecheck** — `npm test -- SetupScreen` → PASS; `npm run typecheck --workspace apps/web` clean; visually compare against `setup-reference.html`.

- [ ] **Step 10: Commit + merge** — gates green → merge `feat/gxp-*` → main, close LKWkalk-gxp.
```bash
git add apps/web/src packages/i18n/src package-lock.json
git commit -m "feat(gxp): Setup screen (vehicle bar, order cards, position rows) + i18n keys"
```

---

## Task 7: Ladeplan/result screen (`apps/web`) — эталон `ladeplan-reference.html`

**bd:** LKWkalk-73u · **Branch:** `feat/73u-ladeplan-screen`

**Files:**
- Create: `apps/web/src/screens/LadeplanScreen.tsx` + `components/CrossSection.tsx`, `Legend.tsx`, `Metrics.tsx`
- Add i18n keys (de+ru): `result.title`, `result.top`, `result.side`, `result.front`, `result.back`, `result.placed`, `result.unplaced`, `result.fill`
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx`, `components/CrossSection.test.tsx`
- Reference: open `docs/lovable/ladeplan-reference.html` (has ready `defs()` hatch generator) + design-system §5/§6 before building.

**Interfaces:**
- Consumes: engine `Layout`, `Vehicle`, `orientedDims`, `findGeometryViolations`; `orderColorToken` (Task 6); `swatch` hatch patterns.
- Produces: `<LadeplanScreen layout={Layout} vehicle={Vehicle} />` — top view + side view SVG in mm coords, legend, metrics, A4 print. **Invariant:** on mount it asserts `findGeometryViolations(layout, vehicle)` is `[]`; drag interactions re-run it and reject moves that introduce a violation.

- [ ] **Step 1: Failing test — CrossSection uses engine heights, not tier counts** — `CrossSection.test.tsx`: given a `Placement` at `z` with a stack, the rendered `<rect>` `y` equals `height - (z + dz)` where `dz` comes from `orientedDims` (design-system §6), not from tier count. Assert one `<rect>` per placement with expected `y`.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement `CrossSection.tsx`** — inline SVG, `viewBox="0 0 length width|height"`, vellum grid (1000 mm), thick vehicle frame, stack `<rect>` filled `url(#pat-N)` + order-color stroke, `×N` label; side-view `y = height - (z + dz)` from `orientedDims`. Port the `defs()` hatch generator from `ladeplan-reference.html`.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Failing LadeplanScreen test** — renders with a real engine `Layout` (from `calculateLayout` on a 2×2×2 / 1×1×1 fixture), asserts: header, top+side `<svg>` present, legend lists each order once, metrics show `totalPlaced`; and `findGeometryViolations(layout, vehicle)` returns `[]` (guard invariant). A `data-violations="0"` attribute exposes the check for the test.

- [ ] **Step 6: Run to verify it fails** — FAIL.

- [ ] **Step 7: Implement `LadeplanScreen.tsx` + `Legend.tsx` + `Metrics.tsx`** — tokens only; A4 print CSS (`@media print`); mount-time geometry assertion; drag handler re-validates via `findGeometryViolations` and reverts on violation.

- [ ] **Step 8: Run tests + typecheck** — `npm test -- Ladeplan CrossSection` → PASS; typecheck clean; visually compare against `ladeplan-reference.html`; wire Setup→Ladeplan in `App.tsx` (compute `calculateLayout` in browser on "Berechnen").

- [ ] **Step 9: Commit + merge** — gates green → merge `feat/73u-*` → main, close LKWkalk-73u.
```bash
git add apps/web/src packages/i18n/src package-lock.json
git commit -m "feat(73u): Ladeplan result screen (top/side cross-sections, legend, metrics, A4 print)"
```

---

## Task 8: ERPNext adapter + one-click order import (reads custom dimension fields)

**bd:** LKWkalk-uvf · **Branch:** `feat/uvf-erpnext-adapter`
**Spec:** [ERPNext dimension fields](../specs/2026-07-14-erpnext-dimension-fields-design.md) — dimensions
come from explicit custom fields `custom_length_mm/width/height` on `Sales Order Item` (fetch_from Item);
**no name parser.** Provenance = `{erpnext-field, manual}`.

**Files:**
- Modify: `packages/contracts/src/dto.ts` + `dto.test.ts` — `DIMENSION_SOURCES = ['erpnext-field','manual']`
- Create: `apps/server/src/erpnext/adapter.ts` + `adapter.test.ts`
- Create: `apps/server/src/routes/orders.ts`; register in `app.ts`
- Modify: `apps/web/src/App.tsx` — deep-link `?order=SO-####` → `importOrder` on load (**deferred** until the Setup screen exists — screens block on LKWkalk-563 design system; ship server-side first)
- Reference (live schema, verified 2026-07-14): Sales Order `data.name` = order id, `data.customer_name`,
  `data.items[]` each with `item_code`, `item_name`, `qty`. Custom fields `custom_length_mm/width/height`
  (Int, mm) will be added on Sales Order Item via fetch_from; absent today (local test mode).

**Interfaces:**
- Consumes: DTOs `OrderZone`, `OrderPosition`, `OrderRef`, `DimensionSource`.
- Produces:
  - `ErpNextAdapter` with config `{ baseUrl, apiKey, apiSecret, fetchImpl? }`:
    - `importOrder(orderId: string): Promise<OrderZone>` — `GET /api/resource/Sales Order/:id`; map each
      `items[i]` to `OrderPosition`. If all three `custom_*_mm` present & > 0 → set dims,
      `dimensionsSource: 'erpnext-field'`; else dims `undefined`, `dimensionsSource: 'manual'`. No parsing.
    - `searchOrders(query: string): Promise<OrderRef[]>` — `GET /api/resource/Sales Order?filters=...` →
      `{ orderId, customer }`.

- [ ] **Step 1: Shrink `DIMENSION_SOURCES` in contracts** — set `['erpnext-field','manual']` in
  `packages/contracts/src/dto.ts`; update `dto.test.ts` to expect the 2-value array. Run
  `npm test -- dto.test` → PASS; `npm run build --workspace @shadrin-v/contracts`.

- [ ] **Step 2: Failing adapter test (mocked REST)** — `adapter.test.ts`: inject a `fetchImpl` mock
  returning a Frappe Sales Order `{ data: { name, customer_name, items: [...] } }`. Cases:
  (a) item with all three `custom_*_mm` → position dims set + `dimensionsSource:'erpnext-field'`;
  (b) item without custom fields → dims `undefined` + `dimensionsSource:'manual'`;
  (c) Authorization header = `token KEY:SECRET`, URL = `…/api/resource/Sales Order/{id}`;
  (d) non-2xx → throws `{ code: 'ERR_ERPNEXT_HTTP' }`;
  (e) `searchOrders` maps `data[]` → `OrderRef[]`.

- [ ] **Step 3: Run to verify it fails** — `npm test -- adapter` → FAIL.

- [ ] **Step 4: Implement `adapter.ts`** — REST client (`Authorization: token ${apiKey}:${apiSecret}`),
  `GET /api/resource/Sales Order/:id`; map items reading `custom_length_mm/custom_width_mm/custom_height_mm`
  from the line (all present & > 0 → `erpnext-field`, else `manual`). `searchOrders` → resource list with
  `filters=[["name","like",...]]&fields=["name","customer_name"]`. **Secrets from env only** (`ERPNEXT_URL`,
  `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`); never logged.

- [ ] **Step 5: Run to verify it passes** — `npm test -- adapter` → PASS.

- [ ] **Step 6: Orders routes + failing route test** — `GET /api/orders/:id` → `adapter.importOrder`;
  `GET /api/orders?q=` → `searchOrders`. `buildApp({ erpnext })` accepts an optional adapter. If no adapter
  configured (env secrets missing), routes return `503 { code: 'ERR_ERPNEXT_UNCONFIGURED' }` (test this —
  matches today's local test-mode reality).

- [ ] **Step 7: Run to verify it passes; typecheck server** — PASS.

- [ ] **Step 8: Wire adapter construction in `index.ts`** — build `ErpNextAdapter` from env only when all
  three secrets present; else pass `undefined` (routes 503). Do not log secrets.

- [ ] **Step 9: Commit + merge server-side** — gates green → merge `feat/uvf-*` → main, close LKWkalk-uvf.
```bash
git add packages/contracts apps/server/src/erpnext apps/server/src/routes/orders.ts apps/server/src/app.ts apps/server/src/index.ts
git commit -m "feat(uvf): ERPNext REST adapter (reads custom_*_mm) + /api/orders + unconfigured guard"
```

- [ ] **Step 10 (DEFERRED, tracked separately): deep-link import in `App.tsx`** — read `?order=SO-####`,
  call `importOrder`, seed the Setup screen. Depends on the Setup screen (gxp), which blocks on the design
  system (LKWkalk-563). File a follow-up bd issue at merge time; do not implement here.

---

## Task 9: Deploy to Coolify / Hetzner + infra runbook

**bd:** LKWkalk-62x (P2) · **Branch:** `feat/62x-deploy` · **Note:** needs the infra reference from the owner (ask before executing — Coolify access, deploy key, DNS).

**Files:**
- Modify: `Dockerfile` (finalize native-build deps + container limits notes), `apps/server/scripts/backup.sh`
- Create/append: `docs/INFRASTRUKTUR-ladungsplaner.md` (deploy runbook)
- No app-code tests here; the gate is a successful Coolify build + reachable health endpoint.

**Interfaces:** none (ops task).

- [ ] **Step 1: Confirm prerequisites with owner** — Coolify project access, GitHub deploy key for `Shadrin-V/Pallet-Packer` (private), DNS control for `group-schaefer.de`, ERPNext API key/secret. (Ask via the user; do not invent secrets.)
- [ ] **Step 2: Create `production` branch** — `git branch production && git push -u origin production` (Coolify auto-deploy source branch).
- [ ] **Step 3: Coolify Application** — new Application from GitHub repo, branch `production`, Dockerfile build; **do not publish ports** (Traefik only); resource limits ~**512 MB / 0.5 CPU**.
- [ ] **Step 4: Named volume** — mount `/app/data` (SQLite + backups). Set env `DB_PATH=/app/data/app.db`, `STATIC_DIR=/app/web`.
- [ ] **Step 5: Secrets (Coolify env, secret)** — `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`. Never in git.
- [ ] **Step 6: Domain + TLS** — A-record `ladungsplaner.group-schaefer.de` → 204.168.246.13 (DNS-only until cert issues), Traefik auto-TLS. Optional Basic Auth via Traefik middleware (MVP auth per ADR 015 §8).
- [ ] **Step 7: Backup cron** — schedule `apps/server/scripts/backup.sh` on the host (model of `/root/backup-arminia.sh`), 14-day rotation.
- [ ] **Step 8: Smoke test** — `curl https://ladungsplaner.group-schaefer.de/api/health` → `{"status":"ok"}`; open the app; import a real `SO-####` deep-link.
- [ ] **Step 9: Write `docs/INFRASTRUKTUR-ladungsplaner.md`** — record image, volume, env keys (names only), domain, limits, backup schedule, redeploy steps.
- [ ] **Step 10: Commit + merge; close LKWkalk-62x and epic LKWkalk-66g.**

---

## Self-Review

**Spec coverage (design spec §1–§12):**
- §2 reuse engine/i18n → Global Constraints + Tasks 1–2 import smoke. ✅
- §3 monorepo + one container + browser engine + `DataProvider` seam → Tasks 1–4. ✅
- §4 two screens → Tasks 6, 7. ✅
- §5 SQLite model (vehicle, loading_plan snapshot) → Task 5. ✅
- §6 ERPNext B (adapter, one-click import, deep-link, dimension fallback, secrets) → Task 8. ✅
- §7 deploy (Dockerfile, production branch, domain, limits, volume, backup, secrets) → Tasks 3, 9. ✅
- §8 auth (Basic Auth via Traefik) → Task 9 Step 6. ✅
- §9 B→A path → seam isolated to `DataProvider` (Task 4) — no code change needed now. ✅
- §10 testing (DataProvider contract tests, server API in-memory, mocked ERPNext, dimension parser, geometry validator each result) → Tasks 4, 5, 8, 7. ✅
- §11 YAGNI (no accounts/PDF/write-back/mobile) → excluded. ✅
- §12 ADR impact (007 IndexedDB replaced by SQLite; 010 npm publish off crit-path) → reflected; no npm publish step. ✅

**Placeholder scan:** no "TBD"/"add error handling"/"similar to Task N" — route/screen tasks that are UI-heavy carry concrete test intent + exact interfaces; code shown for all engine/DB/parser/HTTP logic. Screens (6, 7) describe steps with exact interfaces and reference files rather than full JSX (justified: they are visual ports of committed reference HTML — the reference is the spec).

**Type consistency:** `Vehicle/CargoType/Load/Layout` used verbatim from engine; DTOs (`OrderZone/OrderPosition/LoadingPlan*`) defined once in Task 4 and consumed unchanged in Tasks 5, 8; `DataProvider` method names match between interface (Task 4) and `HttpDataProvider` impl; `orderColorToken` signature consistent between Tasks 6 and 7; `parseDimensions` return shape consistent between Task 8 parser and adapter.

**Open follow-ups (out of this plan, tracked in beads):** qrd.31 per-position clearance (engine), qrd.29 nesting default, qrd.17 real dimensions data, qrd.15 PDF/PNG export.
