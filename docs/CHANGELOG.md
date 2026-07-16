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

### Documentation
- **Умная раскладка — спека и решения (эпик `LKWkalk-4bj`, `4bj.6`).** Разбор упаковщика показал, что
  «полки режутся под первый тип» — лишь **один из трёх** независимых источников карманов: храповик
  `shelfDepth` (глубина полки растёт и не убывает, backfill отсутствует), next-fit (открытие новой
  полки навсегда закрывает предыдущую) и выбор ориентации против пустого региона; четвёртый источник
  — срезы зон заказов — ортогонален. Половина задачи оказалась уже реализованной в движке и не
  выведенной в UI (`Load.loadingMode`, ADR 012). Задача разведена на `4bj.7` (вывести режимы в UI,
  дёшево), `4bj.8` (плотная эвристика, движок) и `4bj.9` (тумблер смежности зон).
  Спека — `docs/superpowers/specs/2026-07-16-smart-layout-design.md`.
- **[ADR 017](adr/017-dense-floor-heuristic.md)** — плотная напольная эвристика: best-fit вместо
  next-fit, backfill карманов, ориентация против остаточного места. Устранено расхождение ADR ↔ код:
  предписанный ADR 004 сорт футпринтов по убыванию площади **никогда не был реализован** и признан
  отменённым — порядок входа несёт семантику приоритета заявки (`floor.test.ts:141`), а плотность
  достигается без переупорядочивания запросов. Зафиксировано, что интерфейс `Packer` существовал
  только в документации; фактический шов — `packFloor` (правки `design.md`, ADR 004, `CLAUDE.md`).
- **[ADR 016](adr/016-order-grouping-density-toggle.md)** — `Load.orderGrouping: 'strict' |
  'densityFirst'` (контракт **0.10.0**, аддитивно, default `strict`): явное ослабление смежности зон
  заказов ради плотности. ADR 011 остаётся дефолтом; «заказ выгружается целиком» становится свойством
  режима `strict`, а не безусловным инвариантом.

### Added
- **Ручной поворот стопки в виде сверху (эпик `LKWkalk-4bj`, `4bj.5`).** Клик по стопке в «Draufsicht»
  выделяет её (пунктирный контур) и показывает кнопку поворота на 90° у верхнего-правого угла.
  Поворот — только вокруг вертикальной оси (`lwh`↔`wlh`, ADR 013), якорь — угол `(x,y)`; правило
  `rotation: 'none'` поворот запрещает. Как и drag, поворот отклоняется при перекрытии соседней
  стопки или выходе за габариты (`findGeometryViolations ≠ []`) — раскладка остаётся прежней.
  Выделение и кнопка не печатаются. Модуль `components/dragLayout.ts` → `components/editLayout.ts`
  (`moveStack` + `rotateStack`). Спека — `docs/superpowers/specs/2026-07-16-manual-stack-rotation-design.md`.
- **Пользовательские пресеты паллет (эпик `LKWkalk-4bj`, `4bj.4`).** Свои габариты можно сохранить в
  каталог: в раскрывающейся панели позиции — «Als Preset speichern» (имя из поля «Bezeichnung»,
  фолбэк `L×W×H`), пресет сразу появляется в дропдауне «Ladungsart» всех позиций экрана и переживает
  перезагрузку (localStorage `ladungsplaner.palletPresets`). Выбранный свой пресет удаляется кнопкой
  «Preset löschen». Дедуп по габаритам; «Zurücksetzen» чистит черновик формы, но не каталог.
  Спека — `docs/superpowers/specs/2026-07-16-user-pallet-presets-design.md`.
- **Hero-шапка сайта (`LKWkalk-9l1`).** Вверху страницы «Настройка» — бренд-градиент (sage→mint),
  логотип `/logo.svg`, заголовок/подзаголовок, переключатель языка и тематический SVG-мотив паллет
  (плейсхолдер под будущее фото/loop-видео: свап файла в `apps/web/public/` без правок логики).
  `print:hidden` — печатный Ladeplan не затронут (там своя бренд-шапка SCHÄFER).
- **Кнопка «Демо» (эпик `LKWkalk-4bj`, `4bj.3`).** Один клик заполняет план и сразу считает его.
  Датасет `apps/web/src/data/demo.ts` покрывает весь функционал: 4 заказа (цвет+штриховка), все
  пресеты паллет + свой размер (Sonderpalette 1340×890×178), Ent/Ver, оба режима вложения
  (pairwise/sequential), лимиты `maxNested`/`maxTiers`, все три правила вращения (none/yawOnly/full)
  и переполнение (EPAL 3 ×216 → часть в «nicht platziert»). Количества подобраны прогоном движка:
  692 размещено, 89 % пола, 65 % объёма, 108 не размещено.
- **Задел: пользовательские пресеты паллет (`LKWkalk-4bj.4`, UI ещё не подключён).**
  `apps/web/src/data/userPresets.ts` — `loadUserPallets`/`addUserPallet`/`removeUserPallet`/
  `isUserPreset`, хранение в `localStorage` (`ladungsplaner.palletPresets`, ключи `user-<uuid>`);
  i18n-ключи `setup.savePreset`/`setup.deletePreset`. Остаток работы — в `bd show LKWkalk-4bj.4`.
- **Web UX Batch 4–6 (эпик `LKWkalk-2ll`, продолжение).** Печать: **штриховка заказов рисуется
  прямыми `<line>`/`<circle>`** (SVG `<pattern>` не печатается в Chrome) с аналитическим клиппингом
  (Лианг-Барски) — различимо в цвете и ч/б; план во всю **ширину A4**; справка по составу с
  габаритами `L×W×H` каждого артикула (компактно, 1 лист). **Вид сбоку** — один силуэт-бар на штабель,
  задние ряды показаны тусклее (глубина по x). ×N над штабелями одного размера; Vorne/Hinten вынесены
  над разрезом. **Схема штабеля** (`StackDiagram`) в раскрывающемся окне позиции, в цвет заказа.
  **UX настроек**: аккордеон + закрытие настроек вложенности по клику вне (click-outside), авто-раскрытие
  на «Verschachtelt». **Persistence** setup+плана в `localStorage` (нет сброса при обновлении) + кнопка
  «Zurücksetzen». Числовые поля: количество влево, скрыт спиннер. Убран нефункциональный «Belademodus».
  **Пресеты фур**: LKW Extra-hoch (2800), LKW Mega (3000), Wechselbrücke, Kühlkoffer/Frigo (+ «Eigene
  Maße»). 228 тестов. Спека батча: [specs/2026-07-15-web-ux-batch-2-design.md](superpowers/specs/2026-07-15-web-ux-batch-2-design.md).
- **Web UX Batch 3 (эпик `LKWkalk-2ll`).** Реальный логотип Holz Schäfer (`apps/web/public/logo.svg`,
  favicon + шапка Ladeplan). Печать: `print-color-adjust: exact` (штриховка/тинты заказов теперь
  печатаются) + свёртка в 1 страницу A4 landscape (фикс. высота разрезов 58 мм, компактные отступы,
  в печати легенда сворачивается до итога по заказу). Проценты заполнения округляются (был сырой float
  `71.895…%`). Промежуточный шаг — **схема штабеля** (`StackDiagram`, боковая проекция decks в рамке
  высоты кузова) в раскрывающемся окне позиции рядом с формулой. Переключение в «Ver» авто-раскрывает
  настройки позиции; кнопка «+ Auftrag» продублирована внизу списка заказов. 223 теста.
- **Web UX Batch 2 (эпик `LKWkalk-2ll`).** Ladeplan приведён к эталону
  [ladeplan-reference.html](lovable/ladeplan-reference.html): шапка-бренд (логотип + «Schäfer / Holz
  bewegt.»), мета-полоса (Fahrzeug innen / Aufträge / Belademodus) + крупные фигуры
  Paletten·Stellplätze·Auslastung; экран на всю ширину (`max-w-1600`). Логотип на сайте и в печати
  (`/logo.svg` — плейсхолдер до реального ассета, favicon оттуда же); печать A4 **landscape**, экран
  «Настройка» скрыт при печати. Легенда развёрнута в **разбивку по заказам** (swatch + orderId +
  позиции «имя × размещено», «(N nicht platziert)»); плитки статистики свёрнуты в компактную строку.
  Tooltip-(i) у поля «Stapelbar»; дефолт `Verschachtelungsmodus = pairwise`; расширены узкие числовые
  поля ввода. 221 тест. Спека:
  [specs/2026-07-15-web-ux-batch-2-design.md](superpowers/specs/2026-07-15-web-ux-batch-2-design.md).
- **Web UX-доработки (эпик `LKWkalk-fvx`, live на ladungsplaner.holz-schaefer.de).** Одна страница
  (нет сброса состояния при результате); переключатель языка DE|RU + localStorage; пресеты кузова
  (LKW Standard) и палет (EPAL 1/2/3/6 + Viertelpalette, данные qrd-17); редактор формулы вложения по
  qrd-13 (режим sequential/pairwise, Δh/h_д, maxNested, живая формула из `StackPreview`, блок Berechnen
  при некорректном Δh); полировка разрезов (`non-scaling-stroke`, читаемые ×N, метки Vorne/Hinten);
  ручной drag штабелей в виде сверху (snap 100 мм + `findGeometryViolations`/футпринт-проверка, откат).
  214 тестов. Спека: [specs/2026-07-15-web-ux-improvements-design.md](superpowers/specs/2026-07-15-web-ux-improvements-design.md).
- **Дизайн-система (эпик `LKWkalk-563`) + экраны gxp/73u** — Direction D (бренд Holz Schäfer),
  два экрана (Настройка, Ladeplan) на React в `apps/web`; docs/design/design-system.md + theme.css.
- **Пивот на полноценное приложение (ADR 015, эпик `LKWkalk-66g`).** Скаффолд монорепо: `apps/web`
  (Vite React SPA, движок в браузере, токены `design-system.md`) + `apps/server` (Fastify + SPA-раздача
  + `/api/health`), workspaces расширены до `packages/*`+`apps/*`, multi-stage Dockerfile (Node 22,
  нативный better-sqlite3). Гейты зелёные (148 тестов, lint, typecheck, docker build, смоук контейнера).
  Нарратив вехи: [milestones/2026-07-14-fullstack-scaffold.md](superpowers/milestones/2026-07-14-fullstack-scaffold.md);
  план: [plans/2026-07-14-fullstack-app-erpnext.md](superpowers/plans/2026-07-14-fullstack-app-erpnext.md).

### Fixed
- **Вид сбоку показывал задний ряд передним (`LKWkalk-4bj.2`).** Глубина ранжировалась по возрастанию
  `y`. Конвенция зафиксирована: вид сбоку снят от нижнего края вида сверху (наблюдатель на `y = width`),
  значит **больший `y` — ближний ряд** (`depth 0`, полная непрозрачность), меньший — дальше (тусклее).
  Добавлено поле `CutRect.rowY`, тест сторожит конвенцию.
- **Click-outside съедал клик по кнопке (`LKWkalk-4bj.1`).** Панель «Verschachtelt» закрывалась на
  `mousedown` → DOM сдвигался до `mouseup`, и браузер отправлял `click` на предка, а не на нажатую
  кнопку («+ Position»/«+ Auftrag») — её обработчик не срабатывал. Слушаем `click`: обработчик кнопки
  (делегирование React на root) отрабатывает первым, затем панель закрывается.
- **Вёрстка строки позиции ломалась на длинных RU-лейблах (`LKWkalk-e5i`).** Ротация «Только вокруг
  вертикальной оси» распирала `nowrap`-строку → горизонтальный overflow страницы (на узком окне
  переполнял и DE, поэтому возврат на DE не помогал). Поле ротации — фиксированная ширина +
  `truncate` (`Select` базово `min-w-0/truncate`), строка переносится ниже 1280 px (`xl:flex-nowrap`);
  плюс запас по ширине (поджатые гэпы, меньшая min-ширина имени), чтобы контролы не упирались в край.
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
