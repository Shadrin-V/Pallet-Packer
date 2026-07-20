// Demo dataset (LKWkalk-4bj.3): one click fills a rich, realistic plan that exercises the whole
// feature set — several orders (colour + hatch), every pallet preset plus a custom size,
// Entschachtelt/Verschachtelt, both nesting modes, maxNested/maxTiers caps, all three rotation
// rules, and more cargo than fits (so the "nicht platziert" path is visible too).
import type { Vehicle } from '@shadrin-v/engine';
import type { OrderState, PositionState } from '../screens/SetupScreen';
import { VEHICLE_PRESETS } from './presets';

const uid = () => crypto.randomUUID();

type PosSeed = Partial<PositionState> &
  Pick<PositionState, 'name' | 'length' | 'width' | 'height' | 'quantity'>;

const pos = (p: PosSeed): PositionState => ({
  id: uid(),
  state: 'entschachtelt',
  rotation: 'yawOnly',
  nestStepPairwise: '',
  nestStepSequential: '',
  nestingMode: 'pairwise',
  maxNested: '',
  allowUnpairedTop: false,
  maxTiers: '',
  ...p,
});

const vehicleOf = (index: number): Vehicle => {
  const v = VEHICLE_PRESETS[index];
  return { id: v.key, name: v.name, length: v.length, width: v.width, height: v.height };
};

/** Colour slots follow list position — stable palette per demo (4bj QA #2). */
const withColors = (orders: Omit<OrderState, 'colorIndex'>[]): OrderState[] =>
  orders.map((o, i) => ({ ...o, colorIndex: i }));

/** A fresh demo setup (new ids on every call). */
export function demoSetup(): { vehicle: Vehicle; orders: OrderState[] } {
  const v = VEHICLE_PRESETS[0]; // LKW Standard
  const vehicle: Vehicle = { id: v.key, name: v.name, length: v.length, width: v.width, height: v.height };

  // colorIndex assigned by position here (stable palette slots for the demo, 4bj QA #2).
  const orders: OrderState[] = [
    {
      key: uid(),
      orderId: 'SO-1001',
      positions: [
        // verschachtelt · pairwise · single pallet allowed on top
        pos({ name: 'EPAL 1', length: 1200, width: 800, height: 144, quantity: 186, state: 'verschachtelt', nestingMode: 'pairwise', nestStepPairwise: 22, allowUnpairedTop: true }),
        // verschachtelt · sequential · capped by maxNested
        pos({ name: 'EPAL 2', length: 1200, width: 1000, height: 162, quantity: 100, state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 30, maxNested: 25 }),
      ],
    },
    {
      key: uid(),
      orderId: 'SO-1002',
      positions: [
        pos({ name: 'EPAL 6', length: 800, width: 600, height: 144, quantity: 160, state: 'verschachtelt', nestingMode: 'pairwise', nestStepPairwise: 20, maxNested: 20 }),
        // entschachtelt · capped by maxTiers
        pos({ name: 'Viertelpalette', length: 600, width: 400, height: 144, quantity: 96, maxTiers: 6 }),
      ],
    },
    {
      key: uid(),
      orderId: 'SO-1003',
      positions: [
        // two-sided forklift access — placed first so it lands before the zone fills, making the
        // constraint visible under the demo's rear loading mode (4bj.13)
        pos({ name: 'EPAL 2 (2-seitig)', length: 1200, width: 1000, height: 162, quantity: 12, forkAccess: 'twoSides', forkAxis: 'length' }),
        // custom (non-preset) size · freely rotatable
        pos({ name: 'Sonderpalette', length: 1340, width: 890, height: 178, quantity: 42 }),
      ],
    },
    {
      key: uid(),
      orderId: 'SO-1004',
      // rotation forbidden + deliberately more than fits → shows "nicht platziert"
      positions: [pos({ name: 'EPAL 3', length: 1000, width: 1200, height: 144, quantity: 216, rotation: 'none' })],
    },
  ].map((o, i) => ({ ...o, colorIndex: i }));

  return { vehicle, orders };
}

/** Nesting & stacking showcase: Ver next to Ent, both nesting modes, maxNested/maxTiers caps —
 *  the stack formula on each row is the point, so the load stays modest and mostly fits. */
function nestingSetup(): { vehicle: Vehicle; orders: OrderState[] } {
  return {
    vehicle: vehicleOf(0), // LKW Standard
    orders: withColors([
      {
        key: uid(),
        orderId: 'SO-2001',
        positions: [
          // pairwise, uncapped, single pallet allowed on top → tallest nested stack
          pos({ name: 'EPAL 1 (verschachtelt)', length: 1200, width: 800, height: 144, quantity: 120, state: 'verschachtelt', nestingMode: 'pairwise', nestStepPairwise: 22, allowUnpairedTop: true }),
          // the same pallet NOT nested and capped at 4 tiers → the contrast Ver ↔ Ent
          pos({ name: 'EPAL 1 (entschachtelt)', length: 1200, width: 800, height: 144, quantity: 24, maxTiers: 4 }),
        ],
      },
      {
        key: uid(),
        orderId: 'SO-2002',
        positions: [
          // sequential nesting, capped by maxNested → formula shows min(raw, cap)
          pos({ name: 'EPAL 2', length: 1200, width: 1000, height: 162, quantity: 60, state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 30, maxNested: 12 }),
          // a tall box that only stacks two high — stacking limit, not nesting
          pos({ name: 'Gitterbox', length: 1200, width: 800, height: 970, quantity: 16, maxTiers: 2 }),
        ],
      },
    ]),
  };
}

/** Overload showcase: deliberately more cargo than fits (large "nicht platziert"), plus a two-sided
 *  pallet whose fork access pins its orientation under the demo's rear loading. */
function overloadSetup(): { vehicle: Vehicle; orders: OrderState[] } {
  return {
    vehicle: vehicleOf(0),
    orders: withColors([
      {
        key: uid(),
        orderId: 'SO-3001',
        positions: [
          pos({ name: 'EPAL 2 (2-seitig)', length: 1200, width: 1000, height: 162, quantity: 72, forkAccess: 'twoSides', forkAxis: 'length' }),
          pos({ name: 'Sonderpalette', length: 1340, width: 890, height: 178, quantity: 90 }),
        ],
      },
      {
        key: uid(),
        orderId: 'SO-3002',
        // rotation forbidden + far more than fits → the unplaced count dominates
        positions: [pos({ name: 'EPAL 3', length: 1000, width: 1200, height: 144, quantity: 320, rotation: 'none' })],
      },
    ]),
  };
}

export interface DemoVariant {
  key: 'mixed' | 'nesting' | 'overload';
  /** i18n key for the variant name shown next to the Demo button. */
  nameKey: 'setup.demo.mixed' | 'setup.demo.nesting' | 'setup.demo.overload';
  /** i18n key for the one-line "what this shows" hint. */
  hintKey: 'setup.demo.mixedHint' | 'setup.demo.nestingHint' | 'setup.demo.overloadHint';
  build: () => { vehicle: Vehicle; orders: OrderState[] };
}

/** The demo carousel (rgv.5). Clicking "Demo" walks this list in order and wraps — a FIXED cycle,
 *  never Math.random: a deterministic result for the same input is a project invariant, and a demo
 *  that cannot be reproduced on request is useless for showing a feature to someone. */
export const DEMO_VARIANTS: DemoVariant[] = [
  { key: 'mixed', nameKey: 'setup.demo.mixed', hintKey: 'setup.demo.mixedHint', build: demoSetup },
  { key: 'nesting', nameKey: 'setup.demo.nesting', hintKey: 'setup.demo.nestingHint', build: nestingSetup },
  { key: 'overload', nameKey: 'setup.demo.overload', hintKey: 'setup.demo.overloadHint', build: overloadSetup },
];
