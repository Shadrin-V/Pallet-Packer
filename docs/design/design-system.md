# Ladungsplaner — дизайн-система (канонический источник)

> **Направление D · Clean Tech + фирменный зелёный Holz Schäfer.** Это источник истины по токенам и
> компонентам для экранов `apps/web`. **Правило: компоненты используют ТОЛЬКО токены — ни одного hex в
> JSX.** Ребренд = правка одного файла [`theme.css`](theme.css). Тема — **только светлая** (MVP), путь к
> тёмной оставлен токенами. Шрифт — **Inter**. Полное обоснование и журнал решений —
> [дизайн-спека](../superpowers/specs/2026-07-15-design-system-ladungsplaner-design.md).
>
> Референс-виды: [`setup-reference.html`](../lovable/setup-reference.html),
> [`ladeplan-reference.html`](../lovable/ladeplan-reference.html) (структура/раскладка; палитра —
> уже эта, новая). Устаревшая версия системы: [`docs/lovable/design-system.md`](../lovable/design-system.md).

## Характер направления

Холодная почти-белая база с лёгким шалфейным уклоном нейтралей (не «безликий серый»); поверхности
разделяются **мягкой тенью и воздухом, а не рамками**; больше простора и крупнее иерархия; глубокий
фирменный зелёный — единственный тёплый-тёмный акцент; сдержанное движение. Читается «дорого,
современно, software-grade». Двойная плотность: «Настройка» компактнее, «Ladeplan» просторнее — через
пресеты padding, без отдельных компонентов.

## 1. Токены темы

Полный список — в [`theme.css`](theme.css) (вставляется как один файл). Группы: surfaces, ink, lines,
brand (`--brand #104F25` / `--mint #71BF87` / `--sage #C3D1C7`), semantic, categorical `--s1…--s8`,
data-viz `--grid`, radii, elevation, typography, motion, density presets.

Три бренд-цвета сняты с holz-schaefer.de:

| Токен | Hex | Роль |
|---|---|---|
| `--brand` | `#104F25` | primary-кнопка, активное состояние, левый кант заказа, ссылки |
| `--mint` | `#71BF87` | focus-ring, tint активного/успеха, hover-подсветки |
| `--sage` | `#C3D1C7` | зелёный уклон нейтралей, акцент-разделители |

## 2. Tailwind (theme.extend)

Мост на CSS-переменные — чтобы писать `bg-card`, `text-muted`, `bg-series-3`, `text-brand`.

```js
// tailwind.config — theme.extend
colors: {
  paper: 'var(--paper)', card: 'var(--card)', sub: 'var(--sub)',
  ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)',
  line: 'var(--line)', 'line-strong': 'var(--line-strong)',
  brand: 'var(--brand)', 'brand-strong': 'var(--brand-strong)', 'brand-ink': 'var(--brand-ink)',
  mint: 'var(--mint)', sage: 'var(--sage)',
  success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)',
  series: { 1:'var(--s1)',2:'var(--s2)',3:'var(--s3)',4:'var(--s4)',
            5:'var(--s5)',6:'var(--s6)',7:'var(--s7)',8:'var(--s8)' },
},
borderRadius: { card: 'var(--r-card)', ctl: 'var(--r-ctl)', pill: 'var(--r-pill)' },
boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
fontSize: {
  title:   ['21px',   { lineHeight: '1.2', letterSpacing: '-0.015em' }],
  h2:      ['16px',   { lineHeight: '1.3', letterSpacing: '-0.01em' }],
  eyebrow: ['11px',   { letterSpacing: '0.13em' }],
  label:   ['10px',   { letterSpacing: '0.13em' }],
  body:    ['13px',   { lineHeight: '1.5' }],
  value:   ['13px',   { lineHeight: '1.4' }],
  formula: ['12.5px', { lineHeight: '1.4' }],
  caption: ['11.5px', { lineHeight: '1.4' }],
},
```
Inter — веса 400/500/600/700 (self-hosted / webfont).

## 3. Типографика

| Роль | Стиль | Tailwind |
|---|---|---|
| Титул экрана (H1) | 21px / 650 / −0.015em | `text-title font-[650]` |
| Секция (H2) | 16px / 600 / −0.01em | `text-h2 font-semibold` |
| Eyebrow | 11px / 600 / UPPERCASE / +0.13em / `--faint` | `text-eyebrow uppercase font-semibold text-faint` |
| Микроподпись поля | 10px / 600 / UPPERCASE / +0.13em / `--faint` | `text-label uppercase font-semibold text-faint` |
| Тело | 13–14px / 400 / `--ink` | `text-body` |
| Значение / число | 13–14px / 600 / tabular | `text-value font-semibold tabular-nums` |
| Формула (моно) | 12.5px / mono в плашке `--sub` | `text-formula font-mono` |
| Микро / caption | 11.5px / 500 / `--muted` | `text-caption font-medium text-muted` |

Веса задаются классом (`font-medium/semibold/[650]`), размеры/трекинг — шагами `fontSize` (§2). Шкала
фиксированная; заголовкам `text-wrap: balance`; ширина текста ~65 символов; `tabular-nums` глобально.

## 4. Сетка, спейсинг, адаптив

- Спейсинг 4px-based: `4·8·12·16·20·24·32·48`; отступы через flex/grid + `gap` (не индивидуальные margin).
- Контейнер десктоп ~1120px, поля 20–24px, межсекционный воздух 24–32px.
- **Брейкпоинты:**
  - `≥1024px` — позиция заказа в одну строку;
  - `640–1023px` — контролы сжимаются/переносятся, поля мм не ломаются;
  - `<640px` — позиция → **вертикальная карточка** (имя сверху, размеры в ряд по 3, состояние/вращение
    ниже), карточки заказов на всю ширину, primary-действие липнет снизу.
- **Двойная плотность:** `--pad-compact` (Настройка) vs `--pad-roomy` (Ladeplan).

## 5. Компоненты (рецепты — только токены)

У каждого — состояния `default / hover / focus-visible / active / disabled / error`.

**Кнопка.** `.primary` фон `--brand`, текст `--brand-ink`, hover → `--brand-strong`. `.secondary` белый
фон, рамка `--line-strong`, hover → рамка/текст `--brand`. `.ghost` пунктир, `--muted`. Focus-visible →
`box-shadow: 0 0 0 3px var(--mint-ring)`. Disabled → opacity .5, `cursor:not-allowed`.

**Поле с единицей (мм не наезжает).** Обёртка `.measure` (flex, рамка `--line-strong`, radius `--r-ctl`);
`input` без рамки, `text-align:right`, `padding-right:2px`; единица — `span.u` 10.5px `--faint`,
`padding:0 8px 0 3px`. Focus → рамка `--brand` + mint-ring. Error → рамка `--danger` + код-ошибки под полем.
Никогда не класть «mm» абсолютом поверх input.
```html
<span class="measure"><input value="1200"><span class="u">mm</span></span>
```

**Select (Drehung, пресеты кузовов).** Нативный, `appearance:none`, свой шеврон, рамка `--line`,
radius `--r-ctl`. Пресеты — только select: дефолт «Eigene Maße», стандартные — под разделителем (не кнопки).

**Segmented (состояние Ent/Ver).** Пилюля из 2 опций; активная = фон `--brand`, белый текст. Это и есть
состояние вложения — отдельного чекбокса нет.

**Chip.** 11.5px, фон `--sub`, рамка `--line`, radius `--r-pill`. Вариант `.mint` (фон `--mint-tint`,
текст тёмно-зелёный) для состояния Verschachtelt («Stapel N»).

**Card / Panel.** Фон `--card`, radius `--r-card`, `--shadow-card` — **без рамки** (Clean Tech). Вложенные
разделители — `--line`.

**Order card.** Левый кант 4px = цвет заказа (`--sN`); шапка `--sub`: свотч (цвет+штрих, §6) + Auftrags-ID
(inline-input, 700) + сводка справа. Внутри — строки позиций, разделены `--line`.

**Position row.** Desktop — одна строка (flex, nowrap): свотч 12×26 · Name (`--line` input, 600) · Д×Ш×В
(`measure` ×3) · segmented Ent/Ver · Drehung select · spacer · chip «Stapel N» · `⌄` · `⋮`. Phone —
вертикальная карточка (см. §4). Детали правил (nesting/stacking/rotation) — раскрывающаяся панель (фон
`--sub`, `border-top:1px dashed`).

**Add-bar.** Полоса `--sub`, `border-top:1px dashed --line-strong`, «+ Position hinzufügen»; «+» в белом
квадрате с рамкой, знак `--brand`.

**Служебные.** toast (успех/предупреждение/ошибка семантикой), empty-state, skeleton-загрузка, modal
(`--shadow-pop`), tooltip. Все — на токенах, с focus-стилями и `prefers-reduced-motion`.

**Доступность.** Видимый focus-ring везде; контраст текста ≥ 4.5:1 (`#104F25` на белом — с запасом);
идентичность заказа = **цвет И штрих**, не только цвет.

## 6. Свотч заказа (цвет + штрих) — инлайн-SVG

Идентичность заказа = **цвет И штрих** (штрих обязателен: ЧБ-печать + дальтонизм). 8 паттернов по индексу:
1 `/`, 2 `\`, 3 `+`, 4 точки, 5 `—`, 6 `|`, 7 `#`, 8 плотные точки. Мини-свотч (легенда / карточка):
```html
<svg width="24" height="16" viewBox="0 0 24 16">
  <rect width="24" height="16" fill="var(--s1)" fill-opacity=".18"/>
  <path d="M0,16 L16,0 M-8,8 L8,-8 M16,24 L32,8" stroke="var(--s1)" stroke-width="3" stroke-opacity=".7"/>
</svg>
```

## 7. Разрезы (виды сверху/сбоку)

- Inline-SVG в мм-координатах (`viewBox="0 0 length width|height"`, `width:100%`) — из `Layout`/`orientedDims`
  движка, НЕ из числа ярусов.
- Фон — калька: `--paper` + бледная сетка 1000 мм (`--grid`, opacity .5). Рамка кузова — `--line-strong`, толстая.
- Стапель = `<rect>` заливка `url(#pat-N)` (цвет заказа, tint .16 + штрих .65) + `stroke` цвета заказа;
  подпись только `×N`, fill `--ink`, фикс-размер.
- `<defs>` с 8 паттернами (генератор `defs()` — из `ladeplan-reference.html`).
- Вид сбоку: `rect y = height-(z+dz)`, высота из движка (`orientedDims`). Спереди/сзади: `Vorne`/`Hinten`,
  одна стрелка направления из `loadingMode`.
- Легенда обязательна (цвет+штрих+Auftrags-ID). Данные-цвета ≠ бренд-акцент.

## 8. Печать A4 (только Ladeplan)

```css
@media print {
  /* A4 портрет; скрыть UI-хром */
  .app-chrome, button, .add-bar, nav, .measure input { /* hidden / static */ }
}
```
- Состав листа: шапка (заказы/машина/дата) → разрезы сверху+сбоку → легенда → сводка заполнения
  (% объёма, размещено/остаток).
- `print-color-adjust: exact` (заливки не выцветают); `break-inside: avoid` для разрезов и легенды.
- Всегда светлая; ЧБ-читаемость гарантируют штрихи. Экран «Настройка» не печатается.

## 9. Иконки, движение, тон

- **Иконки:** Lucide (линейный, stroke ~1.5, размеры 16/20/24, `currentColor`). Эмодзи-иконки не используем.
- **Движение:** сдержанно; переходы `var(--dur) var(--ease)` (120–180ms) для hover/focus/раскрытия;
  пересчёт раскладки — лёгкий fade. Всё под `prefers-reduced-motion: reduce`.
- **Тон (de/ru):** активный залог; кнопка называет действие («Berechnen» → тост «Berechnet»); ошибки
  объясняют, что не так и как исправить, без извинений. Ни одной строки в коде — только ключи i18n
  (`@shadrin-v/i18n`, de по умолчанию + ru).

## 10. Как это попадает в экраны

1. Токены [`theme.css`](theme.css) → `apps/web/src/theme.css`; блок §2 → `apps/web/tailwind.config.js`.
2. Экраны `gxp` (Настройка) / `73u` (Ladeplan) собираются основной сессией по этому файлу.
3. Требования: только токены (ни одного hex), i18n de/ru, адаптив вплоть до телефона, светлая тема,
   print-стиль A4 для Ladeplan.
