import type { CargoType, Layout, Load, Placement, UnplacedCount } from '../model/index';
import { ENGINE_CONTRACT_VERSION } from '../index';
import { packFloor, type FloorRequest } from './floor';
import { computeVerticalStack } from './vertical';

/**
 * Per-tier placements for one floor column. dz = H (entschachtelt) or stepHeight (nested); when
 * nested with no stepHeight (contract-valid when nestable:false — validate.ts gates the stepHeight
 * check on nestable:true), dz falls back to 0, matching computeVerticalStack's own `stepHeight ?? 0`
 * fallback (vertical.ts) so the emitted column never exceeds the count/height it computed.
 */
export function columnPlacements(
  cargo: CargoType,
  x: number,
  y: number,
  orientation: Placement['orientation'],
  units: number,
): Placement[] {
  const dz = cargo.state === 'entschachtelt' ? cargo.height : (cargo.nesting.stepHeight ?? 0);
  const out: Placement[] = [];
  for (let t = 0; t < units; t++) {
    out.push({
      cargoTypeId: cargo.id,
      x,
      y,
      z: t * dz,
      orientation,
      tier: t + 1,
      state: cargo.state,
    });
  }
  return out;
}

/** Group cargo into order zones, preserving order-of-first-appearance; no orderId = one implicit group. */
function zonesOf(cargo: CargoType[]): CargoType[][] {
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
  const placements: Placement[] = [];
  const placedByType = new Map<string, number>();
  let usedFloorPositions = 0;
  let xOffset = 0;

  for (const zone of zonesOf(load.cargo)) {
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
  return {
    placements,
    unplaced,
    metrics: { totalPlaced, usedFloorPositions, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: ENGINE_CONTRACT_VERSION,
  };
}
