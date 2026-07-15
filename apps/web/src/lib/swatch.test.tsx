import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HatchDefs, OrderSwatch } from './swatch';

describe('HatchDefs', () => {
  it('renders all 8 hatch patterns', () => {
    const { container } = render(
      <svg>
        <HatchDefs />
      </svg>,
    );
    for (let s = 1; s <= 8; s++) {
      expect(container.querySelector(`#pat-${s}`)).toBeInTheDocument();
    }
  });
});

describe('OrderSwatch', () => {
  it('renders an svg using the series colour token and hatch', () => {
    const { container } = render(<OrderSwatch index={0} title="Auftrag A" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // series-1 colour var + its hatch pattern
    expect(container.querySelector('#pat-1')).toBeInTheDocument();
    expect(container.innerHTML).toContain('var(--s1)');
  });

  it('wraps colour by index (9th order → series 1)', () => {
    const { container } = render(<OrderSwatch index={8} />);
    expect(container.querySelector('#pat-1')).toBeInTheDocument();
  });
});
