// Manual layout edits (ADR 019, api-contract 0.12.0). The algebra of "what a human may do to a
// computed layout" lives here, in the core, next to the packer whose rules it must not break — the
// UI owns only the pointer and the snap grid.
//
// Every operation is pure and total: on refusal it returns the ORIGINAL layout plus an error code,
// never a half-applied edit and never silence (the UI must be able to say WHY — LKWkalk-dwc.4).
//
// Invariants held by construction (ADR 019):
//   · findGeometryViolations(load, result) === []  — bounds, overlap, rotation and fork access;
//   · placed + unplaced per cargo type is conserved — units are moved, never invented or dropped;
//   · a hand-placed column is built by `columnPlacements`, the packer's own code, so it can never be
//     taller than the computed stack (ADR 003/009);
//   · metrics are recomputed here — the UI never does arithmetic on a layout.
import type { CargoType, EngineError, Layout, Load, Placement, UnplacedCount } from '../model/index';
import { orientedDims } from '../model/orientation';
import { findGeometryViolations } from '../geometry/geometry';
import { computeFillMetrics } from '../metrics/metrics';
import { computeVerticalStack } from './vertical';
import { columnPlacements } from './orchestrator';

/** A floor column: every placement sharing this cargo type and (x, y). */
export interface StackRef {
  cargoTypeId: string;
  x: number;
  y: number;
}

export interface PlaceStackSpec {
  cargoTypeId: string;
  x: number;
  y: number;
  /** Yaw only (ADR 013): the MVP packer places no tipped columns, and a manual edit must not either. */
  orientation: 'lwh' | 'wlh';
  /** Defaults to a full stack, capped by how many units are still unplaced. */
  units?: number;
}

/** Outcome of an edit: the new layout, or the original one plus the reason it was refused. */
export interface EditResult {
  layout: Layout;
  error?: EngineError;
}

/** One draggable stack in the buffer (unplaced units, grouped into stacks). */
export interface BufferStack {
  cargoTypeId: string;
  units: number;
}

const err = (code: string, details?: Record<string, unknown>): EngineError =>
  details ? { code, details } : { code };

const isRef = (ref: StackRef) => (p: Placement) =>
  p.cargoTypeId === ref.cargoTypeId && p.x === ref.x && p.y === ref.y;

/** Stable identity of a floor column — used to test membership of a selection. */
export const refKey = (r: StackRef): string => `${r.cargoTypeId}@${r.x},${r.y}`;

/** Half-open interval overlap (touching edges do not overlap). */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Does this footprint leave the hold? Checked BEFORE overlap, on purpose: a spot outside the hold is
 * usually also on top of something, and "does not fit in the truck" is the more fundamental answer —
 * it keeps the reported reason stable instead of depending on which neighbour happens to be there.
 */
const outOfBounds = (load: Load, x: number, y: number, dx: number, dy: number): boolean =>
  x < 0 || y < 0 || x + dx > load.vehicle.length || y + dy > load.vehicle.width;

/**
 * Does the footprint at (x, y) hit any column other than `exclude`?
 *
 * findGeometryViolations deliberately skips same-(cargoTypeId, x, y) pairs — they are one column —
 * so it alone would not catch dropping a stack exactly onto another stack of the same type.
 */
function overlapsOtherStack(
  load: Load,
  layout: Layout,
  exclude: (p: Placement) => boolean,
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  return layout.placements.some((o) => {
    if (exclude(o)) return false;
    const oc = byId.get(o.cargoTypeId);
    if (!oc) return false;
    const [odx, ody] = orientedDims(oc.length, oc.width, oc.height, o.orientation);
    return overlaps1d(x, x + dx, o.x, o.x + odx) && overlaps1d(y, y + dy, o.y, o.y + ody);
  });
}

/** Map the first geometry violation to an edit error code, so the UI can explain the refusal. */
function violationError(load: Load, layout: Layout): EngineError | undefined {
  const [v] = findGeometryViolations(load, layout);
  if (!v) return undefined;
  if (v.kind === 'out-of-bounds') return err('ERR_EDIT_OUT_OF_BOUNDS', v.details);
  if (v.kind === 'fork-access') return err('ERR_EDIT_FORK_ACCESS', v.details);
  if (v.kind === 'orientation') return err('ERR_EDIT_ROTATION', v.details);
  return err('ERR_EDIT_OVERLAP', v.details);
}

const unplacedOf = (layout: Layout, cargoTypeId: string): number =>
  layout.unplaced.filter((u) => u.cargoTypeId === cargoTypeId).reduce((s, u) => s + u.count, 0);

/** Add `delta` unplaced units of a type, keeping one entry per type and dropping empties. */
function withUnplaced(layout: Layout, cargoTypeId: string, delta: number): UnplacedCount[] {
  const out: UnplacedCount[] = [];
  let seen = false;
  for (const u of layout.unplaced) {
    if (u.cargoTypeId !== cargoTypeId) {
      out.push(u);
      continue;
    }
    seen = true;
    const count = u.count + delta;
    if (count > 0) out.push({ ...u, count });
  }
  if (!seen && delta > 0) out.push({ cargoTypeId, count: delta });
  return out;
}

/** Rebuild a layout around new placements/unplaced, with metrics recomputed by the core. */
function retally(load: Load, layout: Layout, placements: Placement[], unplaced: UnplacedCount[]): Layout {
  const columns = new Set(placements.map((p) => refKey(p)));
  const next: Layout = { ...layout, placements, unplaced };
  return {
    ...next,
    metrics: {
      totalPlaced: placements.length,
      usedFloorPositions: columns.size,
      ...computeFillMetrics(load, next),
    },
  };
}

/** Take the whole column at `ref` off the floor; its units return to `unplaced`. */
export function unplaceStack(load: Load, layout: Layout, ref: StackRef): EditResult {
  const taken = layout.placements.filter(isRef(ref));
  if (taken.length === 0) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };

  return {
    layout: retally(
      load,
      layout,
      layout.placements.filter((p) => !isRef(ref)(p)),
      withUnplaced(layout, ref.cargoTypeId, taken.length),
    ),
  };
}

/** Put a stack of unplaced units at (x, y). Refuses if there is nothing left, or it would not fit. */
export function placeStack(load: Load, layout: Layout, spec: PlaceStackSpec): EditResult {
  const cargo: CargoType | undefined = load.cargo.find((c) => c.id === spec.cargoTypeId);
  if (!cargo) return { layout, error: err('ERR_EDIT_NO_STACK', { cargoTypeId: spec.cargoTypeId }) };

  const available = unplacedOf(layout, spec.cargoTypeId);
  if (available <= 0) return { layout, error: err('ERR_EDIT_NOTHING_TO_PLACE', { cargoTypeId: spec.cargoTypeId }) };

  // A hand-built column obeys the same stack rules as a packed one; it is only ever capped further,
  // by what the buffer actually holds or by an explicit request. A type that does not stand in this
  // hold at all (count 0) is refused here rather than built and caught by the geometry check.
  const full = computeVerticalStack(cargo, load.vehicle.height).count;
  if (full <= 0) {
    return { layout, error: err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: cargo.id, height: cargo.height }) };
  }
  const requested = spec.units ?? full;
  if (requested < 1) {
    return { layout, error: err('ERR_EDIT_NOTHING_TO_PLACE', { cargoTypeId: cargo.id, units: requested }) };
  }
  const units = Math.min(requested, full, available);

  const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, spec.orientation);
  if (outOfBounds(load, spec.x, spec.y, dx, dy)) {
    return { layout, error: err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: spec.cargoTypeId, x: spec.x, y: spec.y }) };
  }
  if (overlapsOtherStack(load, layout, () => false, spec.x, spec.y, dx, dy)) {
    return { layout, error: err('ERR_EDIT_OVERLAP', { cargoTypeId: spec.cargoTypeId, x: spec.x, y: spec.y }) };
  }

  const candidate = retally(
    load,
    layout,
    [...layout.placements, ...columnPlacements(cargo, spec.x, spec.y, spec.orientation, units)],
    withUnplaced(layout, spec.cargoTypeId, -units),
  );
  const bad = violationError(load, candidate);
  return bad ? { layout, error: bad } : { layout: candidate };
}

/** Move the column at `ref` to (toX, toY). Coordinates are integer mm; snapping is the UI's job. */
export function moveStack(load: Load, layout: Layout, ref: StackRef, toX: number, toY: number): EditResult {
  const selected = layout.placements.filter(isRef(ref));
  if (selected.length === 0) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };
  if (toX === ref.x && toY === ref.y) return { layout };

  const cargo = load.cargo.find((c) => c.id === ref.cargoTypeId);
  if (!cargo) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };

  const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, selected[0].orientation);
  if (outOfBounds(load, toX, toY, dx, dy)) {
    return { layout, error: err('ERR_EDIT_OUT_OF_BOUNDS', { ...ref, toX, toY }) };
  }
  if (overlapsOtherStack(load, layout, isRef(ref), toX, toY, dx, dy)) {
    return { layout, error: err('ERR_EDIT_OVERLAP', { ...ref, toX, toY }) };
  }

  const candidate: Layout = {
    ...layout,
    placements: layout.placements.map((p) => (isRef(ref)(p) ? { ...p, x: toX, y: toY } : p)),
  };
  const bad = violationError(load, candidate);
  return bad ? { layout, error: bad } : { layout: candidate };
}

/** The yaw counterpart of an orientation, or null if it is not a floor (yaw) orientation. */
const yawFlip = (o: Placement['orientation']): 'lwh' | 'wlh' | null =>
  o === 'lwh' ? 'wlh' : o === 'wlh' ? 'lwh' : null;

/**
 * Rotate the column at `ref` by 90° about the vertical axis, anchored at its (x, y) corner.
 *
 * Yaw only, per ADR 013: tipping onto a face changes dz, which would invalidate the z of every tier
 * above — that is a recomputation, not a manual edit.
 */
export function rotateStack(load: Load, layout: Layout, ref: StackRef): EditResult {
  const selected = layout.placements.filter(isRef(ref));
  if (selected.length === 0) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };

  const cargo = load.cargo.find((c) => c.id === ref.cargoTypeId);
  if (!cargo) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };
  if (cargo.rotation === 'none') {
    return { layout, error: err('ERR_EDIT_ROTATION', { cargoTypeId: cargo.id, rotation: cargo.rotation }) };
  }

  // A column the packer builds is uniform; a mixed or tipped one is not ours to rotate.
  const from = selected[0].orientation;
  const to = yawFlip(from);
  if (!to || selected.some((p) => p.orientation !== from)) {
    return { layout, error: err('ERR_EDIT_ROTATION', { cargoTypeId: cargo.id, orientation: from }) };
  }

  const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, to);
  if (outOfBounds(load, ref.x, ref.y, dx, dy)) {
    return { layout, error: err('ERR_EDIT_OUT_OF_BOUNDS', { ...ref }) };
  }
  if (overlapsOtherStack(load, layout, isRef(ref), ref.x, ref.y, dx, dy)) {
    return { layout, error: err('ERR_EDIT_OVERLAP', { ...ref }) };
  }

  const candidate: Layout = {
    ...layout,
    placements: layout.placements.map((p) => (isRef(ref)(p) ? { ...p, orientation: to } : p)),
  };
  const bad = violationError(load, candidate);
  return bad ? { layout, error: bad } : { layout: candidate };
}

/**
 * Take several columns off the floor at once (ADR 021).
 *
 * Cannot fail on geometry — the floor only empties — so the only refusal is a ref that names no
 * column, and it refuses the WHOLE call: a partially emptied floor is exactly the half-applied edit
 * ADR 019 forbids. Repeated refs are one stack; a selection is a set.
 */
export function unplaceStacks(load: Load, layout: Layout, refs: StackRef[]): EditResult {
  const unique = new Map(refs.map((r) => [refKey(r), r]));
  // Validate every ref against the ORIGINAL layout first, so nothing is applied before we know the
  // whole call is good.
  for (const ref of unique.values()) {
    if (!layout.placements.some(isRef(ref))) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };
  }
  let cur = layout;
  for (const ref of unique.values()) {
    // .error is safe to drop: this ref was already checked against the ORIGINAL layout above, and
    // unplaceStack can only refuse with ERR_EDIT_NO_STACK — a column, once found, cannot un-exist
    // partway through this loop, so every call here succeeds.
    cur = unplaceStack(load, cur, ref).layout;
  }
  return { layout: cur };
}

/**
 * Shift several columns by a common delta (ADR 021).
 *
 * Takes a DELTA rather than target coordinates: the group's mutual arrangement is then preserved by
 * construction, and "the group came apart" is not expressible. Members are excluded from each
 * other's overlap test — they move together, so a member sliding onto another member's old spot is
 * legal. Refusal is whole: the original layout comes back untouched.
 */
export function moveStacks(load: Load, layout: Layout, refs: StackRef[], dx: number, dy: number): EditResult {
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  if (unique.length === 0) return { layout };

  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const keys = new Set(unique.map(refKey));
  const moving = (p: Placement) => keys.has(refKey(p));

  // Every check runs against the original layout before anything is built — bounds for all members
  // first (the more fundamental answer, as elsewhere in this module), then overlap. Refs are
  // validated here, BEFORE the zero-delta short-circuit below, so a bogus ref is refused even at
  // (0, 0) — the same order the singular moveStack uses.
  const footprints: { ref: StackRef; w: number; h: number }[] = [];
  for (const ref of unique) {
    const column = layout.placements.filter(isRef(ref));
    const cargo = byId.get(ref.cargoTypeId);
    if (column.length === 0 || !cargo) return { layout, error: err('ERR_EDIT_NO_STACK', { ...ref }) };
    const [w, h] = orientedDims(cargo.length, cargo.width, cargo.height, column[0].orientation);
    footprints.push({ ref, w, h });
  }
  if (dx === 0 && dy === 0) return { layout };
  for (const { ref, w, h } of footprints) {
    if (outOfBounds(load, ref.x + dx, ref.y + dy, w, h)) {
      return { layout, error: err('ERR_EDIT_OUT_OF_BOUNDS', { ...ref, dx, dy }) };
    }
  }
  for (const { ref, w, h } of footprints) {
    if (overlapsOtherStack(load, layout, moving, ref.x + dx, ref.y + dy, w, h)) {
      return { layout, error: err('ERR_EDIT_OVERLAP', { ...ref, dx, dy }) };
    }
  }

  const candidate: Layout = {
    ...layout,
    placements: layout.placements.map((p) => (moving(p) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
  };
  const bad = violationError(load, candidate);
  return bad ? { layout, error: bad } : { layout: candidate };
}

/**
 * The buffer: unplaced units grouped into draggable stacks (ADR 019).
 *
 * `Layout.unplaced` counts single units, but a user drags a STACK — so the counts are cut into full
 * stacks (`computeVerticalStack.count`) plus a remainder. Order follows `Load.cargo`, i.e. the
 * request's own priority; deterministic for the same input.
 */
export function stackBuffer(load: Load, layout: Layout): BufferStack[] {
  const out: BufferStack[] = [];
  for (const cargo of load.cargo) {
    let left = unplacedOf(layout, cargo.id);
    if (left <= 0) continue;
    // count 0 = this type does not stand in this hold (validation normally rejects such a load
    // first). Offering it as stacks of one would only hand the user tiles placeStack must refuse.
    const per = computeVerticalStack(cargo, load.vehicle.height).count;
    if (per <= 0) continue;
    while (left > 0) {
      const units = Math.min(per, left);
      out.push({ cargoTypeId: cargo.id, units });
      left -= units;
    }
  }
  return out;
}
