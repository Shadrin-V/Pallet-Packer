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

/** One box per floor column: every placement sharing a cargo type and (x, y) is one stack. */
function floorBoxes(load: Load, layout: Layout, exclude?: StackRef): Box[] {
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: Box[] = [];
  for (const p of layout.placements) {
    const key = `${p.cargoTypeId}@${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = byId.get(p.cargoTypeId);
    if (!c) continue;
    const ref: StackRef = { cargoTypeId: p.cargoTypeId, x: p.x, y: p.y };
    if (exclude && sameRef(ref, exclude)) continue;
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
  const boxes = floorBoxes(load, layout, opts.exclude);

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
