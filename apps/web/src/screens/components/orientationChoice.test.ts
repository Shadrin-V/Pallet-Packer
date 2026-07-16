import { describe, it, expect } from 'vitest';
import { orientationChoiceOf, orientationFieldsFor } from './orientationChoice';

describe('orientationChoiceOf (engine fields → UI Ausrichtung)', () => {
  it('rotation none → fixed', () => {
    expect(orientationChoiceOf('none')).toBe('fixed');
    expect(orientationChoiceOf('none', 'twoSides')).toBe('fixed'); // no yaw to constrain
  });

  it('yaw + all4 (or unset) → free', () => {
    expect(orientationChoiceOf('yawOnly', 'all4')).toBe('free');
    expect(orientationChoiceOf('yawOnly')).toBe('free');
  });

  it('yaw + twoSides → twoSided', () => {
    expect(orientationChoiceOf('yawOnly', 'twoSides')).toBe('twoSided');
  });

  it('legacy full maps to free (full is dropped from the UI, ADR 018/013)', () => {
    expect(orientationChoiceOf('full')).toBe('free');
  });
});

describe('orientationFieldsFor (UI Ausrichtung → engine fields)', () => {
  it('maps each choice to rotation + forkAccess', () => {
    expect(orientationFieldsFor('fixed')).toEqual({ rotation: 'none', forkAccess: 'all4' });
    expect(orientationFieldsFor('free')).toEqual({ rotation: 'yawOnly', forkAccess: 'all4' });
    expect(orientationFieldsFor('twoSided')).toEqual({ rotation: 'yawOnly', forkAccess: 'twoSides' });
  });

  it('round-trips with orientationChoiceOf', () => {
    for (const choice of ['fixed', 'free', 'twoSided'] as const) {
      const f = orientationFieldsFor(choice);
      expect(orientationChoiceOf(f.rotation, f.forkAccess)).toBe(choice);
    }
  });
});
