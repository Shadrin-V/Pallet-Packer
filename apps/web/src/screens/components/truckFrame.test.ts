import { describe, expect, it } from 'vitest';
import { truckFrame } from './truckFrame';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 };

describe('truckFrame', () => {
  it('outer width is the hold plus the cab gutter', () => {
    const f = truckFrame(V, 'top');
    expect(f.outerW).toBe(f.frontGutter + V.length);
  });

  // Виды стоят друг под другом в одной колонке: разные outerW сдвинули бы их по длине кузова.
  it('both views share one outer width', () => {
    expect(truckFrame(V, 'top').outerW).toBe(truckFrame(V, 'side').outerW);
  });

  // Колёса висят под полом только на виде сбоку; сверху их нет, и поле под них не резервируется.
  it('only the side view reserves room for the running gear', () => {
    expect(truckFrame(V, 'top').wheelGutter).toBe(0);
    expect(truckFrame(V, 'side').wheelGutter).toBeGreaterThan(0);
    expect(truckFrame(V, 'side').outerH).toBeGreaterThan(truckFrame(V, 'top').outerH);
  });

  // Вертикаль вида сверху меряется шириной кузова, вида сбоку — высотой.
  it('spans width on the top view and height on the side view', () => {
    const wide = { ...V, width: 2450, height: 3000 };
    expect(truckFrame(wide, 'top').outerH).toBe(truckFrame(wide, 'top').topGutter + wide.width);
  });
});
