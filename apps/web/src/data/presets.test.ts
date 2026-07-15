import { describe, it, expect } from 'vitest';
import { VEHICLE_PRESETS, PALLET_PRESETS, palletByKey } from './presets';

describe('presets (qrd-17 confirmed data)', () => {
  it('default vehicle is LKW Standard 13600×2430×2650', () => {
    expect(VEHICLE_PRESETS[0]).toMatchObject({ name: 'LKW Standard', length: 13600, width: 2430, height: 2650 });
  });

  it('EPAL 2 is 1200×1000×162', () => {
    expect(palletByKey('epal2')).toMatchObject({ length: 1200, width: 1000, height: 162 });
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
