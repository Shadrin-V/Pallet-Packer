import { describe, it, expect } from 'vitest';
import * as engine from './index';

describe('@shadrin-v/engine bootstrap', () => {
  it('exposes the API contract version 0.4.0', () => {
    expect(engine.ENGINE_CONTRACT_VERSION).toBe('0.4.0');
  });
});
