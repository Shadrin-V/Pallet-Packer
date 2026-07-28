import { describe, it, expect } from 'vitest';
import type { StackPreview } from '@shadrin-v/engine';
import { ruleChip, ruleSentences } from './positionRules';
import type { PositionState } from '../SetupScreen';

const base = (over: Partial<PositionState> = {}): PositionState => ({
  id: 'p1', name: 'Gestell A', length: 2400, width: 1000, height: 1900, quantity: 4,
  state: 'entschachtelt', rotation: 'yawOnly', forkAxis: 'length',
  nestStepPairwise: '', nestStepSequential: '', nestingMode: 'pairwise',
  maxNested: '', allowUnpairedTop: false, maxTiers: '', ...over,
});

const preview = (over: Partial<StackPreview> = {}): StackPreview => ({
  count: 4, height: 7600, mode: 'entschachtelt', base: 1900, hold: 2700, rawCount: 4, ...over,
} as StackPreview);

describe('ruleChip', () => {
  it('nested position shows the step', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120 });
    expect(ruleChip(p, preview({ mode: 'sequential', stepHeight: 120, count: 5 }))).toEqual({
      text: { key: 'setup.chip.nested', vars: { step: 120 } }, restricted: false, count: 5,
    });
  });

  it('nested without a step says the step is missing', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: '' });
    expect(ruleChip(p, null).text).toEqual({ key: 'setup.chip.nestedNoStep', vars: {} });
  });

  it('a tier limit is named on the chip', () => {
    expect(ruleChip(base({ maxTiers: 3 }), preview({ count: 3 })).text).toEqual({
      key: 'setup.chip.stackLimited', vars: { cap: 3 },
    });
  });

  it('plain stacking has no number', () => {
    expect(ruleChip(base(), preview()).text).toEqual({ key: 'setup.chip.stack', vars: {} });
  });

  it('count is null while there is no preview', () => {
    expect(ruleChip(base({ length: '' }), null).count).toBeNull();
  });

  it('restricted is true for fixed and for two-sided, false for free', () => {
    expect(ruleChip(base({ rotation: 'none' }), null).restricted).toBe(true);
    expect(ruleChip(base({ forkAccess: 'twoSides' }), null).restricted).toBe(true);
    expect(ruleChip(base(), null).restricted).toBe(false);
  });
});

describe('ruleSentences', () => {
  it('explains plain stacking with the unit height and the count', () => {
    expect(ruleSentences(base(), preview())[0]).toEqual({
      key: 'setup.rule.entschachtelt', vars: { base: 1900, count: 4 },
    });
  });

  it('explains sequential nesting with the increment', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120 });
    expect(ruleSentences(p, preview({ mode: 'sequential', stepHeight: 120, count: 5 }))[0]).toEqual({
      key: 'setup.rule.sequential', vars: { step: 120, base: 1900 },
    });
  });

  it('explains pairwise nesting and the unpaired top when allowed', () => {
    const p = base({ state: 'verschachtelt', nestingMode: 'pairwise', nestStepPairwise: 22, allowUnpairedTop: true });
    const out = ruleSentences(p, preview({ mode: 'pairwise', stepHeight: 22, count: 5 }));
    expect(out[0]).toEqual({ key: 'setup.rule.pairwise', vars: { base: 1900, step: 22 } });
    expect(out[1]).toEqual({ key: 'setup.rule.pairwiseUnpaired', vars: {} });
  });

  it('names the cap that actually bit', () => {
    const out = ruleSentences(base({ maxTiers: 2 }), preview({ cappedBy: 'maxTiers', cap: 2, count: 2 }));
    expect(out).toContainEqual({ key: 'setup.rule.capTiers', vars: { cap: 2 } });
  });

  it('a not-stackable preview replaces the vertical sentence', () => {
    const out = ruleSentences(base(), preview({ cappedBy: 'notStackable', count: 1 }));
    expect(out[0]).toEqual({ key: 'setup.rule.notStackable', vars: {} });
  });

  it('always ends with the orientation sentence', () => {
    expect(ruleSentences(base(), null)).toEqual([{ key: 'setup.rule.orientFree', vars: {} }]);
    expect(ruleSentences(base({ rotation: 'none' }), null)).toEqual([
      { key: 'setup.rule.orientFixed', vars: {} },
    ]);
    expect(ruleSentences(base({ forkAccess: 'twoSides', forkAxis: 'width' }), null)).toEqual([
      { key: 'setup.rule.orientTwoSidedWidth', vars: {} },
    ]);
  });
});
