# Warehouse Order Bays Implementation Plan

> ⚠️ **ВЫПОЛНЕН 2026-07-27** (PR #35, `cecc45d` в `main`, задача `LKWkalk-41e.2` закрыта).
> Истина о том, КАК оно устроено, — спека `docs/superpowers/specs/2026-07-27-41e2-warehouse-order-bays-design.md`
> и код; этот план — исторический документ, и код-блоки в нём отражают ЗАМЫСЕЛ, а не то, что уехало.
> Финальное ревью изменило три вещи против текста ниже:
> 1. **Два пространства индексов.** План обещал, что `insertionIndexAt` отдаёт индекс в плоском
>    `layout.tiles` и потому ничего у вызывающих не меняется. Это было неверно: `layout.tiles`
>    сгруппирован, а вызывающие сплайсят в свои несгруппированные массивы. Появился
>    `PlacedTile.srcIndex`, и наружу отдаётся всегда он — см. спеку §2 «Две системы индексов».
> 2. **Тот же перекос на отрисовке:** `WarehouseFloor` отдавал родителю сгруппированный индекс для
>    `onPickUp`/`onRotate`/`dragging` — при двух перемешанных заказах бралась не та стопка. Тоже
>    чинится через `srcIndex`.
> 3. **Бирка**: текст `{label} · ×{units}` (со средней точкой, как в спеке), кегль ужимается под
>    длину номера заказа; из констант наружу экспортируется только `TAG_H`.
>
> И позже в тот же день — четвёртое, уже после прода (`LKWkalk-77g`, PR #39): **дефолт развёрнут.**
> Загоны стали режимом, ВЫКЛЮЧЕННЫМ по умолчанию (`warehouseFloor(..., { grouped })` + переключатель
> в шапке двора). Весь план ниже описывает включённое состояние.
>
> И пятое-шестое — 2026-07-28 (PR #40), тоже после прода:
> 5. **Числа бирки и загона другие** (`LKWkalk-1f5`). Всюду ниже читай `TAG_H = 180` (не 330),
>    `TAG_W = 1200` (не 2200), `TAG_PAD = 70` (не 120), `BAY_MIN_W = 1600` (не 2400); в примерах
>    раскладки высота загона `h = 1380` (не 1530), узкий загон `w = 1600` (не 2400). Прежние числа
>    задавались «на глаз» до прода: бирка читалась заголовком раздела. Мера теперь взята у груза —
>    длина и глубина европоддона.
> 6. **Порядок загонов берётся из заявки** (`LKWkalk-8z2`), а не «по первому появлению в списке
>    плиток», как обещает §«Алгоритм» ниже: `groupByOrder` получил параметр `cargo` и строит порядок
>    групп по первому появлению номера в `load.cargo`. Плитки внутри загона — по-прежнему дворовые.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стопки в буфере склада группируются по заказу в размеченные загоны на асфальте, и стопка, брошенная из кузова, садится в загон своего заказа.

**Architecture:** Вся геометрия — в чистом модуле `warehouseLayout.ts`: он разбивает плитки по `orderId`, раскладывает каждую группу сегодняшним потоком с переносом внутри её загона, затем раскладывает сами загоны как блоки и возвращает `bays: PlacedBay[]` рядом с прежним плоским `tiles`. Компоненты только рисуют: новый `WarehouseBay` — периметр разметки и бирку с номером заказа. `insertionIndexAt` получает необязательный целевой заказ и переводит точку броска в позицию **внутри своего загона**; наружу отдаётся индекс во ВХОДНОМ массиве (через `PlacedTile.srcIndex`), а не в сгруппированном `layout.tiles` — см. баннер выше.

**Tech Stack:** TypeScript, React 18, SVG в мм-координатах, Vitest + @testing-library/react, Tailwind + CSS-токены темы, `@shadrin-v/i18n`.

**Spec:** `docs/superpowers/specs/2026-07-27-41e2-warehouse-order-bays-design.md`
**Issue:** `LKWkalk-41e.2`. Перетаскивание загонов (§4 спеки) — **не** в этом плане, это `LKWkalk-36f`.

## Global Constraints

- Движок (`packages/engine`) и контракт `0.14.0` **не трогаем** — работа целиком в `apps/web` и `packages/i18n`.
- Все координаты — целые миллиметры (ADR 002). Никаких px в мм-пространстве SVG.
- Ни одной пользовательской строки в коде — только ключи локалей; новые ключи добавляются в `de` **и** `ru` (тест `completeness.test.ts` иначе падает).
- Словарь читается тестами из собранного `dist`: после правки `packages/i18n` обязательно `npm run build -w @shadrin-v/i18n`, иначе новый ключ «не существует».
- Двор экран-онли: `print:hidden`, PNG-экспорт берёт только `svg[data-cutaway]`. Ничего в этом плане не должно получить атрибут `data-cutaway`.
- Обещание масштаба 1:1: `viewBox` двора по ширине равен `vehicle.length`. Никакой горизонтальный отступ/рамка вокруг svg не добавляется.
- Мерж в `main` = выкладка на прод (ADR 023). Коммитим только на зелёных тестах.
- Тесты запускаются ТОЛЬКО из корня репозитория: `npm test -- <фильтр по пути>` (vitest, один общий конфиг; у `apps/web` своего скрипта `test` нет). Зелёный прогон этой работы — `npm test -- apps/web packages`. Голый `npm test` тянет ещё и `apps/server`, где локально красно из-за ABI `better-sqlite3` (`NODE_MODULE_VERSION`) — это пре-существующее, чинить не нужно.

---

### Task 1: Раскладка загонов (чистая функция)

**Files:**
- Modify: `apps/web/src/screens/components/warehouseLayout.ts`
- Test: `apps/web/src/screens/components/warehouseLayout.test.ts`

**Interfaces:**
- Consumes: `orientedDims`, `Load`, `BufferStack` из `@shadrin-v/engine` (уже импортированы).
- Produces:
  - `export interface PlacedBay { orderId: string; x: number; y: number; w: number; h: number; units: number; startIndex: number; count: number }`
  - `WarehouseFloorLayout` получает поле `bays: PlacedBay[]`
  - `warehouseFloor(load, tiles, opts?)` — `opts` получает необязательное `bayOrder?: string[]`
  - константы `BAY_PAD = 200`, `BAY_GAP = 400`, `TAG_H = 330`, `BAY_MIN_W = 2400` (по факту наружу
    ушёл только `TAG_H` — у остальных не нашлось потребителя, см. баннер)

- [ ] **Step 1: Написать падающие тесты**

Добавить в `apps/web/src/screens/components/warehouseLayout.test.ts`. Существующий хелпер `cargo` получает параметр заказа — правка первой строки, остальные вызовы не меняются:

```ts
const cargo = (id: string, length: number, width: number, orderId = 'SO-1') => ({
  id,
  name: id,
  length,
  width,
  height: 144,
  quantity: 10,
  rotation: 'yawOnly' as const,
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt' as const,
  orderId,
});
```

Новый блок в конце файла:

```ts
describe('warehouseFloor — загоны по заказу', () => {
  // 'a' 1200×800 в SO-1, 'b' 600×400 в SO-2 — два различимых заказа.
  const twoOrders: Load = {
    vehicle: V,
    cargo: [cargo('a', 1200, 800, 'SO-1'), cargo('b', 600, 400, 'SO-2')],
  };

  it('один заказ — загонов нет, раскладка ровно сегодняшняя', () => {
    const fl = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(fl.bays).toEqual([]);
    expect(fl.tiles[0]).toMatchObject({ x: 200, y: 200 });
    expect(fl.tiles[1]).toMatchObject({ x: 1600, y: 200 });
  });

  it('два заказа — по загону на заказ, плитки сгруппированы', () => {
    // Порядок плиток нарочно чередует заказы: группировка должна их развести.
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')], { gap: 200, pad: 200 });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-1', 'SO-2']);
    expect(fl.bays[0]).toMatchObject({ startIndex: 0, count: 2, units: 2 });
    expect(fl.bays[1]).toMatchObject({ startIndex: 2, count: 1, units: 1 });
    // Первый загон: x=pad=200, y=pad=200; контент 2×'a' = 1200+200+1200 = 2600 → w = 2600+2*200 = 3000;
    // h = 800 + TAG_H(330) + 2*BAY_PAD(400) = 1530.
    expect(fl.bays[0]).toMatchObject({ x: 200, y: 200, w: 3000, h: 1530 });
    // Второй встаёт правее: 200 + 3000 + BAY_GAP(400) = 3600. Контент 600 → w = max(1000, BAY_MIN_W) = 2400.
    expect(fl.bays[1]).toMatchObject({ x: 3600, y: 200, w: 2400, h: 1130 });
  });

  it('плитки смещены внутрь своего загона — под бирку и поля', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    // 200 (bay.x) + 200 (BAY_PAD) = 400 по x; 200 (bay.y) + 330 (TAG_H) + 200 (BAY_PAD) = 730 по y.
    expect(fl.tiles[0]).toMatchObject({ x: 400, y: 730 });
  });

  it('загоны переносятся на новую строку, когда следующий не влезает', () => {
    const narrow: Load = { ...twoOrders, vehicle: { ...V, length: 6000 } };
    const fl = warehouseFloor(narrow, [tile('a'), tile('a'), tile('b')], { gap: 200, pad: 200 });
    // Загон SO-1 занял x=200..3200; SO-2 (w=2400) с x=3600 упёрся бы в 6000 > 6000-200.
    expect(fl.bays[1].x).toBe(200);
    expect(fl.bays[1].y).toBe(200 + fl.bays[0].h + 400); // строка + BAY_GAP
  });

  it('грузы без номера заказа собираются в загон, который идёт последним', () => {
    const mixed: Load = {
      vehicle: V,
      cargo: [cargo('a', 1200, 800, ''), cargo('b', 600, 400, 'SO-2')],
    };
    const fl = warehouseFloor(mixed, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-2', '']);
  });

  it('bayOrder выводит названный заказ вперёд, неизвестный id игнорирует', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], {
      gap: 200,
      pad: 200,
      bayOrder: ['SO-9', 'SO-2'],
    });
    expect(fl.bays.map((b) => b.orderId)).toEqual(['SO-2', 'SO-1']);
  });

  it('фантом не попадает в ×N бирки — счёт показывает то, что уже лежит', () => {
    const fl = warehouseFloor(
      twoOrders,
      [tile('a'), { ...tile('a'), phantom: true }, tile('b')],
      { gap: 200, pad: 200 },
    );
    expect(fl.bays[0].units).toBe(1);
    expect(fl.bays[0].count).toBe(2); // но место в раскладке фантом занимает
  });

  it('высота двора покрывает самую высокую строку загонов', () => {
    const fl = warehouseFloor(twoOrders, [tile('a'), tile('b')], { gap: 200, pad: 200 });
    expect(fl.height).toBe(200 + 1530 + 200);
  });

  it('детерминирована', () => {
    const build = () => warehouseFloor(twoOrders, [tile('a'), tile('b'), tile('a')]);
    expect(build()).toEqual(build());
  });
});
```

- [ ] **Step 2: Прогнать тесты, убедиться что падают**

Run: `npm test -- warehouseLayout`
Expected: FAIL — `fl.bays` is undefined; `bayOrder` нет в типе `opts`.

- [ ] **Step 3: Реализовать**

В `apps/web/src/screens/components/warehouseLayout.ts`. Дописать константы рядом с существующими `GAP`/`PAD`:

```ts
const GAP = 200;
const PAD = 200;
/** Поле между разметкой загона и его стопками. */
const BAY_PAD = 200;
/** Проход между соседними загонами. */
const BAY_GAP = 400;
/** Высота бирки с номером заказа — верхняя полоса внутри периметра. */
const TAG_H = 330;
/** Минимальная ширина загона: чтобы бирка вида `SO-1042 · ×18` не вылезала за разметку. */
const BAY_MIN_W = 2400;
export { BAY_PAD, BAY_GAP, TAG_H, BAY_MIN_W };
```

Тип загона рядом с `PlacedTile`:

```ts
/** Площадка одного заказа на асфальте: периметр разметки + бирка с номером (41e.2). */
export interface PlacedBay {
  /** '' — грузы без номера заказа; ярлык подставляет компонент. */
  orderId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Сумма units по РЕАЛЬНЫМ стопкам загона — «×N» на бирке. Фантом не считается: это ещё не груз,
   *  и мигающий во время драга счёт врал бы про содержимое двора. */
  units: number;
  /** Диапазон плиток загона в плоском `tiles`: [startIndex, startIndex + count).
   *  Магниту нужно переводить позицию внутри загона в глобальный индекс, и хранить это здесь
   *  честнее, чем пересканировать `tiles` по `orderId` на каждый кадр драга. */
  startIndex: number;
  count: number;
}
```

В `WarehouseFloorLayout` добавить поле:

```ts
  /** Загоны заказов. Пуст, когда различимых заказов меньше двух — тогда двор выглядит как раньше. */
  bays: PlacedBay[];
```

Выделить сегодняшний поток в хелпер (координаты локальные, от нуля) и переписать `warehouseFloor`:

```ts
type Cargo = Load['cargo'][number];

interface Flow {
  tiles: PlacedTile[];
  /** Правый край самой длинной строки — по нему считается ширина загона. */
  width: number;
  height: number;
}

/** Сегодняшняя раскладка рядами с переносом, в координатах от (0,0). Вынесена, чтобы её могли
 *  разделить весь двор (когда загонов нет) и каждый загон по отдельности. */
function flowTiles(tiles: BufferTile[], byId: Map<string, Cargo>, maxWidth: number, gap: number): Flow {
  const out: PlacedTile[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let rowStart = 0;
  for (const tile of tiles) {
    const c = byId.get(tile.cargoTypeId);
    if (!c) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, tile.orientation);
    // Перенос — но никогда на первой плитке строки: плитка шире отведённой ширины иначе зациклит,
    // и ей всё равно надо куда-то встать.
    if (x > 0 && x + dx > maxWidth) {
      for (let i = rowStart; i < out.length; i++) out[i].rowH = rowH;
      x = 0;
      y += rowH + gap;
      rowH = 0;
      rowStart = out.length;
    }
    out.push({ tile, x, y, dx, dy, rowH: 0, phantom: tile.phantom });
    x += dx + gap;
    rowH = Math.max(rowH, dy);
  }
  for (let i = rowStart; i < out.length; i++) out[i].rowH = rowH;
  const width = out.reduce((m, t) => Math.max(m, t.x + t.dx), 0);
  return { tiles: out, width, height: out.length === 0 ? 0 : y + rowH };
}

/** Плитки по заказам: порядок групп — по первому появлению, группа без номера всегда последняя,
 *  поверх — пользовательский `bayOrder` (41e.6). Плитки неизвестного типа выпадают здесь, как и
 *  раньше выпадали в потоке. */
function groupByOrder(
  tiles: BufferTile[],
  byId: Map<string, Cargo>,
  bayOrder: string[],
): { orderId: string; tiles: BufferTile[] }[] {
  const groups = new Map<string, BufferTile[]>();
  for (const t of tiles) {
    const c = byId.get(t.cargoTypeId);
    if (!c) continue;
    const key = c.orderId ?? '';
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const keys = [...groups.keys()];
  const byDefault = [...keys.filter((k) => k !== ''), ...keys.filter((k) => k === '')];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of bayOrder) {
    if (groups.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const id of byDefault) if (!seen.has(id)) ordered.push(id);
  return ordered.map((id) => ({ orderId: id, tiles: groups.get(id)! }));
}

export function warehouseFloor(
  load: Load,
  tiles: BufferTile[],
  opts: { width?: number; gap?: number; pad?: number; bayOrder?: string[] } = {},
): WarehouseFloorLayout {
  const width = opts.width ?? load.vehicle.length;
  const gap = opts.gap ?? GAP;
  const pad = opts.pad ?? PAD;
  const byId = new Map(load.cargo.map((c) => [c.id, c]));

  const groups = groupByOrder(tiles, byId, opts.bayOrder ?? []);

  // Меньше двух заказов — делить нечего: рамка вокруг всего ничего не разделяет. Двор остаётся
  // ровно таким, каким был до 41e.2.
  if (groups.length < 2) {
    const flow = flowTiles(tiles, byId, width - 2 * pad, gap);
    return {
      tiles: flow.tiles.map((t) => ({ ...t, x: t.x + pad, y: t.y + pad })),
      bays: [],
      width,
      height: flow.tiles.length === 0 ? 0 : flow.height + 2 * pad,
    };
  }

  // Ширина, отведённая содержимому загона: двор минус свои поля минус поля загона. Отсюда загон
  // не шире двора — с той же оговоркой, что и у плитки: стопка шире этой ширины распирает загон.
  const contentMax = width - 2 * pad - 2 * BAY_PAD;
  const outTiles: PlacedTile[] = [];
  const bays: PlacedBay[] = [];
  let bx = pad;
  let by = pad;
  let rowH = 0;
  for (const g of groups) {
    const flow = flowTiles(g.tiles, byId, contentMax, gap);
    const w = Math.max(flow.width + 2 * BAY_PAD, BAY_MIN_W);
    const h = flow.height + TAG_H + 2 * BAY_PAD;
    if (bx > pad && bx + w > width - pad) {
      bx = pad;
      by += rowH + BAY_GAP;
      rowH = 0;
    }
    const startIndex = outTiles.length;
    for (const t of flow.tiles) {
      outTiles.push({ ...t, x: t.x + bx + BAY_PAD, y: t.y + by + TAG_H + BAY_PAD });
    }
    bays.push({
      orderId: g.orderId,
      x: bx,
      y: by,
      w,
      h,
      units: g.tiles.reduce((s, t) => s + (t.phantom ? 0 : t.units), 0),
      startIndex,
      count: outTiles.length - startIndex,
    });
    bx += w + BAY_GAP;
    rowH = Math.max(rowH, h);
  }
  return { tiles: outTiles, bays, width, height: by + rowH + pad };
}
```

- [ ] **Step 4: Прогнать тесты, убедиться что зелено**

Run: `npm test -- warehouseLayout`
Expected: PASS — и новый блок, и все прежние тесты `warehouseFloor`/`insertionIndexAt`/phantom.

- [ ] **Step 5: Проверить типы**

Run: `npm run typecheck -w apps/web`
Expected: ошибок нет (потребители `WarehouseFloorLayout` не ломаются: поле добавлено, ничего не удалено).

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/components/warehouseLayout.ts apps/web/src/screens/components/warehouseLayout.test.ts
git commit -m "feat(warehouse): group buffer tiles into per-order bays (41e.2)"
```

---

### Task 2: Магнит — точка броска в свой загон

**Files:**
- Modify: `apps/web/src/screens/components/warehouseLayout.ts`
- Test: `apps/web/src/screens/components/warehouseLayout.test.ts`

**Interfaces:**
- Consumes: `PlacedBay`, `WarehouseFloorLayout.bays`, `startIndex`/`count` из Task 1.
- Produces: `insertionIndexAt(layout, point, opts?: { orderId?: string }): number` — возвращает по-прежнему **глобальный** индекс в плоском `tiles`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `apps/web/src/screens/components/warehouseLayout.test.ts`:

```ts
describe('insertionIndexAt — магнит к своему загону', () => {
  const V2 = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
  const two: Load = {
    vehicle: V2,
    cargo: [cargo('a', 1200, 800, 'SO-1'), cargo('b', 600, 400, 'SO-2')],
  };
  const fl = () => warehouseFloor(two, [tile('a'), tile('a'), tile('b')], { gap: 200, pad: 200 });

  it('точка в чужом загоне — стопка всё равно уходит в конец своего', () => {
    const layout = fl();
    const foreign = layout.bays[0]; // SO-1
    const point = { x: foreign.x + 10, y: foreign.y + 10 };
    // Несём стопку заказа SO-2: его загон — второй, плитки [2..3).
    expect(insertionIndexAt(layout, point, { orderId: 'SO-2' })).toBe(3);
  });

  it('точка в своём загоне задаёт позицию внутри него', () => {
    const layout = fl();
    const own = layout.bays[0]; // SO-1, плитки 0 и 1
    const first = layout.tiles[0];
    // Левее центра первой плитки своего загона → перед ней.
    expect(insertionIndexAt(layout, { x: own.x + 1, y: first.y }, { orderId: 'SO-1' })).toBe(0);
    // Правее центра первой, левее центра второй → между ними.
    const between = { x: first.x + first.dx + 10, y: first.y };
    expect(insertionIndexAt(layout, between, { orderId: 'SO-1' })).toBe(1);
  });

  it('у заказа ещё нет загона — новый открывается в конце', () => {
    const layout = fl();
    expect(insertionIndexAt(layout, { x: 300, y: 300 }, { orderId: 'SO-77' })).toBe(
      layout.tiles.length,
    );
  });

  it('без целевого заказа поведение прежнее', () => {
    const layout = warehouseFloor(load, [tile('a'), tile('a')], { gap: 200, pad: 200 });
    expect(insertionIndexAt(layout, { x: 0, y: layout.tiles[0].y })).toBe(0);
  });
});
```

- [ ] **Step 2: Прогнать тесты, убедиться что падают**

Run: `npm test -- warehouseLayout`
Expected: FAIL — третий аргумент `insertionIndexAt` не принимается / индексы не совпадают.

- [ ] **Step 3: Реализовать**

Заменить `insertionIndexAt` в `apps/web/src/screens/components/warehouseLayout.ts`. Тело сегодняшнего цикла переезжает в `flowIndexAt` без изменений логики:

```ts
/** Позиция точки в потоке плиток: индекс в [0..tiles.length]. Сначала ряды (плитка «в ряду точки»,
 *  когда `t.y <= point.y <= t.y + t.rowH` — высота РЯДА, а не собственная `dy`: ряд может смешивать
 *  высоты грузов, и собственная `dy` низкой плитки оборвала бы полосу раньше времени и ошибочно
 *  протолкнула бы точку за неё), затем x внутри ряда: точка вставляется перед первой плиткой, чьего
 *  ряда она достигла и чей центр не левее её. Точка за всеми плитками попадает в конец. */
function flowIndexAt(tiles: PlacedTile[], point: { x: number; y: number }): number {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (point.y > t.y + t.rowH) continue; // ряд этой плитки целиком выше точки — уже позади
    if (point.y < t.y) return i; // точка перед началом ряда (зазор над ним или самый верх)
    const cx = t.x + t.dx / 2;
    if (point.x <= cx) return i; // тот же ряд, на центре плитки или левее
  }
  return tiles.length;
}

/** Куда сядет брошенная стопка. Заказ стопки определяется её типом груза и броском не меняется,
 *  поэтому при живых загонах точка «примагничивается» к загону своего заказа: внутри него она
 *  задаёт позицию, снаружи — стопка встаёт в конец своего загона. Возвращается ГЛОБАЛЬНЫЙ индекс
 *  в плоском `tiles`, так что splice фантома в `WarehouseFloor` не меняется. */
export function insertionIndexAt(
  layout: WarehouseFloorLayout,
  point: { x: number; y: number },
  opts: { orderId?: string } = {},
): number {
  const { tiles, bays } = layout;
  if (bays.length === 0 || opts.orderId === undefined) return flowIndexAt(tiles, point);
  const bay = bays.find((b) => b.orderId === opts.orderId);
  // Стопки этого заказа во дворе ещё нет: загон откроется в конце потока, фантом покажется уже в нём.
  if (!bay) return tiles.length;
  const inside =
    point.x >= bay.x && point.x <= bay.x + bay.w && point.y >= bay.y && point.y <= bay.y + bay.h;
  if (!inside) return bay.startIndex + bay.count;
  return bay.startIndex + flowIndexAt(tiles.slice(bay.startIndex, bay.startIndex + bay.count), point);
}
```

- [ ] **Step 4: Прогнать тесты, убедиться что зелено**

Run: `npm test -- warehouseLayout`
Expected: PASS, включая прежний блок `insertionIndexAt` (он вызывает функцию с двумя аргументами).

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/components/warehouseLayout.ts apps/web/src/screens/components/warehouseLayout.test.ts
git commit -m "feat(warehouse): drop magnet — insertion index inside the stack's own bay (41e.2)"
```

---

### Task 3: Токен разметки, ярлык локали и компонент загона

**Files:**
- Create: `apps/web/src/screens/components/WarehouseBay.tsx`
- Create: `apps/web/src/screens/components/WarehouseBay.test.tsx`
- Modify: `apps/web/src/theme.css`
- Modify: `packages/i18n/src/dictionaries/de.ts`
- Modify: `packages/i18n/src/dictionaries/ru.ts`

**Interfaces:**
- Consumes: `PlacedBay`, `TAG_H` из Task 1.
- Produces: `WarehouseBay({ bay, series, label })` — рисует периметр и бирку; DOM-маркеры `data-testid="warehouse-bay"` и `data-order={bay.orderId}`.

- [ ] **Step 1: Добавить ключи локалей**

В `packages/i18n/src/dictionaries/de.ts`, рядом с остальными `warehouse.*`:

```ts
  'warehouse.bay.noOrder': 'Ohne Auftrag',
```

В `packages/i18n/src/dictionaries/ru.ts`, в том же месте:

```ts
  'warehouse.bay.noOrder': 'Без заказа',
```

Ключ a11y-ручки (`warehouse.bay.reorder`) в этот план **не** входит — он появится вместе с перетаскиванием загонов (`LKWkalk-36f`).

- [ ] **Step 2: Собрать словарь и прогнать его тесты**

Run: `npm run build -w @shadrin-v/i18n && npm test -- packages/i18n`
Expected: PASS — `completeness.test.ts` подтверждает, что ключ есть в обеих локалях.

- [ ] **Step 3: Добавить токен разметки**

В `apps/web/src/theme.css`, в блок «токенов рисования» рядом с `--grid` и `--truck`:

```css
  --yard-mark: #e8b300;    /* складская разметка на асфальте (периметр загона заказа) */
```

- [ ] **Step 4: Написать падающий тест компонента**

Создать `apps/web/src/screens/components/WarehouseBay.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarehouseBay } from './WarehouseBay';
import type { PlacedBay } from './warehouseLayout';

const bay: PlacedBay = {
  orderId: 'SO-1042',
  x: 200,
  y: 200,
  w: 3000,
  h: 1530,
  units: 18,
  startIndex: 0,
  count: 3,
};

const draw = (b: PlacedBay = bay, label = b.orderId) =>
  render(
    <svg>
      <WarehouseBay bay={b} series={2} label={label} />
    </svg>,
  ).container;

describe('WarehouseBay', () => {
  it('обводит площадку пунктиром складской разметки', () => {
    const c = draw();
    const outline = c.querySelector('[data-testid="warehouse-bay"] [data-outline]')!;
    expect(outline.getAttribute('stroke')).toBe('var(--yard-mark)');
    expect(outline.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(Number(outline.getAttribute('width'))).toBe(3000);
  });

  it('бирка красится цветом заказа и называет номер и число единиц', () => {
    const c = draw();
    expect(c.querySelector('[data-tag]')!.getAttribute('fill')).toBe('var(--s2)');
    expect(c.textContent).toContain('SO-1042');
    expect(c.textContent).toContain('×18');
  });

  it('ничего не перехватывает у указателя — под стопками лежит инертная разметка', () => {
    const c = draw();
    expect(c.querySelector('[data-testid="warehouse-bay"]')!.getAttribute('pointer-events')).toBe(
      'none',
    );
  });

  it('показывает переданный ярлык, когда номера заказа нет', () => {
    const c = draw({ ...bay, orderId: '' }, 'Ohne Auftrag');
    expect(c.textContent).toContain('Ohne Auftrag');
  });

  it('бирка уже загона, но узкий загон её обрезает', () => {
    expect(Number(draw().querySelector('[data-tag]')!.getAttribute('width'))).toBe(2200);
    const narrow = draw({ ...bay, w: 900 });
    expect(Number(narrow.querySelector('[data-tag]')!.getAttribute('width'))).toBe(900);
  });
});
```

- [ ] **Step 5: Прогнать тест, убедиться что падает**

Run: `npm test -- WarehouseBay`
Expected: FAIL — `Failed to resolve import './WarehouseBay'`.

- [ ] **Step 6: Реализовать компонент**

Создать `apps/web/src/screens/components/WarehouseBay.tsx`:

```tsx
// Площадка одного заказа на асфальте склада (LKWkalk-41e.2): пунктир складской разметки по периметру
// и бирка с номером заказа в левом верхнем углу.
//
// Почему разметка жёлтая своим токеном, а не `--warning`: это не семантика предупреждения, а краска
// на полу — в одном ряду с `--grid` (сетка разреза) и `--truck` (обводка кузова).
//
// Почему бирка красится цветом ЗАКАЗА, а не той же жёлтой: бирка — единственное место, где номер
// заказа написан во дворе, и её цвет связывает загон со своими стопками и с легендой (design-system
// §6: идентичность заказа — цвет + штриховка). Жёлтой остаётся только краска.
//
// Инертная декорация: лежит под стопками и не берёт указатель — жест «потянуть» внутри загона
// принадлежит стопке. Перетаскивание самой бирки придёт отдельно (LKWkalk-36f).
//
// Доступность: весь двор объявлен одним `role="img"` с ярлыком на уровне <svg> в WarehouseFloor,
// поэтому текст внутри вспомогательные технологии не читают — здесь ничего не добавляем, чтобы не
// изображать доступность, которой нет.
import { TAG_H, type PlacedBay } from './warehouseLayout';

/** Отступ текста от левого края бирки, мм. */
const TAG_PAD = 120;
/** Номинальная ширина бирки, мм — под `SO-1042 · ×18` при кегле 0.62·TAG_H. Узкий загон обрезает
 *  её до своей ширины: разметка — граница, за которую бирка не выходит. */
const TAG_W = 2200;

export function WarehouseBay({
  bay,
  series,
  /** Готовый ярлык: номер заказа либо локализованное «без заказа» — резолвит вызывающий. */
  label,
}: {
  bay: PlacedBay;
  /** Слот палитры 1..8 — тот же, что у стопок этого заказа. */
  series: number;
  label: string;
}) {
  // Узкий загон (один маленький груз) не должен выпускать бирку за разметку.
  const tagW = Math.min(bay.w, TAG_W);
  return (
    <g data-testid="warehouse-bay" data-order={bay.orderId} pointerEvents="none">
      <rect
        data-outline
        x={bay.x}
        y={bay.y}
        width={bay.w}
        height={bay.h}
        fill="none"
        stroke="var(--yard-mark)"
        strokeWidth={2}
        strokeDasharray="10 7"
        vectorEffect="non-scaling-stroke"
      />
      <rect data-tag x={bay.x} y={bay.y} width={tagW} height={TAG_H} fill={`var(--s${series})`} />
      <text
        x={bay.x + TAG_PAD}
        y={bay.y + TAG_H / 2}
        fill="var(--brand-ink)"
        fontSize={TAG_H * 0.62}
        fontWeight={700}
        dominantBaseline="central"
      >
        {label} · ×{bay.units}
      </text>
    </g>
  );
}
```

- [ ] **Step 7: Прогнать тест, убедиться что зелено**

Run: `npm test -- WarehouseBay`
Expected: PASS.

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/screens/components/WarehouseBay.tsx apps/web/src/screens/components/WarehouseBay.test.tsx apps/web/src/theme.css packages/i18n/src/dictionaries/de.ts packages/i18n/src/dictionaries/ru.ts
git commit -m "feat(warehouse): bay outline and order tag component (41e.2)"
```

---

### Task 4: Отрисовать загоны во дворе

**Files:**
- Modify: `apps/web/src/screens/components/WarehouseFloor.tsx`
- Test: `apps/web/src/screens/components/WarehouseFloor.test.tsx`

**Interfaces:**
- Consumes: `WarehouseBay` (Task 3), `floor.bays` (Task 1), существующие `orderColorToken`, `orderIndexMap`.
- Produces: DOM-маркеры `warehouse-bay` внутри `[data-testid="warehouse-floor"]`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `apps/web/src/screens/components/WarehouseFloor.test.tsx`. Существующий фикстур `load` держит оба груза в `SO-1`; для загонов нужен второй заказ:

```tsx
describe('WarehouseFloor — загоны по заказу', () => {
  const twoOrders: Load = {
    vehicle: V,
    cargo: [
      { ...load.cargo[0], orderId: 'SO-1' },
      { ...load.cargo[1], orderId: 'SO-2' },
    ],
  };
  const render2 = (t: BufferTile[]) =>
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor load={twoOrders} tiles={t} onRotate={vi.fn()} onPickUp={vi.fn()} dragging={null} />
      </LocaleProvider>,
    );

  it('рисует по загону на заказ с номером и числом единиц', () => {
    render2([
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    ]);
    const bays = document.querySelectorAll('[data-testid="warehouse-bay"]');
    expect(bays).toHaveLength(2);
    expect([...bays].map((b) => b.getAttribute('data-order'))).toEqual(['SO-1', 'SO-2']);
    expect(screen.getByText(/SO-1 ×18/)).toBeInTheDocument();
  });

  it('один заказ — разметки нет, двор как раньше', () => {
    renderFloor();
    expect(document.querySelectorAll('[data-testid="warehouse-bay"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid="warehouse-tile"]')).toHaveLength(1);
  });

  it('загон без номера заказа подписан локализованным ярлыком', () => {
    const anon: Load = {
      vehicle: V,
      cargo: [{ ...load.cargo[0], orderId: undefined }, { ...load.cargo[1], orderId: 'SO-2' }],
    };
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={anon}
          tiles={[
            { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
            { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
          ]}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(/Ohne Auftrag/)).toBeInTheDocument();
  });

  it('разметка лежит под стопками — стопку по-прежнему можно взять', () => {
    render2([
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    ]);
    const svg = document.querySelector('[data-testid="warehouse-floor"] svg')!;
    const nodes = [...svg.querySelectorAll('[data-testid="warehouse-bay"], [data-testid="warehouse-tile"]')];
    expect(nodes[0].getAttribute('data-testid')).toBe('warehouse-bay');
    expect(nodes.at(-1)!.getAttribute('data-testid')).toBe('warehouse-tile');
  });
});
```

- [ ] **Step 2: Прогнать тесты, убедиться что падают**

Run: `npm test -- WarehouseFloor`
Expected: FAIL — узлов `warehouse-bay` в документе нет.

- [ ] **Step 3: Реализовать**

В `apps/web/src/screens/components/WarehouseFloor.tsx` добавить импорт:

```tsx
import { WarehouseBay } from './WarehouseBay';
```

и вставить отрисовку сразу после `<WarehouseBackdrop … />`, до блока `empty` и до плиток — разметка обязана лежать **под** стопками:

```tsx
          {/* Загоны заказов (41e.2): пустой массив, когда различимых заказов меньше двух — тогда
              двор выглядит как раньше. Рисуются между фоном и стопками, указателя не берут. */}
          {floor.bays.map((bay) => {
            const slot = orderColors?.get(bay.orderId) ?? oidx.get(bay.orderId) ?? 0;
            return (
              <WarehouseBay
                key={bay.orderId}
                bay={bay}
                series={orderColorToken(slot).series}
                label={bay.orderId || tt('warehouse.bay.noOrder')}
              />
            );
          })}
```

- [ ] **Step 4: Прогнать тесты, убедиться что зелено**

Run: `npm test -- WarehouseFloor`
Expected: PASS, включая прежние тесты (viewBox, размеры стопки, title, поворот).

- [ ] **Step 5: Проверить типы и линт**

Run: `npm run typecheck -w apps/web && npm run lint`
Expected: чисто.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/components/WarehouseFloor.tsx apps/web/src/screens/components/WarehouseFloor.test.tsx
git commit -m "feat(warehouse): draw order bays under the buffer stacks (41e.2)"
```

---

### Task 5: Подключить магнит к переносу из кузова

**Files:**
- Modify: `apps/web/src/screens/LadeplanScreen.tsx:352-361` (`phantomAt`), `:364-390` (`onDropOutside`)
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx`

**Interfaces:**
- Consumes: `insertionIndexAt(layout, point, { orderId })` из Task 2.
- Produces: поведения наружу не добавляет — меняет, куда садится брошенная стопка.

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/web/src/screens/LadeplanScreen.test.tsx`, в тот же `describe`, где живёт `withDropRig`. Нужен второй заказ, поэтому рига — своя, по образцу существующей:

```tsx
  it('стопка чужого заказа садится в свой загон, куда бы её ни бросили', () => {
    // C — единственный груз заказа SO-2; A и B (уже в буфере) — SO-1. Бросаем C прямо в загон SO-1:
    // магнит обязан увести её в собственный загон, а не воткнуть между A и B.
    const bayLoad: Load = {
      ...dropLoad,
      cargo: dropLoad.cargo.map((c) => (c.id === 'c' ? { ...c, orderId: 'SO-2' } : c)),
    };
    const restoreSvg = installSvgGeometry({ left: 0, top: 0, width: 4000, height: 2000 });
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 4000, top: 0, bottom: 2000, width: 4000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={bayLoad} layout={dropLayout} />
        </LocaleProvider>,
      );
      const svg = container.querySelector('svg[data-cutaway="top"] svg')!;
      fireEvent.pointerDown(svg.querySelector('[data-stack-ref="c@0,0"]')!, { clientX: 500, clientY: 500 });
      // Точка внутри загона SO-1 (левый верхний угол двора), но это ЧУЖОЙ загон.
      fireEvent.pointerMove(svg, { clientX: 500, clientY: 400 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 400 });
      // Два загона, C — в своём, а не между A и B.
      const bays = [...document.querySelectorAll('[data-testid="warehouse-bay"]')];
      expect(bays.map((b) => b.getAttribute('data-order'))).toEqual(['SO-1', 'SO-2']);
      const labels = screen.getAllByTestId('warehouse-tile').map((t) => t.getAttribute('aria-label'));
      expect(labels).toEqual([
        expect.stringContaining('A'),
        expect.stringContaining('B'),
        expect.stringContaining('C'),
      ]);
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  });
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npm test -- LadeplanScreen`
Expected: FAIL — загонов нет / порядок плиток `A, C, B`.

- [ ] **Step 3: Реализовать**

В `apps/web/src/screens/LadeplanScreen.tsx` добавить хелпер рядом с `orderedTiles`:

```tsx
  /** Заказ типа груза — он же заказ любой его стопки: броском заказ не меняется, поэтому именно он
   *  выбирает загон, в который стопка сядет (41e.2). */
  const orderOfType = (cargoTypeId: string) =>
    load.cargo.find((c) => c.id === cargoTypeId)?.orderId ?? '';
```

В `phantomAt` передать заказ несомой стопки:

```tsx
    const index = insertionIndexAt(warehouseFloor(load, orderedTiles), pt, {
      orderId: orderOfType(carry.cargoTypeId),
    });
```

В `onDropOutside` — то же самое, по заказу первой из брошенных стопок:

```tsx
        // Якорь берётся по заказу ПЕРВОЙ стопки группы: групповой бросок может смешивать заказы, но
        // раскладка всё равно разведёт их по своим загонам — точка броска задаёт лишь относительное
        // место внутри своего загона.
        const idx = insertionIndexAt(warehouseFloor(load, orderedTiles), pt, {
          orderId: orderOfType(refs[0].cargoTypeId),
        });
```

- [ ] **Step 4: Прогнать тест, убедиться что зелено**

Run: `npm test -- LadeplanScreen`
Expected: PASS, включая прежние тесты броска (они держат один заказ `SO-1`, значит идут по ветке без загонов).

- [ ] **Step 5: Полный прогон и линт**

Run: `npm test -- apps/web packages && npm run typecheck -w apps/web && npm run lint`
Expected: всё зелено. Число тестов `apps/web` выросло относительно базовых 587 (`apps/web` + `packages`) ровно на добавленные.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/LadeplanScreen.test.tsx
git commit -m "feat(warehouse): carry a stack into its own order bay (41e.2)"
```

---

### Task 6: Проверка в браузере и запись в CHANGELOG

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Поднять приложение**

```bash
cd apps/web && npm run dev            # :5173
DB_PATH=/tmp/qa.db npm run dev -w apps/server   # :3000, из корня репозитория
```

- [ ] **Step 2: Проверить глазами**

Собрать заявку из **двух заказов** так, чтобы часть груза не влезла в кузов. Проверить:

1. во дворе две размеченные площадки, у каждой бирка цветом своего заказа с номером и `×N`;
2. стопки каждого заказа стоят внутри своей площадки, ни одна не лежит на разметке;
3. заявка из **одного** заказа — разметки нет вовсе, двор как раньше;
4. перенос стопки из кузова в чужой загон: фантом-зазор показывается в СВОЁМ загоне, и стопка садится туда же;
5. масштаб 1:1 не уехал: стопка одного и того же груза в кузове и во дворе одного размера на экране.

- [ ] **Step 3: Записать в CHANGELOG**

Добавить запись в `docs/CHANGELOG.md` под заголовком `## [Unreleased]`, первой — над записью
`### 2026-07-24 — склад: фоновый ассет владельца…`:

```markdown
### 2026-07-27 — склад: загоны заказов (`LKWkalk-41e.2`)

- Стопки в буфере склада группируются по заказу: у каждого заказа своя площадка на асфальте —
  пунктир складской разметки (`--yard-mark`) и бирка цветом заказа с номером и числом единиц.
  Разметка появляется только когда различимых заказов больше одного.
- Стопка, брошенная из кузова, садится в загон СВОЕГО заказа, куда бы её ни отпустили; фантом-зазор
  во время переноса показывает настоящее место посадки.
- Только презентация `apps/web`: движок и контракт `0.14.0` не тронуты. Перетаскивание загонов
  (порядок заказов во дворе) — `LKWkalk-36f`.
```

- [ ] **Step 4: Коммит**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): warehouse order bays (41e.2)"
```

- [ ] **Step 5: Закрыть задачу**

```bash
bd close LKWkalk-41e.2 --reason "Загоны заказов во дворе: разметка + бирка цветом заказа, магнит броска к своему загону. Перетаскивание загонов вынесено в LKWkalk-36f."
```
