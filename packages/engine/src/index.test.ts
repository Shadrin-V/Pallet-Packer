import { describe, it, expect } from 'vitest';
import * as engine from './index';

describe('@pallet/engine bootstrap', () => {
  it('exposes the API contract version 0.1.0', () => {
    expect((engine as Record<string, unknown>).ENGINE_CONTRACT_VERSION).toBe('0.1.0');
  });
});
