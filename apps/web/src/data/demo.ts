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
  stepHeight: '',
  nestingMode: 'pairwise',
  maxNested: '',
  allowUnpairedTop: false,
  maxTiers: '',
  ...p,
});

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
        pos({ name: 'EPAL 1', length: 1200, width: 800, height: 144, quantity: 186, state: 'verschachtelt', nestingMode: 'pairwise', stepHeight: 22, allowUnpairedTop: true }),
        // verschachtelt · sequential · capped by maxNested
        pos({ name: 'EPAL 2', length: 1200, width: 1000, height: 162, quantity: 100, state: 'verschachtelt', nestingMode: 'sequential', stepHeight: 30, maxNested: 25 }),
      ],
    },
    {
      key: uid(),
      orderId: 'SO-1002',
      positions: [
        pos({ name: 'EPAL 6', length: 800, width: 600, height: 144, quantity: 160, state: 'verschachtelt', nestingMode: 'pairwise', stepHeight: 20, maxNested: 20 }),
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
