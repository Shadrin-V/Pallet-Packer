# Дизайн: qrd.7 — Оркестратор упаковки и распределение заявки

Дата: 2026-07-10 · Задача: `LKWkalk-qrd.7` · Статус: дефолты приняты пользователем (директива автономии)

Связывает floor-упаковку (`packFloor`, qrd.4), вертикальный расчёт (`computeVerticalStack`, qrd.5) и
зонирование по заказам ([ADR 011](../../adr/011-order-grouping.md)) в единый расчёт `Layout`.
Опирается на [ADR 005](../../adr/005-order-fulfillment-mode.md) (режим «Размести заявку»),
[ADR 012](../../adr/012-loading-modes.md) (loadingMode), [ADR 014](../../adr/014-nested-column-geometry.md)
(геометрия колонок). Контракт уже описывает `orderId` (0.3.0) и `loadingMode` (0.4.0) — код догоняет.

## 1. Публичная поверхность (внутренняя для пакета)

```ts
export function packLoad(load: Load): Layout;
```
`packLoad` — оркестратор; публичный `calculateLayout` + `getLayoutReport` (qrd.10) обернут его позже.
Проценты метрик (`floorFillPercent`, `volumeFillPercent`) вычисляет qrd.8 — здесь они `0`
(заполняются позже); `totalPlaced` и `usedFloorPositions` считаются здесь.

## 2. Модель (аддитивно, контракт 0.4.0 в коде)

- `CargoType.orderId?: string` (ADR 011).
- `Load.loadingMode?: LoadingMode` + `type LoadingMode = 'rear' | 'side' | 'combined'` (ADR 012).
- `ENGINE_CONTRACT_VERSION` в `src/index.ts`: `0.2.0 → 0.4.0`.

## 3. Геометрия — column-aware ([ADR 014](../../adr/014-nested-column-geometry.md))

`findGeometryViolations` (qrd.9): пара боксов с одинаковыми `(x, y, cargoTypeId)` — одна вложенная/
штабельная колонка, между собой на пересечение НЕ проверяется. Остальное (разные колонки, типы,
горизонталь, габариты, ориентация) — как раньше. Инвариант [spec.md](../../spec.md) уточняется.

## 4. Алгоритм `packLoad`

`loadingMode = load.loadingMode ?? 'combined'` (контрактный дефолт, ADR 012); `clearance = load.clearance ?? 0`.

### 4.1 Зоны по orderId (смежные по длине)
- Группировка `load.cargo` по `orderId`; `orderId === undefined` → одна неявная группа.
- Порядок зон = порядок первого появления `orderId` в списке. Внутри зоны типы — в стабильном
  порядке списка.

### 4.2 Аллокация зон вдоль длины
`xOffset = 0`. Для каждой зоны по порядку:
1. `region = { length: vehicle.length − xOffset, width: vehicle.width }` (остаток пола).
2. Для каждого типа зоны: `S = computeVerticalStack(cargo, vehicle.height).count` (единиц в колонке).
   `positionsNeeded = fill ? BIG : ceil(quantity / S)` (при `S=0` тип не размещается).
3. `FloorRequest[]`: сперва типы с `quantity` (порядок списка), затем `fill`-типы. `packFloor(region,
   requests, { clearance, loadingMode })`.
4. Сдвиг координат placement'ов на `+xOffset` по `x`. `xOffset += maxX + (maxX>0 ? clearance : 0)`,
   где `maxX = max(fp.x + fp.dx)` в зоне (0 если зона пуста).

Заказ не влезает целиком → размещается что влезло, остаток → `unplaced` (директива). Смежность зон —
1D вдоль длины. Замечание о плотности: контрактный дефолт — `combined` (плотнейшая из rear/side).
Для многозонных загрузок (зоны смежны по длине кузова) `rear` (полки по ширине, рост вдоль длины)
даёт бóльшую плотность, но дефолтом остаётся `combined`; кому нужна максимальная плотность на
мультизаказах — передаёт `loadingMode: 'rear'` явно (документированное ограничение MVP).

### 4.3 Колонка → per-tier Placements
Для каждого напольного места (из `packFloor`: `cargoTypeId, x, y, dx, dy, orientation`) и типа:
- `units = min(S, remainingQuantity)` (для `fill` — `S`), убыль `remainingQuantity`.
- Эмитим `units` placement'ов, ярус `t = 1..units`, высота `z` по вертикальному расчёту:
  - `entschachtelt`: `z = (t−1)·H` (не пересекаются).
  - `sequential`/`pairwise`: `z = (t−1)·step` (колонка ≤ `Hк` гарантирована qrd.5; пересечения
    внутри колонки допускает column-aware валидатор). `state` = состояние типа.
- `unplaced[type] = quantity − placedUnits` (для `fill` — 0; неразмещённые floor-места учтены).

### 4.4 Сборка `Layout`
`placements` (все зоны), `unplaced` (ненулевые), `contractVersion = ENGINE_CONTRACT_VERSION`,
`metrics = { totalPlaced, usedFloorPositions, floorFillPercent: 0, volumeFillPercent: 0 }`.

## 5. Инварианты (не срезать)
- **Детерминизм:** без `Math.random`/`Date`; стабильные порядки → идентичный вход даёт идентичный
  `Layout`.
- **Геометрия на КАЖДОМ результате:** `findGeometryViolations(load, packLoad(load)) === []` —
  property-тест + по-кейсовые.
- Правила `nesting`/`stacking`/`rotation` типа не нарушаются (наследуются из qrd.4/qrd.5/qrd.6).

## 6. Тесты (TDD)
1. Модель: типы принимают `orderId`/`loadingMode`; `ENGINE_CONTRACT_VERSION === '0.4.0'`.
2. Геометрия column-aware: две единицы одного типа в одной `(x,y)` не флагаются; разные `(x,y)`
   или разные типы с пересечением — флагаются; регрессия qrd.9 зелёная.
3. Вертикаль→placements: `entschachtelt` H=1000, Hк=2650 → 2 яруса z=0,1000; nested — верх ≤ Hк.
4. Оркестратор — точные кейсы:
   - Один тип, `quantity`, `entschachtelt`: floor-места × ярусы = placed; `2×2×2` кузов, `1×1×1`
     груз → 8 (тривиальный из CLAUDE.md).
   - `fill: true` покрывает остаток; `unplaced` корректен; «ничего не влезает» → все в `unplaced`.
   - Смешанные типы; два `orderId` → зоны смежны по `x` (первая зона при `x < xOffset2`), обе
     непересекающиеся.
   - `loadingMode` из `Load` доходит до packFloor (дефолт `combined`; при явном `rear` раскладка растёт вдоль x).
5. **Property-based (fast-check):** случайные `Load` → `findGeometryViolations === []`; `totalPlaced ≤
   Σ quantity`; детерминизм (два прогона равны).

## 7. Файлы
- Создать: `packages/engine/src/packing/orchestrator.ts` (+ `.test.ts`).
- Изменить: `model/types.ts` (`orderId`, `loadingMode`, `LoadingMode` в constants), `src/index.ts`
  (версия 0.4.0), `geometry/geometry.ts` (column-aware) + `geometry.test.ts`, `spec.md` (инвариант).
- `orchestrator.ts` — внутренний; публичный `index.ts` расширит qrd.10.

## 8. Границы
- `calculateLayout`/`getLayoutReport`/валидация-на-входе — qrd.10. Проценты метрик — qrd.8.
- Гибрид зон разной осью, LIFO-очередность точек, переворот на грань — пост-MVP.
