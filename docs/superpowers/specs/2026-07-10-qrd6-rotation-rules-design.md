# Дизайн: qrd.6 — правила вращения (none / yawOnly / full)

Дата: 2026-07-10 · Задача: `LKWkalk-qrd.6` · Статус: одобрено пользователем (brainstorming)

Интеграция трёх режимов вращения в упаковку + централизация rotation-логики. Опирается на
[ADR 013](../../adr/013-rotation-mvp-yaw.md) (`full` ≈ yaw в упаковщике, переворот отложен) и
[ADR 003](../../adr/003-2p5d-computation-model.md) (2.5D). Контракт не меняется.

## 1. Наблюдение: упаковщик уже знает про режимы

После `LKWkalk-qrd.4` `floor.ts:chooseOrientation` уже трактует все три режима: `none` → только `lwh`;
`yawOnly`/`full` → выбор max-fit из `{lwh, wlh}`. Задача qrd.6 — не «научить с нуля», а **зафиксировать
семантику тестами и убрать дублирование**.

## 2. Единый модуль `model/orientation.ts` (новый)

Единственный источник маппинга «режим → ориентации» и ось-маппинга:

```ts
import type { Orientation, RotationRule } from './constants';

/** Номинально разрешённые ориентации режима (лояльная валидация; full → все 6). */
export function allowedOrientations(rotation: RotationRule): Orientation[];
//   none → ['lwh']; yawOnly → ['lwh','wlh']; full → ['lwh','wlh','lhw','hlw','whl','hwl']

/** Напольные (yaw) ориентации, которые кладёт упаковщик MVP (full ≈ yaw). */
export function floorOrientations(rotation: RotationRule): Array<'lwh' | 'wlh'>;
//   none → ['lwh']; yawOnly | full → ['lwh','wlh']

/** Ось-маппинг: ориентация (порядок l/w/h → x/y/z) → (dx, dy, dz) от базовых размеров. */
export function orientedDims(l: number, w: number, h: number, orientation: Orientation): [number, number, number];
```

Разделение `allowedOrientations` (номинально) vs `floorOrientations` (реальная укладка MVP) прямо
кодирует решение «валидация лояльна, упаковщик yaw» ([ADR 013](../../adr/013-rotation-mvp-yaw.md)).

## 3. Рефактор потребителей (поведение НЕ меняется)

- **`geometry.ts`** — удалить локальные `allowedOrientations` и `orientedDims`; импортировать из
  `model/orientation`. Вызов становится `orientedDims(cargo.length, cargo.width, cargo.height, p.orientation)`.
- **`validate.ts`** — `orientationTriples(cargo)` перестаёт хардкодить 6 триплетов:
  `allowedOrientations(cargo.rotation).map((o) => orientedDims(cargo.length, cargo.width, cargo.height, o))`.
- **`floor.ts`** — в `chooseOrientation` заменить `canYaw = rotation === 'yawOnly' || rotation === 'full'`
  на использование `floorOrientations(rotation)`: если вернулись обе yaw-ориентации — выбор max-fit;
  если только `lwh` — без свапа. Поведение (EUR 34, none → 33) сохраняется.

Существующие тесты `geometry`/`validate`/`floor` — сеть безопасности рефактора (поведение прежнее).

## 4. Семантика MVP (для документации и тестов)

- `none` — исходная ориентация (`lwh`), не меняется никогда.
- `yawOnly` — обмен L↔W (`lwh`/`wlh`), выбор по max-влезанию.
- `full` — **в упаковщике = yaw** (как `yawOnly`); переворот на грань отложен (пост-MVP).
- Лояльная валидация: `full`-груз, влезающий в кузов только перевёрнутым на грань, проходит
  `fitsInVehicle`, но упаковщик кладёт yaw → он в `unplaced` **без ошибки** (ограничение MVP).
- Инвариант: упаковщик порождает только `lwh`/`wlh` — оба допустимы при `yawOnly`/`full`; при `none`
  только `lwh`. Недопустимые ориентации не порождаются никогда.

## 5. Тесты (TDD)

- **`model/orientation.test.ts` (новый):**
  - `allowedOrientations`: `none`→1 (`['lwh']`), `yawOnly`→2, `full`→6 (точный список).
  - `floorOrientations`: `none`→`['lwh']`; `yawOnly`→`['lwh','wlh']`; `full`→`['lwh','wlh']`.
  - `orientedDims`: проверка каждого из 6 маппингов (напр. `lhw` от `(l,w,h)` → `[l,h,w]`).
- **`floor.test.ts` (дополнить):**
  - `full` в упаковщике: EUR `1200×800` `rotation:'full'` на `13600×2430` → **34** (как `yawOnly`, ориентация `wlh`).
  - `none`: ориентация всех placement — `lwh` (не меняется).
- **Регрессия:** `geometry.test.ts`, `validate.test.ts`, `floor.test.ts` (все прежние) остаются
  зелёными после рефактора — доказывает сохранение поведения.
- **Приёмка qrd.6:** кейс на каждый режим; `none` не меняет ориентацию; недопустимые ориентации не
  используются.

## 6. Документация и границы

- **ADR 013** (новый) — `full` ≈ yaw в MVP-упаковщике, лояльная валидация, единый rotation-модуль.
- Пометка ограничения (`full` tipped-only → `unplaced`) в `spec.md` инвариантах.
- **Контракт не меняется** (`RotationRule`/`Orientation` те же; версия 0.4.0).
- **Вне qrd.6:** настоящий переворот на грань (6 ориентаций в укладке + переменная высота в вертикали)
  — пост-MVP; `full`/`orderId`/`loadingMode` в оркестраторе — qrd.7.

## 7. Файлы

- Создать: `packages/engine/src/model/orientation.ts`, `packages/engine/src/model/orientation.test.ts`.
- Изменить: `geometry.ts`, `validation/validate.ts`, `packing/floor.ts` (рефактор на общий модуль);
  дополнить `packing/floor.test.ts`.
- Экспорт `orientation.ts` из `model/index.ts` — опционально (внутренний потребитель); держим модуль
  доступным для geometry/validate/floor. Публичную поверхность `index.ts` не расширяем.
