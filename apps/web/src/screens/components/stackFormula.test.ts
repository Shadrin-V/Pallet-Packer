import { describe, it, expect } from 'vitest';
import type { StackPreview } from '@shadrin-v/engine';
import { formulaKey, fillTemplate, formulaVars, stepInvalid } from './stackFormula';

const base = (over: Partial<StackPreview>): StackPreview => ({
  count: 10,
  height: 1440,
  mode: 'sequential',
  base: 144,
  hold: 2650,
  rawCount: 10,
  ...over,
});

describe('formulaKey', () => {
  it('entschachtelt', () => expect(formulaKey(base({ mode: 'entschachtelt' }))).toBe('stack.formula.entschachtelt'));
  it('sequential', () => expect(formulaKey(base({ mode: 'sequential' }))).toBe('stack.formula.sequential'));
  it('pairwise', () => expect(formulaKey(base({ mode: 'pairwise' }))).toBe('stack.formula.pairwise'));
  it('notStackable overrides mode', () =>
    expect(formulaKey(base({ mode: 'sequential', cappedBy: 'notStackable' }))).toBe('stack.formula.notStackable'));
});

describe('fillTemplate', () => {
  it('substitutes operands', () => {
    expect(fillTemplate('⌊{hold}/{base}⌋ = {rawCount}', formulaVars(base({ hold: 2650, base: 144, rawCount: 18 })))).toBe(
      '⌊2650/144⌋ = 18',
    );
  });
  it('leaves unknown placeholders intact', () => {
    expect(fillTemplate('{x}', {})).toBe('{x}');
  });
});

describe('stepInvalid', () => {
  it('entschachtelt is always valid', () => expect(stepInvalid('entschachtelt', '', 144)).toBe(false));
  it('verschachtelt requires a step', () => expect(stepInvalid('verschachtelt', '', 144)).toBe(true));
  it('verschachtelt rejects 0 / negative', () => expect(stepInvalid('verschachtelt', 0, 144)).toBe(true));
  it('verschachtelt rejects step > height', () => expect(stepInvalid('verschachtelt', 200, 144)).toBe(true));
  it('verschachtelt accepts a valid step', () => expect(stepInvalid('verschachtelt', 22, 144)).toBe(false));
});
