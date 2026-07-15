import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HatchMarks, OrderSwatch } from './swatch';

describe('HatchMarks', () => {
  it('draws diagonal lines for series 1 (clipped to the rect)', () => {
    const { container } = render(
      <svg viewBox="0 0 100 100">
        <HatchMarks x={0} y={0} w={100} h={100} series={1} spacing={20} />
      </svg>,
    );
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
    // uses the series-1 colour token
    expect(container.innerHTML).toContain('var(--s1)');
  });

  it('draws dots (circles) for series 4', () => {
    const { container } = render(
      <svg viewBox="0 0 100 100">
        <HatchMarks x={0} y={0} w={100} h={100} series={4} spacing={20} />
      </svg>,
    );
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);
  });
});

describe('OrderSwatch', () => {
  it('renders an svg using the series colour token and hatch marks', () => {
    const { container } = render(<OrderSwatch index={0} title="Auftrag A" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="swatch-1"]')).toBeInTheDocument();
    expect(container.innerHTML).toContain('var(--s1)');
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
  });

  it('wraps colour by index (9th order → series 1)', () => {
    const { container } = render(<OrderSwatch index={8} />);
    expect(container.querySelector('[data-testid="swatch-1"]')).toBeInTheDocument();
  });
});
