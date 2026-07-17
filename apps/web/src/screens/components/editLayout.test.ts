import { describe, it, expect } from 'vitest';
import { snap, SNAP_MM } from './editLayout';

// The edit RULES are the engine's and are tested there (packages/engine/src/packing/edit.test.ts),
// as is the search for a place (resolveDrop.test.ts). All that is left on this side is the grid the
// drag's AIM is rounded to — and that the resolved position is NOT rounded again, which is guarded
// where it happens (CrossSection).

describe('snap', () => {
  it('rounds to the grid', () => {
    expect(snap(0)).toBe(0);
    expect(snap(149)).toBe(100);
    expect(snap(150)).toBe(200);
    expect(snap(-149)).toBe(-100);
    expect(SNAP_MM).toBe(100);
  });
});
