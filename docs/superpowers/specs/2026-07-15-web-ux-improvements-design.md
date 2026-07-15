# Дизайн: доработки UX веб-приложения (одностраничность, формула вложения, drag, языки, пресеты)

Статус: утверждён пользователем (2026-07-15, брейншторм). Реализация — отдельным планом (writing-plans).
Область: `apps/web` (движок/контракт не меняются — всё уже есть). Источники: спека формулы
[qrd-13-prompts.md](../../lovable/qrd-13-prompts.md), данные пресетов [qrd-17](../../qrd-17-preset-data.md),
дизайн-система [design-system.md](../../design/design-system.md).

## Контекст

Приложение живо (https://ladungsplaner.holz-schaefer.de), два экрана (Настройка, Ladeplan). По итогам
использования — 6 доработок. Движок уже даёт всё необходимое: `computeStack`→`StackPreview` (операнды
формулы `base/hold/stepHeight/rawCount/cappedBy/cap/count`, режим `mode`), `findGeometryViolations`,
`orientedDims`, поддержка `nestingMode` sequential/pairwise (ADR 009). Работа — только в UI.

## 1. Одностраничность (фикс сброса состояния)

**Проблема:** `App` переключает `SetupScreen`↔`LadeplanScreen`; при «Назад» SetupScreen размонтируется →
всё введённое теряется.

**Решение:** **одна страница**. `SetupScreen` всегда смонтирован и владеет состоянием (кузов + заказы).
Результат «Ladeplan» рендерится **в той же странице ниже** и появляется/обновляется по «Berechnen».
Кнопка «Zurück» убирается; вместо неё результат можно свернуть/пересчитать. Состояние **никогда** не
сбрасывается (нет размонтирования).

- `App` больше не держит режим-навигацию; он рендерит один компонент страницы.
- Состояние setup можно поднять в `App` или оставить в `SetupScreen` — оставляем в `SetupScreen`,
  который рендерит и результат (или `App` держит `{load, layout}` и рендерит `LadeplanScreen` ниже под
  `SetupScreen`, оба всегда смонтированы). Выбор: **`App` держит `result` и рендерит оба компонента
  подряд** (SetupScreen сверху всегда, LadeplanScreen ниже при наличии result).

## 2. Формула вложения (по qrd-13)

Раскрывающаяся панель правил позиции получает полноценные поля вложения/штабелирования и **читаемую
формулу штабеля** из операндов `StackPreview`.

**Модель позиции (`PositionState`) добавляет:**
- `nestingMode: 'sequential' | 'pairwise'` (дефолт `sequential`);
- `stepHeight` — Δh (sequential) или h_д (pairwise);
- `maxNested?` — лимит вложений;
- `allowUnpairedTop?: boolean` (только pairwise);
- (`maxTiers` уже есть — штабелирование без вложения).

**Панель правил (expandable):**
- Segmented Ent/Ver уже задаёт `state`. При **Verschachtelt**: select `nestingMode`
  (`cargoType.nesting.mode`), поле `stepHeight` с лейблом по режиму (sequential →
  `cargoType.nesting.stepHeightSeq` «Δh», pairwise → `cargoType.nesting.stepHeightPair` «h_д»),
  подпись-хинт `cargoType.nesting.stepHeightHint` с подстановкой `{H}` = высота позиции, поле
  `maxNested`. При **pairwise** — чекбокс `allowUnpairedTop`.
- Штабелирование: `maxTiers`.

**Живой предпросмотр + формула:** `computeStack(cargo, vehicle)` → `StackPreview`. Показать
`stack.result` («Im Stapel: {count} Paletten · {height}») + строку `stack.formula.label` = формула,
выбранная по данным:
- entschachtelt → `stack.formula.entschachtelt` `⌊Hк/H⌋ = ⌊{hold}/{base}⌋ = {rawCount}`;
- sequential → `stack.formula.sequential` `1 + ⌊(Hк−H)/Δh⌋ = 1 + ⌊({hold}−{base})/{step}⌋ = {rawCount}`;
- pairwise → `stack.formula.pairwise` `Paarweise, h_d = {step} mm → {rawCount} (vor Limit)`;
- если `cappedBy` → добавить `stack.formula.cap` `→ min({rawCount},{cap}) = {count}`;
- `cappedBy==='notStackable'` → `stack.formula.notStackable`.
Формула — в моно-плашке `--sub` (дизайн §3, «Формула»).

**Валидация:** при `state==='verschachtelt'` `stepHeight` обязателен, целое `1..height` (0 недопустимо).
При любой некорректной вложенной позиции — **блокировать «Berechnen»** и подсветить поле (ошибка
`ERR_INVALID_NESTING`). `toCargo` строит `nesting` из этих полей.

**Новые i18n-ключи (de/ru, из qrd-13):** `cargoType.nesting.mode`, `.modeSequential`, `.modePairwise`,
`.stepHeightSeq`, `.stepHeightPair`, `.stepHeightHint`, `.maxNested`, `.allowUnpairedTop`,
`stack.preview`, `stack.result`, `stack.formula.label`, `stack.formula.entschachtelt`,
`stack.formula.sequential`, `stack.formula.pairwise`, `stack.formula.cap`, `stack.formula.notStackable`.
Подстановки (`{count}`,`{height}`,`{hold}`,`{base}`,`{step}`,`{rawCount}`,`{cap}`,`{H}`) — простой
интерполятор в UI (i18n `t` возвращает шаблон, подстановку делает экран).

## 3. Рендер разрезов (полировка)

Сейчас штрихи/сетка заданы в мм-координатах → на широком `viewBox` (13600 мм) при отрисовке в ~1120px
становятся невидимо-тонкими; подписи `×N` (fontSize в мм) — непредсказуемы.

**Решение:**
- Все обводки (рамка кузова, сетка, контур стопки) — `vector-effect="non-scaling-stroke"` +
  толщина в **px** (рамка ~2px, сетка ~1px, контур стопки ~1.5px) — стабильно независимо от масштаба.
- Подписи `×N` — размер пропорционально футпринту стопки (`min(w,h)*k`, с нижним/верхним пределом),
  либо через `<text>` с `vector-effect` и фикс px через пересчёт. Выбор: **пропорционально футпринту**,
  читаемо и не наезжает.
- Пропорции: сохранить истинный масштаб по длине; вид сверху `viewBox 0 0 L W`, вид сбоку `0 0 L H`.
  Подписи направления **Vorne/Hinten** (`ladeplan.front/back`) по краям вида сбоку; стрелка направления
  из `loadingMode` (если задан; иначе без стрелки).
- Читаемость: калька `--paper`, сетка 1000 мм `--grid`, рамка `--line-strong`, заливка стопки
  `url(#pat-N)` + контур цвета заказа. Легенда/метрики без изменений (уже ок).

## 4. Ручной drag штабелей (вид сверху, привязка к сетке)

- В **виде сверху** стопки — перетаскиваемые (pointer events на `<rect>` группы стопки).
- Экран держит **редактируемую копию** `Layout`. Перетаскивание меняет `x,y` **всех placements** этой
  стопки (одна напольная позиция = стопка одного типа).
- **Snap к сетке** (шаг `SNAP_MM`, напр. 100 мм) при отпускании.
- После перемещения — `findGeometryViolations(load, editedLayout)`: если непусто (пересечение/выход за
  габариты) — **откат** к прежней позиции; если пусто — принять. Инвариант «раскладка всегда валидна»
  соблюдается.
- Метрики (`floorFillPercent` и т.п.) в MVP не пересчитываются при ручном перемещении (позиция стопки
  не меняет число размещённых); при желании — отдельная доработка. Печать A4 использует
  отредактированную раскладку.
- Пере-«Berechnen» из Настройки сбрасывает ручные правки (новый расчёт).

## 5. Переключатель языка (de/ru)

- Маленький сегмент **DE | RU** в шапке (top-right), меняет `LocaleContext.setLocale`.
- Дефолт `de` (ADR 006). Персист в `localStorage` (ключ `ladungsplaner.locale`) — по желанию,
  включаем (просто и полезно). Формат чисел/единиц — уже через `@shadrin-v/i18n`.
- English — **вне объёма** (отдельная задача при необходимости).

## 6. Пресеты (кузов + палеты EPAL)

Данные — из подтверждённых qrd-17. Модуль `apps/web/src/data/presets.ts` (зеркалит qrd-17; при
расхождении — обновлять qrd-17/spec.md Приложение A).

- **Кузова:** `LKW Standard` — 13600×2430×2650 (дефолтный выбор). Плюс «Eigene Maße». (Прочие кузова —
  по мере подтверждения данных.)
- **Палеты (заполняют позицию, entschachtelt по умолчанию):**
  EPAL 1 — 1200×800×144; EPAL 2 — 1200×1000×162; EPAL 3 — 1000×1200×144; EPAL 6 — 800×600×144;
  Viertelpalette — 600×400×144.
- **UI:** в строке-позиции — select «Palette» (дефолт «Eigene Maße»); выбор пресета проставляет
  `name` + L/W/H (не трогает уже введённые правила). Кузов — существующий select пресетов кузова.
- Каркасы-Gestelle с вложением — PLACEHOLDER в qrd-17; не добавляем, пока нет данных.

## 7. Тестирование

- **Формула:** unit-тесты выбора шаблона формулы по `StackPreview` (entschachtelt/sequential/pairwise/
  cap/notStackable) + подстановка операндов; тест валидации (блок Berechnen при некорректном Δh).
- **Одностраничность:** тест, что после «Berechnen» и повторного редактирования состояние Настройки
  сохраняется (нет сброса).
- **Drag:** unit-тест функции перемещения+snap+revalidate (принять валидное, откатить пересекающееся) —
  на чистой функции над `Layout`, без DOM-drag.
- **Пресеты:** тест, что выбор EPAL 2 проставляет 1200×1000×162.
- **Языки:** тест переключения de→ru меняет видимые строки.
- **Геометро-валидатор** — на каждом отрендеренном/отредактированном результате (инвариант).

## 8. Вне объёма (YAGNI сейчас)

English-локаль; drag в виде сбоку; пересчёт метрик при ручном перемещении; пресеты каркасов-Gestelle
(нет данных); сохранение планов в БД из этого UI (DataProvider есть, отдельная задача); deep-link
импорта (s17).
