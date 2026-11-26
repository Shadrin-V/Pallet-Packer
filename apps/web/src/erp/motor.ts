// Capacity facade for the ERP desk page (lkw_motor). Pure: engine + preset data + de labels only —
// no React, DOM, network or globals (a later lock scans the built bundle for those tokens).
import {
  ENGINE_CONTRACT_VERSION,
  FORK_ACCESS,
  FORK_AXES,
  LOADING_MODES,
  NESTING_MODES,
  NESTING_STATES,
  ROTATION_RULES,
  calculateLayout,
  maxUnitsInVehicle,
  type CapacityOptions,
} from '@shadrin-v/engine';
import { VEHICLE_PRESETS, vehicleFromPreset } from '../data/presets';

export { ENGINE_CONTRACT_VERSION, maxUnitsInVehicle, VEHICLE_PRESETS, vehicleFromPreset };
export type { CapacityOptions };

export const CAPACITY_API_VERSION = '1' as const;

/** Facade-level error code: the engine does not know it (contract: task 5). `details.field` names the path. */
export const ERR_INVALID_INPUT = 'ERR_INVALID_INPUT';
export const FACADE_ERROR_CODES = [ERR_INVALID_INPUT] as const;

export const DEFAULT_VEHICLE_PRESET_KEY: string = VEHICLE_PRESETS[0].key;

/**
 * i18n compartment keys used by the presets -> German text. A local constant, not `t()`: importing
 * @shadrin-v/i18n would bundle both full dictionaries into lkw_motor.js (their `setup.import.*` keys trip
 * the literal `import` lock). Single source stays the de dictionary — motor.test.ts locks equality.
 */
export const COMPARTMENT_LABELS_DE: Readonly<Record<string, string>> = Object.freeze({
  'vehicle.compartment.tractor': 'Motorwagen',
  'vehicle.compartment.trailer': 'Anhänger',
});

export type CapacityError = { code: string; details?: unknown };
export type CapacityResult =
  | { status: 'fits'; units: number }
  | { status: 'does_not_fit'; units: 0 }
  | { status: 'invalid'; errors: CapacityError[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

/** First offending field path, or null when the input matches the schema. */
function firstBadField(cargo: unknown, vehicle: unknown, options: unknown): string | null {
  if (!isObj(cargo)) return 'cargo';
  if (typeof cargo.id !== 'string') return 'cargo.id';
  if (cargo.name !== undefined && typeof cargo.name !== 'string') return 'cargo.name';
  for (const k of ['length', 'width', 'height']) if (!isNum(cargo[k])) return `cargo.${k}`;
  if (!oneOf(ROTATION_RULES, cargo.rotation)) return 'cargo.rotation';
  if (!oneOf(NESTING_STATES, cargo.state)) return 'cargo.state';
  const st = cargo.stacking;
  if (!isObj(st)) return 'cargo.stacking';
  if (typeof st.stackable !== 'boolean') return 'cargo.stacking.stackable';
  if (st.maxTiers !== undefined && !isNum(st.maxTiers)) return 'cargo.stacking.maxTiers';
  const ne = cargo.nesting;
  if (!isObj(ne)) return 'cargo.nesting';
  if (typeof ne.nestable !== 'boolean') return 'cargo.nesting.nestable';
  if (ne.nestingMode !== undefined && !oneOf(NESTING_MODES, ne.nestingMode)) return 'cargo.nesting.nestingMode';
  if (ne.allowUnpairedTop !== undefined && typeof ne.allowUnpairedTop !== 'boolean') {
    return 'cargo.nesting.allowUnpairedTop';
  }
  for (const k of ['stepHeight', 'maxNested']) if (ne[k] !== undefined && !isNum(ne[k])) return `cargo.nesting.${k}`;
  if (cargo.forkAccess !== undefined && !oneOf(FORK_ACCESS, cargo.forkAccess)) return 'cargo.forkAccess';
  if (cargo.forkAxis !== undefined && !oneOf(FORK_AXES, cargo.forkAxis)) return 'cargo.forkAxis';

  if (!isObj(vehicle)) return 'vehicle';
  if (typeof vehicle.id !== 'string') return 'vehicle.id';
  if (vehicle.name !== undefined && typeof vehicle.name !== 'string') return 'vehicle.name';
  for (const k of ['length', 'width', 'height']) if (!isNum(vehicle[k])) return `vehicle.${k}`;
  const comps = vehicle.compartments;
  if (comps !== undefined) {
    if (!Array.isArray(comps)) return 'vehicle.compartments';
    for (let i = 0; i < comps.length; i++) {
      const c: unknown = comps[i];
      if (!isObj(c)) return `vehicle.compartments[${i}]`;
      if (typeof c.id !== 'string') return `vehicle.compartments[${i}].id`;
      if (c.name !== undefined && typeof c.name !== 'string') return `vehicle.compartments[${i}].name`;
      if (!isNum(c.x)) return `vehicle.compartments[${i}].x`;
      if (!isNum(c.length)) return `vehicle.compartments[${i}].length`;
    }
  }

  if (options !== undefined) {
    if (!isObj(options)) return 'options';
    if (options.loadingMode !== undefined && !oneOf(LOADING_MODES, options.loadingMode)) return 'options.loadingMode';
    if (options.clearance !== undefined && !(isNum(options.clearance) && options.clearance >= 0)) {
      return 'options.clearance';
    }
  }
  return null;
}

/**
 * How many units of one cargo type fit in a vehicle. Never throws on bad shape (-> `invalid`);
 * engine exceptions are NOT caught — the consumer reports them separately.
 */
export function calculateCapacity(cargo: unknown, vehicle: unknown, options?: CapacityOptions): CapacityResult {
  // Same normalisation as maxUnitsInVehicle: quantity/fill/orderId never take part, not even in validation.
  const bare = isObj(cargo) ? (({ quantity: _q, fill: _f, orderId: _o, ...rest }) => rest)(cargo) : cargo;
  const bad = firstBadField(bare, vehicle, options);
  if (bad !== null) return { status: 'invalid', errors: [{ code: ERR_INVALID_INPUT, details: { field: bad } }] };

  const layout = calculateLayout({
    vehicle: vehicle as never,
    cargo: [{ ...(bare as object), quantity: 0, fill: true, orderId: undefined } as never],
    loadingMode: options?.loadingMode,
    clearance: options?.clearance,
  });
  if (layout.errors) {
    const rest = layout.errors.filter((e) => e.code !== 'ERR_CARGO_EXCEEDS_VEHICLE');
    return rest.length > 0 ? { status: 'invalid', errors: layout.errors } : { status: 'does_not_fit', units: 0 };
  }
  const units = layout.metrics.totalPlaced;
  return units > 0 ? { status: 'fits', units } : { status: 'does_not_fit', units: 0 };
}
