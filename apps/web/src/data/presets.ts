// Reference presets — the four confirmed cargo holds mirror
// docs/lkw-presets-logist-2026-07-20.md (logist's scheme, sighted 2026-07-20; supersedes the older
// qrd-17-preset-data.md placeholder for vehicles). Integer mm.
// On divergence, update spec.md Appendix A too.

export interface DimPreset {
  key: string;
  name: string;
  length: number;
  width: number;
  height: number;
}

/** Cargo-hold presets (internal mm). The first four are the logist-confirmed variants 1-4 from
 *  docs/lkw-presets-logist-2026-07-20.md — width is 2450 on every one of them (the scheme's own
 *  figure; the previous 2430/2440/2480 in this file were wrong and are corrected here, since a
 *  20-30mm difference on a ~2450mm hold is the line between two 1200mm pallets fitting across the
 *  width or not). Variant 5 (Autozug / road train) is deliberately NOT included — it is two
 *  separate cargo compartments with a physical gap between them, and the engine models exactly one
 *  compartment (Vehicle = one set of internal dims); see LKWkalk-p3p for the multi-compartment
 *  follow-up. `lkw-standard` keeps its key but its height moves from 2650 (wrongly labelled
 *  "Standard") to 2450 (the logist's actual "Стандартный тент"); the 2650 variant now has its own
 *  entry below ("Hochplane" — raised tarp). This is safe for saved data: a Vehicle is persisted by
 *  value (full length/width/height), never re-resolved from its preset key, so existing saved
 *  plans and localStorage drafts keep the numbers they were created with regardless of this table.
 *  `lkw-extrahoch` (2800) is dropped — no variant on the logist's scheme has that height, and
 *  nothing else in the codebase anchors that key. Wechselbrücke/Frigo aren't on the logist's scheme
 *  at all; kept as common EU reference sizes for "Eigene Maße"-adjacent presets, with Frigo's width
 *  corrected to the same 2450 (2440 was the same class of error as the vehicle bodies above).
 *  Keep the standard tent first (default; SetupScreen reads VEHICLE_PRESETS[0]). */
export const VEHICLE_PRESETS: DimPreset[] = [
  { key: 'lkw-standard', name: 'LKW Standard', length: 13600, width: 2450, height: 2450 },
  { key: 'lkw-hochplane', name: 'LKW Hochplane', length: 13600, width: 2450, height: 2650 },
  { key: 'lkw-mega', name: 'LKW Mega (Hochvolumen)', length: 13600, width: 2450, height: 3000 },
  { key: 'lkw-mega-niederflur', name: 'LKW Mega (Niederflur)', length: 13600, width: 2450, height: 2950 },
  { key: 'wechselbruecke', name: 'Wechselbrücke', length: 7150, width: 2450, height: 2700 },
  { key: 'frigo', name: 'Kühlkoffer (Frigo)', length: 13300, width: 2450, height: 2500 },
];

/** Euro-pallet presets (mm), placed entschachtelt by default. */
export const PALLET_PRESETS: DimPreset[] = [
  { key: 'epal1', name: 'EPAL 1', length: 1200, width: 800, height: 144 },
  { key: 'epal2', name: 'EPAL 2', length: 1200, width: 1000, height: 162 },
  { key: 'epal3', name: 'EPAL 3', length: 1000, width: 1200, height: 144 },
  { key: 'epal6', name: 'EPAL 6', length: 800, width: 600, height: 144 },
  { key: 'quarter', name: 'Viertelpalette', length: 600, width: 400, height: 144 },
];
