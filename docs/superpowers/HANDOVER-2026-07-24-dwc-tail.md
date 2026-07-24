# HANDOVER 2026-07-24 — хвост эпика буфера: off-by-one фантома + нейтральный групп-лейбл

Короткая сессия поверх склада (dwc.7-9). **2 PR смержено в `main` (#26 docs-wrap, #27 dwc.11+dwc.10), 2 задачи
закрыто** (плюс эпик `rgv` закрыт как 8/8). Всё код — презентация в `apps/web`; движок/контракт `0.14.0` не тронуты.

## Что сделано

- **`dwc.11` — off-by-one подхвата/поворота при фантоме (мультитач).** `WarehouseFloor` маппит `floor.tiles`,
  куда **вставлен** carry-in фантом-слот, а родительские `onPickUp`/`onRotate`/`dragging` индексируют `tiles`
  **без** него → для плиток после фантома индексы расходились на 1, и подхват/поворот доставался не той
  буферной стопке. Достижимо только вторым указателем (мультитач) во время carry. Фикс: render-индекс
  маппится назад (`i-1` при `phantomAt && i>index`) перед передачей наверх. `WarehouseFloor.tsx`. 2 теста.
- **`dwc.10` — нейтральный лейбл призрака для смешанной группы.** Призрак кузов→склад показывал имя
  pressed-типа над счётчиком, суммирующим **все** выделенные стопки → смешанная группа читалась как
  «Alpha ×(alpha+beta)». Однотипная группа сохраняет имя типа (лейбл корректен); группа из >1 distinct-типа
  показывает нейтральный лейбл — новый i18n-ключ `ladeplan.groupGhost` (de «Auswahl», ru «Выделение»).
  `CrossSection.tsx` (`onCarry`) + `packages/i18n`. 2 теста.
- **#26 (docs-wrap)** — реконсиляция предыдущей сессии: CHANGELOG + handover склада dwc.7-9 (тогда не были созданы).

### Файлы
- `apps/web/src/screens/components/WarehouseFloor.tsx` (+ `.test.tsx`) — `realIndex`-маппинг.
- `apps/web/src/screens/components/CrossSection.tsx` (+ `.test.tsx`) — `mixed`-детект, нейтральный `label`.
- `packages/i18n/src/dictionaries/{de,ru}.ts` + `keys.ts` — ключ `ladeplan.groupGhost`.
- `docs/CHANGELOG.md` — записи dwc.11/dwc.10 и (в #26) dwc.7-9.

## Решения / поздние фиксы

1. **`dwc.10` чинит только СМЕШАННУЮ группу** (distinct cargoTypeId > 1), не любую `refs.length>1`: однотипная
   группа уже корректна (имя типа истинно) и должна остаться названной. Детект: `new Set(refs.map cargoTypeId).size > 1`.
2. **i18n грузится из СОБРАННОГО `dist`** (`packages/i18n` `main: ./dist/index.js`), не из исходника. Новый ключ
   не резолвился в локальных тестах, пока не пересобрал: `npm run build -w @shadrin-v/i18n`. В CI это делает
   `npm run build` (i18n→engine→contracts→web→server) до тестов — ключ попадает штатно. `dist` gitignored.

## Грабли

1. **Wrap-дрейф повторяется:** и склад (#25), и эти фиксы (#27) мержились БЕЗ записи в CHANGELOG/handover —
   ловится только реконсиляцией `/wrap` §1. Правило: код с `bd close` → сразу CHANGELOG + (в конце) handover.
2. **`packages/i18n` — сборка перед тестами.** Правка словаря/ключа не видна ни локальным тестам, ни apps/web,
   пока не пересобран `dist`. Локально: `npm run build -w @shadrin-v/i18n`.
3. **Локально `apps/server`-тесты красные** — `better-sqlite3 NODE_MODULE_VERSION` (ABI). Пре-существующее, в CI
   (чистый Node) зелёное. Не чинить в рамках фич. Поэтому «583 зелёных» — это `apps/web`+`packages`, без server.

## Состояние

- `main` = `89ce7dd` (#27), `origin/main` синхронна. Прод обновлён (CD, ADR 023), health
  `{"status":"ok","contract":"0.14.0"}`, `@shadrin-v/engine` `0.0.8`.
- Гейты: `typecheck` ✅, `lint` ✅, `apps/web`+`packages` **583** ✅. CI на #26/#27 зелёный. (`apps/server` — ABI, Грабли §3.)
- Эпик `LKWkalk-dwc`: **10/11 (90%)**. Открыт только `dwc.5`. Эпик `rgv` закрыт (8/8).

## Что взять дальше

1. **`dwc.5` (P3) — клавиатурная постановка стопки из буфера в кузов.** A11y-фича, НЕ полиш: выбрать плитку →
   стрелки двигают призрак по snap-сетке → Enter ставит (`placeStack`) → Esc отменяет. Требует **brainstorming**
   (старт призрака, шаг сетки, управление фокусом, сосуществование с pointer-путём) до кода. Прецедент — `RotateHandle`.
2. **Дешёвые баги из `bd ready`:** `pkm` (два заказа с одинаковым Auftrags-ID → один цвет), `5tg` (подпись
   «N стопок» нечитаема — тёмный текст поверх соседней стопки), `v1m` (`resolveGroupDrop` не проверяет
   rotation/forkAccess, в отличие от `resolveDrop` — потенциальный инвариант-баг ядра).
3. **Заблокировано:** `41e.5` (фон склада) — ждёт `warehouse-scenery.svg` владельца (`specs/2026-07-23-warehouse-scenery-asset-brief.md`).
4. Крупное (требует brainstorming): `p3p` (автопоезд тягач+прицеп, ядро+контракт+ADR).

## Локальный запуск

```bash
cd apps/web && npm run dev                      # :5173
DB_PATH=/tmp/qa.db npm run dev -w apps/server   # :3000 (из корня!)
npm run build -w @shadrin-v/i18n                # пересобрать i18n dist после правки словаря/ключа
# визуал разреза:  vite --port 5178 <harness.html> → chrome --headless --screenshot
# ЖЕСТ (drag/rotate): harness с LadeplanScreen → chrome --remote-debugging-port=9222 → CDP Input.dispatchMouseEvent
```
