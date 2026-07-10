# qrd.30 — серия промптов для Lovable: заказы (Auftrags-ID) + перемещение штабелей

> Расширяет [qrd-13](qrd-13-prompts.md)/[qrd-14](qrd-14-prompts.md): ввод **Auftrags-ID до** выбора
> груза, группировка/подсветка штабелей **по заказу**, и **перетаскивание** штабелей на виде сверху
> с проверкой геометрии. Требует `@shadrin-v/engine` **≥ 0.0.5** (контракт 0.9.0 —
> `findGeometryViolations`).

## Договорённости (те же жёсткие правила)

- **DESIGN TOKENS ONLY** (серии-токены `--color-series-1..8` — теперь красят по **заказу**), i18n
  de/ru через `t()`, desktop-first, светлая тема, мм внутри.
- **Геометрию отредактированной раскладки проверяет движок** — `findGeometryViolations(load, layout)`;
  UI не пере-реализует правила пересечений/габаритов.
- Инвариант: после ручного перемещения раскладка **остаётся валидной** — недопустимый сброс
  откатывается.

Добавь в DICT (de И ru):
```
  order.current   de: "Aktueller Auftrag"   ru: "Текущий заказ"
  order.none      de: "Ohne Auftrag"        ru: "Без заказа"
  order.hint      de: "Vor dem Hinzufügen eingeben — neue Paletten gehören zu diesem Auftrag" ru: "Введите до добавления — новые паллеты попадут в этот заказ"
  order.legend    de: "Aufträge"            ru: "Заказы"
  edit.dragHint   de: "Stapel ziehen zum Verschieben" ru: "Перетащите штабель для перемещения"
  edit.invalidMove de: "Position ungültig (Überlappung/außerhalb) — zurückgesetzt" ru: "Позиция недопустима (пересечение/за габаритами) — отменено"
  action.recalc   de: "Neu berechnen"       ru: "Пересчитать"
  action.recalcConfirm de: "Manuelle Verschiebungen verwerfen und neu berechnen?" ru: "Отменить ручные перемещения и пересчитать?"
```

---

## Промпт O1 — Auftrags-ID «сначала» + группировка редактора по заказу

```
Rework the cargo editor to be order-first (style via semantic tokens only, i18n via t()):
- At the TOP of the Ladungstyp (cargo) section, ABOVE the preset buttons and the custom-size /
  "Ladungstyp hinzufügen" controls, add a prominent "Aktueller Auftrag" text input (order.current)
  with helper order.hint. Its value is the CURRENT Auftrags-ID.
- When the user adds a cargo row (an EPAL/preset quick-add or a custom "hinzufügen"), the new row's
  orderId = the current Auftrags-ID (empty → undefined, shown as order.none).
- Group the cargo rows visually by orderId: render one group box per distinct order (order-of-first-
  appearance), headed by its Auftrags-ID (or order.none), with the order's colour (see O2) as a
  subtle left border / tint. Rows keep their per-row orderId field for corrections, but the primary
  flow is: type an Auftrags-ID → add pallets → they land in that order's group.
- Pallets of one Auftrags-ID are packed as one adjacent zone by the engine (already), so grouping
  here matches the physical unload-by-order intent.
```

---

## Промпт O2 — цвет и легенда по Auftrags-ID (зоны)

```
Colour the views by Auftrags-ID (order zones), not by cargo type:
- Assign each distinct orderId (order-of-first-appearance; undefined = order.none) one series token
  --color-series-N (stable). Map a placement to its order via the Load (placement.cargoTypeId →
  cargo.orderId).
- In BOTH the Draufsicht and Seitenansicht, fill each stack with its ORDER colour. Keep per-stack
  labels (position number, type name/short, tier count).
- Legend title becomes t('order.legend'): one row per order — colour swatch + Auftrags-ID (or
  order.none) + total pallets in that order. (Optional secondary line: the types inside the order.)
This makes each order read as one coloured zone — what a loader unloads together.
```

---

## Промпт D1 — перетаскивание штабелей (вид сверху) с проверкой геометрии

```
Make stacks draggable in the Draufsicht (top view). Import the validator:
    import { findGeometryViolations } from '@shadrin-v/engine';   // >= 0.0.5

- Each stack (a floor position = placements sharing cargoTypeId + x + y) is one draggable SVG group.
  Show t('edit.dragHint') as a hint near the diagram.
- On pointer drag, convert screen px → millimetres using the SVG's inverse CTM (getScreenCTM), and
  move the WHOLE stack: update x and y of ALL placements in that column by the same delta (z/tiers
  unchanged). Constrain the footprint within the hold bounds (0..length−dx, 0..width−dy).
- Live validation: build a candidate `layout` with the moved column and call
  findGeometryViolations(load, candidate). The base layout is valid, so ANY returned violation was
  caused by the move → outline the dragged stack in the danger token while it is invalid.
- On drop: if findGeometryViolations(load, candidate).length > 0, REVERT the stack to its position
  before the drag and briefly show t('edit.invalidMove'); otherwise commit the candidate as the new
  layout. The layout stays valid at all times.
- Manual moves persist in the UI layout state: the JSON export, print sheet, side view and legend all
  reflect the edited positions. Metrics (floor/volume fill) are unchanged by moving (same footprints
  and heights) — leave them as computed.
- Recalculate: add an "action.recalc" button (Neu berechnen) that re-runs calculateLayout
  and REPLACES the layout (discarding manual moves). If manual moves exist, confirm first with
  t('action.recalcConfirm'). The main "Berechnen" behaves the same (regenerates).
- Everything via tokens; numbers/labels via t()/formatLength; the engine is the only source of truth
  for validity (findGeometryViolations) and dimensions (orientedDims).
```

---

## Дефолты перетаскивания (приняты; видимое поведение)

- Перетаскивание — **только на виде сверху** (пол); двигается весь штабель (все ярусы вместе).
- Свободная позиция в мм, ограничена габаритами кузова; **без привязки к сетке** (snap — позже).
- Недопустимый сброс (пересечение/выход) → **откат** к прежней позиции (раскладка всегда валидна).
- Ручные правки — слой поверх авто-раскладки; **«Пересчитать/Berechnen» их сбрасывает** (с
  подтверждением). Метрики при перемещении не меняются.

## Рефайнмент 2 (после O1–O2–D1) — по обратной связи

> Всё ниже — **чисто UI, движок не меняется** (работает на опубликованной версии). Три темы:
> логика заказов, полноширинные разрезы (калька + штриховка, печатопригодно), печать на один A4.

Добавь в DICT (de И ru):
```
  order.add        de: "Auftrag hinzufügen"     ru: "Добавить заказ"
  order.title      de: "Auftrag"                ru: "Заказ"
  position.add     de: "Position hinzufügen"    ru: "Добавить позицию"
  position.preset  de: "Standard-Palette"       ru: "Стандартная паллета"
  position.custom  de: "Eigene Maße"            ru: "Свои размеры"
```

### Промпт F1 — логика заказов (заказ → позиции; разделение; state только у позиции)

```
Restructure the cargo editor around ORDERS and POSITIONS (tokens only, i18n via t()):
- REMOVE the global Entschachtelt/Verschachtelt (ZUSTAND) toggle at the top of the cargo section.
  The Verschachtelt/Entschachtelt state is a PER-POSITION setting only (each position row keeps its
  own state select). Keep the Load-level Abstand (clearance) and Beladmodus (loadingMode) controls.
- The cargo section is a list of ORDER cards. Each order card = an editable "Auftrags-ID" header
  (t('order.title'); may be left EMPTY) + the positions belonging to that order + a "Position
  hinzufügen" (t('position.add')) control INSIDE the card. Add a top-level "Auftrag hinzufügen"
  (t('order.add')) button that creates a NEW empty order card.
- "Position hinzufügen" opens a picker offering BOTH the standard presets (EPAL 1/2/3/6, Viertel-
  palette — t('position.preset')) AND custom size (t('position.custom')); the chosen position is
  added to THAT order (inherits its Auftrags-ID). This must work inside every order card — the bug
  where presets couldn't be chosen when adding to an order is fixed.
- Logical separation: choosing the pallet (preset/custom) is one step; the Auftrags-ID lives on the
  order card (a position may still be reassigned via its own order-id field). An empty Auftrags-ID =
  the shared "Ohne Auftrag" zone (the engine merges empty-id positions into one zone).
- Everything else per position (dims, qty, fill, rotation, state, stacking, nesting, stack preview,
  "Stapel berechnen") stays as-is, now living inside the order card.
```

### Промпт F2 — разрезы на всю ширину экрана, калька, штриховка (печатопригодно)

```
Make the two views the full-bleed hero of the screen (tokens only):
- Remove width limits: the whole app must use the FULL screen width — drop the centered max-width
  container / mx-auto / max-w-* on the app shell and on the Result section. Content spans 100% width
  (keep small side gutters only).
- Draufsicht and Seitenansicht each span the FULL screen width, one under the other, as large as
  possible. The truck is long and thin, so a full-width strip is exactly right.
- Diagram background = tracing-paper / vellum look: a warm translucent off-white with a very faint
  blueprint grid (every 1000 mm), all from theme tokens (no hex). It must read on screen and in print.
- Fill each order's stacks with a DISTINCT COLOUR **and** a DISTINCT SVG HATCH pattern (define
  <pattern> fills: diagonal /, diagonal \, cross-hatch, dots, horizontal, vertical, grid, dense-dots
  — 8 variants), one (colour+pattern) per order. NOT solid black. Choose print-friendly colours and
  MODERATE fill density (~30–40% ink) so: (a) it prints clearly in colour AND legibly in grayscale,
  (b) the position number / tier-count labels stay readable on top. Reuse the same (colour+pattern)
  for that order in the top view, side view and legend.
- Keep front/rear + loading-direction labels, axis/scale, numbers and tier badges.
```

### Промпт F3 — печать на один лист A4 (лого + графики по максимуму)

```
Add a print layout that fits EVERYTHING on ONE A4 page (landscape), maximising the diagrams:
- @page { size: A4 landscape; margin: 8mm }. In print, HIDE the editor/controls/buttons; show only:
  the Holz Schäfer logo (top-left), the title block (vehicle + dims + Auftrag/Datum + totals +
  fill %), then BOTH views as large as the page allows (the two full-width strips stacked), then a
  compact legend (orders) and the per-type/KPI numbers in a small row.
- Priority when fitting: the two diagrams get the maximum area; textual info (KPIs, legend, per-type
  table) shrinks to a compact footer band. Everything must fit on a single page — scale the diagram
  block to the available height so nothing overflows to page 2.
- Colours/patterns must render in print (rely on tokens; set print-color-adjust: exact so the vellum
  and hatch fills are kept). The existing "Drucken" button triggers window.print().
```

## Definition of Done для qrd.30

- Поле **Auftrags-ID** вводится до добавления груза; новые паллеты попадают в текущий заказ; редактор
  сгруппирован по заказам.
- Виды и легенда красят **по Auftrags-ID** (зоны); один заказ = один цвет.
- Штабели **перетаскиваются** на виде сверху; движок (`findGeometryViolations`) проверяет геометрию;
  недопустимый сброс откатывается; правки сохраняются в JSON/печати.
- Токены/i18n de-ru; desktop ≥1280px.
