import { describe, it, expect } from 'vitest';
import type { Layout } from '@shadrin-v/engine';
import { openDb } from './schema';
import { upsertVehicle, listVehicles } from './vehicles';
import { savePlan, getPlan, listPlans } from './plans';

const V = { id: 'v1', name: 'LKW', length: 13600, width: 2480, height: 2700 };

const emptyLayout: Layout = {
  placements: [],
  unplaced: [],
  metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
  contractVersion: '0.9.0',
};

describe('vehicle repo', () => {
  it('upserts (insert then update, no duplicate) and lists', () => {
    const db = openDb(':memory:');
    upsertVehicle(db, V);
    upsertVehicle(db, { ...V, name: 'LKW-2' });
    expect(listVehicles(db)).toEqual([{ ...V, name: 'LKW-2' }]);
    db.close();
  });
});

describe('plan repo', () => {
  it('saves a snapshot and reads it back; lists summaries', () => {
    const db = openDb(':memory:');
    const load = { vehicle: V, cargo: [] };
    const saved = savePlan(
      db,
      { name: 'P1', load, erpnextOrderIds: ['SO-1'], notes: 'hello' },
      emptyLayout,
      { id: 'p1', now: '2026-07-14T00:00:00Z' },
    );
    expect(saved.id).toBe('p1');
    expect(getPlan(db, 'p1')).toMatchObject({
      id: 'p1',
      name: 'P1',
      load,
      layout: emptyLayout,
      erpnextOrderIds: ['SO-1'],
      notes: 'hello',
    });
    expect(listPlans(db).map((p) => p.id)).toEqual(['p1']);
    db.close();
  });

  it('getPlan throws ERR_NOT_FOUND for a missing id', () => {
    const db = openDb(':memory:');
    expect.assertions(1);
    try {
      getPlan(db, 'nope');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('ERR_NOT_FOUND');
    } finally {
      db.close();
    }
  });
});
