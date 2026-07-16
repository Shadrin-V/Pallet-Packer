import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, type Load } from '@shadrin-v/engine';
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

  it('labels the side view Vorne / Hinten', () => {
    renderCut('side', 'Seitenansicht');
    expect(screen.getByText('Vorne')).toBeInTheDocument();
    expect(screen.getByText('Hinten')).toBeInTheDocument();
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
});
