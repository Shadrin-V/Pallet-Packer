import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, findGeometryViolations, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { LadeplanScreen } from './LadeplanScreen';
import * as exportPlan from '../lib/exportPlan';

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

// Export (qrd.15): PDF via the print dialog, PNG rasterised client-side, JSON verbatim per contract.
// The plan's worst news must sit with the summary figures, not only in the legend far below (rgv.7).
describe('LadeplanScreen — unplaced figure', () => {
  it('omits the unplaced figure when everything fits', () => {
    renderLadeplan(); // 8 cubes fill the 2×2×2 hold exactly
    expect(screen.queryByTestId('fig-unplaced')).not.toBeInTheDocument();
  });

  it('shows the unplaced count with the figures when some units did not fit', () => {
    const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
      </LocaleProvider>,
    );
    const fig = screen.getByTestId('fig-unplaced');
    expect(fig).toHaveTextContent('3'); // 11 requested − 8 placed
    expect(fig).toHaveTextContent('Nicht platziert');
  });
});

// The buffer (dwc.3): what is NOT in the hold. jsdom has no layout, so the drag geometry itself is
// verified in a real browser — these guard the wiring and the states the user can reach by clicking.
describe('LadeplanScreen — warehouse floor', () => {
  /** 11 cubes into a hold that takes 8 → 3 left over for the warehouse. */
  const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };
  const renderOverloaded = () =>
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
      </LocaleProvider>,
    );
  /** The tile's footprint, read off the shape itself — there is no card to read it from. */
  const footprint = (tile: HTMLElement) => {
    const r = tile.querySelector('rect')!;
    return `${r.getAttribute('width')}×${r.getAttribute('height')}`;
  };

  it('offers the unplaced units as draggable stacks, not as a bare number', () => {
    renderOverloaded();
    expect(screen.getByTestId('warehouse-floor')).toBeInTheDocument();
    expect(screen.getByTestId('warehouse-count')).toHaveTextContent('3 nicht platziert');
    // Tiles are STACKS, not units: the hold takes two cubes per column, so 3 leftovers arrive as a
    // full stack of 2 plus a remainder of 1 — that is what the user actually drags.
    const tiles = screen.getAllByTestId('warehouse-tile');
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.textContent)).toEqual([
      expect.stringContaining('×2'),
      expect.stringContaining('×1'),
    ]);
  });

  it('says the warehouse is empty when everything is in the hold', () => {
    renderLadeplan(); // 8 cubes fill the hold exactly
    expect(screen.getByTestId('warehouse-floor')).toHaveTextContent('Alles platziert');
    expect(screen.queryAllByTestId('warehouse-tile')).toHaveLength(0);
  });

  it('turns a stack on the floor, so it can be dropped in the other way round', async () => {
    const pallets: Load = {
      vehicle: { id: 'v', name: 'LKW', length: 1200, width: 800, height: 1000 },
      cargo: [{ ...load.cargo[0], id: 'p', name: 'Pal', length: 1200, width: 800, height: 900, quantity: 2, rotation: 'yawOnly' }],
    };
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={pallets} layout={calculateLayout(pallets)} />
      </LocaleProvider>,
    );
    expect(footprint(screen.getByTestId('warehouse-tile'))).toBe('1200×800');

    // No ⟳ button any more: click selects the stack, the handle turns it — the hold's own gesture.
    await userEvent.click(screen.getByTestId('warehouse-tile'));
    await userEvent.click(screen.getByRole('button', { name: /Stapel im Lager drehen/ }));
    expect(footprint(screen.getByTestId('warehouse-tile'))).toBe('800×1200'); // yaw flipped
  });

  // Orientation is per cargo TYPE: stacks of one type are interchangeable and their order shifts on
  // every edit, so an index-keyed orientation would hand the rotation to a random stack.
  it('keeps a rotation on its cargo type, not on a slot in the list', async () => {
    const two: Load = {
      vehicle: { id: 'v', name: 'LKW', length: 1200, width: 800, height: 1000 },
      cargo: [
        { ...load.cargo[0], id: 'a', name: 'A', length: 1200, width: 800, height: 900, quantity: 3, rotation: 'yawOnly' },
      ],
    };
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={two} layout={calculateLayout(two)} />
      </LocaleProvider>,
    );
    // one position in the hold, two stacks left over → both tiles are the same type
    expect(screen.getAllByTestId('warehouse-tile')).toHaveLength(2);

    await userEvent.click(screen.getAllByTestId('warehouse-tile')[0]);
    await userEvent.click(screen.getByRole('button', { name: /Stapel im Lager drehen/ }));

    // both tiles of that type now read the rotated footprint — nothing depends on list position
    for (const tile of screen.getAllByTestId('warehouse-tile')) {
      expect(footprint(tile)).toBe('800×1200');
    }
  });

  it('offers no rotation for cargo whose rule forbids it', async () => {
    renderOverloaded(); // the cube type is rotation: 'none'
    await userEvent.click(screen.getAllByTestId('warehouse-tile')[0]);
    expect(screen.queryByRole('button', { name: /Stapel im Lager drehen/ })).not.toBeInTheDocument();
  });

  it('carries a ghost of the stack while it is being dragged', () => {
    renderOverloaded();
    expect(screen.queryByTestId('drag-ghost')).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Box ×2' }), { clientX: 10, clientY: 10 });
    expect(screen.getByTestId('drag-ghost')).toHaveTextContent('Box ×2');
  });
});

describe('LadeplanScreen — section order', () => {
  // Owner's batch: side view on top, then the top view, then the warehouse it feeds.
  it('reads side view → top view → warehouse', () => {
    const { container } = renderLadeplan();
    const marks = [...container.querySelectorAll('svg[data-cutaway], [data-testid="warehouse-floor"]')];
    expect(marks.map((el) => el.getAttribute('data-cutaway') ?? 'warehouse')).toEqual([
      'side',
      'top',
      'warehouse',
    ]);
  });

  // Both cutaways share the x axis, so one pair of markers under the TOP view labels them both.
  it('keeps Vorne / Hinten under the top view once the side view moves above it', () => {
    renderLadeplan();
    expect(screen.getAllByText('Vorne')).toHaveLength(1);
    expect(screen.getAllByText('Hinten')).toHaveLength(1);
  });
});

describe('LadeplanScreen — action bar groups', () => {
  it('labels the strategy and export groups instead of one flat row (rgv.3)', () => {
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={load} layout={layout} onLoadingModeChange={vi.fn()} />
      </LocaleProvider>,
    );
    // The mode switch already exposes its own group named "Belademodus"; the bar adds the visible
    // heading above it, plus a real group around the output actions.
    expect(screen.getByRole('group', { name: 'Belademodus' })).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Export' })).toBeInTheDocument();
  });
});

describe('LadeplanScreen — export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers all three exports', () => {
    renderLadeplan();
    for (const name of ['PDF', 'PNG', 'JSON']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  // The PNG composes exactly the two cutaways. Selecting them by role="img" once swept in the
  // legend swatches too (square aspect → a metres-tall sheet), hence the explicit marker.
  it('marks exactly the two projections as cutaways, side before top', () => {
    const { container } = renderLadeplan();
    const cutaways = [...container.querySelectorAll('svg[data-cutaway]')];
    expect(cutaways.map((el) => el.getAttribute('data-cutaway'))).toEqual(['side', 'top']);
    expect(container.querySelectorAll('svg[role="img"]').length).toBeGreaterThan(cutaways.length);
  });

  // The captions used to be a hard-coded array indexed by DOM position, so reordering the sections
  // would have swapped them silently. They now come from the svg that is actually being exported.
  it('captions each PNG section from its own data-cutaway, not from its position', async () => {
    const spy = vi.spyOn(exportPlan, 'exportPlanPng').mockResolvedValue(undefined);
    renderLadeplan();
    await userEvent.click(screen.getByRole('button', { name: 'PNG' }));

    const sections = spy.mock.calls[0][1].sections;
    expect(
      sections.map((s: { caption: string; svg: SVGSVGElement }) => [
        s.svg.dataset.cutaway,
        s.caption,
      ]),
    ).toEqual([
      ['side', 'Seitenansicht'],
      ['top', 'Draufsicht'],
    ]);
  });

  it('PDF opens the print dialog (browser "save as PDF")', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderLadeplan();
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('JSON downloads load + layout under a dated filename', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderLadeplan();
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^ladungsplaner-lkw-\d{4}-\d{2}-\d{2}\.json$/);
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
