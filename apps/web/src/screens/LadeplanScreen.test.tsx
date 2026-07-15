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
  it('renders the brand kicker, vehicle-name heading and both cutaways', () => {
    renderLadeplan();
    expect(screen.getByText('Ladeplan · Ladungsplaner')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('LKW');
    expect(screen.getByRole('img', { name: 'Draufsicht' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Seitenansicht' })).toBeInTheDocument();
  });

  it('shows the meta band with inner vehicle dimensions and figure labels', () => {
    renderLadeplan();
    expect(screen.getByText('Fahrzeug (innen)')).toBeInTheDocument();
    // de grouping: 2000 → "2.000"; unit once at the end
    expect(screen.getByText('2.000 × 2.000 × 2.000 mm')).toBeInTheDocument();
    // figure labels (also echoed in the compact metrics row → use getAllByText)
    expect(screen.getAllByText('Paletten').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stellplätze').length).toBeGreaterThan(0);
    expect(screen.getByText('Auslastung')).toBeInTheDocument();
  });

  it('legend breaks the order down by position (name × placed)', () => {
    renderLadeplan();
    // order id appears (legend + meta band)
    expect(screen.getAllByText('SO-1').length).toBeGreaterThan(0);
    // the single position "Box" placed ×8 (8 cubes fill the 2×2×2 hold exactly)
    expect(screen.getByText(/Box/)).toBeInTheDocument();
    expect(screen.getByText('×8')).toBeInTheDocument();
  });

  it('makes top-view stacks draggable (onMoveStack wired)', () => {
    const { container } = renderLadeplan();
    expect(container.querySelector('g[style*="grab"]')).toBeInTheDocument();
  });

  it('holds the geometry invariant (0 violations) — both directly and via the DOM flag', () => {
    expect(findGeometryViolations(load, layout)).toEqual([]);
    const { container } = renderLadeplan();
    expect(container.querySelector('[data-violations]')?.getAttribute('data-violations')).toBe('0');
  });
});
