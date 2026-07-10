import { describe, it, expect } from 'vitest';
import { TRANSLATION_KEYS } from './keys';

describe('TRANSLATION_KEYS', () => {
  it('has no duplicate keys', () => {
    expect(new Set(TRANSLATION_KEYS).size).toBe(TRANSLATION_KEYS.length);
  });

  it('includes every engine validation error code (api-contract.md §3)', () => {
    const errorCodes = [
      'ERR_INVALID_DIMENSION',
      'ERR_CARGO_EXCEEDS_VEHICLE',
      'ERR_INVALID_QUANTITY',
      'ERR_INVALID_NESTING',
      'ERR_INVALID_ROTATION',
      'ERR_EMPTY_LOAD',
      'ERR_UNKNOWN_VEHICLE',
    ];
    for (const code of errorCodes) {
      expect(TRANSLATION_KEYS).toContain(code);
    }
  });

  it('includes the first-screen UI keys (vehicle, cargo type, actions, results, units)', () => {
    const uiKeys = [
      'app.title',
      'field.name',
      'field.length',
      'field.width',
      'field.height',
      'field.quantity',
      'field.orderId',
      'vehicle.label',
      'vehicle.cargoHold',
      'cargoType.label',
      'cargoType.rotation.label',
      'cargoType.rotation.none',
      'cargoType.rotation.yawOnly',
      'cargoType.rotation.full',
      'cargoType.stacking.label',
      'cargoType.nesting.label',
      'action.calculate',
      'action.exportJson',
      'results.totalPlaced',
      'results.unplaced',
      'results.floorFillPercent',
      'results.volumeFillPercent',
      'results.placed',
      'results.requested',
      'unit.mm',
    ];
    for (const key of uiKeys) {
      expect(TRANSLATION_KEYS).toContain(key);
    }
  });
});
