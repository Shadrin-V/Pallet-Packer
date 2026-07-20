import { describe, it, expect } from 'vitest';
import { DIMENSION_SOURCES } from './dto';
import type { Article, ArticleInput } from './dto';

describe('contracts DTOs', () => {
  it('enumerates dimension provenance sources', () => {
    expect(DIMENSION_SOURCES).toEqual(['erpnext-field', 'manual']);
  });
});

describe('Article DTO', () => {
  it('accepts an ERP article with locked constructive fields and free rules', () => {
    const a: Article = {
      itemCode: 'ABB101',
      name: 'Einweg-Holzpalette 600x800 mm IPPC + KD',
      length: 800,
      width: 600,
      height: 144,
      nestStepPairwise: 22,
      nestStepSequential: 30,
      rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly', allowUnpairedTop: true },
      source: 'erp',
      syncedAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
      erpFields: ['length', 'width'],
    };
    expect(a.itemCode).toBe('ABB101');
  });

  it('accepts a local article with no dimensions yet (nothing is required but the identity)', () => {
    const input: ArticleInput = {
      itemCode: 'BOX-9',
      name: 'Sonderkiste',
      rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    };
    expect(input.length).toBeUndefined();
  });
});
