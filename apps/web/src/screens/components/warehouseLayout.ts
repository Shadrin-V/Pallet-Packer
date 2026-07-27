// Where the buffer's stacks stand on the warehouse floor (LKWkalk-sqj). Rows left to right, wrapping
// at the floor's width; the floor grows downwards to fit.
//
// This is screen arrangement, not domain: the core knows about holds and columns, not about rows and
// wrapping. It lives here with cutaway.ts and orderBreakdown.ts, and stays a pure function so it can
// be tested without a DOM.
//
// The floor is exactly as wide as the hold, and both SVGs render at width:100% inside the same
// column — that is what makes the 1:1 scale hold, with no measuring in JS. It grows in DEPTH instead,
// which is also what tells the two apart: three rows of EPAL are ~2800 mm against the hold's 2430.
import { orientedDims, type BufferStack, type Load } from '@shadrin-v/engine';

/** A buffer stack with the orientation the user has turned it to (yaw only, ADR 013).
 *
 *  Orientation is held per cargo TYPE by the caller, not per tile: the buffer's stacks of one type
 *  are interchangeable and their list positions shift on every edit, so an index-keyed orientation
 *  would hand a rotation to whichever stack slid into that slot (dwc).
 *
 *  It lives here, in the pure module, rather than in the component: it is data, not markup, and this
 *  way the layout function stands on its own — the component imports the type, not the reverse. */
export interface BufferTile extends BufferStack {
  orientation: 'lwh' | 'wlh';
  /** A placeholder opened during a carry-in drag; not a real stack (B). */
  phantom?: true;
}

export interface PlacedTile {
  tile: BufferTile;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** mm — the tallest `dy` among every tile in this tile's row, not this tile's own: a row can mix
   *  cargo heights (the buffer holds several types at once), so a tile's own `dy` under-covers its
   *  row's actual footprint. Used by `insertionIndexAt` to tell a tile's row apart from the point. */
  rowH: number;
  /** This tile's position in the `tiles` array the caller passed to `warehouseFloor`.
   *
   *  `tiles` is the layout's OWN order — grouped by order into bays, which reorders the input
   *  (a group with no order id is pushed last today; `bayOrder` will reorder them wholesale). The
   *  callers, however, splice into their own ungrouped arrays: `LadeplanScreen` into `orderedTiles`,
   *  `WarehouseFloor` into its `tiles` prop, and both index handlers by that array too. This field is
   *  the bridge between the two index spaces — without it every index the layout hands out is only
   *  accidentally right (41e.2, final review). */
  srcIndex: number;
  /** Carried over from `tile.phantom` — the gap-preview slot opened while dragging a stack in. */
  phantom?: true;
}

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

export interface WarehouseFloorLayout {
  tiles: PlacedTile[];
  /** Загоны заказов. Пуст, когда различимых заказов меньше двух — тогда двор выглядит как раньше. */
  bays: PlacedBay[];
  /** mm — always the vehicle length, so the floor shares the top view's scale. */
  width: number;
  /** mm — grows with the content; 0 when the buffer is empty. */
  height: number;
}

const GAP = 200;
const PAD = 200;
/** Поле между разметкой загона и его стопками. */
const BAY_PAD = 200;
/** Проход между соседними загонами. */
const BAY_GAP = 400;
/** Высота бирки с номером заказа — верхняя полоса внутри периметра. Единственная константа загона,
 *  которая нужна снаружи: по ней `WarehouseBay` рисует плашку и её кегль. Остальные — внутренние. */
export const TAG_H = 330;
/** Минимальная ширина загона: чтобы бирка вида `SO-1042 · ×18` не вылезала за разметку. */
const BAY_MIN_W = 2400;

type Cargo = Load['cargo'][number];

/** An input tile paired with its position in the caller's array, so that position survives grouping. */
interface SourcedTile {
  tile: BufferTile;
  srcIndex: number;
}

interface Flow {
  tiles: PlacedTile[];
  /** Правый край самой длинной строки — по нему считается ширина загона. */
  width: number;
  height: number;
}

/** Сегодняшняя раскладка рядами с переносом, в координатах от (0,0). Вынесена, чтобы её могли
 *  разделить весь двор (когда загонов нет) и каждый загон по отдельности. */
function flowTiles(tiles: SourcedTile[], byId: Map<string, Cargo>, maxWidth: number, gap: number): Flow {
  const out: PlacedTile[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let rowStart = 0;
  for (const { tile, srcIndex } of tiles) {
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
    out.push({ tile, x, y, dx, dy, rowH: 0, srcIndex, phantom: tile.phantom });
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
  tiles: SourcedTile[],
  byId: Map<string, Cargo>,
  bayOrder: string[],
): { orderId: string; tiles: SourcedTile[] }[] {
  const groups = new Map<string, SourcedTile[]>();
  for (const t of tiles) {
    const c = byId.get(t.tile.cargoTypeId);
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
  const sourced: SourcedTile[] = tiles.map((tile, srcIndex) => ({ tile, srcIndex }));

  const groups = groupByOrder(sourced, byId, opts.bayOrder ?? []);

  // Меньше двух заказов — делить нечего: рамка вокруг всего ничего не разделяет. Двор остаётся
  // ровно таким, каким был до 41e.2.
  if (groups.length < 2) {
    const flow = flowTiles(sourced, byId, width - 2 * pad, gap);
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
      units: g.tiles.reduce((s, { tile: t }) => s + (t.phantom ? 0 : t.units), 0),
      startIndex,
      count: outTiles.length - startIndex,
    });
    bx += w + BAY_GAP;
    rowH = Math.max(rowH, h);
  }
  return { tiles: outTiles, bays, width, height: by + rowH + pad };
}

/** Where a point (mm, warehouse frame) falls in the flow order: index in [0..tiles.length].
 *  Rows first (by vertical band of each placed tile — a tile is "in the point's row" when
 *  `t.y <= point.y <= t.y + t.rowH`, the ROW's height, not this tile's own `dy`: a row can mix cargo
 *  heights, so a short tile's own `dy` would end its band early and wrongly bump the point past it to
 *  the next tile), then x within the row: the point inserts before the first tile whose row it has
 *  reached and whose centre is at or right of it. A point past every row's tiles lands at the end.
 *  The loop visits tiles in flow order, so earlier rows are always consumed (skipped) before the
 *  point's own row is reached. */
function flowIndexAt(tiles: PlacedTile[], point: { x: number; y: number }): number {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (point.y > t.y + t.rowH) continue; // this tile's row is entirely above the point — already behind it
    if (point.y < t.y) return i; // point falls before this row starts (a gap above it, or the very top)
    const cx = t.x + t.dx / 2;
    if (point.x <= cx) return i; // same row, at or left of this tile's centre
  }
  return tiles.length;
}

/** Where a dropped stack lands. A stack's order is fixed by its cargo type and cannot change on a
 *  drop, so with live bays the point magnets to its own order's bay: inside it, it sets a position;
 *  outside, the stack lands at the end of its own bay.
 *
 *  The returned index is in the CALLER's index space — the `tiles` array that was handed to
 *  `warehouseFloor` — not in the layout's own grouped `tiles`. Both call sites splice it straight
 *  into their ungrouped arrays (`LadeplanScreen`'s `orderedTiles`, `WarehouseFloor`'s `tiles` prop),
 *  and the two spaces only coincide while grouping happens to preserve the input order, which it
 *  already does not (a group with no order id is pushed last) and will not by design once `bayOrder`
 *  lands. `PlacedTile.srcIndex` is what carries the input position across the grouping. */
export function insertionIndexAt(
  layout: WarehouseFloorLayout,
  point: { x: number; y: number },
  opts: { orderId?: string } = {},
): number {
  const { tiles, bays } = layout;
  // No bays — grouping did not run at all, so the layout order IS the input order and the flow index
  // needs no translation. Unchanged from before 41e.2.
  if (bays.length === 0 || opts.orderId === undefined) return flowIndexAt(tiles, point);
  const bay = bays.find((b) => b.orderId === opts.orderId);
  // This order has no stack in the yard yet: its bay will open at the end of the flow, where the
  // phantom will already show up inside it.
  if (!bay) return tiles.length;
  const inside =
    point.x >= bay.x && point.x <= bay.x + bay.w && point.y >= bay.y && point.y <= bay.y + bay.h;
  const end = bay.startIndex + bay.count;
  // Grouping is stable, so within a bay `srcIndex` increases: inserting before the bay's grouped tile
  // `k` is the same cut as inserting at `tiles[k].srcIndex` in the input array (everything of this bay
  // before `k` has a smaller `srcIndex`, everything from `k` on a larger-or-equal one), and appending
  // to the bay is the slot right after its last tile. A bay always holds at least one tile — groups
  // are built from tiles — so `end - 1` is always a real tile of this bay.
  const at = inside ? bay.startIndex + flowIndexAt(tiles.slice(bay.startIndex, end), point) : end;
  return at < end ? tiles[at].srcIndex : tiles[end - 1].srcIndex + 1;
}
