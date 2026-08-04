# Двор: порядок по «тип × количество» — план реализации (`LKWkalk-72g`)

> **For agentic workers:** REQUIRED SUB-SKILL: используйте superpowers:subagent-driven-development
> (рекомендуется) или superpowers:executing-plans, задача за задачей. Шаги отмечаются `- [ ]`.

**Goal:** плитка-остаток во дворе (`×12` среди `×17`) должна переставляться жестом, а бросок из
кузова во двор — сохранять сегодняшнее поведение даже когда `stackBuffer` перенарезал буфер.

**Architecture:** порядок двора (`bufferOrder`) остаётся слоем поверх производного `stackBuffer`, но
ключом становится пара «количество : тип», а разбор порядка переезжает из тела `LadeplanScreen` в
чистый модуль `yardOrder.ts` с двухфазной реконсиляцией (точное совпадение ключа → запасное по типу).

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library (jsdom), Vite. Движок не затрагивается.

## Global Constraints

- Спека: [`docs/superpowers/specs/2026-08-03-yard-order-tile-identity-design.md`](../specs/2026-08-03-yard-order-tile-identity-design.md).
- Контракт движка `0.15.0` **не меняется**; `packages/engine` не трогать.
- Ни одной пользовательской строки в коде — только ключи локалей (в этой задаче новых строк нет).
- Тесты гоняются **с корня** (`npm test`), не workspace-scoped.
- Комментарии в коде — по-английски или по-русски по образцу соседних; идентификаторы — английские.
- Коммит после каждой зелёной задачи, сообщения по-английски (кроме тела с русским пояснением, как
  в истории репозитория).

---

### Task 1: чистый модуль `yardOrder.ts`

**Files:**
- Create: `apps/web/src/screens/components/yardOrder.ts`
- Test: `apps/web/src/screens/components/yardOrder.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `yardOrderKey(t: { cargoTypeId: string; units: number }): string`
  - `reconcileYardOrder<T extends { cargoTypeId: string; units: number }>(tiles: T[], order: string[]): T[]`

- [ ] **Step 1: Написать падающие тесты**

```ts
// apps/web/src/screens/components/yardOrder.test.ts
import { describe, expect, it } from 'vitest';
import { reconcileYardOrder, yardOrderKey } from './yardOrder';

const t = (cargoTypeId: string, units: number) => ({ cargoTypeId, units });

describe('yardOrderKey', () => {
  // Количество впереди: ПЕРВОЕ двоеточие делит ключ однозначно при любом id из пользовательского
  // справочника — включая id, который сам содержит двоеточия.
  it('делит ключ однозначно даже когда id содержит двоеточие', () => {
    expect(yardOrderKey(t('a:b:c', 17))).toBe('17:a:b:c');
    expect(yardOrderKey(t('a', 17))).not.toBe(yardOrderKey(t('a', 12)));
  });
});

describe('reconcileYardOrder', () => {
  it('без порядка отдаёт плитки как есть', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1)];
    expect(reconcileYardOrder(tiles, [])).toEqual(tiles);
  });

  it('различает плитки одного типа по количеству — остаток можно поставить первым', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['12:p3', '17:p3', '1:p1']);
    expect(out.map((x) => x.units)).toEqual([12, 17, 1]);
  });

  it('повторённый ключ снимает столько же плиток этого ключа', () => {
    const tiles = [t('p3', 17), t('p3', 17), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['1:p1', '17:p3', '17:p3']);
    expect(out.map((x) => x.cargoTypeId)).toEqual(['p1', 'p3', 'p3']);
  });

  it('неупомянутые плитки дописываются в конце в своём порядке', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['1:p1']);
    expect(out.map((x) => x.units)).toEqual([1, 17, 12]);
  });

  // Запасная фаза. Буфер пере-нарезается на каждом рендере, а бросок из кузова записывает порядок
  // ДО того, как плитки появятся, — предсказанное количество может не совпасть ни с одной плиткой.
  // Тогда ключ снимает любую плитку СВОЕГО ТИПА, то есть ведёт себя как прежняя модель «по типу».
  it('ключ с несуществующим количеством снимает любую плитку своего типа', () => {
    const tiles = [t('p1', 1), t('p3', 17), t('p3', 12)];
    const out = reconcileYardOrder(tiles, ['5:p3', '1:p1', '17:p3', '7:p3']);
    expect(out.map((x) => `${x.cargoTypeId}×${x.units}`)).toEqual(['p3×17', 'p1×1', 'p3×12']);
  });

  it('ключ типа, которого во дворе нет вовсе, просто пропускается', () => {
    const tiles = [t('p1', 1)];
    expect(reconcileYardOrder(tiles, ['4:gone', '1:p1'])).toEqual([t('p1', 1)]);
  });

  it('не теряет и не дублирует плитки ни при каком порядке', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['9:p3', '1:p1', '12:p3', '99:zzz']);
    // Мультимножество, а не порядок: сравниваем отсортированные КЛЮЧИ (объекты сортировкой не
    // сравнить — `Array.prototype.sort` приведёт их к «[object Object]» и ничего не упорядочит).
    expect(out.map(yardOrderKey).sort()).toEqual(tiles.map(yardOrderKey).sort());
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -- yardOrder`
Expected: FAIL — `Failed to resolve import "./yardOrder"`.

- [ ] **Step 3: Написать модуль**

```ts
// apps/web/src/screens/components/yardOrder.ts
// Пользовательский порядок плиток во дворе (LKWkalk-72g), слой ПОВЕРХ производного `stackBuffer`.
//
// Своей идентичности у плитки нет: `stackBuffer` пересобирает двор на каждый рендер из числа
// неразмещённых единиц (полные стопки по `per`, затем остаток), поэтому хранить ссылки не на что.
// Ключ — пара «количество : тип»: этого хватает, чтобы отличить остаток (×12) от полных стопок
// (×17), и ровно этого не хватало прежней модели «список cargoTypeId», где такая перестановка
// давала тот же список строк и читалась как пустой жест.
//
// Две плитки одного типа И одного количества по-прежнему неразличимы — они и на экране
// пиксель-в-пиксель одинаковы, переставлять их незачем (решение владельца, 2026-08-03).

/** Ключ плитки в порядке двора. Количество ВПЕРЕДИ: первое двоеточие делит ключ однозначно при
 *  любом `cargoTypeId`, включая id из пользовательского справочника с двоеточиями внутри. */
export const yardOrderKey = (t: { cargoTypeId: string; units: number }) =>
  `${t.units}:${t.cargoTypeId}`;

/** Тип груза обратно из ключа — всё после первого двоеточия. */
const typeOfKey = (key: string) => key.slice(key.indexOf(':') + 1);

/**
 * Разложить плитки в пользовательском порядке.
 *
 * Очередь на каждый ключ (порядок внутри очереди — порядок `tiles`), затем проход по `order`:
 *  1. точная фаза — снять голову очереди этого ключа;
 *  2. запасная фаза — если такой очереди нет или она пуста, снять голову первой непустой очереди
 *     ТОГО ЖЕ типа груза.
 *
 * Запасная фаза не запас прочности, а обязательная часть: бросок из кузова во двор записывает
 * порядок ДО того, как плитка появится в буфере, и `stackBuffer` может перенарезать буфер так, что
 * записанное количество не совпадёт ни с одной плиткой. Двор [×17, ×7], вернули колонну из 5 при
 * per = 17: было 24 неразмещённых, стало 29 → буфер выдаст [×17, ×12], и ни ключ `5:` брошенной,
 * ни ключ `7:` прежнего остатка не совпадут ни с чем. Без запасной фазы бросок сел бы на место по
 * умолчанию — то есть эта задача починила бы остаток и сломала бы уже работающий бросок.
 *
 * Хвосты очередей дописываются в конце в порядке `tiles`: ключ, которого порядок не упоминает,
 * сохраняет место по умолчанию, и порядок деградирует мягко, а не теряет плитки.
 */
export function reconcileYardOrder<T extends { cargoTypeId: string; units: number }>(
  tiles: T[],
  order: string[],
): T[] {
  const queues = new Map<string, T[]>();
  for (const t of tiles) {
    const k = yardOrderKey(t);
    const q = queues.get(k);
    if (q) q.push(t);
    else queues.set(k, [t]);
  }
  const out: T[] = [];
  for (const key of order) {
    const exact = queues.get(key);
    if (exact && exact.length > 0) {
      out.push(exact.shift()!);
      continue;
    }
    const type = typeOfKey(key);
    for (const [k, q] of queues) {
      if (q.length > 0 && typeOfKey(k) === type) {
        out.push(q.shift()!);
        break;
      }
    }
  }
  for (const q of queues.values()) out.push(...q);
  return out;
}
```

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `npm test -- yardOrder`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/screens/components/yardOrder.ts apps/web/src/screens/components/yardOrder.test.ts
git commit -m "feat(yard): yardOrderKey + reconcileYardOrder (72g)"
```

---

### Task 2: подключить модуль к экрану и к перестановке внутри двора

**Files:**
- Modify: `apps/web/src/screens/LadeplanScreen.tsx` (блок `bufferOrder`/`orderedTiles` ~245–274,
  `reorderYard` ~479–509)
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx` (тест-пин ~1362–1381 в describe
  «перестановка стопок во дворе (Task 6)»)

**Interfaces:**
- Consumes: `yardOrderKey`, `reconcileYardOrder` из Task 1.
- Produces: `orderedTiles` того же типа `(BufferTile & { key: string })[]`, что и сейчас — ниже по
  файлу ничего менять не требуется.

- [ ] **Step 1: Переписать пин-тест в падающий**

Сейчас в файле лежит тест, ПИННИНГУЮЩИЙ дефект (он обязан перестать проходить):

```ts
  it('две плитки одного типа между собой не переставляются (модель порядка — по типам)', async () => {
```

Заменить его целиком (вместе с шапкой комментария над ним) на:

```ts
  // 72g: порядок двора хранится парами «количество : тип», поэтому остаток (p3×12) отличим от
  // полной стопки (p3×17) и переставляется. Драг нацелен на ТРЕТЬЮ плитку, а не на соседнюю:
  // перенос на позицию непосредственно следующей плитки — тождество для ЛЮБОЙ модели порядка
  // (вставка «перед следующим» после изъятия себя же возвращает на своё место, см. off-by-one в
  // `reorderYard`), и потому проверял бы арифметику вставки, а не различимость плиток.
  it('плитки одного типа с разным количеством переставляются (72g)', async () => {
    await withYardGeometry(async () => {
      renderPlanWithYard({ grouped: false, sameType: true });
      const yard = document.querySelector('svg[data-warehouse]')!;
      const tiles = yardTiles(yard);
      expect(tiles.map((el) => el.getAttribute('data-units'))).toEqual(['17', '12', '1']);
      await dragFromTo(tiles[0], tiles[2]);
      const after = yardTiles(yard).map((el) => el.getAttribute('data-units'));
      expect(after).toEqual(['12', '17', '1']);
    });
  });
```

Соседний тест «позитивный контроль: перенос p1 в начало…» **оставить как есть** — он и дальше
страхует рig от вакуумной зелени.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- LadeplanScreen -t "переставляются"`
Expected: FAIL — получено `['17','12','1']` (порядок не изменился), ожидалось `['12','17','1']`.

- [ ] **Step 3: Подключить модуль**

В шапке файла добавить импорт рядом с прочими из `./components/...`:

```ts
import { reconcileYardOrder, yardOrderKey } from './components/yardOrder';
```

Блок `orderedTiles` (сейчас — IIFE с локальными очередями) заменить на вызов чистой функции,
а комментарий над `bufferOrder` привести в соответствие:

```ts
  // ---- bufferOrder (B, 72g): явный пользовательский порядок двора, слой ПОВЕРХ собственного
  // порядка `tiles`, а не замена ему — `stackBuffer` пересобирается на каждом рендере (полные
  // стопки, затем остаток, по `Load.cargo`), и стабильного массива, в который можно было бы просто
  // вставить элемент, не существует. Хранит ключи «количество : тип» (`yardOrderKey`): этого
  // хватает, чтобы отличить остаток от полной стопки, и ровно этого не хватало прежней модели
  // «список cargoTypeId». Разбор — `reconcileYardOrder`, там же описаны обе его фазы.
  const [bufferOrder, setBufferOrder] = useState<string[]>([]);
  const orderedTiles = reconcileYardOrder(tiles, bufferOrder);
```

В `reorderYard` поменять только источник строк:

```ts
    const before = orderedTiles.map(yardOrderKey);
```

Абзац доккоммента `reorderYard` про «The order is stored as `cargoTypeId` strings, not tile
identities (see "Известное ограничение"…)» заменить на:

```
 *  Порядок хранится ключами «количество : тип» (`yardOrderKey`, 72g), а не идентичностями плиток:
 *  идентичности у плитки нет вовсе. Две плитки одного типа И одного количества по-прежнему
 *  взаимозаменяемы, поэтому их перестановка даёт тот же список и читается как пустой жест — так и
 *  задумано: на экране они пиксель-в-пиксель одинаковы.
```

Защиту `if (sameOrder(next, before)) return;` и проверку диапазона `from` **не трогать**.

- [ ] **Step 4: Прогнать тесты**

Run: `npm test -- LadeplanScreen`
Expected: PASS целиком, включая «позитивный контроль…», «при выключенной группировке…»,
«при включённой группировке тот же жест ничего не меняет», «resets bufferOrder…».

- [ ] **Step 5: Гейты и коммит**

```bash
npm run typecheck && npm run lint
git add apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/LadeplanScreen.test.tsx
git commit -m "fix(yard): reorder a remainder tile among full stacks (72g)"
```

---

### Task 3: бросок из кузова во двор пишет ключи с количеством

**Files:**
- Modify: `apps/web/src/screens/LadeplanScreen.tsx` (`onDropOutside` ~595–630)
- Test: `apps/web/src/screens/LadeplanScreen.test.tsx` (новый тест в describe «перестановка стопок
  во дворе (Task 6)», рядом с существующими)

**Interfaces:**
- Consumes: `yardOrderKey`, `reconcileYardOrder` (Task 1), `topRects` из `./components/cutaway`
  (`CutRect` несёт `count` — число единиц колонны, группировка по `cargoTypeId:x:y`).
- Produces: ничего нового наружу.

- [ ] **Step 1: Написать падающий тест на запасную фазу**

Фикстура кладёт в кузов колонну p3 из **5** единиц — меньше полной стопки (`per = 17`), поэтому
после возврата во двор `stackBuffer` перенарежет буфер и НИ ОДИН записанный ключ не совпадёт по
количеству. Порядок `Load.cargo` — `p1`, затем `p3`, чтобы «по умолчанию» и «в точку броска»
давали разный результат.

Добавить в describe «перестановка стопок во дворе (Task 6)» после `sameTypeLayout`:

```ts
  /** Запасная фаза реконсиляции (72g): p3 стоит в кузове колонной из 5 единиц при полной стопке в
   *  17, поэтому бросок её во двор превращает 24 неразмещённых p3 в 29 — и буфер, нарезанный
   *  [×17, ×7], становится [×17, ×12]. Ключи, записанные в момент броска (`5:p3` для брошенной,
   *  `7:p3` для остатка), не совпадают ни с одной плиткой; порядок обязан удержаться на запасной
   *  фазе (любая плитка своего типа), иначе брошенная стопка сядет на место по умолчанию. */
  const fallbackLoad: Load = {
    vehicle: yardVehicle,
    cargo: [box('p1', 'P1', 1), box('p3', 'P3', 29, { height: 100, stacking: { stackable: true, maxTiers: 17 } })],
  };
  const fallbackLayout: Layout = {
    placements: Array.from({ length: 5 }, (_, i) => ({
      cargoTypeId: 'p3', x: 0, y: 0, z: i * 100, orientation: 'lwh' as const, tier: i + 1, state: 'entschachtelt' as const,
    })),
    unplaced: [{ cargoTypeId: 'p1', count: 1 }, { cargoTypeId: 'p3', count: 24 }],
    metrics: { totalPlaced: 5, usedFloorPositions: 1, floorFillPercent: 3, volumeFillPercent: 3 },
    contractVersion: '0.14.0',
  };
```

Тест (двор в `withYardGeometry` уже отделён от кузова по Y; дополнительно нужен прямоугольник
`bufferRef`-обёртки — это `HTMLDivElement`, чей `getBoundingClientRect` в jsdom нулевой, и без
подмены `overBuffer` никогда не станет `true`):

```ts
  it('бросок из кузова садится в точку броска, даже когда буфер перенарезан (запасная фаза, 72g)', async () => {
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return { left: 0, right: 10000, top: 0, bottom: 4000, width: 10000, height: 4000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      await withYardGeometry(async () => {
        render(
          <LocaleProvider initial="de">
            <LadeplanScreen load={fallbackLoad} layout={fallbackLayout} />
          </LocaleProvider>,
        );
        const yard = document.querySelector('svg[data-warehouse]')!;
        expect(yardTiles(yard).map((el) => el.getAttribute('data-units'))).toEqual(['1', '17', '7']);

        const hold = document.querySelector('svg[data-hold="top"]')!;
        const column = hold.querySelector('[data-stack-ref="p3@0,0"]')!;
        const target = centreOf(yardTiles(yard)[0]);
        fireEvent.pointerDown(column, { clientX: -1000, clientY: -1750, pointerId: 2 });
        fireEvent.pointerMove(hold, { clientX: target.x, clientY: target.y, pointerId: 2 });
        fireEvent.pointerUp(hold, { clientX: target.x, clientY: target.y, pointerId: 2 });

        const after = yardTiles(yard).map((el) => el.getAttribute('data-units'));
        // Стопка вернулась во двор целиком: 29 неразмещённых p3 → ×17 и ×12.
        expect(after).toEqual(['17', '1', '12']);
      });
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
    }
  });
```

Если риг не срабатывает (в кузове не находится `[data-stack-ref="p3@0,0"]`, или двор не меняется
вовсе) — **чинить риг, а не ослаблять проверку**: сверьтесь с `withDropRig`/`dropStackAt` в describe
«drop lands at the release point (bufferOrder, B)», где тот же жест уже отлажен. Ожидание
`['17','1','12']` — суть теста: без запасной фазы получится `['1','17','12']` (порядок по умолчанию).

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- LadeplanScreen -t "запасная фаза"`
Expected: FAIL — получено `['1','17','12']`: снимок записан ключами старого вида, ни один не совпал.

- [ ] **Step 3: Писать ключи с количеством**

В `onDropOutside` заменить построение снимка. Количество единиц колонны берётся из `topRects`
(та же группировка `cargoTypeId:x:y`, что и в виде сверху, — своей копии правила не заводим):

```ts
        // Ключи порядка несут количество (72g), а `StackRef` его не несёт: единицы колонны берём из
        // `topRects` — той же группировки по `cargoTypeId:x:y`, что рисует вид сверху.
        const columns = topRects(load, edited);
        const unitsOf = (r: StackRef) =>
          columns.find((c) => c.cargoTypeId === r.cargoTypeId && c.x === r.x && c.y === r.y)?.count ?? 1;
        const idx = insertionIndexAt(yardFloor, pt, { orderId: orderOfType(refs[0].cargoTypeId) });
        const snapshot = orderedTiles.map(yardOrderKey);
        snapshot.splice(idx, 0, ...refs.map((r) => yardOrderKey({ cargoTypeId: r.cargoTypeId, units: unitsOf(r) })));
        setBufferOrder(snapshot);
```

Импорт `topRects` добавить к существующему импорту из `./components/cutaway` (там уже берётся
`orderIndexMap`), новую строку импорта не заводить.

Комментарий выше по блоку («once they appear, `orderedTiles`' FIFO dequeue places them per the order
just recorded here, correct by construction») исправить — «correct by construction» больше не
верно, работает запасная фаза:

```
      // ...once they appear, `reconcileYardOrder` places them per the order recorded here. Точного
      // совпадения ключа при этом НЕ гарантировано: `stackBuffer` перенарезает буфер, и вернувшаяся
      // колонна из 5 при полной стопке в 17 не даст плитки ×5 вовсе — тогда ключ снимает любую
      // плитку своего типа (запасная фаза), то есть ведёт себя как модель «по типу» до 72g.
```

- [ ] **Step 4: Прогнать тесты**

Run: `npm test -- LadeplanScreen`
Expected: PASS целиком.

- [ ] **Step 5: Гейты с корня и коммит**

```bash
npm run typecheck && npm run lint && npm test
git add apps/web/src/screens/LadeplanScreen.tsx apps/web/src/screens/LadeplanScreen.test.tsx
git commit -m "fix(yard): carry unit counts into the drop-in order snapshot (72g)"
```

---

### Task 4: документация

**Files:**
- Modify: `docs/CHANGELOG.md` (раздел `## [Unreleased]`)

- [ ] **Step 1: Запись в CHANGELOG**

Добавить в `## [Unreleased]` НАД записью «2026-08-03 — UI-пачка…»:

```markdown
### 2026-08-03 — Двор: порядок по «тип × количество» (`LKWkalk-72g`)

Контракт движка не менялся (`0.15.0`), движок не затрагивался.
Спека — [`superpowers/specs/2026-08-03-yard-order-tile-identity-design.md`](superpowers/specs/2026-08-03-yard-order-tile-identity-design.md).

- Порядок плиток во дворе хранится ключами «количество : тип» вместо списка `cargoTypeId`:
  плитка-остаток (`×12` среди `×17`) наконец переставляется жестом.
- Разбор порядка вынесен в чистый модуль `apps/web/src/screens/components/yardOrder.ts`
  (`yardOrderKey`, `reconcileYardOrder`) и покрыт модульными тестами.
- Запасная фаза реконсиляции: ключ, чьё количество не совпало ни с одной плиткой (буфер
  перенарезан после броска из кузова), снимает любую плитку своего типа — бросок садится в точку
  релиза, как и до задачи.
- Плитки одного типа И одного количества по-прежнему взаимозаменяемы: на экране они одинаковы,
  переставлять их незачем (решение владельца).
```

- [ ] **Step 2: Коммит**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): yard order by type × units (72g)"
```

---

## Проверка перед PR

- [ ] `npm run typecheck` — 0 ошибок
- [ ] `npm run lint` — 0 ошибок
- [ ] `npm test` **с корня** — все зелёные, число тестов выросло относительно 956
- [ ] Живая проверка в Chrome (метод — память `2026-08-03-cdp-browser-verification`): во дворе с
      остатком плитка `×12` перетаскивается в начало ряда и там остаётся
