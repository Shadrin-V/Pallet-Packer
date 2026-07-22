// Oblique axonometric projection + stack geometry for the Setup stack diagram (41e.3).
// Front face (length × height) is true; depth (width) recedes up-and-right by (DX, DY) per mm.
// Pure and DOM-free so the geometry is unit-tested without rendering.

export const DX = 0.44;
export const DY = 0.3;

export interface Pt {
  x: number;
  y: number;
}

/** Project a model point (l along length, w along width/depth, h up) to 2-D screen (y grows down). */
export function project(l: number, w: number, h: number, ox = 0, oy = 0): Pt {
  return { x: ox + l + w * DX, y: oy - h - w * DY };
}

/** Increment between tier bottoms: entschachtelt → base (flush); nested → < base (telescoped). */
export function tierStep(base: number, height: number, count: number): number {
  return count > 1 ? (height - base) / (count - 1) : 0;
}

export interface Faces {
  front: Pt[];
  top: Pt[];
  right: Pt[];
}

/** The three visible faces of a box spanning l∈[0,L], w∈[0,W], h∈[z0,z0+H] at origin (ox,oy). */
export function boxFaces(z0: number, L: number, W: number, H: number, ox = 0, oy = 0): Faces {
  const p = (l: number, w: number, h: number) => project(l, w, h, ox, oy);
  return {
    front: [p(0, 0, z0), p(L, 0, z0), p(L, 0, z0 + H), p(0, 0, z0 + H)],
    top: [p(0, 0, z0 + H), p(L, 0, z0 + H), p(L, W, z0 + H), p(0, W, z0 + H)],
    right: [p(L, 0, z0), p(L, W, z0), p(L, W, z0 + H), p(L, 0, z0 + H)],
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** SVG `points` attribute string for a polygon. */
export function polyPoints(pts: Pt[]): string {
  return pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

export interface ViewBox {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

/** viewBox spanning the whole hold box (length × width × hold) plus uniform padding. */
export function stackViewBox(length: number, width: number, hold: number, pad = 40): ViewBox {
  return {
    minX: -pad,
    minY: -pad,
    w: length + width * DX + 2 * pad,
    h: hold + width * DY + 2 * pad,
  };
}
