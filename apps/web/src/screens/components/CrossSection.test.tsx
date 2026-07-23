import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, moveStacks, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { CrossSection } from './CrossSection';
import { installSvgGeometry } from './svgTestGeometry';

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

function renderCut(view: 'top' | 'side', label: string) {
  return render(
    <LocaleProvider initial="de">
      <CrossSection load={load} layout={layout} view={view} label={label} />
    </LocaleProvider>,
  );
}

describe('svgTestGeometry install/uninstall', () => {
  // The stub file's own comment warns that a prototype patch left behind silently changes what
  // every later test in the same worker sees. Pin the round trip directly, independent of any
  // component: install must return Element.prototype / SVGSVGElement.prototype / the PointerEvent
  // global to their EXACT prior shape — not just "working again", but no leftover own properties.
  const patchedMembers = [
    [SVGSVGElement.prototype, 'createSVGPoint'],
    [SVGSVGElement.prototype, 'getScreenCTM'],
    [SVGSVGElement.prototype, 'getBoundingClientRect'],
    [Element.prototype, 'setPointerCapture'],
    [Element.prototype, 'releasePointerCapture'],
  ] as const;

  it('restores every patched member and the PointerEvent global to their pre-install shape', () => {
    const before = patchedMembers.map(([obj, key]) => Object.prototype.hasOwnProperty.call(obj, key));
    const hadPointerEventBefore = 'PointerEvent' in globalThis;

    const restore = installSvgGeometry();
    restore();

    const after = patchedMembers.map(([obj, key]) => Object.prototype.hasOwnProperty.call(obj, key));
    expect(after).toEqual(before);
    expect('PointerEvent' in globalThis).toBe(hadPointerEventBefore);
  });

  it('refuses a second install before the first is restored, rather than losing the original state', () => {
    const restore = installSvgGeometry();
    try {
      expect(() => installSvgGeometry()).toThrow(/already installed/);
    } finally {
      restore();
    }
  });
});

describe('CrossSection rendering polish', () => {
  it('uses non-scaling-stroke for crisp lines', () => {
    const { container } = renderCut('top', 'Draufsicht');
    expect(container.querySelector('[vector-effect="non-scaling-stroke"]')).toBeInTheDocument();
  });

  // Both cutaways share the x axis, so one set of markers under the TOP view labels the pair (QA).
  it('labels Vorne / Hinten under the top view, and only there', () => {
    renderCut('top', 'Draufsicht');
    expect(screen.getByText('Vorne')).toBeInTheDocument();
    expect(screen.getByText('Hinten')).toBeInTheDocument();
  });

  it('does not repeat the Vorne / Hinten markers on the side view', () => {
    renderCut('side', 'Seitenansicht');
    expect(screen.queryByText('Vorne')).not.toBeInTheDocument();
    expect(screen.queryByText('Hinten')).not.toBeInTheDocument();
  });

  it('shows the ×N stack count on the top view', () => {
    renderCut('top', 'Draufsicht');
    expect(screen.getAllByText('×2').length).toBeGreaterThan(0); // 2 tiers per stack
  });
});

describe('manual stack rotation (T5)', () => {
  function renderEditable(view: 'top' | 'side', onRotateStack = vi.fn()) {
    render(
      <LocaleProvider initial="de">
        <CrossSection
          load={load}
          layout={layout}
          view={view}
          label={view === 'top' ? 'Draufsicht' : 'Seitenansicht'}
          onMoveStack={() => {}}
          onRotateStack={onRotateStack}
        />
      </LocaleProvider>,
    );
    return onRotateStack;
  }
  const rotateName = 'Stapel drehen';

  it('offers the rotate action only for the selected stack', async () => {
    renderEditable('top');
    expect(screen.queryByRole('button', { name: rotateName })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByText('×2')[0]); // click a stack (no drag) → selects it
    expect(screen.getAllByRole('button', { name: rotateName })).toHaveLength(1);
  });

  it('rotates the selected stack through onRotateStack', async () => {
    const onRotateStack = renderEditable('top');
    await userEvent.click(screen.getAllByText('×2')[0]);
    await userEvent.click(screen.getByRole('button', { name: rotateName }));

    expect(onRotateStack).toHaveBeenCalledTimes(1);
    const sel = onRotateStack.mock.calls[0][0];
    expect(sel).toMatchObject({ cargoTypeId: 'c1' });
    expect(layout.placements.some((p) => p.x === sel.x && p.y === sel.y)).toBe(true);
  });

  it('does not offer rotation in the side view', async () => {
    renderEditable('side');
    await userEvent.click(document.querySelector('svg rect')!);
    expect(screen.queryByRole('button', { name: rotateName })).not.toBeInTheDocument();
  });

  it('places the rotate handle inside the stack shape so edge stacks stay clickable (QA)', async () => {
    renderEditable('top');
    await userEvent.click(screen.getAllByText('×2')[0]);
    const rect = document.querySelector('rect[stroke-dasharray="6 4"]') as SVGRectElement;
    const rx = parseFloat(rect.getAttribute('x')!);
    const ry = parseFloat(rect.getAttribute('y')!);
    const rw = parseFloat(rect.getAttribute('width')!);
    const rh = parseFloat(rect.getAttribute('height')!);
    const handle = screen.getByRole('button', { name: rotateName });
    const m = handle.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
    const cx = parseFloat(m[1]);
    const cy = parseFloat(m[2]);
    // handle centre strictly inside the rect — a corner-anchored handle is clipped for edge stacks
    expect(cx).toBeGreaterThan(rx);
    expect(cx).toBeLessThan(rx + rw);
    expect(cy).toBeGreaterThan(ry);
    expect(cy).toBeLessThan(ry + rh);
  });
});

// Пять стопок 1200×400. s(x=0,y=0) — дальняя, её загораживает ровно одна: o(x=600,y=500).
// Саму o загораживают три стопки при x=1300, которые до s не достают (1300 ≥ 1200).
// Глубины: s=1, o=3 → сортировка по глубине ставит o ПЕРЕД s, и дальняя s закрашивает ближнюю o.
const depthV = { id: 'v2', name: 'LKW', length: 4000, width: 2400, height: 2000 };
const depthLoad: Load = {
  vehicle: depthV,
  cargo: [
    {
      id: 'p',
      name: 'P',
      length: 1200,
      width: 400,
      height: 1000,
      quantity: 5,
      rotation: 'none',
      stacking: { stackable: false },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const at = (x: number, y: number): Layout['placements'][number] => ({
  cargoTypeId: 'p',
  x,
  y,
  z: 0,
  orientation: 'lwh',
  tier: 1,
  state: 'entschachtelt',
});
const depthLayout: Layout = {
  placements: [at(0, 0), at(600, 500), at(1300, 1000), at(1300, 1500), at(1300, 2000)],
  unplaced: [],
  metrics: { totalPlaced: 5, usedFloorPositions: 5, floorFillPercent: 0, volumeFillPercent: 0 },
  contractVersion: '0.12.0',
};

describe('side view paint order', () => {
  it('draws far rows before near ones — depth is a count, not an order', () => {
    const { container } = render(
      <LocaleProvider>
        <CrossSection load={depthLoad} layout={depthLayout} view="side" label="Seitenansicht" />
      </LocaleProvider>,
    );
    const svg = container.querySelector('svg[data-cutaway="side"]')!;
    // первый <rect> каждой группы несёт её x — по нему и опознаём стопку
    const xs = [...svg.querySelectorAll('g > rect:first-child')].map((r) =>
      Number(r.getAttribute('x')),
    );
    expect(xs).toEqual([0, 600, 1300, 1300, 1300]); // по возрастанию rowY
  });
});

describe('side view dimming (D2)', () => {
  it('dims a rear stack by its fill, keeping the outline at full strength', () => {
    const { container } = render(
      <LocaleProvider>
        <CrossSection load={depthLoad} layout={depthLayout} view="side" label="Seitenansicht" />
      </LocaleProvider>,
    );
    const svg = container.querySelector('svg[data-cutaway="side"]')!;
    // дальняя стопка (x=0) идёт первой после сортировки по rowY
    const rear = svg.querySelectorAll('g')[0];
    // группа больше не гасится целиком — иначе контур гаснет вместе с заливкой
    expect(rear.getAttribute('opacity')).toBeNull();
    const fill = rear.querySelector('rect:first-child')!;
    const outline = [...rear.querySelectorAll('rect')].at(-1)!;
    expect(Number(fill.getAttribute('fill-opacity'))).toBeLessThan(0.16);
    expect(outline.getAttribute('stroke-opacity')).toBeNull(); // контур в полную силу
  });
});

// Отрисовка призрака по готовому решению движка. Сам жест (pointer → resolveDrop → призрак →
// постановка) для этого набора кейсов покрыт статичным `preview`, без pointer-событий; полный жест
// целиком (включая getScreenCTM/createSVGPoint, которых jsdom не даёт) проверяется ниже, в
// «group selection», через стаб `svgTestGeometry.ts`.
describe('drop preview', () => {
  const renderPreview = (preview: Parameters<typeof CrossSection>[0]['preview']) =>
    render(
      <LocaleProvider initial="de">
        <CrossSection load={load} layout={layout} view="top" label="Draufsicht" preview={preview} />
      </LocaleProvider>,
    );

  it('shows a green ghost where the stack would actually land', () => {
    const { container } = renderPreview({ x: 1000, y: 0, dx: 1000, dy: 1000, ok: true, blocking: [] });
    const ghost = container.querySelector('[data-testid="drop-preview"]')!;
    expect(ghost).toHaveAttribute('stroke', 'var(--brand)');
    expect(ghost).toHaveAttribute('x', '1000');
  });

  it('shows a red ghost and outlines exactly what is in the way', () => {
    const { container } = renderPreview({
      x: 0,
      y: 0,
      dx: 1000,
      dy: 1000,
      ok: false,
      blocking: [{ cargoTypeId: 'c1', x: 0, y: 0 }],
    });
    expect(container.querySelector('[data-testid="drop-preview"]')).toHaveAttribute(
      'stroke',
      'var(--danger)',
    );
    const blocked = container.querySelectorAll('[data-testid="drop-blocker"]');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toHaveAttribute('x', '0');
  });

  it('draws no ghost when nothing is being dragged', () => {
    const { container } = renderPreview(null);
    expect(container.querySelector('[data-testid="drop-preview"]')).toBeNull();
  });
});

// Group selection (LKWkalk-dwc.6). These ARE pointer-gesture tests: the geometry jsdom is missing
// (createSVGPoint, getScreenCTM, a non-zero bounding rect) is supplied as the identity transform, so
// one client pixel is one millimetre of hold and the component's own arithmetic still runs.
describe('group selection', () => {
  let restoreSvgGeometry: (() => void) | null = null;
  afterEach(() => {
    restoreSvgGeometry?.();
    restoreSvgGeometry = null;
  });

  /** 4×2 m hold, 1×1 m cubes. */
  const groupLoad: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [
      {
        id: 'c',
        name: 'Cube',
        length: 1000,
        width: 1000,
        height: 1000,
        quantity: 3,
        rotation: 'yawOnly',
        stacking: { stackable: false },
        nesting: { nestable: false },
        state: 'entschachtelt',
      },
    ],
  };
  /** A row of three along the front wall, spelled out so every coordinate below is unambiguous —
   *  the packer's own answer for this load is an L (0,0 / 0,1000 / 1000,0), which would leave the
   *  row's escape route occupied and make "move the block one metre down" a different question. */
  const cubeAt = (x: number, y: number): Layout['placements'][number] => ({
    cargoTypeId: 'c',
    x,
    y,
    z: 0,
    orientation: 'lwh',
    tier: 1,
    state: 'entschachtelt',
  });
  const groupLayout: Layout = {
    placements: [cubeAt(0, 0), cubeAt(1000, 0), cubeAt(2000, 0)],
    unplaced: [],
    metrics: { totalPlaced: 3, usedFloorPositions: 3, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.14.0',
  };

  /** A CrossSection whose parent really applies the group move — the selection can only survive a
   *  move if the layout it points into moves with it. */
  function MovableGroup() {
    const [lay, setLay] = useState(groupLayout);
    return (
      <CrossSection
        load={groupLoad}
        layout={lay}
        view="top"
        label="Draufsicht"
        onMoveStack={vi.fn()}
        onRotateStack={vi.fn()}
        onMoveStacks={(refs, dx, dy) => setLay((cur) => moveStacks(groupLoad, cur, refs, dx, dy).layout)}
      />
    );
  }

  const renderTop = (
    props: Partial<Parameters<typeof CrossSection>[0]> = {},
    rect?: { left: number; top: number; width: number; height: number },
  ) => {
    restoreSvgGeometry = installSvgGeometry(rect);
    const utils = render(
      <LocaleProvider initial="de">
        <CrossSection
          load={groupLoad}
          layout={groupLayout}
          view="top"
          label="Draufsicht"
          onMoveStack={vi.fn()}
          onRotateStack={vi.fn()}
          {...props}
        />
      </LocaleProvider>,
    );
    // The nested cargo svg holds the pointer handlers now; events fired on the outer chrome svg
    // would not reach them (they bubble up, not down). Target the nested one.
    const svg = utils.container.querySelector('svg[data-cutaway="top"] svg')!;
    return { ...utils, svg };
  };

  /** Drag on the empty floor from (x0,y0) to (x1,y1), in mm. */
  const rubberBand = (svg: Element, x0: number, y0: number, x1: number, y1: number) => {
    fireEvent.pointerDown(svg, { clientX: x0, clientY: y0 });
    fireEvent.pointerMove(svg, { clientX: x1, clientY: y1 });
    fireEvent.pointerUp(svg, { clientX: x1, clientY: y1 });
  };

  const stackEl = (container: HTMLElement, x: number, y: number) =>
    container.querySelector(`[data-stack-ref="c@${x},${y}"]`)!;

  /** Grab the stack at (0,0) by its middle and drag it to (toX, toY) client px. */
  const dragFirstStack = (svg: Element, container: HTMLElement, toX: number, toY: number) => {
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: toX, clientY: toY });
    fireEvent.pointerUp(svg, { clientX: toX, clientY: toY });
  };

  it('draws no group chrome before anything is selected', () => {
    const { queryByTestId } = renderTop();
    expect(queryByTestId('group-frame')).toBeNull();
    expect(queryByTestId('marquee')).toBeNull();
  });

  it('shows the rubber band while it is being drawn', () => {
    const { svg, queryByTestId } = renderTop();
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
    const band = queryByTestId('marquee')!;
    expect(band).toHaveAttribute('width', '1500');
    expect(band).toHaveAttribute('height', '500');
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });
    expect(queryByTestId('marquee')).toBeNull(); // gone on release
  });

  // Regression (86v): the nested cargo svg carries the handlers but paints nothing, so `visiblePainted`
  // makes it a non-target on empty floor — the browser delivers the press to the painted hold background
  // instead. jsdom hit-tests nothing, so every OTHER band test fires straight on the svg and never sees
  // this. Here we fire on the background the browser actually hits: the band must still start.
  it('starts a marquee from a press on the hold background (the real hit target), not only the svg', () => {
    const { container, queryByTestId } = renderTop();
    const bg = container.querySelector('[data-hold-bg]') as SVGRectElement | null;
    expect(bg).not.toBeNull(); // there must be a painted floor to catch empty-floor presses
    fireEvent.pointerDown(bg!, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(bg!, { clientX: 1500, clientY: 500 });
    expect(queryByTestId('marquee')).not.toBeNull();
  });

  it('rubber-bands the stacks it touches and reports the count', () => {
    const { svg, getByTestId } = renderTop();
    // A band over x 0..1500, y 0..500 clips the stacks at x=0 and x=1000, but not the one at 2000.
    rubberBand(svg, 0, 0, 1500, 500);

    expect(getByTestId('group-frame')).toBeInTheDocument();
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
    // the frame spans exactly the two it caught, not the third
    expect(getByTestId('group-frame')).toHaveAttribute('width', '2000');
  });

  it('a click on empty floor clears the selection', () => {
    const { svg, queryByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByTestId('group-frame')).not.toBeNull();

    fireEvent.pointerDown(svg, { clientX: 3500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 3500, clientY: 1500 });

    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('shift-click drops one stack out of the selection without touching the rest', () => {
    const { svg, container, getByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');

    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500, shiftKey: true });

    // one left — below 2, so the group frame goes away entirely, and the survivor is the OTHER one
    expect(container.querySelector('[data-testid="group-count"]')).toBeNull();
    expect(stackEl(container, 1000, 0).querySelector('[stroke-dasharray="6 4"]')).not.toBeNull();
    expect(stackEl(container, 0, 0).querySelector('[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('ctrl-click drops one stack out of the selection, same as shift-click', () => {
    const { svg, container, getByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');

    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500, ctrlKey: true });

    expect(container.querySelector('[data-testid="group-count"]')).toBeNull();
    expect(stackEl(container, 1000, 0).querySelector('[stroke-dasharray="6 4"]')).not.toBeNull();
    expect(stackEl(container, 0, 0).querySelector('[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('meta-click adds a stack to the selection, same as shift-click', () => {
    const onMoveStack = vi.fn();
    const { svg, container, getByTestId } = renderTop({ onMoveStack });
    rubberBand(svg, 0, 0, 1500, 500);

    fireEvent.pointerDown(stackEl(container, 2000, 0), { clientX: 2500, clientY: 500, metaKey: true });
    expect(getByTestId('group-count')).toHaveTextContent('3 Stapel ausgewählt');

    // no drag was armed by that press: a move + release afterwards moves nothing
    fireEvent.pointerMove(svg, { clientX: 2500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 2500, clientY: 1500 });
    expect(onMoveStack).not.toHaveBeenCalled();
  });

  it('shift-click adds a stack to the selection and starts no drag', () => {
    const onMoveStack = vi.fn();
    const { svg, container, getByTestId } = renderTop({ onMoveStack });
    rubberBand(svg, 0, 0, 1500, 500);

    fireEvent.pointerDown(stackEl(container, 2000, 0), { clientX: 2500, clientY: 500, shiftKey: true });
    expect(getByTestId('group-count')).toHaveTextContent('3 Stapel ausgewählt');

    // no drag was armed by that press: a move + release afterwards moves nothing
    fireEvent.pointerMove(svg, { clientX: 2500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 2500, clientY: 1500 });
    expect(onMoveStack).not.toHaveBeenCalled();
  });

  it('dragging a selected stack moves the WHOLE group by one delta', () => {
    const onMoveStacks = vi.fn();
    const { svg, container } = renderTop({ onMoveStacks });
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 1500); // down a full cell

    expect(onMoveStacks).toHaveBeenCalledTimes(1);
    const [refs, dx, dy] = onMoveStacks.mock.calls[0];
    expect(refs).toHaveLength(2);
    expect(dx).toBe(0);
    expect(dy).toBe(1000);
  });

  it('applies exactly the delta the ghost promised', () => {
    const onMoveStacks = vi.fn();
    const { svg, container, getByTestId } = renderTop({ onMoveStacks });
    rubberBand(svg, 0, 0, 1500, 500);

    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 1500 });
    // the ghost is the group's bbox at the resolved delta
    const ghost = getByTestId('drop-preview');
    expect(ghost).toHaveAttribute('y', '1000');
    expect(ghost).toHaveAttribute('width', '2000');
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 1500 });

    const [, dx, dy] = onMoveStacks.mock.calls[0];
    expect({ dx, dy }).toEqual({ dx: 0, dy: 1000 });
  });

  it('shows a red ghost and names what blocks a group move', () => {
    const { svg, container, getByTestId } = renderTop({ onMoveStacks: vi.fn() });
    rubberBand(svg, 0, 0, 1500, 500);

    // one metre to the right walks the block's leading member onto the stack at x=2000
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });

    expect(getByTestId('drop-preview')).toHaveAttribute('stroke', 'var(--danger)');
    const blockers = container.querySelectorAll('[data-testid="drop-blocker"]');
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toHaveAttribute('x', '2000');
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });
  });

  it('keeps the selection where it is when the engine refuses the nudge', () => {
    const { svg, container, getByTestId } = renderTop({ onMoveStacks: vi.fn() });
    rubberBand(svg, 0, 0, 1500, 500);
    // far past the 2000 mm-wide hold — out of the magnet's reach, so the group does not move
    dragFirstStack(svg, container, 500, 4000);

    // still selected, and still where it was: a refused nudge must not lose the user's block
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
    expect(getByTestId('group-frame')).toHaveAttribute('y', '0');
  });

  it('keeps the group selected after a move, so it can be nudged again', () => {
    restoreSvgGeometry = installSvgGeometry();
    const { container } = render(
      <LocaleProvider initial="de">
        <MovableGroup />
      </LocaleProvider>,
    );
    const svg = container.querySelector('svg[data-cutaway="top"] svg')!; // nested cargo svg holds the handlers
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 1500); // one metre down…
    expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
    // …and the block, still selected, is nudged again from its NEW position
    fireEvent.pointerDown(stackEl(container, 0, 1000), { clientX: 500, clientY: 1500 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 1500 });

    // moved right by one cell: the block now sits at 1000/2000, and nothing is left at x=0
    expect(container.querySelector('[data-stack-ref="c@2000,1000"]')).not.toBeNull();
    expect(container.querySelector('[data-stack-ref="c@0,1000"]')).toBeNull();
    expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
  });

  it('hands the whole group to onDropOutside when released off the cutaway', () => {
    const onDropOutside = vi.fn();
    const onMoveStacks = vi.fn();
    const { svg, container } = renderTop({ onDropOutside, onMoveStacks });
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 2600); // below the svg's 2000-tall box

    expect(onDropOutside).toHaveBeenCalledTimes(1);
    expect(onDropOutside.mock.calls[0][0]).toHaveLength(2);
    expect(onMoveStacks).not.toHaveBeenCalled(); // the hold no longer owns them
  });

  it('a plain press on a stack outside the selection replaces it and drags that one alone', () => {
    const onMoveStack = vi.fn();
    const onMoveStacks = vi.fn();
    const { svg, container } = renderTop({ onMoveStack, onMoveStacks });
    rubberBand(svg, 0, 0, 1500, 500);

    fireEvent.pointerDown(stackEl(container, 2000, 0), { clientX: 2500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 2500, clientY: 1500 });
    fireEvent.pointerUp(svg, { clientX: 2500, clientY: 1500 });

    expect(onMoveStacks).not.toHaveBeenCalled();
    expect(onMoveStack).toHaveBeenCalledTimes(1);
    expect(onMoveStack.mock.calls[0][0]).toMatchObject({ cargoTypeId: 'c', x: 2000, y: 0 });
  });

  it('clicking the sole selected stack deselects it (the wasSole path)', () => {
    const { svg, container, queryByTestId } = renderTop();
    // First click selects the stack alone — it is now the entire selection.
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500 });
    expect(stackEl(container, 0, 0).querySelector('[stroke-dasharray="6 4"]')).not.toBeNull();

    // A second click on that same, still-sole selection is a toggle-off, not a re-select.
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500 });

    expect(stackEl(container, 0, 0).querySelector('[stroke-dasharray="6 4"]')).toBeNull();
    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('clicking one member of a multi-stack selection keeps THAT stack, not refs[0] (the pressed path)', () => {
    const { svg, container } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500); // selects (0,0) and (1000,0); refs[0] is (0,0)

    // Press the member that is NOT first in the selection, and release without dragging — a click.
    fireEvent.pointerDown(stackEl(container, 1000, 0), { clientX: 1500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });

    // down to one — the frame goes away — and the survivor is the PRESSED stack, not refs[0]
    expect(container.querySelector('[data-testid="group-count"]')).toBeNull();
    expect(stackEl(container, 1000, 0).querySelector('[stroke-dasharray="6 4"]')).not.toBeNull();
    expect(stackEl(container, 0, 0).querySelector('[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('leaves a real layout untouched when the engine refuses a group drag', () => {
    restoreSvgGeometry = installSvgGeometry();
    const { container } = render(
      <LocaleProvider initial="de">
        <MovableGroup />
      </LocaleProvider>,
    );
    const svg = container.querySelector('svg[data-cutaway="top"] svg')!; // nested cargo svg holds the handlers
    rubberBand(svg, 0, 0, 1500, 500);

    // far past the 2000 mm-wide hold — out of the magnet's reach, so the refusal must be a no-op
    dragFirstStack(svg, container, 500, 4000);

    // the placements never moved — a real moveStacks() ran and rejected the delta
    expect(container.querySelector('[data-stack-ref="c@0,0"]')).not.toBeNull();
    expect(container.querySelector('[data-stack-ref="c@1000,0"]')).not.toBeNull();
    // and the selection survives the refusal
    expect(screen.getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
  });

  it('clears the selection after a single-stack move, unlike a group move which keeps it', () => {
    const onMoveStack = vi.fn();
    const { svg, container } = renderTop({ onMoveStack });
    // A lone drag with no prior selection: onMoveStack must fire and the selection then be empty.
    dragFirstStack(svg, container, 500, 1500); // down one cell — an empty spot

    expect(onMoveStack).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="group-frame"]')).toBeNull();
    expect(container.querySelector('[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('drags a single, non-grouped stack off the cutaway as an array of exactly one ref', () => {
    const onDropOutside = vi.fn();
    const { svg, container } = renderTop({ onDropOutside });
    // No prior selection — this is a lone drag, not a group drag.
    dragFirstStack(svg, container, 500, 2600); // below the svg's 2000-tall box

    expect(onDropOutside).toHaveBeenCalledTimes(1);
    const [refs] = onDropOutside.mock.calls[0];
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ cargoTypeId: 'c', x: 0, y: 0 });
  });

  it('a plain press outside the selection removes the old group frame, not just the callbacks', () => {
    const { svg, container } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(container.querySelector('[data-testid="group-frame"]')).not.toBeNull();

    fireEvent.pointerDown(stackEl(container, 2000, 0), { clientX: 2500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 2500, clientY: 500 }); // a click, no drag

    expect(container.querySelector('[data-testid="group-frame"]')).toBeNull();
    expect(stackEl(container, 2000, 0).querySelector('[stroke-dasharray="6 4"]')).not.toBeNull();
  });

  it('offers the rotate handle for a single stack only', () => {
    const { svg, container, queryByLabelText } = renderTop();
    // single click selects one stack → handle present
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500 });
    expect(queryByLabelText('Stapel drehen')).not.toBeNull();

    // a two-stack group → no handle: rotating a group is a different operation
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByLabelText('Stapel drehen')).toBeNull();
  });

  it('Escape clears the selection', () => {
    const { svg, queryByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByTestId('group-frame')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('a few mm of jitter next to a stack clears the selection instead of catching it', () => {
    const { svg, container, queryByTestId } = renderTop();
    rubberBand(svg, 0, 0, 1500, 500);
    expect(queryByTestId('group-count')).not.toBeNull();

    // Press on bare floor 5 mm below the row, then jitter 10 mm back across its edge — well under
    // CLICK_SLOP_MM, so the gesture table says this is a click on empty floor, not a band.
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 1005 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 995 });
    expect(queryByTestId('marquee')).toBeNull(); // below the slop nothing is drawn…
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 995 });

    // …and nothing is caught: the selection is cleared, not replaced by the stack the jitter grazed.
    expect(queryByTestId('group-frame')).toBeNull();
    expect(container.querySelector('[stroke-dasharray="6 4"]')).toBeNull();
  });

  it('abandons a carried stack on pointercancel instead of leaving it translated forever', () => {
    const onMoveStack = vi.fn();
    const { svg, container, queryByTestId } = renderTop({ onMoveStack });
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 1500 });
    expect(queryByTestId('drop-preview')).not.toBeNull();

    fireEvent.pointerCancel(svg, { clientX: 500, clientY: 1500 });

    expect(queryByTestId('drop-preview')).toBeNull();
    expect(stackEl(container, 0, 0).getAttribute('transform')).toBeNull(); // back where it stands
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 1500 });
    expect(onMoveStack).not.toHaveBeenCalled(); // a cancelled gesture applies nothing
  });

  it('abandons a half-drawn band on pointercancel, selecting nothing', () => {
    const { svg, queryByTestId } = renderTop();
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
    expect(queryByTestId('marquee')).not.toBeNull();

    fireEvent.pointerCancel(svg, { clientX: 1500, clientY: 500 });

    expect(queryByTestId('marquee')).toBeNull();
    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('a second pointer on bare floor ends the stack drag rather than running both gestures', () => {
    const onMoveStack = vi.fn();
    const { svg, container } = renderTop({ onMoveStack });
    fireEvent.pointerDown(stackEl(container, 0, 0), { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 1500 });

    // second finger down on empty floor while the first still carries a stack
    fireEvent.pointerDown(svg, { clientX: 3500, clientY: 1500 });
    fireEvent.pointerMove(svg, { clientX: 3900, clientY: 1900 });
    fireEvent.pointerUp(svg, { clientX: 3900, clientY: 1900 });

    // the carried stack was let go, not left hovering at the old delta
    expect(stackEl(container, 0, 0).getAttribute('transform')).toBeNull();
    expect(onMoveStack).not.toHaveBeenCalled();
  });

  it('keeps the selection when a release outside the hold is not taken by the parent', () => {
    const onDropOutside = vi.fn(() => false); // the parent looked, and the release was a miss
    const { svg, container, getByTestId } = renderTop({ onDropOutside, onMoveStacks: vi.fn() });
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 2600); // below the svg's box, but over nothing that takes cargo

    expect(onDropOutside).toHaveBeenCalledTimes(1);
    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
    expect(getByTestId('group-frame')).toHaveAttribute('y', '0'); // still on the floor, still there
  });

  it('clears the selection when the parent really took the stacks off the floor', () => {
    const onDropOutside = vi.fn(() => true);
    const { svg, container, queryByTestId } = renderTop({ onDropOutside, onMoveStacks: vi.fn() });
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 2600);

    expect(queryByTestId('group-frame')).toBeNull();
  });

  // Regression: "outside the hold" must be read from the hold's own viewBox box (via getScreenCTM),
  // NOT its getBoundingClientRect — which, under overflow:visible, grows to wrap the dragged ghost.
  // Here the bounding box reaches y=3000 (the inflated ghost box) while the hold really ends at
  // spanY=2000; a release at y=2600 is over the buffer and MUST be handed over. With the old box it
  // read as still inside the hold and every drag-out to the warehouse snapped back.
  it('hands a stack to the buffer by the hold CTM box, not its ghost-inflated bounding box', () => {
    const onDropOutside = vi.fn(() => true);
    const { svg, container, queryByTestId } = renderTop(
      { onDropOutside, onMoveStacks: vi.fn() },
      { left: 0, top: 0, width: 4000, height: 3000 }, // bounding box taller than the real hold (spanY=2000)
    );
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 2600); // below the hold (2000) but inside the inflated box (3000)

    expect(onDropOutside).toHaveBeenCalledTimes(1);
    expect(queryByTestId('group-frame')).toBeNull();
  });

  it('leaves the selection where it is when no group handler exists to move it', () => {
    // A consumer that supplies onMoveStack but never opted into group moves: nothing is applied, so
    // the selection must not be shifted to coordinates where no stack stands.
    const { svg, container, getByTestId } = renderTop(); // no onMoveStacks
    rubberBand(svg, 0, 0, 1500, 500);

    dragFirstStack(svg, container, 500, 1500); // a legal metre down — but nothing carries it out

    expect(getByTestId('group-count')).toHaveTextContent('2 Stapel ausgewählt');
    expect(getByTestId('group-frame')).toHaveAttribute('y', '0');
  });

  it('keeps every selection affordance off the printed sheet', () => {
    const { svg, getByTestId, queryByTestId } = renderTop();
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: 1500, clientY: 500 });
    expect(queryByTestId('marquee')).toHaveClass('print:hidden');
    fireEvent.pointerUp(svg, { clientX: 1500, clientY: 500 });

    expect(getByTestId('group-frame').closest('g')).toHaveClass('print:hidden');
  });
});

// The nested-svg wrap (Task 5): chrome lives in the OUTER svg's gutters; the cargo keeps its own 1:1
// viewport, unshifted, so no cargo coordinate moves. These pin that invariant directly.
describe('nested cargo viewport (1:1 preserved)', () => {
  it('cargo viewport stays exactly 1:1 (length × spanY) after the nested-svg wrap', () => {
    const { container } = renderCut('side', 'Seitenansicht');
    const outer = container.querySelector('svg[data-cutaway="side"]')!;
    const nested = outer.querySelector('svg')!; // the cargo viewport
    expect(nested.getAttribute('viewBox')).toBe(`0 0 ${V.length} ${V.height}`);
    // hold outline rect unchanged: 0,0,length,height in the nested coordinate space
    const frame = [...nested.querySelectorAll('rect')].find(
      (r) =>
        r.getAttribute('width') === String(V.length) && r.getAttribute('height') === String(V.height),
    );
    expect(frame).toBeTruthy();
  });

  it('top cargo viewport is length × width', () => {
    const { container } = renderCut('top', 'Draufsicht');
    const nested = container.querySelector('svg[data-cutaway="top"] svg')!;
    expect(nested.getAttribute('viewBox')).toBe(`0 0 ${V.length} ${V.width}`);
  });
});

// Truck chrome composed into the outer svg's gutters (Task 6): cab + wheels + ruler on the side view,
// the light polygon hint on the top view — never the cargo viewport itself.
describe('truck chrome composition', () => {
  it('side view renders the tractor cap + wheels + ruler chrome, non-interactive', () => {
    const { container } = renderCut('side', 'Seitenansicht');
    const outer = container.querySelector('svg[data-cutaway="side"]')!;
    // ruler tick labels present (interior metres of a 2000mm hold → "1")
    const texts = [...outer.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('1');
    // the front tractor cap is re-hosted as a nested svg with the asset viewBox, and is decoration
    const cap = outer.querySelector('svg[viewBox="53 520 372 400"]');
    expect(cap).toBeTruthy();
    expect(cap!.getAttribute('pointer-events')).toBe('none');
    // wheels are half-circle paths (cap steer/drive + rear bogie)
    expect(outer.querySelectorAll('path').length).toBeGreaterThanOrEqual(4);
  });

  it('top view renders the top-view cab, not the side tractor cap', () => {
    const { container } = renderCut('top', 'Draufsicht');
    const outer = container.querySelector('svg[data-cutaway="top"]')!;
    // the top-view cab-top asset is present…
    expect(outer.querySelector('svg[viewBox="50 55 215 370"]')).toBeTruthy();
    // …and the side-view tractor cap is not
    expect(outer.querySelector('svg[viewBox="53 520 372 400"]')).toBeNull();
  });
});
