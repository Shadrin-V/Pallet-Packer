import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { CrossSection } from './CrossSection';

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

// Перетаскивание целиком в jsdom не проверить: getScreenCTM там не реализован, любое движение
// сворачивается в ноль. Здесь — отрисовка призрака по готовому решению движка; сам жест
// (pointer → resolveDrop → призрак → постановка) проверяется в реальном Chrome.
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
