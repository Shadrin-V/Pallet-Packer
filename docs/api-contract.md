# Контракт API движка — Pallet Packer

> Граница между ядром `@shadrin-v/engine`, UI (Lovable) и будущим MCP-сервером.
> Это источник истины по формам входа/выхода. **Ломающее изменение → ADR + правка этого файла
> до реализации.** Версия контракта: `0.15.0` (ломающее; полная история версий — в конце файла).

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
  forkAccess?: 'all4' | 'twoSides';  // доступ погрузчика; default 'all4' (без ограничения) (ADR 018)
  forkAxis?: 'length' | 'width';     // ось захода вил; default 'length'; значим при forkAccess:'twoSides'
  weightPerUnit?: number;// кг; опц.; в MVP не используется
}
```

**Семантика `forkAccess`** ([ADR 018](adr/018-fork-access-orientation.md)): `'all4'` (default) —
стопка доступна погрузчику со всех сторон, ограничения ориентации нет. `'twoSides'` — доступны только
две противоположные стороны (нормальные оси `forkAxis` поддона); упаковщик обязан поставить стопку
доступной парой к двери загрузки. При `loadingMode: 'rear'` это пиннит ориентацию (ось захода вдоль
`x`), при `'side'` — вдоль `y`, при `'combined'` — не ограничивает (годятся обе yaw-ориентации).
Ограничение жёсткое: соблюдается прежде плотности. Отсутствие поля = `'all4'` = текущее поведение.

### Load (запрос)
```ts
type LoadingMode = 'rear' | 'side' | 'combined';        // сторона загрузки (ADR 012)
type OrderGrouping = 'strict' | 'densityFirst';        // смежность зон заказов (ADR 016)

interface Load {
  vehicle: Vehicle;
  cargo: CargoType[];
  clearance?: number;             // мм, равномерный зазор; по умолчанию 0
  loadingMode?: LoadingMode;      // сторона загрузки; default 'combined' (ADR 012)
  orderGrouping?: OrderGrouping;  // смежность зон заказов; default 'strict' (ADR 016)
  objective?: 'maxUnits';         // MVP: только maxUnits
}
```

**Семантика `fill`:** позиции с `quantity` размещаются первыми в порядке списка; позиции с
`fill: true` занимают весь оставшийся объём после них (если `fill` у нескольких — делят остаток
в порядке списка). Частый случай — один тип с `fill: true`.

**Семантика `orderGrouping`** ([ADR 016](adr/016-order-grouping-density-toggle.md)):
`'strict'` (default) — позиции одного `orderId` размещаются смежной зоной, заказ выгружается целиком
([ADR 011](adr/011-order-grouping.md)); `'densityFirst'` — `orderId` перестаёт ограничивать раскладку
(остаётся только для окраски/легенды/отчёта), заказ может быть разбит по кузову. Отсутствие поля =
`'strict'`, поэтому существующие вызовы и сохранённые планы считаются как прежде.

**Порядок списка `cargo` — приоритет заявки** ([ADR 017](adr/017-dense-floor-heuristic.md)): под
давлением места в `unplaced` уходят позиции с конца списка, а не самые мелкие. Упаковщик запросы не
переупорядочивает (сорт по убыванию площади из ранней редакции ADR 004 признан отменённым —
плотность достигается best-fit/backfill без переупорядочивания).

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
  kind: 'out-of-bounds' | 'overlap' | 'orientation' | 'fork-access';
  details: Record<string, unknown>;   // cargoTypeId, координаты и т.п. (для подсветки в UI)
}
```

`fork-access` ([ADR 018](adr/018-fork-access-orientation.md)): двусторонняя стопка (`forkAccess:
'twoSides'`) стоит не той парой к двери при односторонней загрузке (`loadingMode` rear/side) —
физически не снимается. Ручной поворот (`rotateStack`), нарушающий доступ, отклоняется этим же
инвариантом.

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

### Article (каталог артикулов, провенанс полей ERPNext, [ADR 022](adr/022-article-name-provenance-and-confirm-patterns.md))
```ts
/** Поля, которые ERPNext способен прислать для артикула. */
const ARTICLE_ERP_FIELDS = ['length', 'width', 'height', 'name'] as const;
type ArticleErpField = (typeof ARTICLE_ERP_FIELDS)[number];
```

`Article.erpFields: readonly ArticleErpField[]` — какие поля ERPNext ФАКТИЧЕСКИ прислал для этого
артикула; эти и только эти заперты от локальной правки. Поле, отсутствующее в списке, редактируется
всегда, даже у артикула с `source: 'erp'`. Список решает сервер; клиент не имеет права выводить его
из `source` плюс «значение непустое».

`'name'` в списке означает, что имя пришло из ERPNext и `upsertArticle` его не перезапишет.
Переименование локального артикула (имени в списке нет) продолжает работать.

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
| `moveStack`         | `Load`,`Layout`,`StackRef`,`x`,`y` | `EditResult` | Ручная правка: перенести стопку ([ADR 019](adr/019-manual-layout-editing-api.md)) |
| `rotateStack`       | `Load`,`Layout`,`StackRef` | `EditResult` | Ручная правка: повернуть стопку на 90° (yaw) |
| `unplaceStack`      | `Load`,`Layout`,`StackRef` | `EditResult` | Снять стопку с пола → единицы уходят в `unplaced` |
| `placeStack`        | `Load`,`Layout`,`PlaceStackSpec` | `EditResult` | Поставить стопку из неразмещённых в `(x,y)` |
| `stackBuffer`       | `Load`,`Layout`      | `BufferStack[]`   | Неразмещённое, собранное в стопки (буфер) |

В MVP `list/upsert` работают против браузерного хранилища (IndexedDB) на стороне UI; чистая
функция ядра — `calculateLayout` и `getLayoutReport`. Формы входа/выхода стабильны для всех сред.

### Операции ручной правки (0.12.0, [ADR 019](adr/019-manual-layout-editing-api.md))

Алгебра правок раскладки — в ядре: UI отвечает за указатель и snap, правила — за движком.

```ts
interface StackRef { cargoTypeId: string; x: number; y: number }   // колонка = cargoTypeId + x + y

interface PlaceStackSpec {
  cargoTypeId: string;
  x: number;
  y: number;
  orientation: 'lwh' | 'wlh';   // только yaw (ADR 013)
  units?: number;               // по умолчанию — полная стопка, но не больше, чем есть в unplaced
}

interface EditResult { layout: Layout; error?: EngineError }        // отказ → ИСХОДНЫЙ layout + код

interface BufferStack { cargoTypeId: string; units: number }        // порядок = порядок cargo в Load
```

**Инварианты правок.** Любой результат геометрически валиден (`findGeometryViolations === []`),
иначе операция отказывает и возвращает исходный `layout` с кодом причины. Правила
`nesting`/`stacking`/`rotation`/`forkAccess` не ослабляются. Колонка строится тем же кодом, что и у
упаковщика (высота — `computeVerticalStack`, `z` ярусов — ADR 003/009), поэтому ручная стопка не
может быть выше расчётной. Баланс сохраняется: `placed + unplaced` по типу неизменен —
`unplaceStack` возвращает единицы в `unplaced`, `placeStack` вычитает их оттуда. Метрики
пересчитывает ядро.

### Магнит постановки (0.13.0, [ADR 020](adr/020-magnet-drop-resolution.md))

Отвечает на один вопрос: **куда стопка имеет право встать**, если целились сюда. Чистая функция —
её зовут на каждом движении указателя, чтобы показать исход до отпускания.

```ts
interface DropResolution {
  x: number;                 // куда реально ляжет (примагничено)
  y: number;
  ok: boolean;
  error?: EngineError;       // почему нет, когда !ok
  blocking: StackRef[];      // кто мешает в точке прицела — для подсветки; пусто при ok
}

interface ResolveDropOptions {
  tolerance?: number;        // мм; по умолчанию — половина меньшей стороны стопки
  exclude?: StackRef;        // перенос своей же стопки: не считать её помехой
}

resolveDrop(load: Load, layout: Layout, spec: PlaceStackSpec, opts?: ResolveDropOptions): DropResolution
```

Кандидаты: прицел, обе стенки, позиции **впритык** к кромкам соседей — внутри кузова и в пределах
`tolerance` от прицела. Выбор: больше «впритык»-осей → ближе к прицелу → `(x, y)` по возрастанию
(детерминизм).

**Границы.** `resolveDrop` решает вопрос позиции. Ориентацию и доступ вил она проверяет (при них ни
одна позиция не годится — искать незачем), а наличие свободных единиц — **нет**: это не вопрос
позиции и бессмыслен при переносе. `ERR_EDIT_NOTHING_TO_PLACE` остаётся за `placeStack`.

**Инвариант.** Если `resolveDrop` вернула `ok`, `placeStack` по этой точке не отказывает (при наличии
единиц). `placeStack`/`moveStack` при этом **остаются строгими**: они судят ту точку, которую им дали,
и никогда не двигают груз сами — магнит вызывается отдельно и до них.

### Групповые правки (0.14.0, [ADR 021](adr/021-group-layout-edits.md))

Операции над несколькими стопками сразу. Отказ — всегда целиком: возвращается исходная
раскладка и код ошибки, полуприменённого состояния не бывает.

```ts
interface GroupAim { dx: number; dy: number }

interface GroupDropResolution {
  dx: number;
  dy: number;
  ok: boolean;
  error?: EngineError;
  /** Невыделенные стопки, мешающие в прицельной дельте. Пусто при ok. */
  blocking: StackRef[];
}

/** Опции группового магнита. */
interface GroupDropOptions {
  /** Насколько далеко магнит может подтянуть, мм. Применяется одинаково ко всем участницам —
   *  группа жёсткая. По умолчанию: значение самой тесной стопки (половина её короткой стороны). */
  tolerance?: number;
}

unplaceStacks(load: Load, layout: Layout, refs: StackRef[]): EditResult
moveStacks(load: Load, layout: Layout, refs: StackRef[], dx: number, dy: number): EditResult
resolveGroupDrop(
  load: Load,
  layout: Layout,
  refs: StackRef[],
  aim: GroupAim,
  opts?: GroupDropOptions,
): GroupDropResolution
```

`moveStacks` принимает дельту, а не целевые координаты: взаимное расположение группы
сохраняется по построению. Повторяющиеся `refs` считаются одной стопкой (выделение — множество).

Пустой `refs` и дельта `(0, 0)` для валидных `refs` — успешные no-op: возвращается исходная
раскладка без ошибки. Дельта `(0, 0)` с ref, не называющим ни одной колонки, — по-прежнему отказ
(`ERR_EDIT_NO_STACK`): ref проверяется до короткого пути нулевой дельты.

Коды ошибок — существующие: `ERR_EDIT_NO_STACK`, `ERR_EDIT_OUT_OF_BOUNDS`, `ERR_EDIT_OVERLAP`.

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
| `ERR_EDIT_NO_STACK`         | Правка: по `StackRef` нет колонки                      |
| `ERR_EDIT_OVERLAP`          | Правка: футпринт пересекает другую стопку               |
| `ERR_EDIT_OUT_OF_BOUNDS`    | Правка: стопка выходит за габарит кузова                |
| `ERR_EDIT_FORK_ACCESS`      | Правка: ориентация ломает доступ погрузчика при текущем `loadingMode` (ADR 018) |
| `ERR_EDIT_ROTATION`         | Правка: тип запрещает вращение или колонка не yaw-однородна |
| `ERR_EDIT_NOTHING_TO_PLACE` | Правка: у типа нет неразмещённых единиц                 |

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
- `0.15.0` — **ломающее (типы, не провод):** `ARTICLE_CONSTRUCTIVE_FIELDS` → `ARTICLE_ERP_FIELDS`,
  `ArticleConstructiveField` → `ArticleErpField`, и в список добавлено `'name'`. На проводе
  `erpFields` остаётся массивом строк, но теперь может содержать `"name"` — потребитель, который
  исчерпывающе разбирает это поле, обязан обновиться. Провенанс имени делает переименование
  ERP-артикула через `upsertArticle` невозможным (`LKWkalk-yxn`).
- `0.14.0` — добавлены групповые правки: `unplaceStacks`, `moveStacks`, `resolveGroupDrop`,
  типы `GroupAim`, `GroupDropResolution`, `GroupDropOptions`. Аддитивно: одиночные операции и их
  поведение не менялись. `ENGINE_CONTRACT_VERSION` → `0.14.0` (`LKWkalk-dwc.6`).
- `0.13.0` — добавлен магнит постановки: `resolveDrop`, типы `DropResolution`, `ResolveDropOptions`
  ([ADR 020](adr/020-magnet-drop-resolution.md)). Аддитивно: существующие операции и типы не менялись,
  `placeStack`/`moveStack` остаются строгими. `ENGINE_CONTRACT_VERSION` → `0.13.0` (`LKWkalk-crb`).
- `0.12.0` — добавлены операции ручной правки раскладки: `moveStack`, `rotateStack`, `unplaceStack`,
  `placeStack`, `stackBuffer` + типы `StackRef`/`PlaceStackSpec`/`EditResult`/`BufferStack` и коды
  `ERR_EDIT_*` ([ADR 019](adr/019-manual-layout-editing-api.md)). `moveStack`/`rotateStack` перенесены
  из UI в ядро без смены семантики (в контракте их раньше не было). Аддитивно: существующие операции
  и типы не менялись. `ENGINE_CONTRACT_VERSION` → `0.12.0` (`LKWkalk-dwc.1`).
- `0.11.0` — добавлены `CargoType.forkAccess` (`'all4' | 'twoSides'`, default `'all4'`) и
  `CargoType.forkAxis` (`'length' | 'width'`, default `'length'`): доступ погрузчика как жёсткое
  ограничение ориентации ([ADR 018](adr/018-fork-access-orientation.md)). Добавлен вид нарушения
  `GeometryViolation.kind: 'fork-access'`. Аддитивно; отсутствие `forkAccess` = `'all4'` = текущее
  поведение. `ENGINE_CONTRACT_VERSION` движка → `0.11.0` (`LKWkalk-4bj.10`).
- `0.10.0` — добавлен `Load.orderGrouping` (`'strict' | 'densityFirst'`, default `'strict'`):
  явное ослабление смежности зон заказов ради плотности ([ADR 016](adr/016-order-grouping-density-toggle.md)).
  Аддитивно; отсутствие поля = `'strict'` = текущее поведение (`LKWkalk-4bj.9`).
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
