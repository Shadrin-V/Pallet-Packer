# Web UX Batch 2 — Ladeplan-Referenz, Logo/Druck, Legende, kleinere Fixes

> Спека второго батча web-UX доработок (2026-07-15). Аудитория: агент Claude Code + диспетчер claude.ai.
> Процесс: docs-first → beads → TDD. Брейншторм-диалог отменён (директива автономии) — решения ниже
> приняты письменно, спорные подтверждены пользователем (см. §Решения).

## Контекст

MVP LIVE (https://ladungsplaner.holz-schaefer.de). Владелец дал 6 правок по скриншоту прод-экрана.
Эталон вида Ladeplan — `docs/lovable/ladeplan-reference.html` (богатая шапка + мета-полоса + фигуры +
разрезы + легенда-разбивка). Текущий `LadeplanScreen` беднее эталона и зажат `max-w-[1120px]`.

## Решения (приняты / подтверждены)

- **Логотип:** пользователь пришлёт **SVG-файл** → `apps/web/public/logo.svg`, вставка inline `<img>`.
  До получения — плейсхолдер-марка на токенах (зелёный круг + «Schäfer / Holz bewegt.»), follow-up бид
  на замену. Логотип и на сайте (шапка Ladeplan), и в печатном документе.
- **Печать:** формат по умолчанию **A4 landscape**; содержимое = **лого + шапка (Fahrzeug/Auftrag/
  итоги) + 2 разреза + разбивка по заказам**. Экран «Настройка» и мелкие плитки статистики — скрыты
  (мелкая статистика уходит в одну строку шапки).
- **Ширина Ladeplan:** почти на всю ширину окна (убрать тесный кап 1120px), мягкий предел ~1600px +
  адаптивные поля, чтобы на ultrawide не растягивалось до нечитаемости.
- **Verschachtelungsmodus по умолчанию:** `pairwise` (только UI-дефолт новой позиции; ядро/ADR-009 не
  трогаем — их выравнивание отдельным бидом qrd.29).

## Правки (что делаем)

### E1 — Tooltip «Stapelbar» (i)
Поле «Stapelbar» = `maxTiers` (лимит ярусов штабеля), пустое = без лимита (до высоты кузова). Логика
неочевидна. Добавить примитив `InfoHint` (кнопка «i» + всплывающая подсказка, доступная с клавиатуры,
`aria-label`), рядом с меткой «Stapelbar». Текст — ключ i18n `cargoType.stacking.hint`.

### E2 — Ladeplan под эталон + на всю ширину
`LadeplanScreen`/новые под-компоненты приводятся к `ladeplan-reference.html`:
- **Шапка-бренд:** логотип + «Schäfer / Holz bewegt.» слева; справа kicker «Ladeplan · Ladungsplaner»
  + имя кузова (h2). Кнопки Zurück/Drucken — как сейчас, `print:hidden`.
- **Мета-полоса:** Fahrzeug (innen) `L×W×H mm`, Auftrag (список orderId), Belademodus
  (`load.loadingMode ?? combined`) + три фигуры справа: **Paletten** (totalPlaced), **Stellplätze**
  (usedFloorPositions), **Auslastung** (floorFillPercent %).
- **Разрезы:** как есть (`CrossSection` top/side), с указателями Vorne/Hinten (уже есть в cutaway).
- Контейнер: убрать `max-w-[1120px]` → `max-w-[1600px]` + адаптивные поля; на печати `max-w-none`.

### E3 — Логотип + печать landscape
- `index.html`: favicon = logo.svg.
- Печатный CSS: `@page { size: A4 landscape; margin: 10mm }`. На печати скрыт `SetupScreen` целиком
  (обёртка `print:hidden` вокруг него в `App.tsx`) и второстепенное; показаны лого+шапка+разрезы+
  разбивка. Плитки `Metrics` в печати не дублируются (итоги уже в шапке).

### E4 — Ширины полей ввода
Числовые `Measure` в строке позиции (`w-20`/`w-16`) обрезают «1200». Расширить: L/W/H → `w-24`,
Menge → `w-20`. Проверить, что «13600»/«2430» в шапке кузова (`w-24`) тоже влезают → при нужде `w-28`.

### E5 — Дефолт Verschachtelungsmodus = pairwise
`emptyPosition().nestingMode: 'sequential'` → `'pairwise'`. `allowUnpairedTop` по умолчанию остаётся
`false`. Влияет только на первичный вид формы.

### E6 — Мелкая статистика + полезная разбивка по заказам
- `Metrics`: 4 крупные плитки → одна компактная строка (мелкий текст, `text-caption`), как «foot» в
  эталоне (Boden %, Volumen %, N Paletten · M Stellplätze).
- `Legend` → **разбивка по заказам**: на заказ — swatch (цвет+штрих) + orderId + перечисление позиций
  «имя × placed» (и «(N nicht platziert)» при unplaced>0). Данные: join `layout.placements`/`unplaced`
  по `cargoTypeId` с `load.cargo` (name, orderId). Порядок заказов = `orderIndexMap`.

## Тесты (TDD, где есть смысл)

- `Legend`: по `load`+`layout` рендерит на заказ orderId и «name × placed»; показывает unplaced.
- `LadeplanScreen`: рендерит фигуры Paletten (totalPlaced), Stellplätze (usedFloorPositions),
  Auslastung (floorFillPercent%); мета-строку с габаритами кузова.
- `InfoHint`/Setup: у «Stapelbar» есть доступная кнопка-подсказка с текстом hint.
- `Metrics`: компактный ряд содержит Boden/Volumen % и счётчики (структура изменилась → обновить тест).
- Дефолт: новая позиция при переключении в Ver показывает «Paarweise».
- Пер-заказ разбивка считается чисто (утилита `orderBreakdown(load, layout)`) — unit-тест на join/счёт.

Пустые/пограничные: заказ без placed (всё unplaced), несколько позиций в заказе, orderId отсутствует.

## Токены/i18n

Ни одного hex в JSX — только токены (`--brand`, `--s1..8`, ...). Новые ключи в `keys.ts` + `de.ts` +
`ru.ts` (парити проверяет `keys.test.ts`):
`cargoType.stacking.hint`, `ladeplan.vehicleInner`, `ladeplan.orders`, `ladeplan.loadingMode`,
`ladeplan.mode.rear|side|combined`, `ladeplan.fig.pallets|positions|load`, `ladeplan.brandTagline`,
`ladeplan.kicker`, `ladeplan.pltAbbr` (сокр. «Pal.»), `ladeplan.notPlaced`.

## Гейты

`npm test` · `npm run lint` · `npm run typecheck` · `npm run build --workspace apps/web` (+ docker при
изменении web/server — здесь только web). Правок в `packages/engine`/`i18n` есть (i18n) → пересобрать
`@shadrin-v/i18n` dist до web-тестов. Геометро-инвариант Ladeplan не затрагивается (раскладка та же).
