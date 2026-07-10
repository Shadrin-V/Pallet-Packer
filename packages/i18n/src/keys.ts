// Canonical set of translation keys for the MVP UI (vehicle selection, cargo/order editor,
// calculate, results, JSON export) plus engine validation error codes (ADR 006,
// docs/api-contract.md §3). Adding a key here and to every locale dictionary in `dictionaries/`
// is the only change needed to extend the vocabulary — no lookup-function changes.
export const TRANSLATION_KEYS = [
  // App
  'app.title',

  // Shared field labels (vehicle + cargo-type forms)
  'field.name',
  'field.length',
  'field.width',
  'field.height',
  'field.quantity',
  'field.orderId',

  // Vehicle selection screen
  'vehicle.label',
  'vehicle.cargoHold',

  // Cargo/order editor screen
  'cargoType.label',
  'cargoType.rotation.label',
  'cargoType.rotation.none',
  'cargoType.rotation.yawOnly',
  'cargoType.rotation.full',
  'cargoType.stacking.label',
  'cargoType.nesting.label',

  // Actions
  'action.calculate',
  'action.exportJson',

  // Results / report metrics
  'results.totalPlaced',
  'results.unplaced',
  'results.floorFillPercent',
  'results.volumeFillPercent',
  'results.placed',
  'results.requested',

  // Units
  'unit.mm',

  // Engine validation error codes. Mirrors packages/engine/src/validation/codes.ts plus
  // ERR_UNKNOWN_VEHICLE (api-contract.md §3), reserved for future vehicle-storage validation and
  // not yet emitted by the engine. Kept as literals here (not imported from @shadrin-v/engine) so
  // @shadrin-v/i18n has no build-order dependency on the engine package; revisit if the two start
  // drifting.
  'ERR_INVALID_DIMENSION',
  'ERR_CARGO_EXCEEDS_VEHICLE',
  'ERR_INVALID_QUANTITY',
  'ERR_INVALID_NESTING',
  'ERR_INVALID_ROTATION',
  'ERR_EMPTY_LOAD',
  'ERR_UNKNOWN_VEHICLE',
] as const;

export type TranslationKey = (typeof TRANSLATION_KEYS)[number];

/** A complete locale dictionary: every translation key maps to display text. */
export type Dictionary = Record<TranslationKey, string>;
