# Веха: пивот на полноценное приложение — план + скаффолд монорепо

> Дата: 2026-07-14 · Эпик: **LKWkalk-66g** · Статус: **Веха 1 закрыта** (план готов, скаффолд в `main`).
> Аудитория: агент-диспетчер claude.ai (сверка по GitHub) + будущие сессии Claude Code.
> Связанные документы: [ADR 015](../../adr/015-fullstack-app-erpnext.md) ·
> [дизайн-спека](../specs/2026-07-14-fullstack-app-erpnext-design.md) ·
> [план реализации](../plans/2026-07-14-fullstack-app-erpnext.md).

## 1. Что это за веха

Утверждён пивот (ADR 015): от прототипа в Lovable — к **полноценному приложению**, которое правим
через Claude Code, с БД и интеграцией **ERPNext**. Стратегия **B → A**: сейчас отдельное приложение
поверх ERPNext REST (вариант B); позже — то же приложение как Frappe-app внутри ERPNext (вариант A).

За эту сессию: (1) составлен детальный план реализации (навык writing-plans), (2) собран и смёржен в
`main` скаффолд монорепо (первая из 9 задач эпика).

## 2. Архитектура (зафиксирована)

Монорепо npm workspaces `["packages/*","apps/*"]`:

```
packages/engine   — @shadrin-v/engine  (переиспользуется как есть, контракт 0.9.0, 144 теста)
packages/i18n     — @shadrin-v/i18n     (переиспользуется как есть, локали de/ru)
packages/contracts— @shadrin-v/contracts (БУДЕТ создан в задаче 6cy: общие DTO API)
apps/web          — Vite React SPA: два экрана (Настройка, Ladeplan); движок работает в браузере
apps/server       — Fastify + better-sqlite3: персистенс + адаптер ERPNext + отдаёт собранный SPA
```

**Ключевые архитектурные решения (неизменны без нового ADR):**
- **Один контейнер / один процесс / один порт** за Traefik. Multi-stage Dockerfile: собирает
  engine+i18n+web → тонкий Fastify отдаёт статику `apps/web/dist` и `/api/*`.
- **Движок — в браузере** (ADR 001 сохраняется): SPA сама зовёт `calculateLayout`, `computeStack`,
  `orientedDims`, `findGeometryViolations`. Сервер тонкий (персистенс + ERPNext-прокси).
- **Шов `DataProvider`** — единственный интерфейс, через который SPA берёт данные. В B — реализация
  поверх HTTP к `apps/server` (SQLite + ERPNext REST). В A — поверх Frappe. **SPA никогда не ходит в
  ERPNext/SQLite напрямую.** Это делает миграцию B→A локальной (меняется только реализация провайдера).
- **Персистенс — SQLite на сервере** (ADR 007 про IndexedDB заменён). Сохранённый план — **снимок**
  (`Load` + `Layout` + ссылки на Sales Order), воспроизводимый.
- **i18n с первого коммита** (ADR 006): ни одной строки в коде, только ключи; движок отдаёт `ERR_*`.
- **Токены дизайна** (`docs/lovable/design-system.md`) — единственный источник цветов/радиусов; в JSX
  ни одного hex. Только светлая тема (MVP), шрифт Inter.
- **Геометро-валидатор** `findGeometryViolations` — на каждой отрисованной/сохранённой раскладке.

## 3. Что реально сделано и лежит в `main`

Коммиты (ветка `feat/96y-scaffold-server` → merge в `main`, запушено, `bd dolt push` выполнен):

- `docs(plan)` — [план реализации](../plans/2026-07-14-fullstack-app-erpnext.md): 9 задач в порядке
  эпика, TDD-шаги, точные интерфейсы (`DataProvider`, DTO, парсер габаритов), self-review пройден.
- `feat(96y)` scaffold **apps/server** — Fastify, `GET /api/health → {status:ok, contract:"0.9.0"}`.
  workspaces расширены до `apps/*`; vitest ловит тесты `apps/*`; eslint: `_`-префикс = намеренно
  неиспользуемое.
- `feat(96y)` scaffold **apps/web** — Vite React 18, Tailwind на токенах `design-system.md`
  ([theme.css](../../lovable/design-system.md) → `apps/web/src/theme.css`), shell рендерит `app.title`
  + версию движка; переиспользует `@shadrin-v/engine` + `@shadrin-v/i18n` (доказано тестом).
- `feat(96y)` **Dockerfile** (Node 22, multi-stage) + `.dockerignore` — build → `npm prune --omit=dev`
  → тонкий runtime; `@fastify/static` + SPA-fallback (клиентские маршруты → `index.html`, `/api/*` →
  JSON-404). Нативный `better-sqlite3` собирается в build-стадии.

**Проверено (гейты зелёные):** 148 unit-тестов ✓ · lint ✓ · typecheck всех воркспейсов ✓ ·
`docker build` ✓. Образ запущен локально, смоук: `/api/health` отдаёт contract 0.9.0, SPA и
SPA-fallback работают, `/api/nope` → JSON-404.

## 4. Решения и отклонения, принятые по ходу (не были в плане явно)

1. **eslint:** добавлена конвенция `argsIgnorePattern:'^_'` (namely-unused переменные с `_`). Общее
   правило проекта.
2. **Production-сборка web НЕ типизирует тест-файлы.** `apps/web/tsconfig.json` исключает `*.test.*` и
   `test-setup.ts`; типы `@testing-library/jest-dom` подключаются только в test-setup (иначе они тянут
   jest-глобалы в прод-сборку). Тесты по-прежнему исполняет vitest.
3. **Dockerfile копирует `tsconfig.base.json`** в build-контекст (web-tsconfig наследует его) — иначе
   `tsc` в контейнере падал (TS5083 → каскад ошибок target).
4. **`@shadrin-v/contracts` пока НЕ в зависимостях `apps/server`** — пакета ещё нет (создаётся в 6cy).
   В Dockerfile строка сборки contracts тоже пока убрана; вернётся в задаче 6cy.
5. **dist пакетов engine/i18n пересобраны** локально (были устаревшие — не содержали `t`,
   `formatLength`). `dist/` в `.gitignore`; Docker и CI собирают заново. На чистой машине для локального
   `npm test` нужно сперва `npm run build --workspaces` (engine/i18n dist).

## 4a. Обновление — фундамент backend/данных достроен (та же сессия)

После скаффолда в `main` смёржены ещё три задачи (все гейты зелёные, e2e в контейнере):

- **6cy — DataProvider + `@shadrin-v/contracts`.** Общие DTO (OrderZone/OrderPosition/LoadingPlan*/
  OrderRef/ApiError) + интерфейс `DataProvider` (шов B→A) + `HttpDataProvider` (инъектируемый fetch,
  JSON-ошибки, кодирование path, base URL) + React-контекст. 5 контракт-тестов.
- **r13 — сервер + SQLite.** Схема (`vehicle`, `loading_plan`-снимок, WAL, идемпотентная миграция),
  репозитории, REST `/api/vehicles` (GET/PUT) + `/api/plans` (GET/POST/:id). POST считает `Layout`
  движком `calculateLayout` (единый источник истины). `index.ts` открывает БД на `DB_PATH` (том
  `/app/data`), `scripts/backup.sh` (.backup+tar, ротация 14д). e2e в контейнере: PUT кузова → POST
  плана (движок разместил 8) → GET из SQLite.
- **uvf — адаптер ERPNext (серверная часть).** `ErpNextAdapter.importOrder` читает габариты из
  **кастом-полей** `custom_length_mm/width/height` строки Sales Order (все три >0 → `erpnext-field`,
  иначе `manual`; **парсер названий отменён** — см. ниже), `searchOrders`, token-auth. REST
  `/api/orders` + `/api/orders/:id` с guard **`ERR_ERPNEXT_UNCONFIGURED` (503)**, когда секреты не
  заданы (сейчас ERPNext в локальном тест-режиме). Контейнер подтверждает 503. UI deep-link отложен.

**Итог по гейтам на конец сессии:** 172 теста ✓ · lint ✓ · typecheck (5 воркспейсов) ✓ · docker build ✓.

### Ключевые решения этой сессии (продукт/дизайн)

1. **Дизайн-система вынесена в отдельный трек** (`LKWkalk-563`, по решению владельца): владелец
   приложит готовые дизайн-документы позже; они станут источником истины для экранов. Экраны
   **gxp/73u заблокированы** этой задачей (не начинаем без документов).
2. **Парсер габаритов из названия ОТМЕНЁН.** Габариты приходят из явных кастом-полей ERPNext
   `custom_length_mm/width/height` (Int, мм) на **Item + Sales Order Item через `fetch_from`**. Адаптер
   читает из строки заказа (1 запрос). Провенанс сокращён до `{erpnext-field, manual}`. Спека:
   [specs/2026-07-14-erpnext-dimension-fields-design.md](../specs/2026-07-14-erpnext-dimension-fields-design.md)
   (там §7 — чек-лист настройки полей на стороне ERPNext для владельца). Брейншторм → спека → план
   обновлён → реализация.
3. **Deep-link импорта заказа** (UI) вынесен в follow-up `LKWkalk-s17` (блокируется экраном gxp).

## 5. Что дальше (оставшиеся задачи эпика 66g)

| bd | Задача | Статус | Суть |
|----|--------|--------|------|
| **6cy** | DataProvider + contracts | ✅ done | `packages/contracts` + `DataProvider` + `HttpDataProvider`. |
| **r13** | Сервер + SQLite | ✅ done | vehicle, loading_plan (снимок), REST /api, том /app/data, бэкап. |
| **uvf** | Адаптер ERPNext (сервер) | ✅ done | `importOrder` из custom-полей, `/api/orders`, guard unconfigured. |
| **563** | Дизайн-система (трек) | ⏳ ждёт документы | Владелец приложит дизайн-документы; **блокирует gxp/73u**. |
| **gxp** | Экран «Настройка» | 🔴 blocked (563) | React по `setup-reference.html`; segmented Ent/Ver, `computeStack`. |
| **73u** | Экран «Ladeplan» | 🔴 blocked (563) | React по `ladeplan-reference.html`; разрезы SVG, `findGeometryViolations`. |
| **s17** | Deep-link импорта (UI) | 🔴 blocked (gxp) | `?order=SO-####` → `importOrder` → посев экрана. |
| **62x** | Деплой Coolify | 🟡 нужна инфра | production, поддомен, TLS, лимиты, том+бэкап, секреты, Basic Auth. Нужен инфра-справочник владельца. |

## 6. Важные внешние факты (для сверки)

- **ERPNext сейчас НЕ настроен**: локальный тест-режим на ПК владельца. Перенос в облако Schäfer +
  создание кастом-полей габаритов (`length_mm/width_mm/height_mm`) в DocType Item — позже, на их
  стороне. Живая схема Item: габариты в `item_name` («…1200x800 mm…» = Д×Ш, высоты обычно нет),
  кастом-полей габаритов НЕТ, есть `weight_per_unit`, `item_group='Ladungsträger Artikel'`.
  (beads-память `erpnext-local-test-mode-2026-07-14`.)
- **Локальный Docker** использовался только для смоук-проверки образа (`docker build` + `docker run`
  на `localhost`). На сервер Hetzner/Coolify **ничего не деплоилось** — это отдельная задача 62x.
- **Lovable-версия отвергнута** (ADR 015). В репо от неё остаются только **эталоны дизайна** в
  `docs/lovable/` (`design-system.md`, `setup-reference.html`, `ladeplan-reference.html`) — это
  визуальная цель для React-экранов. Промпты `qrd-13/14/30` — superseded. Кода Lovable-приложения в
  репо нет (прототип жил вне репо).
