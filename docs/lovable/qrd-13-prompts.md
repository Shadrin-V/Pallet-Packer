# qrd.13 — серия промптов для Lovable: «Ladungsplaner» (выбор кузова + редактор заявки)

> UI-прототип **«Ladungsplaner» by Holz Schäfer** поверх `@shadrin-v/engine` (актуальная опубликованная версия — см. CHANGELOG «Соответствие версий»)
> (контракт **0.5.0**). Внутренний инструмент логистики Schäfer GmbH & Co. KG (holz-schaefer.de).
> Движок считает в браузере; UI — заменяемый слой (правки логики → в ядро, правки интерфейса → здесь).
> Визуализация результата (виды сверху/сбоку, экспорт PDF/PNG) — задача **qrd.14**; здесь только
> сбор `Load`, вызов `calculateLayout` и минимальная сводка.

## Как пользоваться

К **первому** сообщению в Lovable приложи SVG логотипа Holz Schäfer — из него Lovable извлечёт
точные цвета бренда. Вставляй промпты **по порядку**, по одному, дожидаясь сборки каждого. Точные
формы контракта и данные пресетов уже вписаны — не давай Lovable их выдумывать.

## Договорённости (утверждены брендбуком; видимое поведение)

- **Бренд:** название в UI — «Ladungsplaner», суффикс «by Holz Schäfer». Тон: профессиональный,
  индустриальный, спокойный; без игривых иллюстраций; много воздуха, чёткие таблицы данных,
  сильная юзабилити форм — это рабочий инструмент.
- **DESIGN TOKENS ONLY (жёсткое правило):** все цвета, шрифты, радиусы, отступы — только в теме
  (CSS-переменные / Tailwind theme). Компоненты ссылаются на семантические токены
  (`primary`, `accent`, `surface`, `text`, …) — **ни одного hex в компонентах**. Ребрендинг = правка
  одного файла темы.
- **Палитра — из логотипа** (SVG приложен). Значения ниже — стартовые, до сэмплинга логотипа:
  primary — лесной зелёный (~#2E7D32), accent — тёплый древесно-коричневый (~#8D6E63),
  surface — тёплый off-white (#FAF9F7), text — тёмно-серый (#2B2B2B). **Только светлая тема** (MVP).
- **Типографика:** чистый современный sans-serif (Inter); без декоративных шрифтов.
- **Desktop-first:** макет обязан работать на desktop (≥1280px); планшет — nice-to-have, мобильный —
  вне MVP.
- **Зависимость:** только `@shadrin-v/engine` **последней опубликованной версии** (сейчас `0.0.3`,
  контракт 0.7.0; публичный npm, без `.npmrc`/секретов). Соответствие пакет↔контракт — в CHANGELOG.
  Обновление версии — по запросу автора в формате из onboarding.md §6. Пакета
  `@shadrin-v/i18n` в Lovable нет — UI держит собственные словари `de`/`ru` (зеркалят ключи ядра +
  ключи редактора). Канонизация ключей обратно в `@shadrin-v/i18n` — бид `LKWkalk-qrd.23`.
- **i18n:** ни одной пользовательской строки в компонентах — только `t(key, locale)`. Локали
  `de` (**по умолчанию**) и `ru`, переключатель в шапке. Числа и единицы — locale-форматирование.
- **Единицы:** всё внутри — целые миллиметры (ADR 002); ввод и вывод в мм.
- **loadingMode:** дефолт `combined` (контракт). Селектор опционален (rear/side/combined).
- **Вне MVP:** вес/оси, LIFO, 3D, CSV/Excel, тёмная тема — не добавлять.
- **Ошибки:** движок возвращает коды `ERR_*` в `layout.errors`; UI переводит их своим словарём.

---

## Промпт 0 — каркас, тема (design-токены), i18n, зависимость от движка

```
Build a desktop-first React + TypeScript single-page internal tool called "Ladungsplaner"
(subtitle "by Holz Schäfer") — a UI client for a headless truck-loading engine. Install the npm
package @shadrin-v/engine (public, no auth/.npmrc needed). Use Inter as the UI font.

I have attached the Holz Schäfer logo (SVG). Extract the exact brand colors from it (primary green,
any secondary wood/brown tone) and use THOSE in the theme tokens below; the hex values I give are
only fallbacks until you sample the logo.

HARD RULE — DESIGN TOKENS ONLY:
- All colors, fonts, radii and spacing live in ONE theme file (CSS variables mapped into the
  Tailwind theme). Components must reference SEMANTIC tokens only — never hardcoded hex values.
  Rebranding must require editing only that one theme file.
- Define at least these semantic tokens (light theme only, no dark mode for MVP):
    --color-primary          (forest green from logo; fallback #2E7D32)
    --color-primary-foreground (text on primary; #FFFFFF)
    --color-accent           (warm wood brown from logo; fallback #8D6E63)
    --color-accent-foreground (#FFFFFF)
    --color-surface          (app background, warm off-white; #FAF9F7)
    --color-surface-card     (cards/panels; #FFFFFF)
    --color-text             (dark gray; #2B2B2B)
    --color-text-muted       (secondary text; ~#6B6B6B)
    --color-border           (hairlines/inputs; ~#E3E0DB)
    --color-danger           (validation errors; a calm muted red, ~#B3261E)
    --color-danger-foreground (#FFFFFF)
    --radius-md, --space scale, --font-sans: Inter
  Expose them in Tailwind as bg-primary, text-text, border-border, etc., and use those classes in
  components. No component may contain a hex color.

Layout: optimize for desktop (>=1280px) with generous whitespace. Header shows the logo, the title
"Ladungsplaner" with a small "by Holz Schäfer" subtitle, and a locale switcher: "de" (default) and
"ru". Below the header, a vertical flow with three sections filled in next prompts: Vehicle, Cargo,
Result. Keep all state in React (a single top-level store/context); no backend.

i18n (do this now — no hardcoded user-facing strings anywhere in components):
- LocaleContext holds the current locale ('de' | 'ru'), default 'de'.
- A dictionary DICT: Record<'de'|'ru', Record<string,string>> and helper
  t(key: string, locale) => DICT[locale][key]. Also formatLength(mm, locale) =>
  `${new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'ru-RU').format(mm)} ${t('unit.mm', locale)}`.
- Seed DICT with exactly these keys (fill BOTH de and ru):

  app.title            de: "Ladungsplaner"                 ru: "Ladungsplaner"
  app.subtitle         de: "von Holz Schäfer"              ru: "от Holz Schäfer"
  unit.mm              de: "mm"                             ru: "мм"
  field.name           de: "Name"                          ru: "Название"
  field.length         de: "Länge"                         ru: "Длина"
  field.width          de: "Breite"                        ru: "Ширина"
  field.height         de: "Höhe"                           ru: "Высота"
  field.quantity       de: "Menge"                          ru: "Количество"
  field.orderId        de: "Auftrags-ID"                    ru: "ID заказа"
  field.clearance      de: "Abstand"                        ru: "Зазор"
  field.fill           de: "Rest auffüllen"                 ru: "Заполнить остаток"
  vehicle.label        de: "Fahrzeug"                       ru: "Транспортное средство"
  vehicle.cargoHold    de: "Laderaum"                       ru: "Грузовой отсек"
  vehicle.preset       de: "Vorlage"                        ru: "Пресет"
  vehicle.custom       de: "Benutzerdefiniert"              ru: "Пользовательский"
  cargoType.label      de: "Ladungstyp"                     ru: "Тип груза"
  cargoType.add        de: "Ladungstyp hinzufügen"          ru: "Добавить тип груза"
  cargoType.remove     de: "Entfernen"                      ru: "Удалить"
  cargoType.rotation.label     de: "Drehung"                ru: "Вращение"
  cargoType.rotation.none      de: "Keine Drehung"          ru: "Без вращения"
  cargoType.rotation.yawOnly   de: "Nur um die Hochachse"   ru: "Только вокруг вертикальной оси"
  cargoType.rotation.full      de: "Alle Ausrichtungen"     ru: "Все ориентации"
  cargoType.stacking.label     de: "Stapeln"                ru: "Штабелирование"
  cargoType.stacking.maxTiers  de: "Max. Lagen"             ru: "Макс. ярусов"
  cargoType.nesting.label      de: "Verschachteln"          ru: "Вложение"
  cargoType.nesting.mode       de: "Verschachtelungsmodus"  ru: "Режим вложения"
  cargoType.nesting.sequential de: "Sequenziell"            ru: "Последовательный"
  cargoType.nesting.pairwise   de: "Paarweise"              ru: "Парами"
  cargoType.nesting.stepHeightSeq  de: "Höhenzuwachs je Palette (Δh)"     ru: "Прирост высоты на паллету (Δh)"
  cargoType.nesting.stepHeightPair de: "Höhe der oberen Bretter (h_d)"    ru: "Высота верхних досок (h_д)"
  cargoType.nesting.stepHeightHint de: "1…{H} mm — Höhenzuwachs pro verschachtelter Palette; 0 ist ungültig." ru: "1…{H} мм — прирост высоты на вложенную паллету; 0 недопустимо."
  cargoType.nesting.maxNested  de: "Max. Verschachtelung"   ru: "Макс. вложений"
  cargoType.nesting.allowUnpairedTop de: "Einzelne oberste Palette erlauben" ru: "Разрешить непарный верх"
  hint.optionalUnlimited de: "leer = unbegrenzt"           ru: "пусто = без лимита"
  stack.preview        de: "Stapel"                        ru: "Штабель"
  stack.pallets        de: "Paletten"                      ru: "поддонов"
  stack.invalid        de: "—"                             ru: "—"
  action.computeStack  de: "Stapel berechnen"              ru: "Рассчитать штабель"
  stack.result         de: "Im Stapel: {count} Paletten · {height}" ru: "В штабеле: {count} поддонов · {height}"
  stack.formula.label  de: "Formel"                        ru: "Формула"
  stack.formula.entschachtelt de: "⌊Hк / H⌋ = ⌊{hold} / {base}⌋ = {rawCount}" ru: "⌊Hк / H⌋ = ⌊{hold} / {base}⌋ = {rawCount}"
  stack.formula.sequential    de: "1 + ⌊(Hк − H) / Δh⌋ = 1 + ⌊({hold} − {base}) / {step}⌋ = {rawCount}" ru: "1 + ⌊(Hк − H) / Δh⌋ = 1 + ⌊({hold} − {base}) / {step}⌋ = {rawCount}"
  stack.formula.pairwise      de: "Paarweise, h_d = {step} mm → {rawCount} (vor Limit)" ru: "Парами, h_д = {step} мм → {rawCount} (до лимита)"
  stack.formula.cap    de: "→ min({rawCount}, {cap}) = {count}" ru: "→ min({rawCount}, {cap}) = {count}"
  stack.formula.notStackable  de: "nicht stapelbar → 1"    ru: "без штабелирования → 1"
  state.label          de: "Zustand"                        ru: "Состояние"
  state.verschachtelt  de: "Verschachtelt"                  ru: "Verschachtelt (вложено)"
  state.entschachtelt  de: "Entschachtelt"                  ru: "Entschachtelt (развложено)"
  loadingMode.label    de: "Belademodus"                    ru: "Режим загрузки"
  loadingMode.rear     de: "Hinten"                         ru: "Сзади"
  loadingMode.side     de: "Seitlich"                       ru: "Сбоку"
  loadingMode.combined de: "Kombiniert"                     ru: "Комбинированный"
  action.calculate     de: "Berechnen"                      ru: "Рассчитать"
  action.exportJson    de: "Als JSON exportieren"           ru: "Экспорт в JSON"
  results.totalPlaced       de: "Platziert gesamt"          ru: "Всего размещено"
  results.unplaced          de: "Nicht platziert"           ru: "Не размещено"
  results.floorFillPercent  de: "Bodenfüllung"              ru: "Заполнение пола"
  results.volumeFillPercent de: "Volumenfüllung"            ru: "Заполнение объёма"
  results.placed            de: "Platziert"                 ru: "Размещено"
  results.requested         de: "Angefordert"               ru: "Запрошено"
  ERR_INVALID_DIMENSION     de: "Ungültige Abmessung: ganze positive Zahl in mm erforderlich." ru: "Некорректный размер: целое положительное число в мм."
  ERR_CARGO_EXCEEDS_VEHICLE de: "Ladung passt in keiner erlaubten Ausrichtung in den Laderaum." ru: "Груз не помещается в кузов ни в одной ориентации."
  ERR_INVALID_QUANTITY      de: "Ungültige Menge: mindestens 0 (oder „Rest auffüllen“ nutzen)."  ru: "Некорректное количество: не меньше 0 (или «заполнить остаток»)."
  ERR_INVALID_NESTING       de: "Ungültige Verschachtelung: Δh muss zwischen 0 und der Höhe liegen." ru: "Некорректное вложение: Δh в диапазоне 0..высота."
  ERR_INVALID_ROTATION      de: "Ungültiger Drehmodus."     ru: "Некорректный режим вращения."
  ERR_EMPTY_LOAD            de: "Die Ladungsliste ist leer." ru: "Список груза пуст."
  ERR_UNKNOWN_VEHICLE       de: "Fahrzeug nicht gefunden."   ru: "Кузов не найден в справочнике."

Do not call the engine yet — just the shell, theme tokens, logo/title, locale switcher, i18n.
```

---

## Промпт 1 — экран выбора кузова

```
Add the Vehicle section (style everything via the theme's semantic tokens — bg-surface-card,
text-text, border-border, bg-primary for the primary action; NEVER a hex value; desktop-first
layout with generous whitespace). A Vehicle has this exact shape (integer millimetres):

  interface Vehicle { id: string; name: string; length: number; width: number; height: number; }

- Offer a preset dropdown (label t('vehicle.preset')) with one built-in preset:
    { id: 'lkw-standard', name: 'LKW Standard (13.6 m)', length: 13600, width: 2430, height: 2650 }
- Selecting a preset fills an editable form (labels via t(): field.name, field.length,
  field.width, field.height) so the user can tweak or define a custom vehicle
  (t('vehicle.custom')). All dimension inputs are integers in mm; validate >0 client-side.
- Show the chosen cargo hold summary under t('vehicle.cargoHold') using formatLength for each dim
  (e.g. "13.600 mm × 2.430 mm × 2.650 mm").
- Store the selected vehicle in the top-level state. No engine call yet.
```

---

## Промпт 2 — редактор заявки (типы груза + правила + глобальный переключатель состояния)

```
Add the Cargo section: an editable list of cargo types (style via semantic tokens only, no hex;
desktop-first; use clear data-table / form layout with strong usability). Each row is a CargoType
with this exact shape (integer millimetres; all rule fields map 1:1 to the engine):

  type RotationRule = 'none' | 'yawOnly' | 'full';
  type NestingState = 'verschachtelt' | 'entschachtelt';
  type NestingMode  = 'sequential' | 'pairwise';
  interface CargoType {
    id: string; name: string;
    length: number; width: number; height: number;   // base unit, mm
    quantity: number;                                  // ignored when fill = true
    fill?: boolean;                                    // true → place as many as possible
    rotation: RotationRule;
    stacking: { stackable: boolean; maxTiers?: number };
    nesting: { nestable: boolean; stepHeight?: number; maxNested?: number;
               nestingMode?: NestingMode; allowUnpairedTop?: boolean };
    state: NestingState;
    orderId?: string;
  }

Row controls (every label via t(); no hardcoded strings):
- name, length, width, height, quantity (field.*), fill checkbox (field.fill) — when checked,
  disable quantity.
- orderId (field.orderId, optional free text — pallets sharing an orderId are packed as one zone).
- rotation: select with options none / yawOnly / full (cargoType.rotation.*).
- stacking: checkbox stackable (cargoType.stacking.label) + optional maxTiers number
  (cargoType.stacking.maxTiers) shown when stackable. IMPORTANT: optional caps must default to
  EMPTY (undefined → unlimited), NEVER 0 — send the field to the engine only when the user typed a
  positive integer; an empty input means "omit the field". Show hint.optionalUnlimited under it.
- nesting: checkbox nestable (cargoType.nesting.label). When nestable, show:
    - nestingMode select (sequential/pairwise, cargoType.nesting.sequential / .pairwise).
    - stepHeight number — REQUIRED, integer 1..height (0 is invalid → the engine returns
      ERR_INVALID_NESTING). Its LABEL depends on the mode: sequential →
      cargoType.nesting.stepHeightSeq (Δh, per-pallet height gain), pairwise →
      cargoType.nesting.stepHeightPair (h_d, height of the two top boards). Show
      cargoType.nesting.stepHeightHint underneath with {H} replaced by the row's height; mark the
      field invalid (danger token) if empty, ≤0 or > height, and disable "Berechnen" while any
      nestable row has an invalid stepHeight.
    - maxNested number — OPTIONAL, default EMPTY (undefined → unlimited), never 0; hint.optionalUnlimited.
    - only for pairwise: allowUnpairedTop checkbox (cargoType.nesting.allowUnpairedTop).
- Remove-row button (cargoType.remove) and an "add cargo type" button (cargoType.add).

Quick-add preset pallets (button per preset that appends a row prefilled with these dims,
rotation 'yawOnly', stackable true, nestable false, state from the global toggle below,
quantity 1):
    EPAL 1 / EUR    1200 × 800  × 144
    EPAL 2          1200 × 1000 × 162
    EPAL 3          1000 × 1200 × 144
    EPAL 6 (halb)    800 × 600  × 144
    Viertelpalette   600 × 400  × 144

Global Verschachtelt/Entschachtelt toggle (state.label with state.verschachtelt /
state.entschachtelt): a single control at the top of the Cargo section that sets `state` on ALL
cargo rows at once (per-row override still allowed after).

Also add a Load-level "clearance" number input (field.clearance, mm, default 0) and an optional
loadingMode select (loadingMode.label; options rear/side/combined, default 'combined').

Keep everything in state; still no engine call (the live stack preview + the invalid-Δh/empty-caps
hardening are added right after, in Prompt 2-fix).
```

---

## Промпт 2-fix — доработка вложения/лимитов (если Cargo уже собран)

> Патч к уже построенной секции Cargo: делает ввод при «Verschachtelt» нативным и убирает
> вредные нули-по-умолчанию. Требует ключей `cargoType.nesting.stepHeightSeq/…Pair/…Hint`,
> `hint.optionalUnlimited` из промпта 0 (добавь их в DICT, если их ещё нет).

```
Refine the cargo editor's nesting and optional-cap inputs — style via semantic tokens only:

1) Optional numeric caps must never default to 0. For stacking.maxTiers and nesting.maxNested:
   default the input to EMPTY; treat empty as "field omitted" (undefined = unlimited) when building
   the CargoType — do NOT send 0. Add the hint hint.optionalUnlimited under each. Reason: the engine
   reads 0 as "cap = 1", so a stray 0 silently collapses stacking/nesting to a single unit.

2) When nestable is on, stepHeight (Δh) is REQUIRED and must be an integer 1..height (0 is invalid
   and makes the engine return ERR_INVALID_NESTING). Default the field to EMPTY (not 0). Its label
   depends on nestingMode: sequential → t('cargoType.nesting.stepHeightSeq'), pairwise →
   t('cargoType.nesting.stepHeightPair'). Show t('cargoType.nesting.stepHeightHint') under it with
   {H} replaced by that row's height. Mark the field invalid (danger token) and disable the
   "Berechnen" button whenever any nestable row has stepHeight empty, <=0 or > its height.

3) Keep allowUnpairedTop visible only in pairwise mode.

4) Live stack preview (2.5D intermediate step). Import computeStack from '@shadrin-v/engine':
       import { computeStack } from '@shadrin-v/engine';   // >= 0.0.2 (live preview)
   Under EACH cargo row, show a small inline preview line that recomputes live as the user edits
   dimensions, state, nestingMode or stepHeight — it answers "how many pallets go in ONE stack"
   before the full floor layout:
       const s = computeStack(cargoRow, vehicle);   // { count, height, mode, pairs?, unpairedTop? }
       // render: `${t('stack.preview')}: ${s.count} ${t('stack.pallets')} · ${formatLength(s.height, locale)}`
   Rules: only render the preview when the row is valid for stacking/nesting (for nestable rows,
   stepHeight must be 1..height); otherwise show t('stack.invalid') ("—"). If s.count === 0 (unit
   taller than the hold) show "—" too. This is pure/synchronous — no async. The preview is
   informational; the full 2D layout still happens on the "Berechnen" button (Prompt 3).
```

---

## Промпт 2-stack — кнопка «Рассчитать штабель» + формула вывода

> Явный промежуточный шаг 2.5D: пользователь считает количество в одном штабеле и видит формулу
> вывода ДО полной раскладки. Требует `@shadrin-v/engine >= 0.0.3` (StackPreview с операндами
> формулы, контракт 0.7.0) и ключей `action.computeStack`, `stack.result`, `stack.formula.*` из
> промпта 0. Живой инлайн-предпросмотр (Промпт 2-fix, п.4) остаётся — это его развёрнутая версия.

```
In each cargo row add an explicit "Stapel berechnen" button (t('action.computeStack')) next to the
nesting block; style via semantic tokens only. On click, call computeStack(row, vehicle) and show a
small result panel under the row (surface-card / border):

    import { computeStack } from '@shadrin-v/engine';   // >= 0.0.3, returns formula operands
    const s = computeStack(row, vehicle);
    // s = { count, height, mode, pairs?, unpairedTop?, base, hold, stepHeight?, rawCount, cappedBy?, cap? }

Panel content (all text via t(), all numbers via formatLength / Intl — NEVER hardcode):
1) Result line: t('stack.result') with {count} = s.count and {height} = formatLength(s.height, locale).
2) Formula line: label t('stack.formula.label') + the mode template, substituting placeholders from s
   (do NOT compute any of these numbers yourself — only substitute):
     - s.mode === 'entschachtelt' → t('stack.formula.entschachtelt') with {hold},{base},{rawCount}
     - s.mode === 'sequential'    → t('stack.formula.sequential')    with {hold},{base},{step}=s.stepHeight,{rawCount}
     - s.mode === 'pairwise'      → t('stack.formula.pairwise')      with {step}=s.stepHeight,{rawCount}
3) Cap line (only if s.cappedBy is set):
     - 'maxTiers' | 'maxNested' → t('stack.formula.cap') with {rawCount},{cap}=s.cap,{count}=s.count
     - 'notStackable'           → t('stack.formula.notStackable')
4) If s.count === 0 (unit taller than the hold) show t('stack.invalid') ("—") instead of the panel.

Numbers come entirely from the engine (single source of truth) — the UI only fills the templates.
Leave room under the panel for a future graphical stack scheme (do not build the graphic now).
This is pure/synchronous — no async.
```

---

## Промпт 2-state-cleanup — один переключатель состояния (полировка, LKWkalk-qrd.28)

> Сейчас «Verschachtelt/Entschachtelt» встречается в 3 местах (глобальный тумблер СОСТОЯНИЕ +
> per-row ZUSTAND + блок VERSCHACHTELN), они рассинхронизируются. Оставляем один источник истины.

```
Simplify the Verschachtelt/Entschachtelt state control to ONE place:
- The global СОСТОЯНИЕ / ZUSTAND toggle at the top of the Cargo section is the single source of
  truth for `state`. Remove the per-row ZUSTAND dropdown; every cargo row inherits the global state.
- Hide the whole VERSCHACHTELN (nesting) block for a row when the global state is Entschachtelt —
  nesting (Δh) only applies to Verschachtelt. Show it only in Verschachtelt.
- Keep t()-keys as-is (state.label / state.verschachtelt / state.entschachtelt); no new strings.
(If per-type mixed states are needed later, reintroduce the per-row control behind an "advanced"
disclosure — the engine already accepts per-type state, so this is UI-only.)
```

---

## Промпт 3 — вызов `calculateLayout`, обработка ошибок, минимальная сводка

```
Wire the engine (style via semantic tokens only — errors use the danger token, the summary uses
surface-card/border/text; no hex). Import from '@shadrin-v/engine':
    import { calculateLayout, getLayoutReport, ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';

On the "Berechnen" button (action.calculate), build a Load object from current state:
    const load = { vehicle, cargo: cargoTypes, clearance, loadingMode };  // loadingMode optional
Call const layout = calculateLayout(load).

Result handling (this is the Result section; full top/side visualization is a later task, keep it
to a summary here):
- If layout.errors is a non-empty array: render each error in a danger-token alert by translating
  its code with t(err.code, locale) (the seeded ERR_* keys). Do not render metrics.
- Otherwise show a summary using getLayoutReport(layout). Format ALL numbers with locale formatting
  (Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'ru-RU', { maximumFractionDigits: 1 })); append
  "%" to the fill percentages:
    - results.totalPlaced = layout.metrics.totalPlaced
    - results.floorFillPercent / results.volumeFillPercent
    - a per-type data table from report.perType: columns results.requested / results.placed /
      results.unplaced, one row per cargoTypeId.
    - results.unplaced total if any.
- Show ENGINE_CONTRACT_VERSION in a small muted footer (text-text-muted).

The engine is pure and synchronous — no async/await needed. Layout coordinates are integer mm.
```

---

## Промпт 4 — (опционально) хранение и экспорт/импорт JSON

```
Add browser persistence and JSON I/O (style via semantic tokens only, no hex), keeping it simple:
- Persist custom vehicles and cargo types to IndexedDB (a small wrapper or idb-keyval is fine);
  built-in presets stay in code.
- "Als JSON exportieren" (action.exportJson): download the current raw `layout` (from the last
  calculateLayout) as a .json file.
- Add library export/import: one JSON file containing all custom vehicles + cargo types, with a
  version field, for backup/transfer. Import merges by id.
Do not add CSV/Excel import (out of MVP).
```

---

## Definition of Done для qrd.13

- Можно собрать `Load` (кузов + типы + правила + состояние + clearance) и получить `Layout`
  из `calculateLayout`; ошибки показываются переводом кодов `ERR_*` (danger-токен).
- Глобальный переключатель Verschachtelt/Entschachtelt работает на все типы.
- Под каждой строкой груза — живой предпросмотр штабеля (`computeStack`): «Штабель: N поддонов · H мм»,
  обновляется при вводе Δh/режима/высоты; при невалидном вложении — «—» (промежуточный шаг 2.5D).
- Кнопка «Рассчитать штабель» (Промпт 2-stack): показывает количество в штабеле + читаемую формулу
  вывода (операнды из `computeStack`, UI не считает сам); место под будущую графсхему.
- Ни одной хардкод-строки в компонентах — всё через `t()`; локали de/ru, de по умолчанию.
- **Ни одного hex-цвета в компонентах** — все цвета/шрифты/радиусы/отступы через токены темы
  (ребренд = правка одного файла); палитра из логотипа Holz Schäfer; только светлая тема; Inter.
- Макет работает на desktop ≥1280px.
- Промпт 4 (хранение/экспорт) — по желанию; ядро задачи закрывают промпты 0–3.

> Виды сверху/сбоку и экспорт PDF/PNG — задача **qrd.14** (следующая серия промптов).
