import { describe, it, expect } from 'vitest';
import { TRANSLATION_KEYS } from '../keys';
import { de } from './de';
import { ru } from './ru';

describe('dictionary completeness', () => {
  it('every key resolves in de and ru', () => {
    for (const k of TRANSLATION_KEYS) {
      expect(de[k], `de missing ${k}`).toBeTruthy();
      expect(ru[k], `ru missing ${k}`).toBeTruthy();
    }
  });
  it('has the ruler unit key', () => {
    expect(TRANSLATION_KEYS).toContain('ladeplan.rulerUnit');
    expect(de['ladeplan.rulerUnit']).toBe('m');
    expect(ru['ladeplan.rulerUnit']).toBe('м');
  });
});
