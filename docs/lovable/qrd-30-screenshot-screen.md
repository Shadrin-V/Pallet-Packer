# qrd.30 — экран «Ladeplan» под скриншот (эталон + промпт)

> Приоритет: экран должен быть **чистым, информативным, без лишнего** — на текущем этапе расчёт
> передаётся поставщику **скриншотом**. Есть визуальный **эталон** — подгоняй под него.

## Эталон

- Живой макет (артефакт): https://claude.ai/code/artifact/fef9a8a8-cf37-408c-9b68-508585376f82
- В репозитории: [`ladeplan-reference.html`](ladeplan-reference.html) — открой в браузере, это точный
  целевой вид «Ladeplan».

Это **референс-дизайн**, не финальный код: цвета/штриховка — провалидированная палитра (data-viz),
раскладка захардкожена ради вида. В Lovable данные берутся из движка (`Layout`, `orientedDims`).

## Что на экране (ничего лишнего)

Результат = ОДНА карточка «Ladeplan», пригодная для скриншота, сверху вниз:
1. **Шапка:** лого Holz Schäfer + «Ladeplan · Ladungsplaner» + название кузова.
2. **Мета-строка:** Fahrzeug (внутр. размеры) · Auftrag/Datum (редактируемое) · Belademodus ·
   и справа 3 цифры: **Paletten**, **Stellplätze**, **Auslastung %**.
3. **Draufsicht** (вид сверху) — на всю ширину; над ним «◄ Vorne … Beladung→ … Hinten (Türen) ►».
4. **Seitenansicht** (вид сбоку) — на всю ширину.
5. **Низ:** легенда заказов (свотч цвет+штрих + Auftrags-ID + Pal.) слева, крошечная строка метрик
   справа (Boden % · Volumen % · N Paletten · M Stellplätze).

Разрезы: калька-фон + бледная сетка 1000 мм, каждый стапель — **цвет + штриховка своего заказа**,
подпись только «×N» (число паллет), фикс-размер, токеном текста. Вид сбоку — реальная высота из
движка (0.0.6).

## Что УБРАТЬ (клаттер)

- Большие KPI-карточки (Всего размещено / Занятых мест / Заполнение…) — заменить на 3 цифры в шапке +
  крошечную строку метрик внизу.
- Текст-колонки сбоку от разрезов (ШИРИНА/ВЫСОТА/ДЛИНА) — только тонкая подпись под SVG.
- Большую таблицу «тип груза» на экране — не нужна для скриншота (данные и так в легенде). Если нужна
  — компактно и вне карточки Ladeplan.
- Крупные кнопки-пресеты, лишние отступы, повторяющиеся подписи.

## Промпт для Lovable

```
Rebuild the result area as ONE clean, screenshot-ready "Ladeplan" card that matches the reference
design (docs/lovable/ladeplan-reference.html — open it; replicate its structure, spacing and the
colour+hatch-by-order look). Tokens only, i18n de/ru, full width, light theme.

Structure of the card, top to bottom (nothing else in it):
1. Header: Holz Schäfer logo + "Ladeplan · Ladungsplaner" + vehicle name.
2. Meta row: Fahrzeug inner dims (formatLength) · editable Auftrag/Datum · Belademodus · and on the
   right three figures: Paletten (totalPlaced), Stellplätze (usedFloorPositions), Auslastung
   (floorFillPercent %).
3. Draufsicht (top view) full width, with "◄ Vorne … Beladung → … Hinten (Türen) ►" above it.
4. Seitenansicht (side view) full width — actual heights from the engine (>=0.0.6).
5. Footer: order legend (colour+hatch swatch + Auftrags-ID + pallet count) on the left; a tiny muted
   metrics line (Boden % · Volumen % · N Paletten · M Stellplätze) on the right.

Diagrams: vellum background + faint 1000mm grid; each stack filled with its ORDER colour AND hatch
pattern (8 validated series from the redesign doc); the ONLY label per stack is "×N" (pallet count),
fixed screen size, in the text token. Front/rear + a single loadingMode-derived direction arrow.

REMOVE clutter: no big KPI cards, no side axis-text columns, no on-screen per-type table (its data is
in the legend); no oversized preset buttons. Keep the editor compact and OUTSIDE this card (the card
is what gets screenshotted). Print = this card on one A4 (logo + both diagrams maximised).
```

## Пресеты — отложено

Программа чаще используется для **нестандартных грузов**, поэтому основной путь добавления позиции —
**свои размеры** (сразу поля Д/Ш/В). Стандартные пресеты (EPAL и т.п.) — вторично: маленький
необязательный выпадающий список или пока опустить. Не делать пресеты кнопками и не выводить их на
первый план (`LKWkalk-qrd.17` — реальные данные пресетов — остаётся отложенной).
