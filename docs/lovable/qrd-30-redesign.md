# qrd.30 — UX/UI редизайн (по обратной связи + dataviz)

> Сплошная переработка вида. **Чисто UI, движок не меняется** (работает на опубликованной версии
> `@shadrin-v/engine` — `orientedDims`, `findGeometryViolations` уже есть). Палитра заказов
> **провалидирована** методом data-viz (colorblind-safe + контраст + ЧБ-печать со штриховкой как
> вторичным кодированием). Применяй промпты G1→G6 по порядку.

## Токены (в ОДИН файл темы; ни одного hex в компонентах)

Серии-цвета заказов (провалидированы; используются ВМЕСТЕ с паттерном штриховки — это обязательное
вторичное кодирование для ЧБ-печати и дальтонизма):
```
--color-series-1: #2E7D32   --color-series-2: #1565C0   --color-series-3: #C62828   --color-series-4: #8E44AD
--color-series-5: #EF6C00   --color-series-6: #0097A7   --color-series-7: #A0522D   --color-series-8: #B08900
```
8 SVG-паттернов штриховки (по индексу заказа, тот же индекс что и цвет): `1 диагональ /`, `2 диагональ \`,
`3 крест +`, `4 точки`, `5 горизонт —`, `6 вертикаль |`, `7 сетка #`, `8 плотные точки`. Плотность
заливки ~30–40% «чернил», штрих — цветом заказа поверх кальки; текст-метки — токеном текста (НЕ цветом
серии). Фон схемы — «калька»: тёплый off-white + очень бледная сетка (1000 мм).

Изменить/сократить строки локалей (de И ru):
```
  cargoType.rotation.none    de: "Keine"      ru: "Нет"
  cargoType.rotation.yawOnly de: "Um Z"       ru: "Вокруг Z"
  cargoType.rotation.full    de: "Alle 6"     ru: "Все 6"
  edit.rotate                de: "Drehen"     ru: "Повернуть"
```

---

## G1 — глобальный каркас: полная ширина, тонкая шапка, компактный кузов

```
Rebuild the app shell for full width and minimal chrome (tokens only, desktop-first, no hex):
- REMOVE every width limit (max-w-*, mx-auto, centered container) on the app AND on the result
  section. The app uses 100% viewport width with only small (16px) side gutters.
- Slim top bar (single row, ~56px): small Holz Schäfer logo left, "Ladungsplaner · von Holz Schäfer"
  next to it, DE/RU toggle right. No large hero.
- Vehicle: one compact line — preset name + "13.600 × 2.430 × 2.650 mm" (formatLength) + an "Ändern"
  toggle that expands the edit form inline. Collapsed by default. Height ~48px.
```

## G2 — компактный редактор груза: одна строка на позицию

```
Make each cargo POSITION a single compact row (not a full-width block). A row shows inline:
[order colour+hatch swatch] · Name · "L×B×H" (compact, mm as a small muted suffix that never overlaps
the input — add right padding / place the unit label to the RIGHT of the field) · Menge · a state chip
· a rules summary · stack "N Pal." · row menu (⋮ = duplicate/delete). Full rule details open in an
inline expander / popover, so the collapsed row stays ONE line.

Consolidate state + nesting into ONE control (removes the current conflict where the ZUSTAND dropdown
blocks pairwise):
- A per-position segmented control [Entschachtelt | Verschachtelt]. This IS the state; there is NO
  separate "Verschachteln" checkbox.
- Verschachtelt → reveal nesting params (mode default **Paarweise**, Δh required 1..H with hint,
  Max. Verschachtelung optional-empty, Einzelne oberste Palette for pairwise) + the "Stapel berechnen"
  result/formula (compact).
- Entschachtelt → reveal stacking (Max. Lagen, optional-empty) + the stack result.
Rotation is a short select (Keine / Um Z / Alle 6). Presets are NOT buttons — see G3.
Keep everything dense: small controls, tight spacing; the whole editor should occupy far less height.
```

## G3 — логика заказов: карточки, добавление с явным фидбеком, пресеты списком

```
Orders as cards, with clear order↔position separation and visible feedback (tokens/i18n only):
- Each order card: header = editable "Auftrags-ID" (may be empty = "Ohne Auftrag") tinted with the
  order's colour+hatch swatch, then its position rows (G2), then an "Position hinzufügen" control
  INSIDE the card.
- "Position hinzufügen" = a neat DROPDOWN (select), NOT buttons: options are the standard pallets
  (EPAL 1/EUR, EPAL 2, EPAL 3, EPAL 6, Viertelpalette) + "Eigene Maße". Choosing one appends a
  position to THIS order and scrolls it into view + briefly highlights it, so it's obvious it was
  added.
- "Auftrag hinzufügen" adds a new order card at the bottom AND scrolls to it + focuses its
  Auftrags-ID field. Adding never leaves the user unsure whether it worked.
- Load-level controls (Abstand/clearance, Beladmodus/loadingMode) live compactly near the top of the
  cargo section (NOTE: per-position clearance is a later engine feature — keep clearance single for now).
```

## G4 — виды сверху/сбоку: герой на всю ширину, минимум надписей, цвет+штрих по заказу

```
The two views are the hero output — full width, minimal chrome (tokens only):
- Each view (Draufsicht, Seitenansicht) spans the FULL content width, stacked. Remove side text /
  scale columns that sit BESIDE the drawing and steal width — put any axis hint as a tiny caption
  under the SVG, not beside it. The SVG itself uses the full width.
- Fill every stack by its ORDER: colour = --color-series-N AND the matching hatch pattern N (both,
  always — this is what survives grayscale printing). Thin border token stroke; 2px gap feel between
  neighbours. Vellum background with the faint 1000mm grid.
- Labels MINIMAL and fixed screen-size (do not scale with viewBox): show ONLY a short piece count per
  stack (e.g. "×18") in the text token — no "ярусов"/"Lagen"/"L" words. Identity comes from the
  order colour+hatch + the legend, not from text on each mark.
- Top view = floor plan (x length → horizontal, y width → vertical). Side view = length×height
  projection; REBUILD it cleanly: viewBox "0 0 {length} {height}", for each placement rect at
  (x, height-(z+dz), dx, dz) filled with the order colour+hatch at ~70% opacity, thin stroke; a thin
  ground line; nothing beside it. (The old side view was broken — replace it.)
- Front/rear: small "Vorne"/"Hinten" markers at x=0 / x=length. Drop the standalone
  "Beladerichtung" badge; instead draw ONE subtle direction arrow derived from loadingMode
  (rear/combined → x+ toward doors; side → y from the loading side). If it can't be derived, omit it.
- Legend (orders) stays: swatch(colour+hatch) + Auftrags-ID + total pallets.
- Fill metrics become a TINY muted one-line notice under the views on screen ("Boden 62% · Volumen
  24%"), and are HIDDEN in print. Not KPI cards.
```

## G5 — интеракция: примагничивание при drag + поворот

```
Improve stack dragging on the top view (uses findGeometryViolations, already available):
- SNAP while dragging: snap the footprint to a 50 mm grid, and edge-snap to the hold walls and to
  neighbouring stacks' edges when within ~80 mm. On drop near a wall, pull flush to the wall. Aim the
  stack into the nearest valid, non-overlapping, aligned spot (a light "best-fit" snap — not a full
  re-pack).
- Validate every candidate with findGeometryViolations(load, candidate); if invalid, revert (layout
  stays valid). Metrics unchanged by moving.
- ROTATE: when a stack's cargo has rotation !== 'none', show a small "Drehen" affordance (button on
  the selected stack + the R key). Rotating swaps the whole column's orientation between its yaw
  options (lwh ↔ wlh); build the candidate and validate with findGeometryViolations — the engine
  rejects orientations its rotation rule forbids ('orientation' violation) or that overlap/exit, so
  keep the rotation only if it returns []. No engine call beyond findGeometryViolations.
```

## G6 — печать на один A4 (лого, графики по максимуму)

```
Refine print to ONE A4 landscape (@page { size: A4 landscape; margin: 8mm }):
- Print shows ONLY: Holz Schäfer logo + title block (vehicle, dims, Auftrag/Datum, total pallets) top;
  then BOTH views as large as the page height allows (the two full-width strips); then a compact
  one-line legend of orders. HIDE all editor/controls and the on-screen fill-metrics notice.
- The diagrams get the maximum area; any remaining text shrinks. Nothing overflows to page 2 — scale
  the diagram block to available height. print-color-adjust: exact so vellum + colour + hatch print.
```

## Дефолты (приняты; видимое поведение)

- Пресеты — выпадающий список (не кнопки). Состояние+вложение — один сегментный контрол на позицию
  (убирает конфликт). Дефолт вложения — «парами».
- Метки на схеме — только число штук, фикс-размер, токеном текста; идентичность заказа = цвет+штрих+легенда.
- Метрики заполнения — крошечное уведомление на экране, скрыты в печати.
- Поворот доступен только при rotation ≠ «Нет»; недопустимый поворот/перенос откатывается движком.
- **Per-position зазор — отдельная задача ядра** (сейчас `Load.clearance` общий); в UI пока один зазор.

## DoD

- Приложение на всю ширину; шапка тонкая; кузов — одна строка.
- Позиция груза — одна компактная строка; пресеты списком; состояние+вложение единым контролом;
  короткие подписи; «мм» не наезжает на поля.
- Заказы карточками; добавление заказа/позиции с явным фидбеком; цвет+штрих по заказу везде.
- Виды — на всю ширину, минимум надписей, вид сбоку починен; метрики — крошечно/скрыто в печати.
- Drag с примагничиванием + поворот; печать на один A4 с лого.
