// @shadrin-v/engine — public entry point.
// Production exports are added test-first (TDD).

/** Version of the engine JSON API contract (see docs/api-contract.md). */
export const ENGINE_CONTRACT_VERSION = '0.5.0';

export * from './model/index';
export { calculateLayout, getLayoutReport } from './api/api';
export { validateLoad } from './validation/validate';
