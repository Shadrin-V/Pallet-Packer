import { describe, it, expect } from 'vitest';
import { ROTATION_RULES, NESTING_STATES, ORIENTATIONS } from './constants';

describe('domain constants (api-contract 0.1.0)', () => {
  it('lists the three rotation rules', () => {
    expect(ROTATION_RULES).toEqual(['none', 'yawOnly', 'full']);
  });

  it('lists the two nesting states', () => {
    expect(NESTING_STATES).toEqual(['verschachtelt', 'entschachtelt']);
  });

  it('lists all six orientations', () => {
    expect(ORIENTATIONS).toEqual(['lwh', 'wlh', 'lhw', 'hlw', 'whl', 'hwl']);
  });
});
