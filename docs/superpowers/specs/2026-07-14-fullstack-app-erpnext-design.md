# Дизайн: полноценное приложение Ladungsplaner + интеграция ERPNext (вариант B → A)

Статус: утверждён пользователем (2026-07-14). Реализация — отдельным планом (writing-plans).
Связанный ADR: [ADR 015](../../adr/015-fullstack-app-erpnext.md).

## 1. Контекст и решение

Прототип UI в Lovable отвергнут: Lovable не воспроизводит утверждённый дизайн. Пивот: строим
**полноценное веб-приложение** (правки — через Claude Code), с БД и **полной интеграцией ERPNext**
(облако Schäfer). Домен Schäfer — производство/продажа паллет; товары ERPNext = сами паллеты (сейчас
габариты в названии, отдельных полей нет — будут добавлены).

**Стратегия B → A** (утверждено): сначала **B** — отдельное приложение, интеграция с ERPNext по REST;
позже **A** — то же приложение внутри ERPNext как Frappe-app. Проектируем так, чтобы переход был
дешёвым: движок и React-UI — переносимое ядро; слой данных/ERPNext — за интерфейсом `DataProvider`.

**Стек (вариант 1, утверждён):** Vite React SPA + тонкий Fastify-бэкенд (better-sqlite3), один Docker-
контейнер, деплой через существующий **Coolify на Hetzner** (паттерн приложения `arminia`).

## 2. Что переиспользуется как есть

- **`packages/engine`** (`@shadrin-v/engine`, контракт 0.9.0, 144 теста) — вся доменная логика.
  Импортируется как workspace-зависимость (npm-публикация больше не нужна для UI).
- **`packages/i18n`** (`@shadrin-v/i18n`, de/ru) — локали и форматирование.
- **Дизайн-система и эталоны** — `docs/lovable/design-system.md`, `setup-reference.html`,
  `ladeplan-reference.html` (это целевой вид экранов).

## 3. Архитектура

Монорепо (npm workspaces, расширить до `["packages/*","apps/*"]`):

```
packages/engine   — движок (reuse)
packages/i18n     — локали (reuse)
apps/web          — Vite React SPA: два экрана (Настройка, Ladeplan); движок работает в браузере
apps/server       — Fastify + better-sqlite3: персистенс + адаптер ERPNext + отдаёт собранный SPA
```

- **Один контейнер, один процесс, один порт** (за Traefik, без публикации портов). Multi-stage
  Dockerfile: сборка engine/i18n/web → Fastify отдаёт статику `apps/web/dist` и `/api/*`.
- **Движок — в браузере** (как сейчас, ADR 001 сохраняется частично): `calculateLayout`,
  `computeStack`, `orientedDims`, `findGeometryViolations` вызываются в SPA. Сервер тонкий.
- **Шов миграции `DataProvider`** (в `packages/` или `apps/web`): единственный интерфейс, через
  который SPA получает данные. В **B** — реализация поверх HTTP к `apps/server` (SQLite + ERPNext
  REST). В **A** — реализация поверх Frappe. SPA никогда не ходит в ERPNext/SQLite напрямую.

```ts
interface DataProvider {
  listVehicles(): Promise<Vehicle[]>;                 // библиотека кузовов
  upsertVehicle(v: Vehicle): Promise<Vehicle>;
  saveLoadingPlan(p: LoadingPlanInput): Promise<LoadingPlan>;
  listLoadingPlans(): Promise<LoadingPlanSummary[]>;
  getLoadingPlan(id: string): Promise<LoadingPlan>;
  // ERPNext
  importOrder(erpOrderId: string): Promise<OrderZone>; // Sales Order → зона (orderId + позиции)
  searchOrders(query: string): Promise<OrderRef[]>;
}
```

## 4. Экраны (UI)

Ровно два эталона, на React + токенах `design-system.md` + `@shadrin-v/i18n` (de дефолт/ru) +
`@shadrin-v/engine`:
- **Настройка** (`setup-reference.html`): тонкая строка кузова, карточки заказов, компактные
  строки-позиции (Ent/Ver один сегмент), пресеты вторично; движок считает предпросмотр штабеля.
- **Ladeplan / результат** (`ladeplan-reference.html`): чистая карточка под скриншот — шапка, два
  разреза на всю ширину (цвет+штрих по заказу), легенда, крошечные метрики; печать A4.

Это перенос ранее подготовленной UI-работы (qrd.13/14/30) в реальный код.

## 5. Модель данных (SQLite, `apps/server`)

Габариты позиций и заказы приходят из ERPNext на момент расчёта; сохранённый план **снимок**
(reproducible), поэтому отдельного мастера грузов не держим (это Items в ERPNext).

- `vehicle(id, name, length, width, height)` — библиотека кузовов (+ встроенный LKW).
- `loading_plan(id, name, created_at, updated_at, vehicle_json, load_input_json, layout_result_json,
  erpnext_refs_json, notes)` — сохранённый расчёт: вход `Load` + результат `Layout` + ссылки на
  Sales Order(ы).
- Данные — только в **named volume** + ночной бэкап (паттерн §6 инфра-файла).

## 6. Интеграция ERPNext (вариант B)

- **Адаптер REST на сервере** (base URL + API key/secret — секреты Coolify). Никогда в git.
- **Импорт заказа (в один клик):** из ERPNext по кнопке/скрипту открывается приложение с id заказа
  (deep-link `?order=SO-####`) → `DataProvider.importOrder` тянет Sales Order → создаёт `orderId`-зону
  с позициями (item_code, qty, габариты). «Машина не полная → добавить ещё заказ» = импорт следующего
  SO как новой зоны (движок уже поддерживает зоны по `orderId`).
- **Габариты:** у Item пока нет полей. План (доработка ERPNext на их стороне): добавить кастом-поля
  `length_mm/width_mm/height_mm` (+ параметры вложения) в DocType Item. **До этого** — фолбэк: парсинг
  габаритов из названия (напр. «600x800 mm») + ручная правка в позиции. Документировать ограничение.
- **Запись обратно** (позже): ссылка/вложение плана к Sales Order / Delivery Note через API.
- Живую схему ERPNext (Sales Order/Item, кастом-поля) смотреть через подключённый MCP при
  проектировании адаптера.

## 7. Деплой (Coolify / Hetzner)

- Репо `Shadrin-V/Pallet-Packer` (private). Ветка автодеплоя **`production`** (конвенция Coolify).
- **Dockerfile** (Node 22, multi-stage): build engine+i18n+web → runtime Fastify. Данные — том
  `/app/data` (SQLite). Лимиты контейнера ~**512 MB / 0.5 CPU** (обязательно на общем сервере).
- **Coolify Application** из GitHub (deploy key), поддомен **`ladungsplaner.holz-schaefer.de`**
  (A-запись → 204.168.246.13, DNS-only до сертификата), TLS авто через Traefik. **Портов не
  публиковать** — только через Traefik.
- **Бэкап:** SQLite `.backup()` + tar тома, ротация 14 дней (свой скрипт по образцу
  `/root/backup-arminia.sh`); дописать в инфра-файл.
- **Секреты:** ERPNext URL/ключи — только Environment Variables (secret) в Coolify.

## 8. Аутентификация (MVP)

Внутренний инструмент за приватным поддоменом. MVP: **HTTP Basic Auth через Traefik/Coolify** (или без
неё на старте, по решению владельца). Полноценный ERPNext-SSO — в варианте A. Не строим аккаунты/роли
сейчас (YAGNI).

## 9. Путь B → A (Frappe)

Frappe-app заменяет `apps/server`: `DataProvider` реализуется против Frappe (DocType «Loading Plan»;
Sales Order/Item — нативно). `apps/web` монтируется как Frappe-страница; движок и экраны не меняются.
Так как SPA зависит только от `DataProvider`, замена локализована.

## 10. Тестирование

- Движок/i18n — существующие Vitest-тесты сохраняются (гейт при каждом изменении).
- Новое: контракт-тесты `DataProvider`; API-тесты сервера (SQLite in-memory); тесты адаптера ERPNext
  (замоканный REST); парсер габаритов из названия. E2E экранов — позже.
- Геометро-валидатор (`findGeometryViolations`) — на каждом отрисованном/сохранённом результате.

## 11. Не входит (YAGNI)

Аккаунты/роли/мультитенант; биллинг; realtime-коллаборация; PDF/PNG-экспорт (qrd.15, позже); запись
плана обратно в ERPNext (позже); мобильный layout (desktop-first).

## 12. Влияние на прежние ADR

- **ADR 001** (движок в браузере) — сохраняется (движок работает в SPA).
- **ADR 007** (IndexedDB) — заменяется: персистенс в SQLite на сервере.
- **ADR 010** (npm-публикация для Lovable) — неактуально: движок импортируется локально в монорепо;
  публикация в npm больше не на критпути (пакет можно оставить опубликованным для истории).
- UI-биды Lovable (qrd.13/14/15/23/28/30-промпты) — **superseded**: UI строится в `apps/web`.
