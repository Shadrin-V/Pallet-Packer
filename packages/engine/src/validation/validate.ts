import type { Load, EngineError, CargoType, Vehicle } from '../model/index';
import { ROTATION_RULES, NESTING_MODES } from '../model/index';
import { allowedOrientations, orientedDims } from '../model/orientation';

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/** Footprint/height triples (dx, dy, dz) the cargo may occupy under its rotation rule. */
function orientationTriples(cargo: CargoType): Array<[number, number, number]> {
  return allowedOrientations(cargo.rotation).map((o) =>
    orientedDims(cargo.length, cargo.width, cargo.height, o),
  );
}

function fitsInVehicle(cargo: CargoType, vehicle: Vehicle): boolean {
  return orientationTriples(cargo).some(
    ([dx, dy, dz]) => dx <= vehicle.length && dy <= vehicle.width && dz <= vehicle.height,
  );
}

/**
 * Validate a Load against api-contract.md 0.1.0. Returns an empty array for a valid load,
 * otherwise one EngineError per violation. The engine returns codes only — no display text.
 */
export function validateLoad(load: Load): EngineError[] {
  const errors: EngineError[] = [];
  const { vehicle, cargo } = load;

  const vehicleValid =
    isPositiveInt(vehicle.length) && isPositiveInt(vehicle.width) && isPositiveInt(vehicle.height);
  for (const dim of ['length', 'width', 'height'] as const) {
    if (!isPositiveInt(vehicle[dim])) {
      errors.push({
        code: 'ERR_INVALID_DIMENSION',
        details: { entity: 'vehicle', field: dim, value: vehicle[dim] },
      });
    }
  }

  if (cargo.length === 0) {
    errors.push({ code: 'ERR_EMPTY_LOAD' });
  }

  for (const c of cargo) {
    const dimsValid =
      isPositiveInt(c.length) && isPositiveInt(c.width) && isPositiveInt(c.height);
    for (const dim of ['length', 'width', 'height'] as const) {
      if (!isPositiveInt(c[dim])) {
        errors.push({
          code: 'ERR_INVALID_DIMENSION',
          details: { cargoTypeId: c.id, field: dim, value: c[dim] },
        });
      }
    }

    if (!c.fill && (!Number.isInteger(c.quantity) || c.quantity < 0)) {
      errors.push({ code: 'ERR_INVALID_QUANTITY', details: { cargoTypeId: c.id, value: c.quantity } });
    }

    const rotationValid = ROTATION_RULES.includes(c.rotation);
    if (!rotationValid) {
      errors.push({ code: 'ERR_INVALID_ROTATION', details: { cargoTypeId: c.id, value: c.rotation } });
    }

    if (c.nesting.nestable) {
      const step = c.nesting.stepHeight;
      if (step === undefined || !Number.isInteger(step) || step <= 0 || step > c.height) {
        errors.push({
          code: 'ERR_INVALID_NESTING',
          details: { cargoTypeId: c.id, stepHeight: step, height: c.height },
        });
      }
    }

    const mode = c.nesting.nestingMode;
    if (mode !== undefined && !NESTING_MODES.includes(mode)) {
      errors.push({ code: 'ERR_INVALID_NESTING', details: { cargoTypeId: c.id, nestingMode: mode } });
    }

    if (vehicleValid && dimsValid && rotationValid && !fitsInVehicle(c, vehicle)) {
      errors.push({ code: 'ERR_CARGO_EXCEEDS_VEHICLE', details: { cargoTypeId: c.id } });
    }
  }

  return errors;
}
