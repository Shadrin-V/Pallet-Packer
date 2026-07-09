// Validation error codes (api-contract.md 0.1.0, §3). The engine returns codes only;
// human-readable text is produced by the UI via @pallet/i18n.

export const VALIDATION_ERROR_CODES = [
  'ERR_INVALID_DIMENSION',
  'ERR_CARGO_EXCEEDS_VEHICLE',
  'ERR_INVALID_QUANTITY',
  'ERR_INVALID_NESTING',
  'ERR_INVALID_ROTATION',
  'ERR_EMPTY_LOAD',
] as const;

export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];
