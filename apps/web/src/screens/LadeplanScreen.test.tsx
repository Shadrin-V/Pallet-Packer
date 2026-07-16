import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Strategy switch changes recompute the layout and discard manual edits, so warn first when edits exist.
const editable: Load = {
  vehicle: { id: 'v2', name: 'LKW', length: 3000, width: 2000, height: 2000 },
  cargo: [
    {
      id: 'p1',
      name: 'Pal',
      length: 1200,
      width: 800,
      height: 900,
      quantity: 2,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};

function renderEditable(onLoadingModeChange = vi.fn()) {
  render(
    <LocaleProvider initial="de">
      <LadeplanScreen
        load={editable}
        layout={calculateLayout(editable)}
        onLoadingModeChange={onLoadingModeChange}
      />
    </LocaleProvider>,
  );
  return onLoadingModeChange;
}

describe('LadeplanScreen — strategy switch vs manual edits', () => {
  afterEach(() => vi.restoreAllMocks());

  it('switches strategy without a prompt when there are no manual edits', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onLoadingModeChange = renderEditable();
    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onLoadingModeChange).toHaveBeenCalledWith('rear');
  });

  it('warns and keeps the current strategy when the user declines after editing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onLoadingModeChange = renderEditable();
    // Make a manual edit: select the stack, then rotate it.
    await userEvent.click(screen.getAllByText('×2')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Stapel drehen' }));

    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onLoadingModeChange).not.toHaveBeenCalled();
  });

  it('switches strategy after editing once the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onLoadingModeChange = renderEditable();
    await userEvent.click(screen.getAllByText('×2')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Stapel drehen' }));

    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    expect(onLoadingModeChange).toHaveBeenCalledWith('rear');
  });
});
