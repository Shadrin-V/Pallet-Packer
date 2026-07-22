import { describe, it, expect } from 'vitest';
import { DX, DY, project, tierStep, boxFaces, stackViewBox } from './stack3d';

describe('project (oblique axonometric)', () => {
  it('projects the origin to itself', () => {
    expect(project(0, 0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
  });
  it('height rises (y decreases); depth recedes up-and-right', () => {
    const up = project(0, 0, 100);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-100);
    const back = project(0, 100, 0);
    expect(back.x).toBeCloseTo(100 * DX);
    expect(back.y).toBeCloseTo(-100 * DY);
  });
});

describe('tierStep', () => {
  it('equals the base height for entschachtelt (flush stacking)', () => {
    expect(tierStep(820, 2460, 3)).toBe(820);
  });
  it('is smaller than base for nested (telescoped)', () => {
    expect(tierStep(820, 2420, 6)).toBe(320);
  });
  it('is 0 for a single tier', () => {
    expect(tierStep(200, 200, 1)).toBe(0);
  });
});

describe('boxFaces', () => {
  it('front face has four corners with the top edge risen', () => {
    const f = boxFaces(0, 1200, 800, 1000, 0, 0).front;
    expect(f).toHaveLength(4);
    expect(f[2]).toEqual({ x: 1200, y: -1000 });
  });
  it('top and right faces each have four corners', () => {
    const b = boxFaces(0, 1200, 800, 1000, 0, 0);
    expect(b.top).toHaveLength(4);
    expect(b.right).toHaveLength(4);
  });
});

describe('stackViewBox', () => {
  it('spans the hold box plus padding', () => {
    const vb = stackViewBox(1200, 800, 2650, 40);
    expect(vb.minX).toBe(-40);
    expect(vb.minY).toBe(-40);
    expect(vb.w).toBeCloseTo(1200 + 800 * DX + 80);
    expect(vb.h).toBeCloseTo(2650 + 800 * DY + 80);
  });
});
