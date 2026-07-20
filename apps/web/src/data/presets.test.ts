import { describe, it, expect } from 'vitest';
import { VEHICLE_PRESETS, PALLET_PRESETS } from './presets';

describe('presets (qrd-17 confirmed data)', () => {
  it('default vehicle is LKW Standard 13600×2430×2650', () => {
    expect(VEHICLE_PRESETS[0]).toMatchObject({ name: 'LKW Standard', length: 13600, width: 2430, height: 2650 });
  });

  it('offers extra vehicle presets incl. an extra-high (2800) hold', () => {
    expect(VEHICLE_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(VEHICLE_PRESETS.some((p) => p.height === 2800)).toBe(true);
  });

  it('ships the five confirmed pallet presets', () => {
    expect(PALLET_PRESETS.map((p) => p.name)).toEqual([
      'EPAL 1',
      'EPAL 2',
      'EPAL 3',
      'EPAL 6',
      'Viertelpalette',
    ]);
  });
});
