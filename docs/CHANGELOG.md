# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/);
версионирование — [SemVer](https://semver.org/lang/ru/).

## Соответствие версий (`@shadrin-v/engine`)

По версии пакета в Lovable видно, какой контракт внутри. Процесс публикации — в
[onboarding.md §6](onboarding.md). Каждое контрактное изменение → ≥ patch-бамп пакета.

| Пакет npm | Контракт | Что вошло |
|-----------|----------|-----------|
| `0.0.1`   | `0.5.0`  | Первый публичный публиш: `calculateLayout`/`getLayoutReport`, `Layout.errors`. |
| `0.0.2`   | `0.6.0`  | Корректные метрики floor/volume; отклонение вложения `Δh ≤ 0`; `computeStack` (предпросмотр штабеля 2.5D). |
| `0.0.3`   | `0.7.0`  | `StackPreview` операнды формулы (`base`/`hold`/`stepHeight`/`rawCount`/`cappedBy`/`cap`) — вывод формулы штабеля в UI. |
| `0.0.4`   | `0.8.0`  | `orientedDims(l,w,h,Orientation) → [dx,dy,dz]` — UI рисует виды сверху/сбоку из `Layout`. |
| `0.0.5`   | `0.9.0`  | `findGeometryViolations(Load,Layout) → GeometryViolation[]` — проверка отредактированной вручную раскладки (drag штабелей). |
| `0.0.6`   | `0.9.0`  | Bugfix: per-tier z колонки «парами» достигает истинной высоты штабеля (был сжат до `t·h_д`) → верный вид сбоку и `volumeFillPercent` (qrd.22). |

> `latest` в npm может отставать от main: публикует пользователь по запросу (см. onboarding.md §6).
> Строку добавляем при бампе версии в `packages/engine/package.json` во время merge.

## [Unreleased]

### Added
- **Пивот на полноценное приложение (ADR 015, эпик `LKWkalk-66g`).** Скаффолд монорепо: `apps/web`
  (Vite React SPA, движок в браузере, токены `design-system.md`) + `apps/server` (Fastify + SPA-раздача
  + `/api/health`), workspaces расширены до `packages/*`+`apps/*`, multi-stage Dockerfile (Node 22,
  нативный better-sqlite3). Гейты зелёные (148 тестов, lint, typecheck, docker build, смоук контейнера).
  Нарратив вехи: [milestones/2026-07-14-fullstack-scaffold.md](superpowers/milestones/2026-07-14-fullstack-scaffold.md);
  план: [plans/2026-07-14-fullstack-app-erpnext.md](superpowers/plans/2026-07-14-fullstack-app-erpnext.md).

### Fixed
- Колонка «парами» (pairwise): per-tier `z` теперь достигает истинной высоты штабеля
  `H + k·(H + h_д)` вместо сжатого `t·h_д` — корректный вид сбоку и `volumeFillPercent`
  (`LKWkalk-qrd.22`). Геометрия остаётся валидной (column-aware, ADR 014).

### Added
- Контракт API движка **0.9.0**: экспонирована `findGeometryViolations(Load, Layout) →
  GeometryViolation[]` — UI проверяет отредактированную вручную раскладку (перемещение штабелей) на
  пересечения/выход за габариты/ориентацию без дублирования доменной логики (`LKWkalk-qrd.30`).
- Контракт API движка **0.8.0**: экспонирована `orientedDims(l, w, h, Orientation) → [dx, dy, dz]`
  — UI рисует виды сверху/сбоку из `Layout` без дублирования маппинга ориентаций (`LKWkalk-qrd.14`).
- Контракт API движка **0.7.0**: `StackPreview` расширен операндами формулы (`base`, `hold`,
  `stepHeight`, `rawCount`, `cappedBy`, `cap`) — UI показывает читаемый вывод «как получено N в
  штабеле» (кнопка «Рассчитать штабель») без дублирования доменной логики (`LKWkalk-qrd.26`).
- Контракт API движка **0.6.0** + `computeStack(CargoType, Vehicle) → StackPreview`: публичный
  предпросмотр вертикального штабеля (промежуточный шаг 2.5D — сколько поддонов в одном штабеле — до
  2D-раскроя пола). Чистая функция, поведение расчёта не меняет; UI показывает эффект `Δh`/режима
  вложения до полного расчёта (`LKWkalk-qrd.25`).
- `@shadrin-v/engine`: метрики заполнения — `computeFillMetrics` (floor/volume %, column-aware
  bounding-box объём, уважает инвариант вложения; 0..100); `packLoad` проставляет реальные метрики
  в `Layout` (`LKWkalk-qrd.8`).
- Публичный API движка: `calculateLayout(Load) → Layout` (валидация → коды в `Layout.errors` или
  упаковка+метрики) и `getLayoutReport(Layout) → Report` (per-type requested/placed/unplaced из
  раскладки); `validateLoad` также экспортирован. Точка входа `@shadrin-v/engine` (`LKWkalk-qrd.10`).
- Контракт API движка **0.5.0**: опц. `Layout.errors` (`EngineError[]`) — канал кодов валидации в
  результате `calculateLayout` (аддитивно, поведение успешного расчёта не меняется).
- Фаза 1 (brainstorming) завершена: зафиксированы объём и архитектура MVP.
- Документация: `spec.md`, `design.md`, `api-contract.md`, ADR 001–008.
- Контракт API движка версии `0.1.0` (черновик, до реализации).
- Пресеты (реальные данные): LKW 13600×2430×2650; Европоддоны EPAL 1/2/3/6 + Viertel
  (см. spec.md, Приложение A). Параметры вложения — PLACEHOLDER (`LKWkalk-qrd.17`).
- ADR 008 (предложено): интеграция `@shadrin-v/engine` в Lovable — решается спайком `LKWkalk-qrd.16`.
- ADR 009 + контракт **0.2.0**: модель вложения **pairwise** (парами) — поля `nestingMode`,
  `allowUnpairedTop`, переинтерпретация `stepHeight` как h_д. Аддитивно; `sequential` по умолчанию.
- `docs/qrd-17-preset-data.md` — точка сбора реальных данных каркасов (h_д для pairwise).
- ADR 010 (итог спайка qrd.16): интеграция в Lovable — приватный scoped npm-пакет через `.npmrc`
  + build secret; ADR 008 разрешён. Браузерная модель (ADR 001) подтверждена.
- Ре-скоуп пакетов `@pallet` → `@shadrin-v` (GitHub Packages, ADR 010).
- ADR 011 + контракт **0.3.0**: группировка по заказам (`CargoType.orderId`); смешанные загрузки —
  частый кейс; ориентация упаковки — по макс-влезанию (EUR → 34). LIFO-очередность точек — вне MVP.
- `docs/onboarding.md` — чеклист поднятия окружения с нуля; восстановление реестра beads — проверенная
  команда `bd bootstrap`. `.npmrc` добавлен в `.gitignore` (для qrd.19, не коммитить).
- ADR 012 + контракт **0.4.0**: режимы загрузки `Load.loadingMode` (rear/side/combined, default
  `combined`; combined = плотнейшая из rear/side). Затрагивает floor-упаковщик (`LKWkalk-qrd.4`).
- `docs/superpowers/specs/2026-07-10-qrd4-shelf-packer-design.md` — дизайн floor-упаковщика:
  ShelfPacker как чистый примитив, ориентация по макс-влезанию, shelf next-fit, режимы загрузки.
- ADR 013: вращение в MVP — `full` ≈ yaw в упаковщике (переворот на грань отложен, вне 2.5D);
  валидация лояльна (full-груз, влезающий только tipped, → `unplaced`). Единый модуль
  `model/orientation.ts` устраняет дублирование rotation-логики (`LKWkalk-qrd.6`). Контракт без изменений.
- `docs/superpowers/specs/2026-07-10-qrd6-rotation-rules-design.md` — дизайн интеграции правил вращения.
- ADR 014: геометрия вложенных/штабельных колонок — валидатор column-aware (единицы одной `(x,y)`-колонки
  одного типа делят колонку, вертикальное перекрытие законно). Инвариант spec §11 уточнён (`LKWkalk-qrd.7`).
- `docs/superpowers/specs/2026-07-10-qrd7-orchestrator-design.md` — дизайн оркестратора: зоны по orderId
  (смежные по длине), fill/quantity, floor+vertical → Layout, contract 0.4.0 в коде.

### Планируется (эпик «Pallet Packer MVP»)
- `@shadrin-v/engine`: домен, валидация, 2D shelf-упаковщик, вертикальный расчёт, метрики.
- `@shadrin-v/i18n`: локали de/ru, форматирование единиц и чисел.
- Прототип UI в Lovable: выбор кузова, редактор заявки, вид сверху/сбоку, экспорт PDF/PNG/JSON.
- Справочники: пресеты + IndexedDB + JSON импорт/экспорт.
