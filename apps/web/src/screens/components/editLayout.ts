// The pointer's own share of manual layout edits. The rules live in the engine (ADR 019), and since
// ADR 020 so does the search for a place (`resolveDrop`) — what is left here is genuinely the UI's:
// the grid a dragged stack's AIM is rounded to.
//
// The grid tidies the aim only. The magnet then resolves that aim to a real spot, which may be flush
// against a neighbour at any millimetre (a 1340 mm Sonderpalette leaves no round edges) — so the
// resolved coordinates go to the engine untouched. Rounding them again would undo the fit.
import type { StackRef } from '@shadrin-v/engine';

export const SNAP_MM = 100;

/** Snap a mm value to the grid. */
export function snap(v: number, grid = SNAP_MM): number {
  return Math.round(v / grid) * grid;
}

/** A floor stack, addressed the way the engine addresses it. */
export type StackSel = StackRef;
