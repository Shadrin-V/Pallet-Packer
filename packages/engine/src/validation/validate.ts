import type { Load, EngineError, CargoType, Vehicle } from '../model/index';
import { ROTATION_RULES, NESTING_MODES } from '../model/index';
import { allowedOrientations, orientedDims } from '../model/orientation';
import { compartmentsOf } from '../model/compartments';

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/** Footprint/height triples (dx, dy, dz) the cargo may occupy under its rotation rule. */
function orientationTriples(cargo: CargoType): Array<[number, number, number]> {
  return allowedOrientations(cargo.rotation).map((o) =>
    orientedDims(cargo.length, cargo.width, cargo.height, o),
  );
}

/** Груз должен влезть в КАКОЙ-НИБУДЬ отсек. Восьмиметровая деталь не помещается в автопоезд
 *  2 × 7,7 м, хотя короче полного пролёта 16,6 м — пролёт включает разрыв, а груз в нём не стоит. */
function fitsInVehicle(cargo: CargoType, vehicle: Vehicle): boolean {
  const maxLength = Math.max(...compartmentsOf(vehicle).map((c) => c.length));
  return orientationTriples(cargo).some(
    ([dx, dy, dz]) => dx <= maxLength && dy <= vehicle.width && dz <= vehicle.height,
  );
}

/** Отсеки: целые, положительные, по возрастанию, без пересечений, и конец последнего = длине
 *  транспорта. Отдаёт максимум одну ошибку: перечислять все поломки сразу незачем — первая же
 *  говорит, что справочник кузовов испорчен. */
function compartmentErrors(vehicle: Vehicle): EngineError[] {
  const cs = vehicle.compartments;
  if (cs === undefined) return [];
  const bad = (reason: string, details?: Record<string, unknown>): EngineError[] => [
    { code: 'ERR_INVALID_COMPARTMENTS', details: { reason, ...details } },
  ];
  if (cs.length === 0) return bad('empty');
  let prevEnd = 0;
  for (const c of cs) {
    if (!Number.isInteger(c.x) || c.x < 0) return bad('x', { id: c.id, x: c.x });
    if (!isPositiveInt(c.length)) return bad('length', { id: c.id, length: c.length });
    if (c.x < prevEnd) return bad('overlap', { id: c.id, x: c.x, prevEnd });
    prevEnd = c.x + c.length;
  }
  if (prevEnd !== vehicle.length) return bad('span', { end: prevEnd, length: vehicle.length });
  return [];
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

  const compartmentIssues = vehicleValid ? compartmentErrors(vehicle) : [];
  errors.push(...compartmentIssues);

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

    if (vehicleValid && dimsValid && rotationValid && compartmentIssues.length === 0 && !fitsInVehicle(c, vehicle)) {
      errors.push({ code: 'ERR_CARGO_EXCEEDS_VEHICLE', details: { cargoTypeId: c.id } });
    }
  }

  return errors;
}
