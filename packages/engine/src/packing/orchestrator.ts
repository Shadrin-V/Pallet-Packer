import type { CargoType, Layout, Load, OrderGrouping, Placement, UnplacedCount } from '../model/index';
import { ENGINE_CONTRACT_VERSION } from '../index';
import { computeFillMetrics } from '../metrics/metrics';
import { packFloor, type FloorRequest } from './floor';
import { computeVerticalStack } from './vertical';

/**
 * Height (mm) of tier `t` (0-based, bottom = 0) in one vertical column of `cargo` (qrd.22).
 *
 * - entschachtelt: `t·H` (full pallets stacked).
 * - sequential:    `t·Δh` (each pallet nests Δh above the one below); Δh guarded to H if ≤ 0.
 * - pairwise (ADR 009): bottom single at 0, then pairs — pair p (1-based) spans `[H+(p−1)(H+h_д),
 *   H+p(H+h_д)]` with its two pallets at that base and at `+h_д`. So the top pallet of a full column
 *   reaches `computeVerticalStack.height` (matching the stack preview/metrics), instead of the old
 *   collapsed `t·h_д` sub-representation. A partial column (`units < n`) just takes the first tiers.
 */
function tierZ(cargo: CargoType, t: number): number {
  const H = cargo.height;
  if (cargo.state === 'entschachtelt') return t * H;

  const step = cargo.nesting.stepHeight;
  const mode = cargo.nesting.nestingMode ?? 'sequential';
  if (mode === 'pairwise') {
    if (t === 0) return 0;
    const hd = step ?? 0;
    const p = Math.ceil(t / 2); // which pair this tier belongs to (1-based)
    const base = H + (p - 1) * (H + hd);
    return t % 2 === 1 ? base : base + hd; // odd tier = pair base, even tier = +h_д
  }
  // sequential
  const dh = step && step > 0 ? step : H;
  return t * dh;
}

/** Per-tier placements for one floor column (qrd.7); z per {@link tierZ} so the column reaches its
 * true computed height (esp. pairwise — see qrd.22). */
export function columnPlacements(
  cargo: CargoType,
  x: number,
  y: number,
  orientation: Placement['orientation'],
  units: number,
): Placement[] {
  const out: Placement[] = [];
  for (let t = 0; t < units; t++) {
    out.push({
      cargoTypeId: cargo.id,
      x,
      y,
      z: tierZ(cargo, t),
      orientation,
      tier: t + 1,
      state: cargo.state,
    });
  }
  return out;
}

/**
 * Group cargo into order zones (ADR 011/016). `strict` (default): one zone per orderId, preserving
 * order-of-first-appearance (no orderId = one implicit group). `densityFirst`: no zoning — a single
 * region over all cargo, so orderId no longer constrains the layout.
 */
function zonesOf(cargo: CargoType[], grouping: OrderGrouping): CargoType[][] {
  if (grouping === 'densityFirst') return cargo.length > 0 ? [cargo] : [];
  const order: (string | undefined)[] = [];
  const map = new Map<string | undefined, CargoType[]>();
  for (const c of cargo) {
    if (!map.has(c.orderId)) {
      map.set(c.orderId, []);
      order.push(c.orderId);
    }
    map.get(c.orderId)!.push(c);
  }
  return order.map((k) => map.get(k)!);
}

/**
 * Orchestrate a full Load into a Layout (qrd.7): zone by orderId (ADR 011), place each zone's floor
 * footprints via packFloor (ADR 004/012), expand each floor position into a per-tier column via
 * computeVerticalStack + columnPlacements, and track unplaced remainders. Zones are laid out as
 * adjacent slices along vehicle length (order = first appearance in `load.cargo`).
 */
export function packLoad(load: Load): Layout {
  const { vehicle } = load;
  const clearance = load.clearance ?? 0;
  const loadingMode = load.loadingMode ?? 'combined'; // contract/ADR-012 default
  const grouping: OrderGrouping = load.orderGrouping ?? 'strict'; // contract/ADR-016 default
  const placements: Placement[] = [];
  const placedByType = new Map<string, number>();
  let usedFloorPositions = 0;
  let xOffset = 0;

  for (const zone of zonesOf(load.cargo, grouping)) {
    const region = { length: vehicle.length - xOffset, width: vehicle.width };
    if (region.length <= 0) break;
    // vertical capacity per type
    const stackOf = new Map<string, number>();
    const requests: FloorRequest[] = [];
    const fillReqs: FloorRequest[] = [];
    for (const c of zone) {
      const S = computeVerticalStack(c, vehicle.height).count;
      stackOf.set(c.id, S);
      if (S <= 0) continue;
      const req: FloorRequest = {
        cargoTypeId: c.id,
        length: c.length,
        width: c.width,
        rotation: c.rotation,
        count: c.fill ? 1_000_000 : Math.ceil(c.quantity / S),
        forkAccess: c.forkAccess,
        forkAxis: c.forkAxis,
      };
      (c.fill ? fillReqs : requests).push(req);
    }
    const fps = packFloor(region, [...requests, ...fillReqs], { clearance, loadingMode });
    // remaining quantity per type (fill = Infinity)
    const remaining = new Map<string, number>();
    for (const c of zone) remaining.set(c.id, c.fill ? Number.POSITIVE_INFINITY : c.quantity);
    let maxX = 0;
    for (const fp of fps) {
      const c = zone.find((z) => z.id === fp.cargoTypeId)!;
      const S = stackOf.get(fp.cargoTypeId)!;
      const rem = remaining.get(fp.cargoTypeId)!;
      const units = Math.min(S, rem);
      if (units <= 0) continue;
      remaining.set(fp.cargoTypeId, rem - units);
      placements.push(...columnPlacements(c, fp.x + xOffset, fp.y, fp.orientation, units));
      placedByType.set(fp.cargoTypeId, (placedByType.get(fp.cargoTypeId) ?? 0) + units);
      usedFloorPositions++;
      maxX = Math.max(maxX, fp.x + fp.dx);
    }
    xOffset += maxX + (maxX > 0 ? clearance : 0);
  }

  const unplaced: UnplacedCount[] = [];
  for (const c of load.cargo) {
    if (c.fill) continue;
    const placed = placedByType.get(c.id) ?? 0;
    if (placed < c.quantity) unplaced.push({ cargoTypeId: c.id, count: c.quantity - placed });
  }
  const totalPlaced = [...placedByType.values()].reduce((a, b) => a + b, 0);
  const layout: Layout = {
    placements,
    unplaced,
    metrics: { totalPlaced, usedFloorPositions, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: ENGINE_CONTRACT_VERSION,
  };
  const fill = computeFillMetrics(load, layout);
  layout.metrics.floorFillPercent = fill.floorFillPercent;
  layout.metrics.volumeFillPercent = fill.volumeFillPercent;
  return layout;
}
