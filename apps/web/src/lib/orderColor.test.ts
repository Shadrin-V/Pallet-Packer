import { describe, it, expect } from 'vitest';
import { orderColorToken } from './orderColor';

describe('orderColorToken', () => {
  it('maps order index to a 1..8 series token, wrapping', () => {
    expect(orderColorToken(0).series).toBe(1);
    expect(orderColorToken(7).series).toBe(8);
    expect(orderColorToken(8).series).toBe(1); // wrap
    expect(orderColorToken(15).series).toBe(8);
  });

  it('gives a stable hatch id per index', () => {
    expect(orderColorToken(0).hatchId).toBe('pat-1');
    expect(orderColorToken(8).hatchId).toBe('pat-1');
  });

  it('exposes the CSS var for the series colour', () => {
    expect(orderColorToken(0).colorVar).toBe('var(--s1)');
    expect(orderColorToken(2).colorVar).toBe('var(--s3)');
  });
});
