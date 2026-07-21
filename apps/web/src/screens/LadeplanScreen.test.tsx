import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { LadeplanScreen } from './LadeplanScreen';
import { installSvgGeometry } from './components/svgTestGeometry';
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
    // Figure labels. The band is now the only place they appear (D1), hence getByText — and
    // "Bodenauslastung" rather than a bare "Auslastung", which is ambiguous next to the volume.
    expect(screen.getByText('Paletten')).toBeInTheDocument();
    expect(screen.getByText('Stellplätze')).toBeInTheDocument();
    expect(screen.getByText('Bodenauslastung')).toBeInTheDocument();
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

// The buffer (dwc.3): what is NOT in the hold. This describe block only checks wiring and the
// states reachable by clicking, without a real pointer drag. Drag geometry itself (createSVGPoint,
// getScreenCTM, a non-zero bounding rect — none of which jsdom implements) is supplied by
// `svgTestGeometry.ts` and exercised below, in "group selection".
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

// Group edits (dwc.6): the whole selection travels as one, and one edit puts it all in the buffer.
describe('LadeplanScreen — group selection', () => {
  /** Stub the geometry jsdom lacks, plus a buffer strip just below the cutaway, so a release at
   *  y=2600 is outside the hold AND over the strip. Restores both, whatever the body does. */
  const withStubbedGeometry = (
    svgRect: { left: number; top: number; width: number; height: number },
    run: () => void,
  ) => {
    const restoreSvg = installSvgGeometry(svgRect);
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function () {
      return {
        left: 0, top: 2400, right: 4000, bottom: 3000,
        width: 4000, height: 600, x: 0, y: 2400, toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      run();
    } finally {
      HTMLDivElement.prototype.getBoundingClientRect = origRect;
      restoreSvg();
    }
  };

  /** Rubber-band everything along y=0, then drag the stack at the origin to (toX, toY) client px. */
  const bandThenDrag = (container: HTMLElement, ref: string, toX: number, toY: number) => {
    const svg = container.querySelector('svg[data-cutaway="top"]')!;
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });

    fireEvent.pointerDown(svg.querySelector(`[data-stack-ref="${ref}"]`)!, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: toX, clientY: toY });
    fireEvent.pointerUp(svg, { clientX: toX, clientY: toY });
    return svg;
  };

  it('sends a whole group to the buffer in one gesture', () => {
    // The 2×2 m hold holds four columns of two cubes; the band catches the two along y=0.
    withStubbedGeometry({ left: 0, top: 0, width: 2000, height: 2000 }, () => {
      const { container } = renderLadeplan();
      expect(screen.queryByTestId('warehouse-count')).not.toBeInTheDocument(); // 8 of 8 placed

      bandThenDrag(container, 'c1@0,0', 500, 2600); // released below the cutaway, over the strip

      // Both stacks of the group are unplaced, i.e. all four cubes they carried — not just one stack.
      expect(screen.getByTestId('warehouse-count')).toHaveTextContent('4 nicht platziert');
    });
  });

  it('moves a whole group inside the hold with a single edit', () => {
    // A 3 m single-file hold with two cubes at x=0 and x=1000 — room to shift the pair along.
    const row: Load = {
      vehicle: { id: 'v3', name: 'LKW', length: 3000, width: 1000, height: 1000 },
      cargo: [{ ...load.cargo[0], quantity: 2, stacking: { stackable: false } }],
    };
    withStubbedGeometry({ left: 0, top: 0, width: 3000, height: 1000 }, () => {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={row} layout={calculateLayout(row)} />
        </LocaleProvider>,
      );
      const svg = bandThenDrag(container, 'c1@0,0', 1500, 500); // one metre along the length

      // The block landed as a block — nothing left at x=0, both members one cell further on — and
      // the geometry invariant still holds, which is what a group move must never break.
      expect(svg.querySelector('[data-stack-ref="c1@0,0"]')).toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@1000,0"]')).not.toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@2000,0"]')).not.toBeNull();
      expect(container.querySelector('[data-violations]')).toHaveAttribute('data-violations', '0');
      expect(screen.queryByTestId('edit-error')).not.toBeInTheDocument();
    });
  });

  it('shows edit-error and leaves the block in place when a group move is refused', () => {
    // Three single-file cubes at x=0/1000/2000 in a 4 m hold, spelled out by hand — the packer's own
    // answer for three 1x1x1 cubes here is an L (0,0 / 0,1000 / 1000,0), not a row (see the group
    // selection fixture in CrossSection.test.tsx for the same note). Band-select the first two and
    // drag them one cell further — straight onto the third, UNSELECTED cube. That is an overlap
    // refusal that never leaves the cutaway's own client rect, so it cannot be mistaken for a drop
    // outside the hold (unlike aiming past the outer wall, where the svg's box and the vehicle's box
    // coincide in these tests and the two situations become impossible to tell apart).
    const threeInRow: Load = {
      vehicle: { id: 'v4', name: 'LKW', length: 4000, width: 2000, height: 1000 },
      cargo: [{ ...load.cargo[0], quantity: 3, stacking: { stackable: false } }],
    };
    const cubeAt = (x: number, y: number): Layout['placements'][number] => ({
      cargoTypeId: 'c1', x, y, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt',
    });
    const threeInRowLayout: Layout = {
      placements: [cubeAt(0, 0), cubeAt(1000, 0), cubeAt(2000, 0)],
      unplaced: [],
      metrics: { totalPlaced: 3, usedFloorPositions: 3, floorFillPercent: 0, volumeFillPercent: 0 },
      contractVersion: '0.14.0',
    };
    withStubbedGeometry({ left: 0, top: 0, width: 4000, height: 2000 }, () => {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={threeInRow} layout={threeInRowLayout} />
        </LocaleProvider>,
      );
      const svg = bandThenDrag(container, 'c1@0,0', 1500, 500); // one cell right — into the third cube

      // the block never moved — none of the three cubes shifted
      expect(svg.querySelector('[data-stack-ref="c1@0,0"]')).not.toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@1000,0"]')).not.toBeNull();
      expect(svg.querySelector('[data-stack-ref="c1@2000,0"]')).not.toBeNull();
      // the selection survives the refusal, and this time the reason is shown to the user
      expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
      expect(screen.getByTestId('edit-error')).toBeVisible();
    });
  });

  it('drops a stale selection when a fresh plan is computed', () => {
    // A selection is a list of floor coordinates. A recompute (loading mode, order grouping) repacks
    // the hold underneath it, so those coordinates stop meaning the stacks the user picked — the
    // frame would span one stack while the label still said two, and a later nudge would move
    // whatever now stands there.
    withStubbedGeometry({ left: 0, top: 0, width: 2000, height: 2000 }, () => {
      const { container, rerender } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={load} layout={layout} />
        </LocaleProvider>,
      );
      const svg = container.querySelector('svg[data-cutaway="top"]')!;
      fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
      fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
      fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });
      expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');

      // The repacked plan keeps only one of the two selected columns.
      const repacked: Layout = {
        ...layout,
        placements: layout.placements.filter((p) => p.x === 0 && p.y === 0),
      };
      rerender(
        <LocaleProvider initial="de">
          <LadeplanScreen load={load} layout={repacked} />
        </LocaleProvider>,
      );

      expect(screen.queryByTestId('group-count')).toBeNull();
      expect(screen.queryByTestId('group-frame')).toBeNull();
      expect(container.querySelector('[stroke-dasharray="6 4"]')).toBeNull();
    });
  });

  it('keeps the block selected through its own move — an edit is not a recompute', () => {
    // The counterpart of the test above: manual edits never touch the `layout` prop, so the top view
    // is NOT reset by them and the block can be nudged again without re-drawing the marquee.
    const row: Load = {
      vehicle: { id: 'v3', name: 'LKW', length: 3000, width: 1000, height: 1000 },
      cargo: [{ ...load.cargo[0], quantity: 2, stacking: { stackable: false } }],
    };
    withStubbedGeometry({ left: 0, top: 0, width: 3000, height: 1000 }, () => {
      const { container } = render(
        <LocaleProvider initial="de">
          <LadeplanScreen load={row} layout={calculateLayout(row)} />
        </LocaleProvider>,
      );
      bandThenDrag(container, 'c1@0,0', 1500, 500); // one metre along the length

      expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
      // and it follows the block to where it now stands, rather than staying behind
      expect(screen.getByTestId('group-frame')).toHaveAttribute('x', '1000');
    });
  });

  // The buffer verdict (dwc.6): `onDropOutside`'s return tells CrossSection whether the release
  // actually took the stacks off the floor — only then may it drop the selection. Nothing here pins
  // the `true` branch itself: round-trip a group through the buffer and back, onto the exact cell it
  // vacated, and check the returning stack does NOT inherit the stale selection.
  it('does not resurrect a stale selection on a stack returned to a vacated cell (buffer verdict)', () => {
    // If `onDropOutside` did not clear the selection on a genuine buffer hit, the stale refs would
    // still name (0,0)/(1000,0) — and a stack later placed back at (0,0) would silently render as
    // part of a group the user never selected. `groupBBox` matches no drawn rect right after the
    // drop, which is exactly why no existing assertion catches it — this test checks the return trip.
    withStubbedGeometry({ left: 0, top: 0, width: 2000, height: 2000 }, () => {
      const { container } = renderLadeplan(); // 8 cubes fill the hold exactly
      const svg = bandThenDrag(container, 'c1@0,0', 500, 2600); // group → buffer strip
      expect(screen.getByTestId('warehouse-count')).toHaveTextContent('4 nicht platziert');

      // Drag the first buffered tile back onto the cell the group just vacated. The identity geometry
      // stub makes client px == hold mm, and a tile is held by its centre, so aiming at (500, 500)
      // resolves a 1000×1000 stack to (0, 0) — the exact ref the stale selection would still hold.
      fireEvent.pointerDown(screen.getAllByTestId('warehouse-tile')[0], { clientX: 10, clientY: 10 });
      fireEvent.pointerUp(window, { clientX: 500, clientY: 500 });

      const returned = svg.querySelector('[data-stack-ref="c1@0,0"]');
      expect(returned).not.toBeNull();
      // Not selected: no dashed outline on the returning stack, and no group label anywhere. Coerced
      // to boolean before the assertion — jsdom elements crash chai's failure-message pretty-printer
      // (unrelated bug, unrelated to what we're pinning), which would otherwise mask a real failure
      // here behind an opaque "Cannot read properties of undefined (reading 'name')".
      expect(Boolean(returned!.querySelector('[stroke-dasharray="6 4"]'))).toBe(false);
      expect(Boolean(screen.queryByTestId('group-count'))).toBe(false);
    });
  });
});

describe('LadeplanScreen — figures (D1 + D3)', () => {
  const overloaded: Load = { ...load, cargo: [{ ...load.cargo[0], quantity: 11 }] };

  // The meta band and the old Metrics row repeated four of five numbers; "not placed" was said three
  // times (figure, legend, metrics). One band, one place.
  it('carries every number once, in the meta band', () => {
    render(
      <LocaleProvider initial="de">
        <LadeplanScreen load={overloaded} layout={calculateLayout(overloaded)} />
      </LocaleProvider>,
    );
    for (const label of ['Paletten', 'Stellplätze', 'Bodenauslastung', 'Volumenauslastung', 'Nicht platziert']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  it('drops the unplaced figure when there is no bad news to tell', () => {
    renderLadeplan(); // 8 cubes fill the hold exactly
    expect(screen.queryByText('Nicht platziert')).not.toBeInTheDocument();
    expect(screen.getByText('Volumenauslastung')).toBeInTheDocument();
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
