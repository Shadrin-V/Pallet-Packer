import type { RotationRule } from '../model/index';

export interface FloorRequest {
  cargoTypeId: string;
  /** Cargo footprint length (l) and width (w), mm. */
  length: number;
  width: number;
  rotation: RotationRule;
  /** How many to place (use a large number for "fill"). */
  count: number;
}

export interface FloorPlacement {
  cargoTypeId: string;
  x: number;
  y: number;
  /** Footprint extent along x (length axis) and y (width axis), mm. */
  dx: number;
  dy: number;
  /** Floor-plane orientation; height stays on z. */
  orientation: 'lwh' | 'wlh';
}

/** Choose a footprint orientation, preferring the longer side along the truck length (x). */
function chooseOrientation(req: FloorRequest): { dx: number; dy: number; orientation: 'lwh' | 'wlh' } {
  const canRotate = req.rotation === 'yawOnly' || req.rotation === 'full';
  if (canRotate && req.width > req.length) {
    return { dx: req.width, dy: req.length, orientation: 'wlh' };
  }
  return { dx: req.length, dy: req.width, orientation: 'lwh' };
}

/**
 * Deterministic 2D floor packer (ADR 004, shelf/grid heuristic). Each request type is grid-packed
 * into a width band, rows along y, columns along x, with a uniform `clearance`. Not a global
 * optimum (PLP-optimal patterns are deferred); it matches the loading references
 * (33 EUR / 20 Gitterbox on a 13600×2430 floor).
 */
export function packFloor(
  floor: { length: number; width: number },
  requests: FloorRequest[],
  clearance = 0,
): FloorPlacement[] {
  const out: FloorPlacement[] = [];
  let yCursor = 0;

  for (const req of requests) {
    if (req.count <= 0) continue;
    const { dx, dy, orientation } = chooseOrientation(req);
    if (dx <= 0 || dy <= 0) continue;

    const stepX = dx + clearance;
    const stepY = dy + clearance;
    // N items need N*dim + (N-1)*clearance ≤ span  ⇔  N ≤ (span + clearance) / (dim + clearance).
    const cols = Math.floor((floor.length + clearance) / stepX);
    const rows = Math.floor((floor.width - yCursor + clearance) / stepY);
    if (cols <= 0 || rows <= 0) continue;

    let remaining = req.count;
    let usedRows = 0;
    for (let r = 0; r < rows && remaining > 0; r++) {
      for (let c = 0; c < cols && remaining > 0; c++) {
        out.push({ cargoTypeId: req.cargoTypeId, x: c * stepX, y: yCursor + r * stepY, dx, dy, orientation });
        remaining--;
      }
      usedRows = r + 1;
    }

    yCursor += usedRows * stepY;
    if (yCursor >= floor.width) break;
  }

  return out;
}
