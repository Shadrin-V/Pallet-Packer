import type { CargoType } from '../model/index';

export interface VerticalStack {
  count: number;
  height: number;
  mode: 'entschachtelt' | 'sequential' | 'pairwise';
  /** pairwise only: number of nested pairs above the bottom single. */
  pairs?: number;
  /** pairwise only: whether a single unpaired pallet sits on top. */
  unpairedTop?: boolean;
}

function activeMode(cargo: CargoType): VerticalStack['mode'] {
  if (cargo.state === 'entschachtelt') return 'entschachtelt';
  return cargo.nesting.nestingMode ?? 'sequential';
}

/**
 * Units that fit in one vertical stack on a floor position (ADR 003, ADR 009).
 * `vehicleHeight` (Hк) and `cargo.height` (H) are integer mm.
 */
export function computeVerticalStack(cargo: CargoType, vehicleHeight: number): VerticalStack {
  const H = cargo.height;
  const Hk = vehicleHeight;
  const mode = activeMode(cargo);

  if (H <= 0 || Hk < H) {
    return { count: 0, height: 0, mode };
  }

  if (mode === 'entschachtelt') {
    let count = Math.floor(Hk / H);
    if (!cargo.stacking.stackable) count = Math.min(count, 1);
    if (cargo.stacking.maxTiers !== undefined) count = Math.min(count, cargo.stacking.maxTiers);
    count = Math.max(count, 1);
    return { count, height: count * H, mode };
  }

  if (mode === 'pairwise') {
    const hd = cargo.nesting.stepHeight ?? 0;
    const pairAdd = H + hd;
    let k = Math.floor((Hk - H) / pairAdd);
    if (k < 0) k = 0;
    let n = 2 * k + 1; // 1 bottom single + k pairs
    const allowUnpaired = cargo.nesting.allowUnpairedTop ?? false;
    const usedHeight = H + k * pairAdd;
    if (allowUnpaired && Hk - usedHeight >= H) {
      n += 1; // unpaired pallet on top
    }
    if (cargo.nesting.maxNested !== undefined) {
      n = Math.min(n, cargo.nesting.maxNested); // capacity ceiling
    }
    if ((n - 1) % 2 === 1 && !allowUnpaired) {
      n -= 1; // an unpaired top is not allowed — drop to whole pairs
    }
    n = Math.max(n, 1);
    const rest = n - 1;
    const pairs = Math.floor(rest / 2);
    const unpairedTop = rest % 2 === 1;
    const height = H + pairs * pairAdd + (unpairedTop ? H : 0);
    return { count: n, height, mode, pairs, unpairedTop };
  }

  // sequential
  const step = cargo.nesting.stepHeight && cargo.nesting.stepHeight > 0 ? cargo.nesting.stepHeight : H;
  let n = 1 + Math.floor((Hk - H) / step);
  if (cargo.nesting.maxNested !== undefined) {
    n = Math.min(n, cargo.nesting.maxNested);
  }
  n = Math.max(n, 1);
  return { count: n, height: H + (n - 1) * step, mode };
}
