// Rotation → orientation mapping (single source; ADR 013). Consumed by geometry, validation, packing.
import { type Orientation, type RotationRule, ORIENTATIONS } from './constants';

/**
 * Orientations a rotation rule notionally permits. Lenient: `full` → all six (used by validation's
 * vehicle-fit check and by the geometry validator). The MVP packer uses only the yaw subset — see
 * `floorOrientations`.
 */
export function allowedOrientations(rotation: RotationRule): Orientation[] {
  switch (rotation) {
    case 'none':
      return ['lwh'];
    case 'yawOnly':
      return ['lwh', 'wlh'];
    case 'full':
      return [...ORIENTATIONS];
    default:
      return [];
  }
}

/**
 * Floor (yaw) orientations the MVP packer may place. `full` is treated as yaw — tipping onto a face
 * is deferred post-MVP (ADR 013), so `full` and `yawOnly` return the same set here.
 */
export function floorOrientations(rotation: RotationRule): Array<'lwh' | 'wlh'> {
  return rotation === 'none' ? ['lwh'] : ['lwh', 'wlh'];
}

/** Map an orientation (axis order l/w/h → x/y/z) to (dx, dy, dz) from base length/width/height. */
export function orientedDims(
  l: number,
  w: number,
  h: number,
  orientation: Orientation,
): [number, number, number] {
  const src = { l, w, h };
  const axes = orientation.split('') as Array<'l' | 'w' | 'h'>;
  return [src[axes[0]], src[axes[1]], src[axes[2]]];
}
