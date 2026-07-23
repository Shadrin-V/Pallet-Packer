import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { WarehouseFloor } from './WarehouseFloor';
import type { BufferTile } from './warehouseLayout';

const V = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
const load: Load = {
  vehicle: V,
  cargo: [
    {
      id: 'p',
      name: 'EPAL 3',
      length: 1000,
      width: 1200,
      height: 144,
      quantity: 40,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
    {
      id: 'fixed',
      name: 'Fix',
      length: 800,
      width: 600,
      height: 144,
      quantity: 2,
      rotation: 'none',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const tiles: BufferTile[] = [{ cargoTypeId: 'p', units: 18, orientation: 'lwh' }];

function renderFloor(t: BufferTile[] = tiles, onRotate = vi.fn()) {
  render(
    <LocaleProvider initial="de">
      <WarehouseFloor
        load={load}
        tiles={t}
        onRotate={onRotate}
        onPickUp={vi.fn()}
        dragging={null}
      />
    </LocaleProvider>,
  );
  return onRotate;
}

describe('WarehouseFloor', () => {
  // Если эти ширины разойдутся, масштаб разойдётся молча: оба svg рисуются width:100% в одной
  // колонке, поэтому равенство viewBox по ширине — и есть весь механизм 1:1.
  it('is exactly as wide as the hold — that IS the 1:1 scale', () => {
    renderFloor();
    const svg = document.querySelector('[data-testid="warehouse-floor"] svg')!;
    const [, , w] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(w).toBe(V.length);
  });

  it('draws each stack at its real footprint with the unit count', () => {
    renderFloor();
    expect(screen.getByText('×18')).toBeInTheDocument();
    const shape = document.querySelector('[data-testid="warehouse-tile"] rect')!;
    expect(Number(shape.getAttribute('width'))).toBe(1000);
    expect(Number(shape.getAttribute('height'))).toBe(1200);
  });

  it('names the cargo type in a title rather than on a card', () => {
    renderFloor();
    expect(document.querySelector('[data-testid="warehouse-tile"] title')!.textContent).toContain(
      'EPAL 3',
    );
  });

  it('is not a projection of the plan — the PNG export must not pick it up', () => {
    renderFloor();
    expect(document.querySelector('[data-testid="warehouse-floor"] svg[data-cutaway]')).toBeNull();
  });

  // Кнопка ⟳ ушла — поворот переехал на выделение. Если плитка не фокусируется, поворот с клавиатуры
  // пропал вместе с кнопкой.
  it('keeps rotation reachable from the keyboard after the ⟳ button is gone', async () => {
    const onRotate = renderFloor();
    const tile = screen.getByRole('button', { name: /EPAL 3/ });
    expect(tile).toHaveAttribute('tabindex', '0');

    tile.focus();
    await userEvent.keyboard('{Enter}');
    const handle = screen.getByRole('button', { name: 'Stapel im Lager drehen' });
    await userEvent.click(handle);
    expect(onRotate).toHaveBeenCalledWith(0);
  });

  it('offers no rotation for fixed-orientation cargo', async () => {
    renderFloor([{ cargoTypeId: 'fixed', units: 1, orientation: 'lwh' }]);
    const tile = screen.getByRole('button', { name: /Fix/ });
    tile.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Stapel im Lager drehen' })).not.toBeInTheDocument();
  });

  // Even empty, the floor must stay a drop target (8fy): otherwise the first stack pulled out of the
  // hold has nowhere to land — the buffer only ever grew from the packer, never from the user.
  it('still offers a drop zone when empty, so a stack can be pulled out of the hold', () => {
    renderFloor([]);
    expect(screen.getByText('Alles platziert — das Lager ist leer.')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="warehouse-floor"] svg')).not.toBeNull();
    expect(screen.getByTestId('warehouse-dropzone')).toBeInTheDocument();
    expect(screen.queryByTestId('warehouse-tile')).toBeNull();
  });
});
