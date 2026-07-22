import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { StackPreview } from '@shadrin-v/engine';
import { StackDiagram } from './StackDiagram';

const preview = (over: Partial<StackPreview>): StackPreview => ({
  count: 3,
  height: 2460,
  mode: 'entschachtelt',
  base: 820,
  hold: 2650,
  stepHeight: 0,
  rawCount: 3,
  ...over,
});

describe('StackDiagram (axonometric)', () => {
  it('draws one tier group per stacked unit', () => {
    const { container } = render(
      <StackDiagram preview={preview({ count: 3 })} length={1200} width={800} label="Stapel" />,
    );
    expect(container.querySelectorAll('[data-tier]').length).toBe(3);
  });

  it('renders the dashed hold headroom frame (top face + 3 risers)', () => {
    const { container } = render(
      <StackDiagram preview={preview({ count: 1 })} length={1200} width={800} label="s" />,
    );
    expect(container.querySelectorAll('[stroke-dasharray]').length).toBeGreaterThanOrEqual(4);
  });

  it('is an accessible image labelled by its caption', () => {
    const { getByRole } = render(
      <StackDiagram preview={preview({})} length={1200} width={800} label="Stapel 3" />,
    );
    expect(getByRole('img', { name: 'Stapel 3' })).toBeInTheDocument();
  });
});
