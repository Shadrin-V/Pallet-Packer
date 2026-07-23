import { describe, it, expect } from 'vitest';
import { metreTicks, halfMetreTicks } from './ruler';

describe('metreTicks', () => {
  it('one tick per interior whole metre', () => {
    expect(metreTicks(13600)).toEqual([
      { x: 1000, metre: 1 }, { x: 2000, metre: 2 }, { x: 3000, metre: 3 },
      { x: 4000, metre: 4 }, { x: 5000, metre: 5 }, { x: 6000, metre: 6 },
      { x: 7000, metre: 7 }, { x: 8000, metre: 8 }, { x: 9000, metre: 9 },
      { x: 10000, metre: 10 }, { x: 11000, metre: 11 }, { x: 12000, metre: 12 },
      { x: 13000, metre: 13 },
    ]);
  });
  it('excludes an exact edge metre', () => {
    expect(metreTicks(2000)).toEqual([{ x: 1000, metre: 1 }]);
  });
  it('empty below one metre', () => {
    expect(metreTicks(800)).toEqual([]);
  });
});

describe('halfMetreTicks', () => {
  it('one minor tick per interior half metre (500, 1500, 2500 …)', () => {
    expect(halfMetreTicks(2650)).toEqual([500, 1500, 2500]);
  });
  it('excludes an exact edge half metre', () => {
    expect(halfMetreTicks(1500)).toEqual([500]);
  });
  it('empty below the first half metre', () => {
    expect(halfMetreTicks(400)).toEqual([]);
  });
});
