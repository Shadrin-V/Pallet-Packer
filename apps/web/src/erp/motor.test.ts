import fc from 'fast-check';
import { calculateLayout } from '@shadrin-v/engine';
import { describe, expect, it } from 'vitest';
import {
  CAPACITY_API_VERSION,
  COMPARTMENT_LABELS_DE,
  DEFAULT_VEHICLE_PRESET_KEY,
  ENGINE_CONTRACT_VERSION,
  ERR_INVALID_INPUT,
  VEHICLE_PRESETS,
  calculateCapacity,
  maxUnitsInVehicle,
  vehicleFromPreset,
} from './motor';

const vehicle = () => vehicleFromPreset(VEHICLE_PRESETS[0]);
const cargo = (over: Record<string, unknown> = {}) => ({
  id: 'c',
  name: 'EUR',
  length: 1200,
  width: 800,
  height: 144,
  quantity: 1,
  rotation: 'yawOnly',
  stacking: { stackable: true, maxTiers: 4 },
  nesting: { nestable: false },
  state: 'entschachtelt',
  ...over,
});

function invalidCode(c: unknown, v: unknown, o?: unknown) {
  const r = calculateCapacity(c, v, o as never);
  expect(r.status).toBe('invalid');
  if (r.status !== 'invalid') throw new Error('unreachable');
  return r.errors;
}

describe('calculateCapacity', () => {
  it('constants', () => {
    expect(CAPACITY_API_VERSION).toBe('1');
    expect(typeof ENGINE_CONTRACT_VERSION).toBe('string');
    expect(DEFAULT_VEHICLE_PRESET_KEY).toBe('lkw-standard');
  });

  it('fits on a standard tent', () => {
    const r = calculateCapacity(cargo(), vehicle());
    expect(r.status).toBe('fits');
    if (r.status === 'fits') expect(r.units).toBeGreaterThan(0);
  });

  it('does_not_fit for 14000 mm cargo', () => {
    expect(calculateCapacity(cargo({ length: 14000 }), vehicle())).toEqual({ status: 'does_not_fit', units: 0 });
  });

  it('mixed errors -> invalid (engine codes kept)', () => {
    const errs = invalidCode(cargo({ length: 14000, width: 0 }), vehicle());
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.every((e) => e.code !== ERR_INVALID_INPUT)).toBe(true);
  });

  it('missing nesting / NaN / empty string -> ERR_INVALID_INPUT without throwing', () => {
    const { nesting: _n, ...noNesting } = cargo();
    void _n;
    for (const c of [noNesting, cargo({ length: NaN }), cargo({ length: '' })]) {
      const errs = invalidCode(c, vehicle());
      expect(errs[0].code).toBe(ERR_INVALID_INPUT);
      expect(errs[0].details).toMatchObject({ field: expect.any(String) });
    }
    expect(invalidCode(noNesting, vehicle())[0].details).toEqual({ field: 'cargo.nesting' });
  });

  it('schema negatives -> ERR_INVALID_INPUT', () => {
    const cases: [unknown, unknown, unknown?][] = [
      [cargo({ stacking: { stackable: 'false' } }), vehicle()],
      [cargo(), { ...vehicle(), compartments: [null] }],
      [cargo(), vehicle(), null],
      [cargo({ state: 'foo' }), vehicle()],
      [cargo(), vehicle(), { loadingMode: 'diagonal' }],
      [cargo({ rotation: 'spin' }), vehicle()],
      [cargo({ forkAccess: 'x' }), vehicle()],
      [cargo({ forkAxis: 'x' }), vehicle()],
      [cargo({ nesting: { nestable: true, nestingMode: 'x' } }), vehicle()],
      [cargo({ stacking: { stackable: true, maxTiers: NaN } }), vehicle()],
      [cargo(), vehicle(), { clearance: -1 }],
      [null, vehicle()],
      [cargo(), null],
      [cargo(), { ...vehicle(), compartments: [{ id: 1, x: 0, length: 5 }] }],
    ];
    for (const [c, v, o] of cases) {
      expect(invalidCode(c, v, o)[0].code).toBe(ERR_INVALID_INPUT);
    }
  });

  it('quantity/fill/orderId in input are ignored', () => {
    const a = calculateCapacity(cargo({ quantity: -5, fill: false, orderId: 7 }), vehicle());
    expect(a).toEqual(calculateCapacity(cargo(), vehicle()));
    expect(a.status).toBe('fits');
  });

  it('units equals maxUnitsInVehicle for valid input (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 3000 }),
        fc.integer({ min: 200, max: 2000 }),
        fc.integer({ min: 100, max: 2000 }),
        fc.constantFrom('none', 'yawOnly', 'full'),
        fc.boolean(),
        (length, width, height, rotation, stackable) => {
          const c = cargo({ length, width, height, rotation, stacking: { stackable, maxTiers: 3 } });
          const r = calculateCapacity(c, vehicle());
          const max = maxUnitsInVehicle(c as never, vehicle());
          expect(r.status).toBe(max > 0 ? 'fits' : 'does_not_fit');
          expect(r).toEqual(max > 0 ? { status: 'fits', units: max } : { status: 'does_not_fit', units: 0 });
        },
      ),
      { numRuns: 40 },
    );
  });

  it('loadingMode side + clearance 50 match maxUnitsInVehicle', () => {
    const o = { loadingMode: 'side', clearance: 50 } as const;
    const r = calculateCapacity(cargo(), vehicle(), o);
    expect(r).toEqual({ status: 'fits', units: maxUnitsInVehicle(cargo() as never, vehicle(), o) });
  });

  it('8000 mm cargo on the road train -> does_not_fit', () => {
    const train = vehicleFromPreset(VEHICLE_PRESETS.find((p) => p.key === 'lkw-gliederzug')!);
    expect(calculateCapacity(cargo({ length: 8000 }), train)).toEqual({ status: 'does_not_fit', units: 0 });
  });

  it('zero placement without errors -> does_not_fit', () => {
    // Fits the hold dimensions, but two-sided fork access (axis length, rear loading) pins an
    // orientation that cannot be placed: the engine reports no error and places nothing.
    const v = { id: 'v', name: 'v', length: 1000, width: 1300, height: 1000 };
    const c = cargo({ rotation: 'yawOnly', stacking: { stackable: false }, forkAccess: 'twoSides', forkAxis: 'length' });
    const layout = calculateLayout({
      vehicle: v,
      cargo: [{ ...c, quantity: 0, fill: true, orderId: undefined } as never],
      loadingMode: 'rear',
    });
    expect(layout.errors).toBeUndefined();
    expect(layout.metrics.totalPlaced).toBe(0);
    expect(calculateCapacity(c, v, { loadingMode: 'rear' })).toEqual({ status: 'does_not_fit', units: 0 });
  });
});

describe('presets re-export', () => {
  it('road train has 2 compartments, deep-copied', () => {
    const p = VEHICLE_PRESETS.find((x) => x.key === 'lkw-gliederzug')!;
    const v = vehicleFromPreset(p);
    expect(v.compartments).toHaveLength(2);
    expect(v.compartments).not.toBe(p.compartments);
    v.compartments!.forEach((c, i) => expect(c).not.toBe(p.compartments![i]));
  });

  it('every compartment name has a de label', () => {
    for (const p of VEHICLE_PRESETS) {
      for (const c of p.compartments ?? []) {
        expect(COMPARTMENT_LABELS_DE[c.name!]).toBeTruthy();
      }
    }
    expect(COMPARTMENT_LABELS_DE['vehicle.compartment.tractor']).toBe('Motorwagen');
  });
});
