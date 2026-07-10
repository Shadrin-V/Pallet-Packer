import { describe, it, expect } from 'vitest';
import * as engine from './index';

describe('@shadrin-v/engine bootstrap', () => {
  it('exposes the API contract version 0.7.0', () => {
    expect(engine.ENGINE_CONTRACT_VERSION).toBe('0.7.0');
  });

  it('exposes the public API surface', () => {
    expect(typeof engine.calculateLayout).toBe('function');
    expect(typeof engine.getLayoutReport).toBe('function');
    expect(typeof engine.computeStack).toBe('function');
    expect(typeof engine.validateLoad).toBe('function');
  });
});
