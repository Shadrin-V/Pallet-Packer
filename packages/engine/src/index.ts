// @shadrin-v/engine — public entry point.
// Production exports are added test-first (TDD).

/** Version of the engine JSON API contract (see docs/api-contract.md). */
export const ENGINE_CONTRACT_VERSION = '0.9.0';

export * from './model/index';
export { calculateLayout, getLayoutReport, computeStack } from './api/api';
export type { StackPreview } from './api/api';
export { validateLoad } from './validation/validate';
export { orientedDims } from './model/orientation';
export { findGeometryViolations } from './geometry/geometry';
export type { GeometryViolation } from './geometry/geometry';
