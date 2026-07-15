import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { StackPreview } from '@shadrin-v/engine';
import { StackDiagram } from './StackDiagram';

const preview = (over: Partial<StackPreview>): StackPreview => ({
  count: 5,
  height: 1000,
  mode: 'sequential',
  base: 200,
  hold: 2650,
  stepHeight: 200,
  rawCount: 5,
  ...over,
});

describe('StackDiagram', () => {
  it('draws one deck rect per stacked unit plus the hold frame', () => {
    const { container } = render(
      <StackDiagram preview={preview({ count: 5 })} length={1200} label="Stapel" />,
    );
    const rects = container.querySelectorAll('rect');
    // 5 decks + 1 headroom frame
    expect(rects.length).toBe(6);
  });

  it('places the top deck at the stack height (nesting overlaps within the hold)', () => {
    const { container } = render(
      <StackDiagram preview={preview({ count: 3, base: 200, height: 600, hold: 2650 })} length={1000} label="s" />,
    );
    // inc = (600-200)/2 = 200; top deck (i=2) y = 2650 - (2*200 + 200) = 2050
    const decks = [...container.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') !== 'none');
    const ys = decks.map((r) => Number(r.getAttribute('y'))).sort((a, b) => a - b);
    expect(ys[0]).toBe(2050); // top deck sits highest (smallest y)
    expect(ys[ys.length - 1]).toBe(2450); // bottom deck: 2650 - 200
  });
});
