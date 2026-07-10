# qrd.30 — экран настройки (эталон + промпт)

> Парный к [экрану результата](qrd-30-screenshot-screen.md). Тот же визуальный язык. Цель — компактный,
> «лаконичный и оптимальный» ввод: заказы → позиции, каждая позиция в одну строку.

## Эталон

- Артефакт: https://claude.ai/code/artifact/0f9532eb-d57e-413e-8069-f98409bdea61
- В репозитории: [`setup-reference.html`](setup-reference.html) — открой в браузере, это целевой вид.

## Решения дизайна (мозговой штурм)

1. **Кузов — тонкая строка** сверху (свёрнут): название + `13 600 × 2 430 × 2 650 mm` + Load-параметры
   (Abstand, Belademodus) + `Ändern`. Разворачивается для правки/выбора кузова.
2. **Заказ = карточка** с цвет+штрих-акцентом (левый бордер + свотч), редактируемым Auftrags-ID
   (можно пустой) и сводкой (N позиций · M паллет).
3. **Позиция = ОДНА строка:** свотч · Name · `Д×Ш×В` (мелкие поля, «мм» суффиксом без наезда) ·
   Menge (+`Rest auffüllen`) · сегмент **Ent/Ver** · Drehung (коротко: Nein/Um Z/Alle 6) · чип
   «Stapel N» · `⌄` детали · `⋮`. Детали правил — в раскрывающейся панели (в макете одна развёрнута).
4. **Состояние+вложение — один сегмент** (Ent/Ver): `Ver` → параметры «парами» (Modus=Paarweise по
   умолч., h_д, Max, Einzelne oberste) + результат/формула; `Ent` → Max. Lagen. Конфликта нет.
5. **Пресеты вторичны:** «+ Position» = список, дефолт **Eigene Maße**, стандартные ниже. Не кнопки.
6. **Зазор на уровне позиции** (в деталях). Прим.: ядро пока принимает общий `Load.clearance` —
   per-position включаем после `LKWkalk-qrd.31`; до этого поле=общий зазор.
7. Внизу — итог (позиции/паллеты) + `Ladeplan berechnen →` (переход к экрану результата).

## Промпт для Lovable

```
Rebuild the setup/input screen to match the reference (docs/lovable/setup-reference.html — open it;
replicate structure, density, and the colour+hatch-by-order accents). Tokens only, i18n de/ru, full
width, light theme; same visual language as the Ladeplan result screen.

- Vehicle = a slim single-line bar: name + inner dims (formatLength) + Abstand + Belademodus +
  "Ändern" that expands the vehicle form. Collapsed by default.
- Orders as cards (colour+hatch accent + swatch + editable Auftrags-ID + "N Positionen · M Paletten").
- Each POSITION is ONE compact row: swatch · Name · L×B×H small inputs (mm as a suffix that never
  overlaps — padding-right/adornment) · Menge (+ "Rest auffüllen") · a segmented [Ent|Ver] control ·
  Drehung short select (Nein / Um Z / Alle 6) · "Stapel N" chip · a ⌄ details toggle · ⋮ menu.
- The segmented [Ent|Ver] IS the state (no separate nesting checkbox). Ver → reveal pairwise params
  (Modus default Paarweise, h_d required 1..H, Max optional, Einzelne oberste) + the "Stapel
  berechnen" result & formula; Ent → reveal Max. Lagen. Per-position Abstand lives in the details.
- "+ Position" is a neat dropdown (default "Eigene Maße", presets listed below) — NOT buttons.
- "+ Auftrag hinzufügen" adds a new order card (scroll + focus). Footer: totals + primary "Ladeplan
  berechnen →". Keep it dense; the whole setup must be far more compact than before.
```

## Итого: два эталона

- Ввод → [`setup-reference.html`](setup-reference.html)
- Результат (под скриншот) → [`ladeplan-reference.html`](ladeplan-reference.html)

Один визуальный язык: калька-палитра, зелёно-древесные акценты, цвет+штрих по заказу, tabular-nums,
тонкие линии, плотно но с воздухом.
