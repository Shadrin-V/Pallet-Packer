# Ladungsplaner — дизайн-система для Lovable

> Канонический источник токенов и компонентов. Вставляй это в Lovable вместе с промптом — оно
> самодостаточно (ссылки на артефакты у Lovable не откроются, они приватные). Референс-виды:
> [`setup-reference.html`](setup-reference.html) и [`ladeplan-reference.html`](ladeplan-reference.html)
> (открой в браузере / приложи скрин). **Правило:** компоненты используют ТОЛЬКО токены — ни одного
> hex в JSX. Ребренд = правка одного файла темы. **Только светлая тема** (MVP). Шрифт — **Inter**.

## 1. Токены темы (CSS-переменные — в один theme.css)

```css
:root{
  /* surfaces */
  --paper:#FAF9F7;      /* app / vellum background */
  --card:#FFFFFF;       /* cards, inputs */
  --sub:#F4F1EB;        /* subtle fill: order header, chips, addbar */
  /* ink */
  --ink:#242321;        /* primary text */
  --muted:#6E6A63;      /* secondary text */
  --faint:#9A958C;      /* labels, hints, units */
  /* lines */
  --line:#E7E3DB;       /* hairlines */
  --line-strong:#D3CCC1;/* input borders, outlines */
  /* brand + semantic */
  --primary:#2E7D32;    --primary-ink:#FFFFFF;   /* forest green (Holz Schäfer) */
  --accent:#8D6E63;     /* warm wood */
  --danger:#B3261E;     --danger-ink:#FFFFFF;
  /* categorical ORDER palette — validated (colorblind + contrast); ALWAYS paired with a hatch */
  --s1:#2E7D32; --s2:#1565C0; --s3:#C62828; --s4:#8E44AD;
  --s5:#EF6C00; --s6:#0097A7; --s7:#A0522D; --s8:#B08900;
  /* radii / shadow / font */
  --r-card:10px; --r-ctl:7px; --r-pill:20px;
  --shadow-card:0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(30,26,20,.05);
  --font-sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  --font-mono:ui-monospace,Menlo,Consolas,monospace;
}
body{ background:var(--paper); color:var(--ink); font-family:var(--font-sans);
  font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased; }
```

## 2. Tailwind (theme.extend) — чтобы писать `bg-card`, `text-muted`, `bg-series-3`

```js
// tailwind.config — extend.colors + borderRadius
colors:{
  paper:'var(--paper)', card:'var(--card)', sub:'var(--sub)',
  ink:'var(--ink)', muted:'var(--muted)', faint:'var(--faint)',
  line:'var(--line)', 'line-strong':'var(--line-strong)',
  primary:'var(--primary)', 'primary-ink':'var(--primary-ink)',
  accent:'var(--accent)', danger:'var(--danger)',
  series:{1:'var(--s1)',2:'var(--s2)',3:'var(--s3)',4:'var(--s4)',
          5:'var(--s5)',6:'var(--s6)',7:'var(--s7)',8:'var(--s8)'},
},
borderRadius:{ card:'var(--r-card)', ctl:'var(--r-ctl)', pill:'var(--r-pill)' },
fontFamily:{ sans:'var(--font-sans)', mono:'var(--font-mono)' },
```
Load Inter (Lovable can use the webfont): weights 400/600/700.

## 3. Типографика

| Роль | Стиль |
|---|---|
| Заголовок экрана | 20px / 650 / -0.01em |
| Секция (eyebrow) | 13px / 600 / UPPERCASE / letter-spacing .12em / `--muted` |
| Микро-подпись поля | 10px / 600 / UPPERCASE / .13em / `--faint` (класс `.ml`) |
| Тело | 13–14px / 400 / `--ink` |
| Значение/число | 13–14px / 600 / `tabular-nums` |
| Формула (моно) | 12.5px / `--font-mono` в плашке `--sub` |

## 4. Компоненты (рецепты — стилизуй через токены)

**Кнопка.** border `--line-strong`, radius `--r-ctl`, 12.5px/600; hover → рамка/текст `--primary`.
`.primary` = фон `--primary`, текст `--primary-ink`. `.ghost` = пунктир, текст `--muted`.

**Поле с единицей (мм не наезжает!).** Обёртка `flex` с рамкой; input без рамки, `text-align:right`,
`padding-right:2px`; единица — `span` 10.5px `--faint`, `padding:0 7px`. Никогда не клади «mm» абсолютом
поверх input.
```html
<span class="measure"><input value="1200"><span class="u">mm</span></span>
```

**Select.** нативный, `appearance:none`, свой шеврон, рамка `--line`, radius `--r-ctl`. Пресеты —
только так (не кнопки): дефолт «Eigene Maße», стандартные — ниже под разделителем.

**Segmented (состояние).** пилюля из 2 опций, активная = фон `--primary`/белый текст. `[Ent | Ver]`
— это и есть state; отдельного чекбокса «вложение» НЕТ.

**Chip.** 11.5px, фон `--sub`, рамка `--line`, radius `--r-pill`. Напр. «Stapel 24».

**Card / Panel.** фон `--card`, рамка `--line`, radius `--r-card`, `--shadow-card`.

**Order card.** left-border 4px = цвет заказа (`--sN`); шапка фон `--sub`; свотч (см. §5) + Auftrags-ID
(inline-input, 700) + сводка справа.

**Position row.** одна строка (flex, nowrap): свотч 12×26 (цвет заказа) · Name (`--line` input, 600) ·
Д×Ш×В (`measure` ×3) · Menge · `Rest` чекбокс · segmented Ent/Ver · Drehung select · spacer · chip
«Stapel N» · `⌄` · `⋮`. Детали правил — раскрывающаяся панель (фон vellum, `border-top:1px dashed`).

## 5. Свотч заказа (цвет + штрих) — инлайн-SVG

Идентичность заказа = **цвет И штрих** (штрих обязателен: выживает в ЧБ-печати и при дальтонизме).
8 паттернов по индексу заказа: 1 `/`, 2 `\`, 3 `+`, 4 точки, 5 `—`, 6 `|`, 7 `#`, 8 плотные точки.
Мини-свотч (легенда / карточка):
```html
<svg width="24" height="16" viewBox="0 0 24 16">
  <rect width="24" height="16" fill="var(--s1)" fill-opacity=".16"/>
  <path d="M0,16 L16,0 M-8,8 L8,-8 M16,24 L32,8" stroke="var(--s1)" stroke-width="3" stroke-opacity=".7"/>
</svg>
```

## 6. Разрезы (виды сверху/сбоку)

- inline-SVG в мм-координатах (`viewBox="0 0 length width|height"`), `width:100%`.
- Фон — **калька**: `--paper` + бледная сетка 1000 мм (`--line-strong`, opacity .5, stroke-width 2).
- Рамка кузова: `--line-strong`, толстая.
- Стапель = `<rect>` заливка `url(#pat-N)` (паттерн цвета заказа, tint .14 + штрих .6) + `stroke` цвета
  заказа. Подпись только `×N` (число паллет), fill `--ink`, фикс-размер.
- SVG `<defs>` с 8 паттернами (см. `ladeplan-reference.html` — готовый генератор `defs()`).
- Вид сбоку: `rect y = height-(z+dz)`, высота из движка (`orientedDims`, ≥0.0.6) — НЕ из числа ярусов.
- Спереди/сзади: метки `Vorne`/`Hinten`; одна стрелка направления из `loadingMode`.

## 7. Как отдать Lovable

1. Вставь §1 (CSS-переменные) и §2 (Tailwind) в проект — это тема.
2. Дай промпт нужного экрана (`qrd-30-setup-screen.md` / `qrd-30-screenshot-screen.md`).
3. Приложи **скриншот** соответствующего референса (`setup-reference.html` / `ladeplan-reference.html`
   — открой в браузере и сделай снимок), либо скопируй его CSS как образец.
4. Требуй: только токены (ни одного hex в компонентах), i18n de/ru, desktop-first, светлая тема.
