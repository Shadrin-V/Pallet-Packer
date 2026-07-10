import type { CargoType } from '../model/index';

export interface VerticalStack {
  count: number;
  height: number;
  mode: 'entschachtelt' | 'sequential' | 'pairwise';
  /** pairwise only: number of nested pairs above the bottom single. */
  pairs?: number;
  /** pairwise only: whether a single unpaired pallet sits on top. */
  unpairedTop?: boolean;
  // Formula operands (qrd.26, api-contract 0.7.0) — let the UI render the derivation
  // ("how N was reached") without duplicating the stacking logic.
  /** Base unit height H, mm. */
  base: number;
  /** Hold height Hк, mm. */
  hold: number;
  /** Effective per-nest increment: Δh (sequential) or h_д (pairwise), mm. Absent for entschachtelt. */
  stepHeight?: number;
  /** Count before any maxTiers / maxNested / non-stackable cap (the raw physical fit). */
  rawCount: number;
  /** Which cap reduced the raw count to `count` (if any). */
  cappedBy?: 'maxTiers' | 'maxNested' | 'notStackable';
  /** Numeric cap that was applied (maxTiers or maxNested); absent when `cappedBy` is 'notStackable'. */
  cap?: number;
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
    return { count: 0, height: 0, mode, base: H, hold: Hk, rawCount: 0 };
  }

  if (mode === 'entschachtelt') {
    const rawCount = Math.floor(Hk / H);
    const afterStackable = cargo.stacking.stackable ? rawCount : Math.min(rawCount, 1);
    const afterMaxTiers =
      cargo.stacking.maxTiers !== undefined
        ? Math.min(afterStackable, cargo.stacking.maxTiers)
        : afterStackable;
    const count = Math.max(afterMaxTiers, 1);

    let cappedBy: VerticalStack['cappedBy'];
    let cap: number | undefined;
    if (cargo.stacking.maxTiers !== undefined && cargo.stacking.maxTiers < afterStackable) {
      cappedBy = 'maxTiers';
      cap = cargo.stacking.maxTiers;
    } else if (!cargo.stacking.stackable && rawCount > 1) {
      cappedBy = 'notStackable';
    }
    return { count, height: count * H, mode, base: H, hold: Hk, rawCount, cappedBy, cap };
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
    const rawCount = n;
    let cappedBy: VerticalStack['cappedBy'];
    let cap: number | undefined;
    if (cargo.nesting.maxNested !== undefined) {
      if (cargo.nesting.maxNested < n) {
        cappedBy = 'maxNested';
        cap = cargo.nesting.maxNested;
      }
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
    return { count: n, height, mode, pairs, unpairedTop, base: H, hold: Hk, stepHeight: hd, rawCount, cappedBy, cap };
  }

  // sequential
  const step = cargo.nesting.stepHeight && cargo.nesting.stepHeight > 0 ? cargo.nesting.stepHeight : H;
  const rawCount = 1 + Math.floor((Hk - H) / step);
  let n = rawCount;
  let cappedBy: VerticalStack['cappedBy'];
  let cap: number | undefined;
  if (cargo.nesting.maxNested !== undefined) {
    if (cargo.nesting.maxNested < n) {
      cappedBy = 'maxNested';
      cap = cargo.nesting.maxNested;
    }
    n = Math.min(n, cargo.nesting.maxNested);
  }
  n = Math.max(n, 1);
  return { count: n, height: H + (n - 1) * step, mode, base: H, hold: Hk, stepHeight: step, rawCount, cappedBy, cap };
}
