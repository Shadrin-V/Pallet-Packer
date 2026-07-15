import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { calculateLayout, findGeometryViolations, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { LadeplanScreen } from './LadeplanScreen';

const V = { id: 'v1', name: 'LKW', length: 2000, width: 2000, height: 2000 };
const load: Load = {
  vehicle: V,
  cargo: [
    {
      id: 'c1',
      name: 'Box',
      length: 1000,
      width: 1000,
      height: 1000,
      quantity: 8,
      rotation: 'none',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const layout = calculateLayout(load);

function renderLadeplan() {
  return render(
    <LocaleProvider initial="de">
      <LadeplanScreen load={load} layout={layout} />
    </LocaleProvider>,
  );
}

describe('LadeplanScreen', () => {
  it('renders the title, both cutaways, legend and metrics', () => {
    renderLadeplan();
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Ladeplan');
    expect(screen.getByRole('img', { name: 'Draufsicht' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Seitenansicht' })).toBeInTheDocument();
    // legend lists the one order id
    expect(screen.getByText('SO-1')).toBeInTheDocument();
    // metric: 8 placed
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('holds the geometry invariant (0 violations) — both directly and via the DOM flag', () => {
    expect(findGeometryViolations(load, layout)).toEqual([]);
    const { container } = renderLadeplan();
    expect(container.querySelector('[data-violations]')?.getAttribute('data-violations')).toBe('0');
  });
});
