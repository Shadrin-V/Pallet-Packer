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
}

export interface PlacedTile {
  tile: BufferTile;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface WarehouseFloorLayout {
  tiles: PlacedTile[];
  /** mm — always the vehicle length, so the floor shares the top view's scale. */
  width: number;
  /** mm — grows with the content; 0 when the buffer is empty. */
  height: number;
}

const GAP = 200;
const PAD = 200;

export function warehouseFloor(
  load: Load,
  tiles: BufferTile[],
  opts: { width?: number; gap?: number; pad?: number } = {},
): WarehouseFloorLayout {
  const width = opts.width ?? load.vehicle.length;
  const gap = opts.gap ?? GAP;
  const pad = opts.pad ?? PAD;
  const byId = new Map(load.cargo.map((c) => [c.id, c]));

  const out: PlacedTile[] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const tile of tiles) {
    const c = byId.get(tile.cargoTypeId);
    if (!c) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, tile.orientation);
    // Wrap — but never on the first tile of a row: a tile wider than the floor would otherwise loop
    // forever, and it has to go somewhere.
    if (x > pad && x + dx > width - pad) {
      x = pad;
      y += rowH + gap;
      rowH = 0;
    }
    out.push({ tile, x, y, dx, dy });
    x += dx + gap;
    rowH = Math.max(rowH, dy);
  }
  return { tiles: out, width, height: out.length === 0 ? 0 : y + rowH + pad };
}

/** Where a point (mm, warehouse frame) falls in the flow order: index in [0..tiles.length].
 *  Rows first (by vertical band of each placed tile — a tile is "in the point's row" when
 *  `t.y <= point.y <= t.y + t.dy`), then x within the row: the point inserts before the first tile
 *  whose row it has reached and whose centre is at or right of it. A point past every row's tiles
 *  lands at the end. Compares against each tile's own y-band rather than a global row-start, so it
 *  keeps working even if rows are ever unequal height; the loop visits tiles in flow order, so
 *  earlier rows are always consumed (skipped) before the point's own row is reached. */
export function insertionIndexAt(
  layout: WarehouseFloorLayout,
  point: { x: number; y: number },
): number {
  const { tiles } = layout;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (point.y > t.y + t.dy) continue; // this tile's row is entirely above the point — already behind it
    if (point.y < t.y) return i; // point falls before this row starts (a gap above it, or the very top)
    const cx = t.x + t.dx / 2;
    if (point.x <= cx) return i; // same row, at or left of this tile's centre
  }
  return tiles.length;
}
