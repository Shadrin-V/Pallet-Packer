import { describe, expect, it } from 'vitest';
import type { Layout, Load } from '../model/index';
import { placeStack } from './edit';
import { resolveDrop } from './resolveDrop';

const V = { id: 'v', name: 'LKW', length: 10000, width: 2400, height: 2650 };
const pallet = {
  id: 'p',
  name: 'P',
  length: 1200,
  width: 800,
  height: 1000,
  quantity: 10,
  rotation: 'yawOnly' as const,
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt' as const,
  orderId: 'SO-1',
};
const load: Load = { vehicle: V, cargo: [pallet] };
const at = (x: number, y: number) => ({
  cargoTypeId: 'p',
  x,
  y,
  z: 0,
  orientation: 'lwh' as const,
  tier: 1,
  state: 'entschachtelt' as const,
});
const layoutOf = (placements: Layout['placements'], unplaced = 5): Layout => ({
  placements,
  unplaced: [{ cargoTypeId: 'p', count: unplaced }],
  metrics: {
    totalPlaced: placements.length,
    usedFloorPositions: placements.length,
    floorFillPercent: 0,
    volumeFillPercent: 0,
  },
  contractVersion: '0.13.0',
});
const spec = (x: number, y: number) => ({
  cargoTypeId: 'p',
  x,
  y,
  orientation: 'lwh' as const,
  units: 1,
});

describe('resolveDrop', () => {
  it('returns the aim untouched when it is free and nothing is near enough to snap to', () => {
    const r = resolveDrop(load, layoutOf([]), spec(5000, 800));
    expect(r).toMatchObject({ x: 5000, y: 800, ok: true, blocking: [] });
  });

  it('snaps flush when the aim overlaps a neighbour', () => {
    // сосед занимает 0…1200; целимся в 1080 → налезаем на 120 мм. Впритык = 1200.
    const r = resolveDrop(load, layoutOf([at(0, 0)]), spec(1080, 0));
    expect(r).toMatchObject({ x: 1200, y: 0, ok: true });
  });

  it('closes a gap: a valid aim still snaps flush to the neighbour', () => {
    // 1260 свободно (сосед кончается на 1200), но оставляет щель 60 мм → прижать к 1200.
    const r = resolveDrop(load, layoutOf([at(0, 0)]), spec(1260, 0));
    expect(r).toMatchObject({ x: 1200, y: 0, ok: true });
  });

  it('refuses and names the blocking stack when nothing fits within tolerance', () => {
    const packed = layoutOf([at(0, 0), at(1200, 0), at(2400, 0)]);
    const r = resolveDrop(load, packed, spec(1250, 0), { tolerance: 100 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(r.blocking.length).toBeGreaterThan(0);
  });

  it('does not search when fork access pins the orientation — no position can fix it', () => {
    const pinned: Load = {
      vehicle: V,
      cargo: [{ ...pallet, forkAccess: 'twoSides', forkAxis: 'length' }],
      loadingMode: 'rear',
    };
    const r = resolveDrop(pinned, layoutOf([]), { ...spec(5000, 800), orientation: 'wlh' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
    expect(r.blocking).toEqual([]);
  });

  it('refuses an orientation the rotation rule forbids', () => {
    const fixed: Load = { vehicle: V, cargo: [{ ...pallet, rotation: 'none' }] };
    const r = resolveDrop(fixed, layoutOf([]), { ...spec(5000, 800), orientation: 'wlh' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
  });

  it('excludes the moved stack from its own collision check', () => {
    const one = layoutOf([at(0, 0)]);
    const r = resolveDrop(load, one, spec(60, 0), { exclude: { cargoTypeId: 'p', x: 0, y: 0 } });
    expect(r.ok).toBe(true); // не считает себя помехой; прижмётся к стенке x=0
    expect(r.x).toBe(0);
  });

  it('pulls an aim just outside the hold back inside', () => {
    const r = resolveDrop(load, layoutOf([]), spec(-50, -30));
    expect(r).toMatchObject({ x: 0, y: 0, ok: true });
  });

  it('refuses an aim far outside the hold rather than teleporting it', () => {
    const r = resolveDrop(load, layoutOf([]), spec(-5000, 800));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('is deterministic', () => {
    const l = layoutOf([at(0, 0), at(2400, 0)]);
    expect(resolveDrop(load, l, spec(1250, 0))).toEqual(resolveDrop(load, l, spec(1250, 0)));
  });

  // Подсветка не может врать: зелёное обещание обязано выполняться.
  it('never returns ok for a position placeStack would refuse', () => {
    const l = layoutOf([at(0, 0), at(2400, 0)]);
    for (let x = -200; x <= 4000; x += 100) {
      for (const y of [0, 400, 800, 1600]) {
        const r = resolveDrop(load, l, spec(x, y));
        if (!r.ok) continue;
        const applied = placeStack(load, l, {
          cargoTypeId: 'p',
          x: r.x,
          y: r.y,
          orientation: 'lwh',
          units: 1,
        });
        expect(
          applied.error,
          `resolveDrop said ok at ${r.x},${r.y} but placeStack refused`,
        ).toBeUndefined();
      }
    }
  });
});
