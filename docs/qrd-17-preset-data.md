# qrd.17 — Реальные данные каркасов (сбор)

> Точка сбора реальных данных для `LKWkalk-qrd.17`. Часть — PLACEHOLDER (пользователь собирает).
> После заполнения: обновить пресеты ([spec.md](spec.md), Приложение A) и тест-кейсы qrd.4/qrd.5,
> снять пометки PLACEHOLDER.

## Кузова (внутренние, мм) — подтверждено

> Superseded 2026-07-20 by the logist's scheme (`LKWkalk-07l`):
> [docs/lkw-presets-logist-2026-07-20.md](lkw-presets-logist-2026-07-20.md). The row below is the
> data this doc originally shipped with — the logist doc is now the source of truth for vehicle
> presets (width is 2450 across the board, not 2430; "LKW Standard" is now the 2450mm-high variant,
> the old 2650 row lives on as "LKW Hochplane").

| Пресет       | Длина | Ширина | Высота |
|--------------|-------|--------|--------|
| LKW Standard | 13600 | 2430   | 2650   |

## Европоддоны (мм) — подтверждено
EPAL 1 — 1200×800×144; EPAL 2 — 1200×1000×162; EPAL 3 — 1000×1200×144;
EPAL 6 — 800×600×144; Viertelpalette — 600×400×144.

## Каркасы (Gestelle) с вложением — PLACEHOLDER
Для каждого типа каркаса собрать:

| Поле                         | Значение | Комментарий                                             |
|------------------------------|----------|---------------------------------------------------------|
| name                         | —        | напр. «Gestell A»                                       |
| length × width × height, мм  | —        | габарит одиночного каркаса (H — высота базовой единицы)  |
| nestingMode                  | —        | `sequential` или `pairwise`                             |
| stepHeight, мм               | —        | `sequential` → Δh; **`pairwise` → h_д (высота 2 верхних досок)** |
| maxNested                    | —        | лимит вложения                                          |
| allowUnpairedTop             | —        | true/false (одиночный непарный сверху, только pairwise)  |
| stackable / maxTiers         | —        | штабелирование без вложения                             |
| rotation                     | —        | none / yawOnly / full                                   |

Эталон pairwise для проверки: H=144, h_д=22, Hк=2650 → n=31 (высота 2634).
