import { describe, it, expect } from 'vitest';
import * as engine from './index';

describe('@shadrin-v/engine bootstrap', () => {
  it('exposes the API contract version 0.8.0', () => {
    expect(engine.ENGINE_CONTRACT_VERSION).toBe('0.8.0');
  });

  it('exposes the public API surface', () => {
    expect(typeof engine.calculateLayout).toBe('function');
    expect(typeof engine.getLayoutReport).toBe('function');
    expect(typeof engine.computeStack).toBe('function');
    expect(typeof engine.validateLoad).toBe('function');
    expect(typeof engine.orientedDims).toBe('function');
  });

  it('orientedDims maps orientation → [dx,dy,dz] for drawing views (qrd.14)', () => {
    expect(engine.orientedDims(1200, 800, 144, 'lwh')).toEqual([1200, 800, 144]);
    expect(engine.orientedDims(1200, 800, 144, 'wlh')).toEqual([800, 1200, 144]);
    expect(engine.orientedDims(1200, 800, 144, 'hlw')).toEqual([144, 1200, 800]);
  });
});
