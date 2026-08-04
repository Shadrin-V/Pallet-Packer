import { describe, it, expect } from 'vitest';
import type { Load, CargoType, Vehicle, Compartment } from '../model/index';
import { validateLoad } from './validate';

function baseCargo(overrides: Partial<CargoType> = {}): CargoType {
  return {
    id: 'epal1',
    name: 'EPAL 1',
    length: 800,
    width: 1200,
    height: 144,
    quantity: 10,
    rotation: 'yawOnly',
    stacking: { stackable: true, maxTiers: 2 },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...overrides,
  };
}

function baseLoad(cargo: CargoType[] = [baseCargo()]): Load {
  return {
    vehicle: { id: 'lkw', name: 'LKW', length: 13600, width: 2430, height: 2650 },
    cargo,
    clearance: 0,
    objective: 'maxUnits',
  };
}

const codes = (load: Load) => validateLoad(load).map((e) => e.code);

describe('validateLoad (api-contract 0.1.0)', () => {
  it('accepts a well-formed load', () => {
    expect(validateLoad(baseLoad())).toEqual([]);
  });

  it('rejects an empty cargo list with ERR_EMPTY_LOAD', () => {
    expect(codes(baseLoad([]))).toContain('ERR_EMPTY_LOAD');
  });

  it('rejects a non-positive vehicle dimension with ERR_INVALID_DIMENSION', () => {
    const load = baseLoad();
    load.vehicle.height = 0;
    expect(codes(load)).toContain('ERR_INVALID_DIMENSION');
  });

  it('rejects a non-integer cargo dimension with ERR_INVALID_DIMENSION', () => {
    expect(codes(baseLoad([baseCargo({ length: 800.5 })]))).toContain('ERR_INVALID_DIMENSION');
  });

  it('rejects a negative quantity with ERR_INVALID_QUANTITY', () => {
    expect(codes(baseLoad([baseCargo({ quantity: -1 })]))).toContain('ERR_INVALID_QUANTITY');
  });

  it('ignores quantity when fill is set (no ERR_INVALID_QUANTITY)', () => {
    expect(codes(baseLoad([baseCargo({ quantity: -1, fill: true })]))).not.toContain(
      'ERR_INVALID_QUANTITY',
    );
  });

  it('rejects cargo larger than the vehicle in every orientation', () => {
    const oversized = baseCargo({ length: 3000, width: 3000, height: 3000, rotation: 'full' });
    expect(codes(baseLoad([oversized]))).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('accepts cargo that fits only after a yaw rotation', () => {
    // length 2000 <= width 2430; width 2431 > 2430 so the base orientation fails,
    // but the yaw orientation (swap L<->W) fits.
    const rotatable = baseCargo({ length: 2000, width: 2431, rotation: 'yawOnly' });
    expect(codes(baseLoad([rotatable]))).not.toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('rejects the same footprint when rotation is disabled', () => {
    const fixed = baseCargo({ length: 2000, width: 2431, rotation: 'none' });
    expect(codes(baseLoad([fixed]))).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('rejects nestable cargo without a valid stepHeight', () => {
    const nested = baseCargo({ nesting: { nestable: true } });
    expect(codes(baseLoad([nested]))).toContain('ERR_INVALID_NESTING');
  });

  it('rejects nestable cargo whose stepHeight exceeds its height', () => {
    const nested = baseCargo({ height: 144, nesting: { nestable: true, stepHeight: 200 } });
    expect(codes(baseLoad([nested]))).toContain('ERR_INVALID_NESTING');
  });

  it('rejects an unknown rotation rule with ERR_INVALID_ROTATION', () => {
    const bad = baseCargo({ rotation: 'diagonal' as CargoType['rotation'] });
    expect(codes(baseLoad([bad]))).toContain('ERR_INVALID_ROTATION');
  });

  it('accepts a valid pairwise nesting configuration (ADR 009)', () => {
    const pairwise = baseCargo({
      state: 'verschachtelt',
      nesting: { nestable: true, stepHeight: 22, maxNested: 6, nestingMode: 'pairwise', allowUnpairedTop: true },
    });
    expect(codes(baseLoad([pairwise]))).not.toContain('ERR_INVALID_NESTING');
  });

  it('rejects an unknown nestingMode with ERR_INVALID_NESTING', () => {
    const bad = baseCargo({
      nesting: {
        nestable: true,
        stepHeight: 22,
        nestingMode: 'telescope' as NonNullable<CargoType['nesting']['nestingMode']>,
      },
    });
    expect(codes(baseLoad([bad]))).toContain('ERR_INVALID_NESTING');
  });
});

const trainVehicle = (compartments: Compartment[], length = 16600): Vehicle => ({
  id: 't', name: 't', length, width: 2450, height: 3050, compartments,
});
const okCargo: CargoType = {
  id: 'c', name: 'c', length: 1200, width: 800, height: 144, quantity: 1,
  rotation: 'yawOnly', stacking: { stackable: true }, nesting: { nestable: false },
  state: 'entschachtelt',
};
const codesWithTrain = (v: Vehicle) => validateLoad({ vehicle: v, cargo: [okCargo], clearance: 0, objective: 'maxUnits' }).map((e) => e.code);

describe('валидация отсеков', () => {
  it('корректные отсеки проходят', () => {
    expect(codesWithTrain(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 8900, length: 7700 }]))).toEqual([]);
  });

  it('пустой массив отвергается: односоставный кузов выражается ОТСУТСТВИЕМ поля', () => {
    expect(codesWithTrain(trainVehicle([]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('отсеки не по возрастанию x', () => {
    expect(codesWithTrain(trainVehicle([{ id: 'b', x: 8900, length: 7700 }, { id: 'a', x: 0, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('пересекающиеся отсеки', () => {
    expect(codesWithTrain(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 7000, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('нецелая или неположительная длина', () => {
    expect(codesWithTrain(trainVehicle([{ id: 'a', x: 0, length: 7700.5 }, { id: 'b', x: 8900, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
    expect(codesWithTrain(trainVehicle([{ id: 'a', x: 0, length: 0 }, { id: 'b', x: 8900, length: 7700 }]))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('конец последнего отсека обязан совпасть с длиной транспорта', () => {
    // Иначе в хвосте заводится молчаливая мёртвая зона, а `length` перестаёт быть производным.
    expect(codesWithTrain(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 8900, length: 7700 }], 17000))).toContain('ERR_INVALID_COMPARTMENTS');
  });

  it('груз длиннее отсека отвергается, хотя короче полного пролёта', () => {
    const longCargo: CargoType = { ...okCargo, id: 'long', length: 8000, rotation: 'none' };
    const v = trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'b', x: 8900, length: 7700 }]);
    expect(validateLoad({ vehicle: v, cargo: [longCargo], clearance: 0, objective: 'maxUnits' }).map((e) => e.code)).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  // Minor находка финального ревью: два отсека с одинаковым `id` не пересекаются по x/length, так
  // что ветки выше их пропускают — но одинаковый id даёт коллизию React-ключей в CrossSection.tsx
  // и SetupHeader.tsx и склеенные строки в счётчиках по отсекам (LadeplanScreen.placedPerCompartment
  // группирует по id).
  it('отсеки с одинаковым id отвергаются, даже если геометрически не пересекаются', () => {
    expect(
      codesWithTrain(trainVehicle([{ id: 'a', x: 0, length: 7700 }, { id: 'a', x: 8900, length: 7700 }])),
    ).toContain('ERR_INVALID_COMPARTMENTS');
  });
});
