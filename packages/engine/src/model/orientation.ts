// Rotation → orientation mapping (single source; ADR 013). Consumed by geometry, validation, packing.
import {
  type Orientation,
  type RotationRule,
  type LoadingMode,
  type ForkAxis,
  ORIENTATIONS,
} from './constants';

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

/**
 * Yaw orientation a two-sided stack is pinned to so its fork-entry axis faces the loading door
 * (ADR 018). `combined` (both doors available) leaves either yaw accessible → returns null (no pin).
 * Single source shared by the packer (chooseOrientation) and the geometry validator.
 */
export function forkPinnedOrientation(mode: LoadingMode, axis: ForkAxis): 'lwh' | 'wlh' | null {
  if (mode === 'combined') return null;
  // rear door → forks run along x (truck length); side door → along y (width). Axis 'length' aligns
  // the pallet's length with that axis, 'width' its width.
  if (mode === 'rear') return axis === 'length' ? 'lwh' : 'wlh';
  return axis === 'length' ? 'wlh' : 'lwh'; // side
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
