import type { ForkAccess, RotationRule } from '@shadrin-v/engine';

/**
 * Single user-facing orientation setting (ADR 018), mapped to the engine's rotation + forkAccess:
 * - `fixed`    → don't rotate (rotation 'none')
 * - `free`     → rotate freely, accessible from all sides (yawOnly + all4)
 * - `twoSided` → rotate, but only two opposite sides are forklift-accessible (yawOnly + twoSides)
 * `full` is not offered in the UI (packer treats it as yaw, ADR 013) and maps to `free`.
 */
export type OrientationChoice = 'fixed' | 'free' | 'twoSided';

export const ORIENTATION_CHOICES: OrientationChoice[] = ['fixed', 'free', 'twoSided'];

export function orientationChoiceOf(rotation: RotationRule, forkAccess?: ForkAccess): OrientationChoice {
  if (rotation === 'none') return 'fixed'; // fixed orientation: no yaw for fork access to constrain
  if (forkAccess === 'twoSides') return 'twoSided';
  return 'free';
}

export function orientationFieldsFor(choice: OrientationChoice): {
  rotation: RotationRule;
  forkAccess: ForkAccess;
} {
  switch (choice) {
    case 'fixed':
      return { rotation: 'none', forkAccess: 'all4' };
    case 'twoSided':
      return { rotation: 'yawOnly', forkAccess: 'twoSides' };
    case 'free':
    default:
      return { rotation: 'yawOnly', forkAccess: 'all4' };
  }
}
