// Reference presets — mirror docs/qrd-17-preset-data.md (confirmed data). Integer mm.
// On divergence, update qrd-17 / spec.md Appendix A too.

export interface DimPreset {
  key: string;
  name: string;
  length: number;
  width: number;
  height: number;
}

/** Cargo-hold presets (internal mm). LKW Standard is qrd-17-confirmed; the others are common EU
 *  reference sizes (Mega/Frigo/Wechselbrücke) — users can always pick "Eigene Maße" for a custom
 *  hold. Keep LKW Standard first (default). */
export const VEHICLE_PRESETS: DimPreset[] = [
  { key: 'lkw-standard', name: 'LKW Standard', length: 13600, width: 2430, height: 2650 },
  { key: 'lkw-extrahoch', name: 'LKW Extra-hoch', length: 13600, width: 2480, height: 2800 },
  { key: 'lkw-mega', name: 'LKW Mega (Hochvolumen)', length: 13600, width: 2480, height: 3000 },
  { key: 'wechselbruecke', name: 'Wechselbrücke', length: 7150, width: 2450, height: 2700 },
  { key: 'frigo', name: 'Kühlkoffer (Frigo)', length: 13300, width: 2440, height: 2500 },
];

/** Euro-pallet presets (mm), placed entschachtelt by default. */
export const PALLET_PRESETS: DimPreset[] = [
  { key: 'epal1', name: 'EPAL 1', length: 1200, width: 800, height: 144 },
  { key: 'epal2', name: 'EPAL 2', length: 1200, width: 1000, height: 162 },
  { key: 'epal3', name: 'EPAL 3', length: 1000, width: 1200, height: 144 },
  { key: 'epal6', name: 'EPAL 6', length: 800, width: 600, height: 144 },
  { key: 'quarter', name: 'Viertelpalette', length: 600, width: 400, height: 144 },
];
