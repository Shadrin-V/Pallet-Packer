// Canonical set of translation keys for the MVP UI (vehicle selection, cargo/order editor,
// calculate, results, JSON export) plus engine validation error codes (ADR 006,
// docs/api-contract.md §3). Adding a key here and to every locale dictionary in `dictionaries/`
// is the only change needed to extend the vocabulary — no lookup-function changes.
export const TRANSLATION_KEYS = [
  // App
  'app.title',
  'app.subtitle',

  // Setup screen (order/position editor)
  'setup.orders',
  'setup.addOrder',
  'setup.addPosition',
  'setup.order',
  'setup.moveOrderUp',
  'setup.moveOrderDown',
  'setup.state.ent',
  'setup.state.ver',
  'setup.stack',
  'setup.vehiclePreset.custom',
  'setup.emptyOrders',
  'setup.savePreset',
  'setup.deletePreset',
  'setup.demo.mixed',
  'setup.demo.mixedHint',
  'setup.demo.nesting',
  'setup.demo.nestingHint',
  'setup.demo.overload',
  'setup.demo.overloadHint',
  'setup.demoLoaded',
  'setup.demoNext',
  'warehouse.title',
  'warehouse.hint',
  'warehouse.count',
  'warehouse.empty',
  'warehouse.rotate',
  'warehouse.dropHint',
  'article.label',
  'article.source.erp',
  'article.source.local',
  'article.source.standard',
  'article.noMatches',

  // Ladeplan / result screen
  'ladeplan.title',
  'ladeplan.top',
  'ladeplan.side',
  'ladeplan.legend',
  'ladeplan.front',
  'ladeplan.back',
  'ladeplan.kicker',
  'ladeplan.brandName',
  'ladeplan.brandTagline',
  'ladeplan.vehicleInner',
  'ladeplan.orders',
  'ladeplan.loadingMode',
  'ladeplan.loadingModeHint',
  'ladeplan.orderGrouping',
  'ladeplan.orderGroupingHint',
  'ladeplan.mode.rear',
  'ladeplan.mode.side',
  'ladeplan.mode.combined',
  'ladeplan.fig.pallets',
  'ladeplan.fig.positions',
  'ladeplan.pltAbbr',
  'ladeplan.notPlaced',
  'ladeplan.rotateStack',
  'ladeplan.discardEditsConfirm',
  'ladeplan.emptyHint',
  'ladeplan.unplacedFig',
  'action.print',

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
  'cargoType.orientation.label',
  'cargoType.orientation.fixed',
  'cargoType.orientation.free',
  'cargoType.orientation.twoSided',
  'cargoType.orientation.twoSidedHint',
  'cargoType.forkAxis.label',
  'cargoType.forkAxis.length',
  'cargoType.forkAxis.width',
  'cargoType.stacking.label',
  'cargoType.stacking.hint',
  'cargoType.nesting.label',
  'cargoType.nesting.mode',
  'cargoType.nesting.modeSequential',
  'cargoType.nesting.modePairwise',
  'cargoType.nesting.stepHeightSeq',
  'cargoType.nesting.stepHeightPair',
  'cargoType.nesting.stepHeightHint',
  'cargoType.nesting.maxNested',
  'cargoType.nesting.allowUnpairedTop',

  // Stack preview + formula (qrd-13 / qrd-26)
  'stack.preview',
  'stack.diagram',
  'stack.result',
  'stack.formula.label',
  'stack.formula.entschachtelt',
  'stack.formula.sequential',
  'stack.formula.pairwise',
  'stack.formula.cap',
  'stack.formula.notStackable',

  // Actions
  'action.calculate',
  'action.export',
  'action.exportPdf',
  'action.exportPdfHint',
  'action.exportPng',
  'action.exportJson',
  'action.exportFailed',
  'action.reset',
  'action.demo',
  'setup.resetConfirm',

  // Results / report metrics
  'results.totalPlaced',
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

  // Manual layout edits (contract 0.12.0, ADR 019)
  'ERR_EDIT_NO_STACK',
  'ERR_EDIT_OVERLAP',
  'ERR_EDIT_OUT_OF_BOUNDS',
  'ERR_EDIT_FORK_ACCESS',
  'ERR_EDIT_ROTATION',
  'ERR_EDIT_NOTHING_TO_PLACE',
] as const;

export type TranslationKey = (typeof TRANSLATION_KEYS)[number];

/** A complete locale dictionary: every translation key maps to display text. */
export type Dictionary = Record<TranslationKey, string>;
