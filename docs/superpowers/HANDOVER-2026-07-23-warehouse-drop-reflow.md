# HANDOVER 2026-07-23 — склад: дроп в место броска, reflow, видимый призрак кузов→склад

Продолжение эпика **`LKWkalk-dwc`** (буфер стопок). **1 PR смержен в `main` (#25, `b513859`), 3 задачи закрыто
(`dwc.7`/`dwc.8`/`dwc.9`).** Всё — презентация в `apps/web`; движок/контракт **не тронуты** (групповые правки
ядра `unplaceStacks`/`resolveGroupDrop` уже жили в контракте `0.14.0` из `dwc.6`).

## Что сделано (по задачам)

- **`dwc.7` — чистая логика раскладки склада.** `insertionIndexAt(layout, point)` — индекс вставки по точке в мм;
  фантом-слот в `warehouseFloor` (композиция: индекс → вставка фантома → штатный reflow соседей). Всё pure,
  тестируемо без DOM. `apps/web/src/screens/components/warehouseLayout.ts` (+тесты).
- **`dwc.8` — страничный призрак драга кузов→склад.** Карточка-призрак рендерится на уровне страницы и едет за
  курсором над **всем** экраном, включая поверхность склада (раньше исчезала над складом). `LadeplanScreen.tsx`.
- **`dwc.9` — дроп в место броска + reflow + живой зазор.** Стопка из кузова ложится туда, куда её бросили
  (`insertionIndexAt`), соседи раздвигаются, зелёный зазор-предпросмотр — больше не «в верхний левый угол».
  `CrossSection.tsx` (`onDropOutside`/`onUp`), `WarehouseFloor.tsx`.

### Файлы
- `apps/web/src/screens/components/warehouseLayout.ts` — `insertionIndexAt`, фантом-слот (+ `warehouseLayout.test.ts`).
- `apps/web/src/screens/components/WarehouseFloor.tsx` — рендер фантома/зазора (+ `WarehouseFloor.test.tsx`).
- `apps/web/src/screens/components/CrossSection.tsx` — carry-драг, `insertionIndexAt` в `onDropOutside` (+ тест).
- `apps/web/src/screens/LadeplanScreen.tsx` — страничный портал призрака (+ `LadeplanScreen.test.tsx`).
- `docs/superpowers/plans/2026-07-23-warehouse-drop-reflow-and-scenery.md` — план (Tasks 1–5).
- `docs/superpowers/specs/2026-07-23-warehouse-drop-reflow-and-scenery-design.md` — дизайн-бриф.
- `docs/superpowers/specs/2026-07-23-warehouse-scenery-asset-brief.md` — бриф на ассет фона (Task 5, ждёт вектор).

## Решения / поздние фиксы

1. **Reflow — композиция, не отдельная функция.** `insertionIndexAt` → вставка фантома в упорядоченный список →
   `warehouseFloor` пересчитывает раскладку → соседи сдвигаются штатно. Тест фиксирует детерминированность.
2. **Призрак — на уровне страницы (портал), не внутри вложенного `<svg>`.** Вложенный cargo-`<svg>` клиппится/скрывается
   над складом; поэтому карточка-призрак рендерится выше по дереву и позиционируется по курсору страницы.
3. **`outside`-детект холда — по CTM (`getScreenCTM`), не по `getBoundingClientRect`** (унаследовано из `lqz`): bbox
   вложенного `<svg>` под `overflow:visible` растягивается за ghost'ом во время драга и врёт.

## Грабли

1. **jsdom НЕ проверяет drag-геометрию, и статический замер боксов тоже врёт** (bbox растягивается ТОЛЬКО во время
   драга). Поймать только **настоящим драгом** → CDP-репро: `vite --port 5178` (harness с реальным `LadeplanScreen`)
   → `chrome --headless --remote-debugging-port=9222` → node-скрипт по `ws` из `http://localhost:9222/json`,
   `Input.dispatchMouseEvent` (**trusted**-события, иначе `setPointerCapture` не работает). Для нового бага в
   разрезах/складе — воссоздать этот репро, не мерить боксы.
2. **`chrome --headless --screenshot`** — для ВИЗУАЛА (render→Read PNG). Для ЖЕСТОВ — только CDP (§1).
3. **Локально `apps/server`-тесты красные** — `better-sqlite3 NODE_MODULE_VERSION` (ABI). Пре-существующее, в CI
   (чистый Node) зелёное. Не чинить в рамках фич.

## Состояние

- `main` = `b513859` (#25), `origin/main` синхронна. Прод обновлён (CD, ADR 023), health
  `{"status":"ok","contract":"0.14.0"}`, `@shadrin-v/engine` `0.0.8`.
- Гейты: CI-гейт `ci` на #25 зелёный (мерж = деплой). `apps/web` тесты зелёные; `apps/server` — ABI (Грабли §3).
- Эпик `LKWkalk-dwc`: 8/11 закрыто (72%). Закрыты `dwc.1–4,6–9`.

## Что взять дальше

1. **`41e.5` — фон склада (Task 5):** ждёт `warehouse-scenery.svg` владельца по
   `specs/2026-07-23-warehouse-scenery-asset-brief.md`. Как придёт вектор — привязать группы к viewBox склада,
   убрать `ForkliftMark`; отдельный PR.
2. **Хвосты эпика `dwc` (P3, не срочно):** `dwc.10` (призрак группы показывает имя одного типа + сумму всех единиц),
   `dwc.11` (off-by-one фантома при мультитаче), `dwc.5` (клавиатурный доступ к постановке стопки).
3. Прочее из `bd ready`: эпик `rgv` (UX-батч одностраничности, P1); баги `pkm`/`5tg`/`v1m`; эпик дизайна `41e` (`41e.2`, `41e.4`).

## Локальный запуск

```bash
cd apps/web && npm run dev                      # :5173
DB_PATH=/tmp/qa.db npm run dev -w apps/server   # :3000 (из корня!)
# визуал разреза:  vite --port 5178 <harness.html> → chrome --headless --screenshot (Грабли §2)
# ЖЕСТ (drag/rotate): harness с LadeplanScreen → chrome --remote-debugging-port=9222 → CDP Input.dispatchMouseEvent (Грабли §1)
```
