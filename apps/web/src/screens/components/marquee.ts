// Rubber-band selection geometry for the top view (LKWkalk-dwc.6), in mm — the same coordinate
// space the cutaway svg uses.
//
// Why this is a module and not inline in CrossSection: jsdom implements no getScreenCTM, so a
// pointer gesture cannot be exercised in a component test at all. Everything that can be decided
// without a pointer lives here, where it is testable; the component keeps only the pointer.
import type { StackRef } from '@shadrin-v/engine';
import type { CutRect } from './cutaway';

export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Two corners in any drag direction → a rect with non-negative extent. */
export function normalizeRect(ax: number, ay: number, bx: number, by: number): MarqueeRect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Half-open interval overlap for the marquee hit test: touching edges do not count as caught.
 *  This is a UI question — "did the band reach this stack?" — not a placement rule; the engine
 *  decides nothing here. It is half-open for the same reason the engine's own overlap test is:
 *  pallets parked flush against each other share an edge, and a band that stopped exactly at one
 *  stack's edge would otherwise also drag in its neighbour. */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Which stacks the marquee catches. Touch selects: any intersection counts (design 2026-07-21) —
 * a 13.6 m hold is drawn heavily squeezed across its width, so demanding full containment would be
 * a precision exercise. A zero-area marquee (a plain click) catches nothing.
 */
export function stacksInRect(rects: CutRect[], rect: MarqueeRect): StackRef[] {
  if (rect.w <= 0 || rect.h <= 0) return [];
  return rects
    .filter(
      (r) =>
        overlaps1d(r.x, r.x + r.w, rect.x, rect.x + rect.w) &&
        overlaps1d(r.y, r.y + r.h, rect.y, rect.y + rect.h),
    )
    .map((r) => ({ cargoTypeId: r.cargoTypeId, x: r.x, y: r.y }));
}

/** Stable identity of a floor column. A position alone is not one: two types can share a corner. */
export const refKey = (r: StackRef): string => `${r.cargoTypeId}@${r.x},${r.y}`;

export const hasRef = (refs: StackRef[], r: StackRef): boolean =>
  refs.some((s) => refKey(s) === refKey(r));

/** Shift/Ctrl-click: add the stack, or drop it, leaving the rest of the selection alone. */
export const toggleRef = (refs: StackRef[], r: StackRef): StackRef[] =>
  hasRef(refs, r) ? refs.filter((s) => refKey(s) !== refKey(r)) : [...refs, r];

/**
 * The box that spans the selection — the group frame drawn over the individual outlines.
 * Null when nothing is selected, or when the selection no longer matches any drawn stack (a stale
 * selection after a recompute): there is no honest box to draw for stacks that are not there.
 */
export function groupBBox(rects: CutRect[], refs: StackRef[]): MarqueeRect | null {
  const keys = new Set(refs.map(refKey));
  const hit = rects.filter((r) => keys.has(refKey({ cargoTypeId: r.cargoTypeId, x: r.x, y: r.y })));
  if (hit.length === 0) return null;
  const x = Math.min(...hit.map((r) => r.x));
  const y = Math.min(...hit.map((r) => r.y));
  const right = Math.max(...hit.map((r) => r.x + r.w));
  const bottom = Math.max(...hit.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}
