// Magnet drop resolution (ADR 020, api-contract 0.13.0). Answers ONE question: given where the user
// aimed a stack, where may it actually stand? Pure and total, like the rest of the edit algebra.
//
// Why it lives in the core: "where a stack may stand" is a domain rule, not a pointer detail — the UI
// owning it would be the second place that knows the packing rules (ADR 019).
//
// Why it is a separate function rather than a `tolerance` flag on placeStack: placeStack judges the
// point it is given. An API/MCP caller must be able to say "put it exactly here, refuse otherwise" —
// a placeStack that quietly relocates cargo is not that operation.
//
// Scope: this resolves a POSITION. It checks rotation and fork access because under them NO position
// works, so searching is pointless. It does NOT check unit availability — that is not a question
// about position (and is meaningless when moving a stack that already stands). placeStack owns it.
//
// It is cheap enough to run on every pointermove, which is what makes a live drop preview honest:
// only bounds and overlap depend on x/y, and both cost one pass over the floor columns.
import type { EngineError, Layout, Load } from '../model/index';
import { allowedOrientations, forkPinnedOrientation, orientedDims } from '../model/orientation';
import { refKey } from './edit';
import type { PlaceStackSpec, StackRef } from './edit';

/** Where the stack would land, and whether it may. */
export interface DropResolution {
  x: number;
  y: number;
  ok: boolean;
  /** Why not, when !ok. */
  error?: EngineError;
  /** Stacks in the way at the aim — the UI outlines these in red. Empty when ok. */
  blocking: StackRef[];
}

export interface ResolveDropOptions {
  /** How far the magnet may pull, in mm. Default: half the footprint's shorter side. */
  tolerance?: number;
  /** Moving an existing stack: it must not count itself as an obstacle. */
  exclude?: StackRef;
}

const err = (code: string, details?: Record<string, unknown>): EngineError =>
  details ? { code, details } : { code };

/** Half-open interval overlap (touching edges do not overlap) — the rule edit.ts uses. */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

const sameRef = (a: StackRef, b: StackRef) =>
  a.cargoTypeId === b.cargoTypeId && a.x === b.x && a.y === b.y;

interface Box extends StackRef {
  dx: number;
  dy: number;
}

/**
 * One box per floor column: every placement sharing a cargo type and (x, y) is one stack.
 *
 * `exclude` is a predicate rather than a single ref because a group excludes a whole SET of columns
 * (ADR 021) — its own members. The single-stack caller passes a one-ref predicate and is unaffected.
 */
function floorBoxes(load: Load, layout: Layout, exclude?: (ref: StackRef) => boolean): Box[] {
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: Box[] = [];
  for (const p of layout.placements) {
    const key = refKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = byId.get(p.cargoTypeId);
    if (!c) continue;
    const ref: StackRef = { cargoTypeId: p.cargoTypeId, x: p.x, y: p.y };
    if (exclude?.(ref)) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, p.orientation);
    out.push({ ...ref, dx, dy });
  }
  return out;
}

export function resolveDrop(
  load: Load,
  layout: Layout,
  spec: PlaceStackSpec,
  opts: ResolveDropOptions = {},
): DropResolution {
  const aim = { x: spec.x, y: spec.y };
  const refuse = (error: EngineError, blocking: StackRef[] = []): DropResolution => ({
    ...aim,
    ok: false,
    error,
    blocking,
  });

  const cargo = load.cargo.find((c) => c.id === spec.cargoTypeId);
  if (!cargo) return refuse(err('ERR_EDIT_NO_STACK', { cargoTypeId: spec.cargoTypeId }));

  // Position-independent rules first. Nudging cannot fix either, so do not even search.
  if (!allowedOrientations(cargo.rotation).includes(spec.orientation)) {
    return refuse(
      err('ERR_EDIT_ROTATION', {
        cargoTypeId: cargo.id,
        orientation: spec.orientation,
        rotation: cargo.rotation,
      }),
    );
  }
  if (cargo.forkAccess === 'twoSides') {
    const pinned = forkPinnedOrientation(load.loadingMode ?? 'combined', cargo.forkAxis ?? 'length');
    if (pinned !== null && spec.orientation !== pinned) {
      return refuse(
        err('ERR_EDIT_FORK_ACCESS', {
          cargoTypeId: cargo.id,
          orientation: spec.orientation,
          loadingMode: load.loadingMode ?? 'combined',
          forkAxis: cargo.forkAxis ?? 'length',
        }),
      );
    }
  }

  const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, spec.orientation);
  const maxX = load.vehicle.length - dx;
  const maxY = load.vehicle.width - dy;
  if (maxX < 0 || maxY < 0) {
    return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: cargo.id, dx, dy }));
  }

  const tol = opts.tolerance ?? Math.min(dx, dy) / 2;
  const boxes = floorBoxes(load, layout, opts.exclude ? (r) => sameRef(r, opts.exclude!) : undefined);

  // Candidates per axis: the aim itself, both walls, and flush against every neighbour's edges.
  // Filtered to what is inside the hold and within reach of the aim — so the magnet can tidy a near
  // miss but never teleport the stack somewhere the user was not pointing.
  const axis = (aimV: number, size: number, max: number, edges: [number, number][]): number[] => {
    const out = new Set<number>();
    const push = (v: number) => {
      if (v >= 0 && v <= max && Math.abs(v - aimV) <= tol) out.add(v);
    };
    push(aimV);
    push(0);
    push(max);
    for (const [start, extent] of edges) {
      push(start + extent); // our near edge against their far edge
      push(start - size); // our far edge against their near edge
    }
    return [...out];
  };
  const xs = axis(
    aim.x,
    dx,
    maxX,
    boxes.map((b): [number, number] => [b.x, b.dx]),
  );
  const ys = axis(
    aim.y,
    dy,
    maxY,
    boxes.map((b): [number, number] => [b.y, b.dy]),
  );

  const hits = (x: number, y: number): Box[] =>
    boxes.filter(
      (b) => overlaps1d(x, x + dx, b.x, b.x + b.dx) && overlaps1d(y, y + dy, b.y, b.y + b.dy),
    );

  const touchesX = (v: number) =>
    v === 0 || v === maxX || boxes.some((b) => v === b.x + b.dx || v + dx === b.x);
  const touchesY = (v: number) =>
    v === 0 || v === maxY || boxes.some((b) => v === b.y + b.dy || v + dy === b.y);

  // Flush beats near: a loader parks pallets edge to edge, and a 60 mm gap is neither wanted nor
  // honest about how much still fits. Distance decides among equally flush spots; (x, y) breaks the
  // last tie, so the same drop always resolves the same way.
  let best: { x: number; y: number; flush: number; dist: number } | null = null;
  for (const x of xs) {
    for (const y of ys) {
      if (hits(x, y).length > 0) continue;
      const cand = {
        x,
        y,
        flush: (touchesX(x) ? 1 : 0) + (touchesY(y) ? 1 : 0),
        dist: Math.hypot(x - aim.x, y - aim.y),
      };
      if (
        !best ||
        cand.flush > best.flush ||
        (cand.flush === best.flush &&
          (cand.dist < best.dist ||
            (cand.dist === best.dist &&
              (cand.x < best.x || (cand.x === best.x && cand.y < best.y)))))
      ) {
        best = cand;
      }
    }
  }

  if (best) return { x: best.x, y: best.y, ok: true, blocking: [] };

  // Nothing within reach. Report the aim's own problem — bounds first, as edit.ts does: "does not fit
  // in the truck" is the more fundamental answer than "is on top of that pallet".
  const outside = aim.x < 0 || aim.y < 0 || aim.x > maxX || aim.y > maxY;
  if (outside) {
    return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { cargoTypeId: cargo.id, x: aim.x, y: aim.y }));
  }
  const blocking = hits(aim.x, aim.y).map(({ cargoTypeId, x, y }) => ({ cargoTypeId, x, y }));
  return refuse(err('ERR_EDIT_OVERLAP', { cargoTypeId: cargo.id, x: aim.x, y: aim.y }), blocking);
}

/** How far a group was dragged, in mm. A delta, not a target — the group is rigid (ADR 021). */
export interface GroupAim {
  dx: number;
  dy: number;
}

/**
 * Options for the group magnet. Deliberately NOT ResolveDropOptions: that type's `exclude` names the
 * one stack a single-stack drag must not trip over, and a group excludes its own members
 * structurally — there is no second meaning for it here, so the field is not offered at all.
 */
export interface GroupDropOptions {
  /** How far the magnet may pull, in mm. Applied identically to every member; the group is rigid.
   *  Default: the tightest member's own default (half its shorter side). */
  tolerance?: number;
}

/** Where the whole group would land, and whether it may. */
export interface GroupDropResolution {
  dx: number;
  dy: number;
  ok: boolean;
  /** Why not, when !ok. */
  error?: EngineError;
  /** Unselected stacks in the way at the aim — the UI outlines these in red. Empty when ok. */
  blocking: StackRef[];
}

/**
 * The magnet for a rigid group (ADR 021) — the same question as resolveDrop, asked about a DELTA.
 *
 * Candidates are common deltas: each member contributes the deltas that would put IT at its aim, at
 * either wall, or flush against a neighbour's edge; a delta is legal when EVERY member is then in
 * bounds and clear of every unselected column. Members never block each other — they move together.
 *
 * Ordering is deliberate and is what keeps this cheap enough for every pointermove: candidates are
 * scored first (O(1) each after the per-axis precomputation), then validated in score order until
 * the first legal one, so the expensive check normally runs once or twice.
 */
export function resolveGroupDrop(
  load: Load,
  layout: Layout,
  refs: StackRef[],
  aim: GroupAim,
  opts: GroupDropOptions = {},
): GroupDropResolution {
  const refuse = (error: EngineError, blocking: StackRef[] = []): GroupDropResolution => ({
    dx: aim.dx,
    dy: aim.dy,
    ok: false,
    error,
    blocking,
  });

  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  if (unique.length === 0) return refuse(err('ERR_EDIT_NO_STACK'));

  // Members with their footprints, taken from the layout (their own orientation, not a guess).
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const members: Box[] = [];
  for (const ref of unique) {
    const column = layout.placements.find(
      (p) => p.cargoTypeId === ref.cargoTypeId && p.x === ref.x && p.y === ref.y,
    );
    const cargo = byId.get(ref.cargoTypeId);
    if (!column || !cargo) return refuse(err('ERR_EDIT_NO_STACK', { ...ref }));
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, column.orientation);
    members.push({ ...ref, dx, dy });
  }

  const selected = new Set(members.map(refKey));
  const boxes = floorBoxes(load, layout, (r) => selected.has(refKey(r)));

  // Default tolerance: the tightest member's own default. The group must not be pulled further than
  // its most sensitive participant would be.
  const tol = opts.tolerance ?? Math.min(...members.map((m) => Math.min(m.dx, m.dy) / 2));

  // Candidate deltas per axis. Each member offers: stay at the aim, sit at either wall, or sit flush
  // against a neighbour's near/far edge — all expressed as a delta by subtracting the member's own
  // current coordinate. Filtered to what is within reach of the aimed delta.
  const axisDeltas = (
    aimD: number,
    pick: (m: Box) => { pos: number; size: number },
    max: (m: Box) => number,
    edges: (b: Box) => { start: number; extent: number },
  ): number[] => {
    const out = new Set<number>([aimD]);
    for (const m of members) {
      const { pos, size } = pick(m);
      const lim = max(m);
      const push = (target: number) => {
        const d = target - pos;
        if (target >= 0 && target <= lim && Math.abs(d - aimD) <= tol) out.add(d);
      };
      push(pos + aimD);
      push(0);
      push(lim);
      for (const b of boxes) {
        const { start, extent } = edges(b);
        push(start + extent); // our near edge against their far edge
        push(start - size); // our far edge against their near edge
      }
    }
    return [...out];
  };

  const dxs = axisDeltas(
    aim.dx,
    (m) => ({ pos: m.x, size: m.dx }),
    (m) => load.vehicle.length - m.dx,
    (b) => ({ start: b.x, extent: b.dx }),
  );
  const dys = axisDeltas(
    aim.dy,
    (m) => ({ pos: m.y, size: m.dy }),
    (m) => load.vehicle.width - m.dy,
    (b) => ({ start: b.y, extent: b.dy }),
  );

  // Flush = at least one member ends against a wall or a neighbour's edge on that axis.
  const flushX = (d: number) =>
    members.some(
      (m) =>
        m.x + d === 0 ||
        m.x + d === load.vehicle.length - m.dx ||
        boxes.some((b) => m.x + d === b.x + b.dx || m.x + d + m.dx === b.x),
    );
  const flushY = (d: number) =>
    members.some(
      (m) =>
        m.y + d === 0 ||
        m.y + d === load.vehicle.width - m.dy ||
        boxes.some((b) => m.y + d === b.y + b.dy || m.y + d + m.dy === b.y),
    );

  const hitsAt = (ddx: number, ddy: number): Box[] =>
    boxes.filter((b) =>
      members.some(
        (m) =>
          overlaps1d(m.x + ddx, m.x + ddx + m.dx, b.x, b.x + b.dx) &&
          overlaps1d(m.y + ddy, m.y + ddy + m.dy, b.y, b.y + b.dy),
      ),
    );
  const inBounds = (ddx: number, ddy: number): boolean =>
    members.every(
      (m) =>
        m.x + ddx >= 0 &&
        m.y + ddy >= 0 &&
        m.x + ddx + m.dx <= load.vehicle.length &&
        m.y + ddy + m.dy <= load.vehicle.width,
    );

  // Score cheaply, sort, then validate in order — the expensive check runs on the winner, not on
  // the whole cross product. Flush beats near; distance breaks ties; (dx, dy) breaks the last one,
  // so the same drag always resolves the same way.
  //
  // flushX/flushY depend only on their own axis value, not on the pairing — memoise per distinct
  // value instead of recomputing it once per cross-product cell.
  const flushXByValue = new Map(dxs.map((d) => [d, flushX(d)]));
  const flushYByValue = new Map(dys.map((d) => [d, flushY(d)]));
  const scored = dxs
    .flatMap((ddx) => dys.map((ddy) => ({ ddx, ddy })))
    .map(({ ddx, ddy }) => ({
      ddx,
      ddy,
      flush: (flushXByValue.get(ddx) ? 1 : 0) + (flushYByValue.get(ddy) ? 1 : 0),
      dist: Math.hypot(ddx - aim.dx, ddy - aim.dy),
    }))
    .sort((a, b) => b.flush - a.flush || a.dist - b.dist || a.ddx - b.ddx || a.ddy - b.ddy);

  for (const c of scored) {
    if (!inBounds(c.ddx, c.ddy)) continue;
    if (hitsAt(c.ddx, c.ddy).length > 0) continue;
    return { dx: c.ddx, dy: c.ddy, ok: true, blocking: [] };
  }

  // Nothing within reach. Report the aim's own problem — bounds first, as edit.ts does.
  if (!inBounds(aim.dx, aim.dy)) {
    return refuse(err('ERR_EDIT_OUT_OF_BOUNDS', { dx: aim.dx, dy: aim.dy }));
  }
  const blocking = hitsAt(aim.dx, aim.dy).map(({ cargoTypeId, x, y }) => ({ cargoTypeId, x, y }));
  return refuse(err('ERR_EDIT_OVERLAP', { dx: aim.dx, dy: aim.dy }), blocking);
}
