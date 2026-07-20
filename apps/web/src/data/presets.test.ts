import { describe, it, expect } from 'vitest';
import { VEHICLE_PRESETS, PALLET_PRESETS } from './presets';

describe('presets (logist-confirmed data, docs/lkw-presets-logist-2026-07-20.md)', () => {
  it('default vehicle is LKW Standard 13600×2450×2450 (logist variant 1)', () => {
    expect(VEHICLE_PRESETS[0]).toMatchObject({ name: 'LKW Standard', length: 13600, width: 2450, height: 2450 });
  });

  it('offers the logist-confirmed variants 2-4 (Hochplane, Mega, Mega Niederflur)', () => {
    expect(VEHICLE_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(VEHICLE_PRESETS.some((p) => p.height === 2650)).toBe(true); // Hochplane
    expect(VEHICLE_PRESETS.some((p) => p.height === 3000)).toBe(true); // Mega
    expect(VEHICLE_PRESETS.some((p) => p.height === 2950)).toBe(true); // Mega Niederflur
  });

  it('does not offer the old, unconfirmed 2800mm extra-high hold', () => {
    expect(VEHICLE_PRESETS.some((p) => p.height === 2800)).toBe(false);
  });

  it('does not offer variant 5 (road train) — it is two compartments, the engine models one (LKWkalk-p3p)', () => {
    expect(VEHICLE_PRESETS.some((p) => p.length >= 15000)).toBe(false);
  });

  it('is 2450mm wide on every vehicle preset (the logist scheme figure, not the old 2430/2440/2480)', () => {
    for (const p of VEHICLE_PRESETS) {
      expect(p.width).toBe(2450);
    }
  });

  // Pins the logist's schema volumes (docs/lkw-presets-logist-2026-07-20.md §"Сверка объёмов") so a
  // future edit to any dimension is caught here, not discovered by a bad packing result. The
  // schema's own hand-marked figures are rounded (e.g. 90 for a computed 88.3), so the tolerance
  // mirrors what the doc itself treats as "matches, dimensions read correctly" — up to ~2 m3.
  it.each([
    { name: 'LKW Standard', volumeM3: 82 },
    { name: 'LKW Hochplane', volumeM3: 90 },
    { name: 'LKW Mega (Hochvolumen)', volumeM3: 100 },
  ])('$name volume matches the logist schema within rounding', ({ name, volumeM3 }) => {
    const p = VEHICLE_PRESETS.find((v) => v.name === name);
    expect(p).toBeDefined();
    const computedM3 = (p!.length * p!.width * p!.height) / 1_000_000_000;
    expect(Math.abs(computedM3 - volumeM3)).toBeLessThanOrEqual(2);
  });

  it('LKW Mega (Niederflur) volume falls in the schema\'s stated 96-100 m3 range', () => {
    const p = VEHICLE_PRESETS.find((v) => v.name === 'LKW Mega (Niederflur)');
    expect(p).toBeDefined();
    const computedM3 = (p!.length * p!.width * p!.height) / 1_000_000_000;
    expect(computedM3).toBeGreaterThanOrEqual(96);
    expect(computedM3).toBeLessThanOrEqual(100);
  });

  it.each([
    { name: 'LKW Standard', length: 13600 },
    { name: 'LKW Hochplane', length: 13600 },
    { name: 'LKW Mega (Hochvolumen)', length: 13600 },
    { name: 'LKW Mega (Niederflur)', length: 13600 },
    { name: 'Wechselbrücke', length: 7150 },
    { name: 'Kühlkoffer (Frigo)', length: 13300 },
  ])('$name length is pinned exactly (not just via volume tolerance)', ({ name, length }) => {
    const p = VEHICLE_PRESETS.find((v) => v.name === name);
    expect(p).toBeDefined();
    expect(p!.length).toBe(length);
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
