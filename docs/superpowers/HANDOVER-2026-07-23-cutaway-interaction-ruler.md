> ▶ Есть более свежий handover: `HANDOVER-2026-07-23-warehouse-drop-reflow.md` (склад, #25). Этот — по разрезам/линейке.

# HANDOVER 2026-07-23 — разрезы Ladeplan: взаимодействие + инженерная линейка (follow-up 41e.1)

Сессия поверх 41e.1: починка сломанных жестов в разрезах + доработка линейки по обратной связи владельца.
**6 PR смержено в `main` (#18–#23), 9 задач закрыто.** Всё — презентация в `apps/web`, движок/контракт не тронуты.

## Что сделано (по PR)

- **#18 (`86v`/`ki1`/`d2d`)** — регрессии 41e.1 (вложенный `<svg>`): marquee не стартовал (добавлен painted
  `data-hold-bg` под грузом — прозрачный svg по `visiblePainted` не ловил пустой пол); перенос склад→кузов
  падал не туда (`toHoldMm` → вложенный `svg[data-hold]`, а не внешний с гуттерами); рамка кузова → `--truck`,
  тоньше кабины.
- **#19 (`8fy`/`06w`)** — пустой склад не принимал стопку (рисуем drop-зону всегда: dashed + `warehouse.dropZone`);
  поворот плитки — по одной (ключ `cargoTypeId#occurrence`, не по типу).
- **#20 (`lqz`) — ГЛАВНЫЙ баг «перенос в склад».** См. Грабли §1.
- **#21/#22/#23 (`j81`/`xa6`/`mr8`)** — инженерная линейка: вертикальная ось (высота сбоку / ширина сверху) по
  **кормовой** кромке; 3 яруса штрихов (метр/полметра/четверть); числа мельче (`RULER_FONT` 0.011); линейка длины
  по **верхней** кромке (`MetreRuler dir=-1` + `topGutter`, короб сдвинут вниз); **итог на каждой из 3 осей**.

## Решения / поздние фиксы

1. **`outside`-детект холда — по CTM, не по `getBoundingClientRect` (`lqz`).** Вложенный cargo-`<svg>` имеет
   `overflow:visible`; во время драга translate-ghost **растягивает его bbox вниз**, и релиз над складом читается
   как «внутри холда» → `onDropOutside` не звался → стопка отскакивала. Фикс: бокс холда = углы viewBox
   `(0,0)-(length,spanY)` через `getScreenCTM` (несёт только позицию/масштаб svg). `CrossSection.tsx onUp`.
2. **Линейка — общий `RULER_FONT` (truckChrome.tsx)** для обеих осей; `dir=±1` в `MetreRuler` (вниз/вверх);
   `VerticalRuler` c `unit`+итогом; штрихи `metre/half/quarterMetreTicks` (`ruler.ts`).
3. **Рамка кузова** больше НЕ `--line-strong` (это теперь только рамки инпутов) — она `--truck` 1.75.

## Грабли

1. **jsdom НЕ проверяет drag-геометрию — и статический замер боксов тоже врёт.** Баг `lqz` был невидим и для
   jsdom (стаб identity), и для моей первой проверки (мерил боксы в покое, а bbox растягивается ТОЛЬКО во время
   драга). Поймал только **настоящий драг**. Инструмент, который сработал → **CDP-репро реального перетаскивания**:
   Node 22 (встроенный `WebSocket`) → `Input.dispatchMouseEvent` (**trusted**-события, поэтому `setPointerCapture`
   работает; синтетический `dispatchEvent` — НЕТ). Пайплайн: `vite --port 5178` с harness (реальный `LadeplanScreen`)
   → `chrome --headless --remote-debugging-port=9222 <harness>` → node-скрипт коннектится к `ws` из
   `http://localhost:9222/json`, шлёт mousePressed→moved×N→released по координатам стопки/склада, читает DOM
   (`holdStacks`/`warehouseTiles`) до/после. Для нового бага в разрезах — воссоздать этот репро, не мерить боксы.
2. **`chrome --headless --screenshot`** — для ВИЗУАЛА (линейка, рамка): render→Read PNG. Для ЖЕСТОВ — только CDP (п.1).
3. **GitHub иногда не запускает `pull_request`-CI** (PR #19): ран не появлялся, помог пустой коммит-«пинок»
   (событие `synchronize`); в squash-мерже он растворяется.
4. **Локально `apps/server`-тесты красные** — `better-sqlite3 NODE_MODULE_VERSION` (ABI). Пре-существующее, в CI
   (чистый Node) зелёное. Не чинить в рамках фич.

## Состояние

- `main` = `1333633`, `origin/main` синхронна. Прод: обновлён каждым мержем (CD, ADR 023), health
  `{"status":"ok","contract":"0.14.0"}`.
- Гейты (корень): `typecheck` ✅, `lint` ✅; `apps/web` **321** ✅, `packages` **238** ✅. (`apps/server` — ABI, см. Грабли §4.)
- Задачи закрыты: `86v ki1 d2d 8fy 06w lqz j81 xa6 mr8`. Открытых хвостов по этой работе нет.

## Что взять дальше

1. Опц. микро-подстройка линейки, если владелец попросит: `0` у пола вертикали, суффикс `m`, частота штрихов,
   положение итогов. Всё в `truckChrome.tsx` (`MetreRuler`/`VerticalRuler`) + `RULER_FONT`.
2. Эпик дизайна `LKWkalk-41e` ещё открыт: `41e.2` (визуал склада/буфера), `41e.4` (общая UI-система). `bd ready`.
3. Висят баги из `bd ready`: `pkm` (цвета заказов схлопываются), `5tg` (подпись стопок нечитаема), `v1m`
   (resolveGroupDrop без проверки rotation), и др.

## Локальный запуск

```bash
cd apps/web && npm run dev                      # :5173
DB_PATH=/tmp/qa.db npm run dev -w apps/server   # :3000 (из корня!)
# визуал разреза:  vite --port 5178 <harness.html> → chrome --headless --screenshot (Грабли §2)
# ЖЕСТ (drag/rotate): harness с LadeplanScreen → chrome --remote-debugging-port=9222 → CDP Input.dispatchMouseEvent (Грабли §1)
```
