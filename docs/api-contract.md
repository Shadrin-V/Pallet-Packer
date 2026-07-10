# Контракт API движка — Pallet Packer

> Граница между ядром `@shadrin-v/engine`, UI (Lovable) и будущим MCP-сервером.
> Это источник истины по формам входа/выхода. **Ломающее изменение → ADR + правка этого файла
> до реализации.** Версия контракта: `0.9.0` (аддитивно; полная история версий — в конце файла).

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
  contractVersion: string;      // напр. "0.5.0"
  errors?: EngineError[];       // непусто → вход не прошёл валидацию; layout пустой (см. §3)
}

interface EngineError {          // коды из §3; текст собирает UI через i18n
  code: string;
  details?: Record<string, unknown>;
}
```

`calculateLayout` при непройденной валидации возвращает **пустой** `Layout` (без размещений,
метрики = 0) с заполненным `errors`; при успехе `errors` отсутствует. UI различает случаи по
наличию `errors`.

### StackPreview (промежуточный шаг 2.5D)
```ts
interface StackPreview {   // единицы в ОДНОМ вертикальном штабеле (ADR 003), до 2D-раскроя пола
  count: number;           // поддонов в штабеле (после лимитов)
  height: number;          // высота штабеля, мм
  mode: 'entschachtelt' | 'sequential' | 'pairwise';
  pairs?: number;          // только pairwise: число вложенных пар над нижним одиночным
  unpairedTop?: boolean;   // только pairwise: одиночный поддон сверху
  // Операнды формулы (0.7.0) — UI рендерит вывод «как получено N» без дублирования логики:
  base: number;            // H (высота базовой единицы), мм
  hold: number;            // Hк (высота кузова), мм
  stepHeight?: number;     // эффективный шаг: Δh (sequential) / h_д (pairwise), мм; нет у entschachtelt
  rawCount: number;        // count ДО лимитов maxTiers/maxNested/нештабелируемости (сырое вмещение)
  cappedBy?: 'maxTiers' | 'maxNested' | 'notStackable';  // какой лимит урезал rawCount до count
  cap?: number;            // числовой лимит (maxTiers/maxNested); отсутствует для 'notStackable'
}
```

`computeStack` считает вертикальный штабель одного типа (2.5D: сначала штабель, потом 2D-раскладка
штабелей — та же модель, что внутри `calculateLayout`). Чистая функция для предпросмотра эффекта
`stepHeight`/режима вложения до полного расчёта; при `H ≤ 0` или `Hк < H` вернёт `count: 0`. Поля
`base/hold/stepHeight/rawCount/cappedBy/cap` дают UI все числа, чтобы показать читаемую формулу
вывода штабеля (кнопка «рассчитать штабель») без повторения доменной логики в UI.

### GeometryViolation (проверка раскладки)
```ts
interface GeometryViolation {
  kind: 'out-of-bounds' | 'overlap' | 'orientation';
  details: Record<string, unknown>;   // cargoTypeId, координаты и т.п. (для подсветки в UI)
}
```

`findGeometryViolations(load, layout)` возвращает `[]` для валидной раскладки, иначе по нарушению на
проблему. Пригодно как для результата движка, так и для **отредактированной вручную** раскладки
(перетаскивание штабелей в UI): единицы не выходят за габариты, не пересекаются (единицы одной
`(x,y,cargoTypeId)`-колонки делят колонку законно, [ADR 014](adr/014-nested-column-geometry.md)),
ориентация допустима правилом вращения.

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
| `computeStack`      | `CargoType`,`Vehicle`| `StackPreview`    | Предпросмотр вертикального штабеля (2.5D)   |
| `orientedDims`      | `l,w,h,Orientation`  | `[dx,dy,dz]`      | Габариты единицы в ориентации (для отрисовки видов) |
| `findGeometryViolations` | `Load`,`Layout` | `GeometryViolation[]` | Проверка (в т.ч. отредактированной вручную) раскладки |

В MVP `list/upsert` работают против браузерного хранилища (IndexedDB) на стороне UI; чистая
функция ядра — `calculateLayout` и `getLayoutReport`. Формы входа/выхода стабильны для всех сред.

## 3. Коды ошибок

Возвращаются движком при валидации; текст — на стороне UI.

| Код                         | Условие                                               |
|-----------------------------|-------------------------------------------------------|
| `ERR_INVALID_DIMENSION`     | Размер ≤ 0 или не целое число мм                       |
| `ERR_CARGO_EXCEEDS_VEHICLE` | Габарит единицы (в любой разрешённой ориентации) > кузова |
| `ERR_INVALID_QUANTITY`      | `quantity` < 0 и не задан `fill`                       |
| `ERR_INVALID_NESTING`       | `nestable:true` без корректного `stepHeight` (целое `0 < stepHeight ≤ H`) |
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
- `0.9.0` — экспонирована `findGeometryViolations(Load, Layout) → GeometryViolation[]`: проверка
  геометрии раскладки (в т.ч. отредактированной вручную) для интерактивного перемещения штабелей.
  Аддитивно, чистая функция (`LKWkalk-qrd.30`).
- `0.8.0` — экспонирована `orientedDims(l, w, h, Orientation) → [dx, dy, dz]`: габариты единицы в
  её ориентации; UI рисует виды сверху/сбоку из `Layout` без дублирования маппинга ориентаций.
  Аддитивно, чистая функция (`LKWkalk-qrd.14`).
- `0.7.0` — `StackPreview` расширен операндами формулы (`base`, `hold`, `stepHeight`, `rawCount`,
  `cappedBy`, `cap`): UI показывает читаемый вывод «как получено N поддонов в штабеле» без дублирования
  доменной логики. Аддитивно (`LKWkalk-qrd.26`).
- `0.6.0` — добавлена операция `computeStack(CargoType, Vehicle) → StackPreview`: предпросмотр
  вертикального штабеля (промежуточный шаг 2.5D — сколько поддонов в одном штабеле — до 2D-раскроя).
  Аддитивно, чистая функция, поведение расчёта не меняет (`LKWkalk-qrd.25`).
- `0.5.0` — добавлено опц. `Layout.errors` (`EngineError[]`): канал кодов валидации в результате
  `calculateLayout` (пустой layout + коды при невалидном входе). Аддитивно, поведение успешного
  расчёта не меняется (`LKWkalk-qrd.10`).
- `0.4.0` — добавлен `Load.loadingMode` (режимы загрузки rear/side/combined; default `combined`,
  [ADR 012](adr/012-loading-modes.md)).
- `0.3.0` — добавлен `CargoType.orderId` (группировка по заказам, [ADR 011](adr/011-order-grouping.md)).
- `0.2.0` — добавлены `nestingMode`, `allowUnpairedTop`; `stepHeight` переинтерпретируется как h_д
  для `pairwise` (аддитивно, [ADR 009](adr/009-pairwise-nesting-model.md)).
- `0.1.0` — исходный контракт.
