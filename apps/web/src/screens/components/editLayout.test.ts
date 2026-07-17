import { describe, it, expect } from 'vitest';
import { calculateLayout, type Load } from '@shadrin-v/engine';
import { moveStack, rotateStack, snap, SNAP_MM } from './editLayout';

// The edit RULES are the engine's, and are tested there (packages/engine/src/packing/edit.test.ts).
// What is this module's own — and all these tests guard — is the pointer side: the snap grid, and
// passing the engine's verdict (layout + reason) straight through to the caller.

const load: Load = {
  vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
  cargo: [
    {
      id: 'p',
      name: 'P',
      length: 1200,
      width: 800,
      height: 900,
      quantity: 1,
      rotation: 'yawOnly',
      stacking: { stackable: false },
      nesting: { nestable: false },
      state: 'entschachtelt',
    },
  ],
};

describe('snap', () => {
  it('rounds to the grid', () => {
    expect(snap(0)).toBe(0);
    expect(snap(149)).toBe(100);
    expect(snap(150)).toBe(200);
    expect(snap(-149)).toBe(-100);
    expect(SNAP_MM).toBe(100);
  });
});

describe('moveStack (adapter)', () => {
  it('snaps the drop point to the grid before the engine sees it', () => {
    const layout = calculateLayout(load);
    const { layout: next, error } = moveStack(load, layout, { cargoTypeId: 'p', x: 0, y: 0 }, 1234, 567);

    expect(error).toBeUndefined();
    expect(next.placements[0]).toMatchObject({ x: 1200, y: 600 }); // 1234→1200, 567→600
  });

  it('passes the engine refusal through instead of swallowing it', () => {
    const layout = calculateLayout(load);
    const { layout: next, error } = moveStack(load, layout, { cargoTypeId: 'p', x: 0, y: 0 }, 3900, 0);

    expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
    expect(next).toBe(layout);
  });
});

describe('rotateStack (adapter)', () => {
  it('returns the rotated layout from the engine', () => {
    const layout = calculateLayout(load);
    const from = layout.placements[0].orientation;
    const { layout: next, error } = rotateStack(load, layout, { cargoTypeId: 'p', x: 0, y: 0 });

    expect(error).toBeUndefined();
    expect(next.placements[0].orientation).not.toBe(from);
  });

  it('passes a refusal reason through', () => {
    const fixed: Load = { ...load, cargo: [{ ...load.cargo[0], rotation: 'none' }] };
    const layout = calculateLayout(fixed);
    const { error } = rotateStack(fixed, layout, { cargoTypeId: 'p', x: 0, y: 0 });

    expect(error?.code).toBe('ERR_EDIT_ROTATION');
  });
});
