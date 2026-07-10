# qrd.14 — серия промптов для Lovable: виды сверху/сбоку + сводка

> Продолжение [qrd-13](qrd-13-prompts.md): визуализация результата поверх того же приложения
> «Ladungsplaner». Рисуем раскладку из `Layout` (вид сверху = план пола со штабелями, вид сбоку =
> ярусы/высота) и сводку. Требует `@shadrin-v/engine` **≥ 0.0.4** (контракт 0.8.0 — `orientedDims`).

## Договорённости (дефолты; те же жёсткие правила, что в qrd-13)

- **DESIGN TOKENS ONLY** — все цвета/шрифты/радиусы через семантические токены темы, ни одного hex.
  Для раскраски по типам груза вводим **серии-токены** `--color-series-1..8` в тот же файл темы
  (не хардкод в компонентах). Ребренд/пере-палитра = один файл.
- **i18n** de(дефолт)/ru, только `t()`-ключи; числа/размеры — `formatLength`/`Intl`.
- **Desktop-first ≥1280px**, только светлая тема (MVP).
- **Отрисовка — inline SVG** в координатах миллиметров (`viewBox` = габариты кузова), масштаб — через
  `viewBox`+`preserveAspectRatio`, без ручной арифметики масштаба. Никаких внешних библиотек.
- **Габариты единицы** берём из движка: `orientedDims(l, w, h, orientation) → [dx, dy, dz]` — UI не
  повторяет маппинг ориентаций.
- **Экспорт:** в MVP — JSON сырого `Layout`. PDF/PNG — отложено (qrd.15, пост-MVP): предусмотреть
  место под кнопку, но не реализовывать.
- Валидность раскладки гарантирует движок (геометро-валидатор) — виды не пере-проверяют геометрию.

---

## Промпт V0 — секция результата: токены серий, i18n, каркас видов

```
Extend the Result section into a visualization area (style via semantic tokens only, no hex;
desktop-first). Add to the ONE theme file a categorical palette of 8 series tokens for colouring
cargo types — pick calm, distinguishable hues that fit the Holz Schäfer look (greens/browns/neutrals),
expose them as --color-series-1 … --color-series-8 and as Tailwind bg-series-1 … bg-series-8. Assign
a colour to each cargoTypeId by its index in the load (stable), and reuse the same colour for that
type across the top view, side view and legend.

Add these i18n keys to DICT (fill de AND ru):
  view.top        de: "Draufsicht"            ru: "Вид сверху"
  view.side       de: "Seitenansicht"         ru: "Вид сбоку"
  view.legend     de: "Legende"               ru: "Легенда"
  view.position   de: "Platz"                 ru: "Место"
  view.empty      de: "Noch nicht berechnet"  ru: "Ещё не рассчитано"
  view.tiers      de: "Lagen"                 ru: "ярусов"
  results.usedFloorPositions de: "Belegte Stellplätze" ru: "Занятых мест"

Layout of the Result section (desktop): the metrics KPIs + per-type table (from Prompt 3) on top,
then two side-by-side panels "Draufsicht" and "Seitenansicht" (surface-card / border), then a
"Legende" mapping each cargo type name to its series colour. Before the first calculation, show
t('view.empty') placeholders in the two panels. Keep everything driven by the last `layout` from
calculateLayout.
```

---

## Промпт V1 — вид сверху (план пола)

```
Render the "Draufsicht" (top view) as an inline SVG in millimetre coordinates. Import from the engine:
    import { orientedDims } from '@shadrin-v/engine';   // >= 0.0.4

- SVG viewBox="0 0 {vehicle.length} {vehicle.width}", width 100%, height auto,
  preserveAspectRatio="xMidYMid meet". Draw the cargo-hold outline as a rect (0,0,length,width) with
  the border token and a faint surface fill.
- A "floor position" = placements sharing cargoTypeId + x + y (one stack). For EACH floor position
  take its bottom placement (tier===1), compute [dx, dy] = orientedDims(cargo.length, cargo.width,
  cargo.height, p.orientation), and draw a rect at (p.x, p.y) size dx×dy, fill = that type's series
  colour, stroke = border token. (x = length axis → horizontal; y = width axis → vertical.)
- Number the positions 1..N in a stable order (sort by x, then y). Put the number as centered SVG
  text (fill text token). Optionally add a small badge with the stack's unit count = number of
  placements in that column + t('view.tiers').
- The number/label text must stay readable — do not scale font with the viewBox; use a fixed
  vector-effect / font-size in screen px via a foreignObject or a transform-independent text layer,
  or render labels in an overlaid absolutely-positioned HTML layer aligned to the SVG.
- Everything localized via t(); all colours via tokens. Pure render from `layout` — no engine calc
  here beyond orientedDims.
```

---

## Промпт V2 — вид сбоку (ярусы/высота)

```
Render the "Seitenansicht" (side view) as an inline SVG in millimetre coordinates — a projection
onto the length×height plane (looking along the width axis), so stacking and nesting are visible.

- SVG viewBox="0 0 {vehicle.length} {vehicle.height}", width 100%, preserveAspectRatio="xMidYMid meet".
  Draw the hold outline rect (0,0,length,height) with the border token.
- For EVERY placement compute [dx, dy, dz] = orientedDims(cargo.length, cargo.width, cargo.height,
  p.orientation) and draw a rect of width dx and height dz. Flip the vertical axis so the floor is at
  the bottom: svgY = vehicle.height - (p.z + dz); rect at (p.x, svgY, dx, dz). Fill = the type's
  series colour with reduced opacity (columns at different width-positions overlap in this projection
  — the overlap reading as denser colour is fine for a schematic), stroke = border token.
- Optional: a thin ground line at the bottom and a right-side height scale using formatLength for a
  couple of ticks (0, vehicle.height).
- Localized labels via t(); colours via tokens; pure render from `layout`.
```

---

## Промпт V3 — легенда + экспорт JSON

```
Finish the Result section:
- Legend (t('view.legend')): one row per cargo type present in the layout — a colour swatch
  (bg-series-N token) + the type name + its placed/requested counts (reuse report.perType).
- Keep the existing metrics KPIs and per-type table; add results.usedFloorPositions =
  layout.metrics.usedFloorPositions to the KPIs.
- JSON export: the existing "Als JSON exportieren" (action.exportJson) downloads the raw `layout` as
  .json. Leave a disabled/"coming soon" placeholder button area for PDF/PNG export (do NOT implement
  it — that's a later task), styled with tokens.
```

---

## Рефайнмент (после первого прогона V0–V3) — по обратной связи

> Схемы «вид сверху/сбоку» — **основной артефакт, который шлём поставщикам, грузящим авто**.
> Поэтому: setup компактнее, схемы — на всю ширину и максимально практичные. Работает на текущей
> опубликованной версии движка (доп. API не требуется).

Добавь в DICT (de И ru):
```
  view.front           de: "Vorne (Fahrerhaus)"    ru: "Перёд (кабина)"
  view.rear            de: "Hinten (Türen)"        ru: "Зад (двери)"
  view.loadingDir      de: "Beladerichtung"        ru: "Направление загрузки"
  diagram.title        de: "Ladeplan"              ru: "План загрузки"
  diagram.pallets      de: "Paletten gesamt"       ru: "Всего паллет"
  field.orderRef       de: "Auftrag / Datum"       ru: "Заказ / дата"
  action.print         de: "Drucken"               ru: "Печать"
```

### Промпт R1 — компактный setup + схемы на всю ширину

```
Rework the page layout for a work tool where the loading diagram is the hero (style via semantic
tokens only, desktop-first):
- Make the setup compact. Vehicle section: after a preset/vehicle is chosen, collapse it to a single
  compact summary bar (name + "13.600 × 2.430 × 2.650 mm" via formatLength) with an "edit" toggle
  that expands the full form; collapsed by default once valid. Cargo section: tighten paddings and
  row spacing, put each cargo row's fields in a denser grid, so the setup occupies clearly less
  vertical space. No feature removed — only denser and collapsible.
- Move the two views OUT of the small side-by-side panels. Render "Draufsicht" (top) and
  "Seitenansicht" (side) as TWO FULL-WIDTH stacked panels (each spans the whole content width), large,
  as the primary output below the KPIs. They must read clearly at full width.
- Keep KPIs + per-type table + legend, but place them compactly around the full-width diagrams.
- Ensure the diagrams print cleanly (A4 landscape): a print stylesheet where the setup/controls are
  hidden and only the title block + both views + legend + KPIs print on white with token colours.
  Add a "Drucken" button (action.print) that triggers window.print().
```

### Промпт R2 — практичная схема для поставщика (шапка, перёд/двери, оси, шкала)

```
Make both views into a self-describing loading diagram a supplier can act on (tokens only, i18n via t):
1) Title block above the views: t('diagram.title') + vehicle name + inner dimensions (formatLength),
   t('diagram.pallets') = totalPlaced, Bodenfüllung / Volumenfüllung %, and an editable
   t('field.orderRef') text field (order id / date) that prints in the header. This makes a printed
   sheet self-explanatory.
2) Orientation of the truck on BOTH views — critical so the loader matches the diagram to the real
   vehicle: label the x=0 edge t('view.front') (Fahrerhaus) and the x=length edge t('view.rear')
   (Türen). Draw a t('view.loadingDir') arrow along x whose direction follows loadingMode: 'rear' and
   'combined' → front→rear (load toward the doors); 'side' → an arrow along y from the loading side.
3) Axes + scale: on the top view label the length axis (field.length) and width axis (field.width)
   with the hold size via formatLength; on the side view label height (field.height) with 0 and
   vehicle.height ticks. A light metre grid (e.g. every 1000 mm) under the shapes helps estimate
   positions — keep it faint (border token, low opacity).
4) Keep per-stack position numbers, the stack unit-count badge (view.tiers), and colour-by-type with
   the legend. Numbers/labels stay a fixed screen size (do not scale with the SVG viewBox).
All numbers come from the engine's Layout / orientedDims; the UI only draws and labels.
```

> Что ещё можно добавить позже (не сейчас): порядок загрузки (нумерация = последовательность
> установки по зонам/orderId), фильтр «показать только заказ X», экспорт PDF/PNG (qrd.15), вес/оси
> (вне MVP). Сейчас важнее чистая, ориентированная, печатаемая схема.

---

## Дефолт вложения — «парами» (Paarweise)

> Программа в первую очередь для паллет/поддонов → режим вложения по умолчанию **pairwise**.

```
In the cargo editor, default nestingMode to 'pairwise' (Paarweise) for every new nestable row and as
the pre-selected value of the nestingMode dropdown. (UI default only; the engine accepts the mode
explicitly.)
```

---

## Definition of Done для qrd.14

- Два вида из `Layout`: **вид сверху** (план пола, пронумерованные штабели, цвет по типу) и **вид
  сбоку** (ярусы/высота), оба inline-SVG в мм-координатах, `orientedDims` из движка.
- Легенда цвет→тип; сводка (KPI + per-type) на месте; экспорт JSON сырого `Layout`.
- Цвета типов — через серии-токены темы (ни одного hex в компонентах); i18n de/ru; desktop ≥1280px.
- PDF/PNG — не реализованы (место под кнопку), это qrd.15.
