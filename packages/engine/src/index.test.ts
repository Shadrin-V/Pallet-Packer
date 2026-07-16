import { describe, it, expect } from 'vitest';
import * as engine from './index';

describe('@shadrin-v/engine bootstrap', () => {
  it('exposes the API contract version 0.11.0', () => {
    expect(engine.ENGINE_CONTRACT_VERSION).toBe('0.11.0');
  });

  it('exposes the fork-access constants (ADR 018)', () => {
    expect(engine.FORK_ACCESS).toEqual(['all4', 'twoSides']);
    expect(engine.FORK_AXES).toEqual(['length', 'width']);
  });

  it('exposes the order-grouping constants (ADR 016)', () => {
    expect(engine.ORDER_GROUPINGS).toEqual(['strict', 'densityFirst']);
  });

  it('exposes the public API surface', () => {
    expect(typeof engine.calculateLayout).toBe('function');
    expect(typeof engine.getLayoutReport).toBe('function');
    expect(typeof engine.computeStack).toBe('function');
    expect(typeof engine.validateLoad).toBe('function');
    expect(typeof engine.orientedDims).toBe('function');
    expect(typeof engine.findGeometryViolations).toBe('function');
  });

  it('findGeometryViolations validates a (possibly hand-edited) layout (qrd.30)', () => {
    const load = {
      vehicle: { id: 'v', name: 'v', length: 2000, width: 2000, height: 1000 },
      cargo: [
        {
          id: 'c',
          name: 'c',
          length: 1000,
          width: 1000,
          height: 1000,
          quantity: 2,
          rotation: 'none' as const,
          stacking: { stackable: true },
          nesting: { nestable: false },
          state: 'entschachtelt' as const,
        },
      ],
    };
    const good = engine.calculateLayout(load);
    expect(engine.findGeometryViolations(load, good)).toEqual([]);

    // Move a stack out of bounds → a violation is reported.
    const edited = {
      ...good,
      placements: good.placements.map((p, i) => (i === 0 ? { ...p, x: 5000 } : p)),
    };
    expect(engine.findGeometryViolations(load, edited).length).toBeGreaterThan(0);
  });

  it('orientedDims maps orientation → [dx,dy,dz] for drawing views (qrd.14)', () => {
    expect(engine.orientedDims(1200, 800, 144, 'lwh')).toEqual([1200, 800, 144]);
    expect(engine.orientedDims(1200, 800, 144, 'wlh')).toEqual([800, 1200, 144]);
    expect(engine.orientedDims(1200, 800, 144, 'hlw')).toEqual([144, 1200, 800]);
  });
});
