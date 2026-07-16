// Domain constants (api-contract.md 0.1.0). Runtime lists drive validation and packing;
// the string-literal unions are derived from them so the two never drift.

/** Allowed rotation rules for a cargo type. */
export const ROTATION_RULES = ['none', 'yawOnly', 'full'] as const;
export type RotationRule = (typeof ROTATION_RULES)[number];

/** Nesting state of a cargo type in a load. */
export const NESTING_STATES = ['verschachtelt', 'entschachtelt'] as const;
export type NestingState = (typeof NESTING_STATES)[number];

/** How a nestable cargo type nests (ADR 009). Default is 'sequential'. */
export const NESTING_MODES = ['sequential', 'pairwise'] as const;
export type NestingMode = (typeof NESTING_MODES)[number];

/**
 * Placement orientations: axis order mapped to (length, width, height).
 * `lwh`/`wlh` are the yaw-only pair; the full set covers all six.
 */
export const ORIENTATIONS = ['lwh', 'wlh', 'lhw', 'hlw', 'whl', 'hwl'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Loading mode for the vehicle (api-contract 0.4.0). */
export const LOADING_MODES = ['rear', 'side', 'combined'] as const;
export type LoadingMode = (typeof LOADING_MODES)[number];

/** Forklift access to a stack: all four sides, or only two opposite sides (ADR 018, api-contract 0.11.0). */
export const FORK_ACCESS = ['all4', 'twoSides'] as const;
export type ForkAccess = (typeof FORK_ACCESS)[number];

/** For a two-sided stack, the pallet axis the forks run along (accessible faces are normal to it). */
export const FORK_AXES = ['length', 'width'] as const;
export type ForkAxis = (typeof FORK_AXES)[number];

/** Order-zone policy (ADR 016, api-contract 0.10.0). `strict` = adjacent zones per orderId (ADR 011);
 *  `densityFirst` = no zoning, one region, orderId no longer constrains layout. */
export const ORDER_GROUPINGS = ['strict', 'densityFirst'] as const;
export type OrderGrouping = (typeof ORDER_GROUPINGS)[number];
