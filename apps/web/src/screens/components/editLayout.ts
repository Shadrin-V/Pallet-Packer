// Pointer-side adapter for manual layout edits. The rules live in the engine (ADR 019, contract
// 0.12.0): `moveStack`/`rotateStack`/`unplaceStack`/`placeStack` validate, refuse with a reason and
// recompute metrics there. What is genuinely the UI's own is here — the snap grid, and the
// convenience of getting a Layout back for React state.
import {
  moveStack as moveStackCore,
  rotateStack as rotateStackCore,
  type EditResult,
  type Layout,
  type Load,
  type StackRef,
} from '@shadrin-v/engine';

export const SNAP_MM = 100;

/** Snap a mm value to the grid. */
export function snap(v: number, grid = SNAP_MM): number {
  return Math.round(v / grid) * grid;
}

/** A floor stack, addressed the way the engine addresses it. */
export type StackSel = StackRef;

/** Drop the dragged stack at the snapped pointer position. */
export function moveStack(load: Load, layout: Layout, sel: StackSel, toX: number, toY: number): EditResult {
  return moveStackCore(load, layout, sel, snap(toX), snap(toY));
}

export function rotateStack(load: Load, layout: Layout, sel: StackSel): EditResult {
  return rotateStackCore(load, layout, sel);
}
