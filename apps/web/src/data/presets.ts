// Reference presets — the four confirmed cargo holds mirror
// docs/lkw-presets-logist-2026-07-20.md (logist's scheme, sighted 2026-07-20; supersedes the older
// qrd-17-preset-data.md placeholder for vehicles). Integer mm.
// On divergence, update spec.md Appendix A too.

import type { Compartment, Vehicle } from '@shadrin-v/engine';

export interface DimPreset {
  key: string;
  name: string;
  length: number;
  width: number;
  height: number;
  /** Грузовые отсеки (ADR 026). Отсутствует = один отсек во всю длину. */
  compartments?: Compartment[];
}

/** Cargo-hold presets (internal mm). The first four are the logist-confirmed variants 1-4 from
 *  docs/lkw-presets-logist-2026-07-20.md — width is 2450 on every one of them (the scheme's own
 *  figure; the previous 2430/2440/2480 in this file were wrong and are corrected here, since a
 *  20-30mm difference on a ~2450mm hold is the line between two 1200mm pallets fitting across the
 *  width or not). Variant 5 (Autozug / road train) was deliberately withheld while the engine only
 *  modelled a single compartment; LKWkalk-p3p (tasks 1-9) added multi-compartment `Vehicle`
 *  support, so variant 5 now ships below as `lkw-gliederzug` with two compartments and a physical
 *  gap — see that entry's own comment. `lkw-standard` keeps its key but its height moves from 2650
 *  (wrongly labelled "Standard") to 2450 (the logist's actual "Стандартный тент"); the 2650 variant
 *  now has its own entry below ("Hochplane" — raised tarp). This is safe for saved data: a Vehicle
 *  is persisted by value (full length/width/height/compartments), never re-resolved from its preset
 *  key, so existing saved plans and localStorage drafts keep the numbers they were created with
 *  regardless of this table. `lkw-extrahoch` (2800) is dropped — no variant on the logist's scheme
 *  has that height, and nothing else in the codebase anchors that key. Wechselbrücke/Frigo aren't
 *  on the logist's scheme at all; kept as common EU reference sizes for "Eigene Maße"-adjacent
 *  presets, with Frigo's width corrected to the same 2450 (2440 was the same class of error as the
 *  vehicle bodies above).
 *  Keep the standard tent first (default; SetupScreen reads VEHICLE_PRESETS[0]); the multi-
 *  compartment road train is appended last, not inserted, so that index stays put. */
export const VEHICLE_PRESETS: DimPreset[] = [
  { key: 'lkw-standard', name: 'LKW Standard', length: 13600, width: 2450, height: 2450 },
  { key: 'lkw-hochplane', name: 'LKW Hochplane', length: 13600, width: 2450, height: 2650 },
  { key: 'lkw-mega', name: 'LKW Mega (Hochvolumen)', length: 13600, width: 2450, height: 3000 },
  { key: 'lkw-mega-niederflur', name: 'LKW Mega (Niederflur)', length: 13600, width: 2450, height: 2950 },
  { key: 'wechselbruecke', name: 'Wechselbrücke', length: 7150, width: 2450, height: 2700 },
  { key: 'frigo', name: 'Kühlkoffer (Frigo)', length: 13300, width: 2450, height: 2500 },
  // Вариант 5 со схемы логиста — автопоезд: ДВА кузова с физическим разрывом, а не один отсек на
  // 15,4 м. Длины 7700 + 7700 (Jumbo-Gliederzug: сходится и с 15 400 мм, и с 110–120 м³ на схеме) и
  // разрыв 1200 мм ТРЕБУЮТ ПОДТВЕРЖДЕНИЯ ЛОГИСТОМ — см. docs/lkw-presets-logist-2026-07-20.md.
  // `length` — полный пролёт вместе с разрывом; грузовая длина = сумма отсеков = 15 400.
  {
    key: 'lkw-gliederzug',
    name: 'LKW Gliederzug (Jumbo)',
    length: 16600,
    width: 2450,
    height: 3050,
    compartments: [
      { id: 'tractor', name: 'vehicle.compartment.tractor', x: 0, length: 7700 },
      { id: 'trailer', name: 'vehicle.compartment.trailer', x: 8900, length: 7700 },
    ],
  },
];

/** Build a `Vehicle` from a preset — the ONE place allowed to do it (финальное ревью ветки p3p,
 *  находка 1). Three call sites (`data/demo.ts` × 2, `SetupScreen.tsx`) built `Vehicle` by
 *  enumerating fields and silently dropped `compartments`; `SetupHeader.tsx:84` had already been
 *  fixed the same way, with the same comment: without this, an autotrain preset silently degrades
 *  to a single 16.6 m compartment — exactly the bug the compartment model exists to prevent.
 *  `compartments` is deep-copied, never carried over by reference: a shared mutable array/element
 *  from the module-level `VEHICLE_PRESETS` constant sitting inside app state is an invitation to a
 *  bug even with no mutation today (Minor, SetupHeader.tsx review). Single-hold presets get the
 *  field OMITTED entirely, not set to `undefined` — one representation of "no compartments", not two. */
export function vehicleFromPreset(p: DimPreset): Vehicle {
  return {
    id: p.key,
    name: p.name,
    length: p.length,
    width: p.width,
    height: p.height,
    ...(p.compartments ? { compartments: p.compartments.map((c) => ({ ...c })) } : {}),
  };
}

/** Euro-pallet presets (mm), placed entschachtelt by default. */
export const PALLET_PRESETS: DimPreset[] = [
  { key: 'epal1', name: 'EPAL 1', length: 1200, width: 800, height: 144 },
  { key: 'epal2', name: 'EPAL 2', length: 1200, width: 1000, height: 162 },
  { key: 'epal3', name: 'EPAL 3', length: 1000, width: 1200, height: 144 },
  { key: 'epal6', name: 'EPAL 6', length: 800, width: 600, height: 144 },
  { key: 'quarter', name: 'Viertelpalette', length: 600, width: 400, height: 144 },
];
