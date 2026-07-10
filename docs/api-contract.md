# Контракт API движка — Pallet Packer

> Граница между ядром `@shadrin-v/engine`, UI (Lovable) и будущим MCP-сервером.
> Это источник истины по формам входа/выхода. **Ломающее изменение → ADR + правка этого файла
> до реализации.** Версия контракта: `0.4.0` (аддитивно; полная история версий — в конце файла).

Единицы: все линейные размеры — **целые миллиметры**. Координаты — от угла грузового отсека
(`x` — длина, `y` — ширина, `z` — высота). Движок текст не возвращает — только данные и коды ошибок.

## 1. Типы данных

### Vehicle
```ts
interface Vehicle {
  id: string;
  name: string;          // ключ/метка; локализация — на стороне UI
  length: number;        // мм, > 0
  width: number;         // мм, > 0
  height: number;        // мм, > 0
  maxPayload?: number;   // кг; опц.; в MVP не проверяется
}
```

### CargoType
```ts
type RotationRule = 'none' | 'yawOnly' | 'full';
type NestingState = 'verschachtelt' | 'entschachtelt';

interface CargoType {
  id: string;
  name: string;
  length: number;        // мм, > 0
  width: number;         // мм, > 0
  height: number;        // мм, > 0 (H базовой единицы)
  quantity: number;      // требуемое количество (>= 0)
  fill?: boolean;        // true → «разместить как можно больше», quantity игнорируется
  rotation: RotationRule;
  stacking: { stackable: boolean; maxTiers?: number };
  nesting: {
    nestable: boolean;
    /** sequential → Δh (прирост на вложение); pairwise → h_д (высота двух верхних досок), мм */
    stepHeight?: number;
    maxNested?: number;
    nestingMode?: 'sequential' | 'pairwise'; // default 'sequential' (ADR 009)
    allowUnpairedTop?: boolean;              // default false; только pairwise
  };
  state: NestingState;   // состояние вложенности данного типа
  orderId?: string;      // группа заказа/клиента; позиции с одним orderId — смежной зоной (ADR 011)
  weightPerUnit?: number;// кг; опц.; в MVP не используется
}
```

### Load (запрос)
```ts
type LoadingMode = 'rear' | 'side' | 'combined';  // сторона загрузки (ADR 012)

interface Load {
  vehicle: Vehicle;
  cargo: CargoType[];
  clearance?: number;         // мм, равномерный зазор; по умолчанию 0
  loadingMode?: LoadingMode;  // сторона загрузки; default 'combined' (ADR 012)
  objective?: 'maxUnits';     // MVP: только maxUnits
}
```

**Семантика `fill`:** позиции с `quantity` размещаются первыми в порядке списка; позиции с
`fill: true` занимают весь оставшийся объём после них (если `fill` у нескольких — делят остаток
в порядке списка). Частый случай — один тип с `fill: true`.

### Layout (результат)
```ts
type Orientation = 'lwh' | 'wlh' | /* при rotation:full */ 'lhw' | 'hlw' | 'whl' | 'hwl';

interface Placement {
  cargoTypeId: string;
  x: number; y: number; z: number;   // мм, угол единицы
  orientation: Orientation;
  tier: number;                       // ярус (1 — нижний)
  state: NestingState;
}

interface Layout {
  placements: Placement[];
  unplaced: { cargoTypeId: string; count: number }[];
  metrics: {
    totalPlaced: number;
    usedFloorPositions: number;
    floorFillPercent: number;   // 0..100
    volumeFillPercent: number;  // 0..100
  };
  contractVersion: string;      // напр. "0.3.0"
}
```

### Report (для отображения/экспорта)
```ts
interface Report {
  layout: Layout;
  perType: { cargoTypeId: string; requested: number; placed: number; unplaced: number }[];
  // только данные и коды; человекочитаемый текст собирается UI через i18n
}
```

## 2. Операции (= будущие MCP-инструменты)

| Операция            | Вход                 | Выход             | Назначение                              |
|---------------------|----------------------|-------------------|-----------------------------------------|
| `listVehicles`      | —                    | `Vehicle[]`       | Пресеты + пользовательские кузова        |
| `upsertVehicle`     | `Vehicle`            | `Vehicle`         | Создать/обновить кузов                    |
| `listCargoTypes`    | —                    | `CargoType[]`     | Пресеты + пользовательские типы поддонов  |
| `upsertCargoType`   | `CargoType`          | `CargoType`       | Создать/обновить тип поддона              |
| `calculateLayout`   | `Load`               | `Layout`          | Основной расчёт раскладки                  |
| `getLayoutReport`   | `Layout`             | `Report`          | Сборка структуры отчёта                    |

В MVP `list/upsert` работают против браузерного хранилища (IndexedDB) на стороне UI; чистая
функция ядра — `calculateLayout` и `getLayoutReport`. Формы входа/выхода стабильны для всех сред.

## 3. Коды ошибок

Возвращаются движком при валидации; текст — на стороне UI.

| Код                         | Условие                                               |
|-----------------------------|-------------------------------------------------------|
| `ERR_INVALID_DIMENSION`     | Размер ≤ 0 или не целое число мм                       |
| `ERR_CARGO_EXCEEDS_VEHICLE` | Габарит единицы (в любой разрешённой ориентации) > кузова |
| `ERR_INVALID_QUANTITY`      | `quantity` < 0 и не задан `fill`                       |
| `ERR_INVALID_NESTING`       | `nestable:true` без корректного `stepHeight` (0..H)    |
| `ERR_INVALID_ROTATION`      | Неизвестный режим вращения                             |
| `ERR_EMPTY_LOAD`            | `cargo` пуст                                           |
| `ERR_UNKNOWN_VEHICLE`       | Кузов не найден в хранилище (для list/upsert-сценариев)|

Ошибка — структура `{ code: string; details?: Record<string, unknown> }`; несколько ошибок
валидации возвращаются списком.

## 4. MCP-готовность

Каждая операция раздела 2 отображается в будущий MCP-инструмент один-к-одному; входы/выходы уже
описаны формами выше и будут выражены JSON-схемами. Гранулярность выбрана под сценарии агентов
(«рассчитай загрузку по этому списку»): `calculateLayout` принимает полный `Load` за один вызов,
`list/upsert` управляют справочниками. Реализация MCP-сервера — отдельный будущий эпик; ядро при
этом не меняется. Ломающие изменения контракта проходят через ADR.

## 5. Правила эволюции контракта

- Аддитивные изменения (новые опц. поля) — минорная версия контракта.
- Ломающие изменения (переименование/удаление/смена семантики) — ADR + мажорная версия +
  синхронная правка UI и (в будущем) REST/MCP.
- `contractVersion` в `Layout` позволяет клиентам проверять совместимость.

### История версий
- `0.4.0` — добавлен `Load.loadingMode` (режимы загрузки rear/side/combined; default `combined`,
  [ADR 012](adr/012-loading-modes.md)).
- `0.3.0` — добавлен `CargoType.orderId` (группировка по заказам, [ADR 011](adr/011-order-grouping.md)).
- `0.2.0` — добавлены `nestingMode`, `allowUnpairedTop`; `stepHeight` переинтерпретируется как h_д
  для `pairwise` (аддитивно, [ADR 009](adr/009-pairwise-nesting-model.md)).
- `0.1.0` — исходный контракт.
