import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  // The live gap preview (B): while a stack is carried in from the hold, the parent hands down where
  // it would land as `phantomAt`, spliced into the same flow `warehouseFloor` lays real tiles out in
  // — so a tile already sitting at that index is pushed aside exactly the way a real drop would push
  // it, not just have something drawn on top of it.
  it('opens a dashed phantom slot at phantomAt.index and pushes the tile there aside', () => {
    const twoTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'fixed', units: 2, orientation: 'lwh' },
    ];
    const phantomTile: BufferTile = { cargoTypeId: 'fixed', units: 1, orientation: 'lwh' };
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={load}
          tiles={twoTiles}
          onRotate={vi.fn()}
          onPickUp={vi.fn()}
          dragging={null}
          phantomAt={{ index: 1, tile: phantomTile }}
        />
      </LocaleProvider>,
    );
    const phantom = screen.getByTestId('warehouse-phantom');
    expect(phantom.tagName.toLowerCase()).toBe('rect');
    expect(phantom).toHaveAttribute('fill', 'none');
    expect(phantom).not.toHaveAttribute('pointer-events', 'auto');

    // PAD=200, GAP=200: 'p' (1000×1200) still opens the row at x=200, same as with no phantom at all.
    // The phantom takes the very next slot — its own tile's 800×600 footprint (fixed, lwh) — at
    // x=1400. The real 'fixed' tile, pushed one slot right by the phantom ahead of it, lands at
    // x=2400 rather than the x=1400 it would hold with the phantom absent.
    const [pTile, fixedTile] = screen.getAllByTestId('warehouse-tile');
    expect(Number(pTile.querySelector('rect')!.getAttribute('x'))).toBe(200);
    expect(Number(phantom.getAttribute('x'))).toBe(1400);
    expect(Number(fixedTile.querySelector('rect')!.getAttribute('x'))).toBe(2400);
  });

  // dwc.11: the map index runs over floor.tiles, which INCLUDES the spliced phantom, but the parent's
  // onPickUp/onRotate index its `tiles` array WITHOUT the phantom. For any tile rendered after the
  // phantom the two diverge by one — so a pick-up/rotate reaches the wrong buffer stack. Reachable only
  // with a second pointer (multitouch) mid-carry, when phantomAt is live and a buffer tile is pressed.
  it('reports the phantom-free tile index to onPickUp, not the render index', () => {
    const twoTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'p', units: 5, orientation: 'lwh' },
    ];
    const onPickUp = vi.fn();
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={load}
          tiles={twoTiles}
          onRotate={vi.fn()}
          onPickUp={onPickUp}
          dragging={null}
          // Phantom spliced BEFORE both tiles: render order is [phantom, tileA, tileB], so tileB sits
          // at render index 2 but is tiles[1].
          phantomAt={{ index: 0, tile: { cargoTypeId: 'p', units: 1, orientation: 'lwh' } }}
        />
      </LocaleProvider>,
    );
    const secondTile = screen.getAllByTestId('warehouse-tile')[1];
    fireEvent.pointerDown(secondTile);
    expect(onPickUp).toHaveBeenCalledWith(1, expect.anything());
  });

  it('reports the phantom-free tile index to onRotate, not the render index', async () => {
    const twoTiles: BufferTile[] = [
      { cargoTypeId: 'p', units: 18, orientation: 'lwh' },
      { cargoTypeId: 'p', units: 5, orientation: 'lwh' },
    ];
    const onRotate = vi.fn();
    render(
      <LocaleProvider initial="de">
        <WarehouseFloor
          load={load}
          tiles={twoTiles}
          onRotate={onRotate}
          onPickUp={vi.fn()}
          dragging={null}
          phantomAt={{ index: 0, tile: { cargoTypeId: 'p', units: 1, orientation: 'lwh' } }}
        />
      </LocaleProvider>,
    );
    const secondTile = screen.getAllByTestId('warehouse-tile')[1];
    secondTile.focus();
    await userEvent.keyboard('{Enter}'); // select → reveals the rotate handle
    await userEvent.click(screen.getByRole('button', { name: 'Stapel im Lager drehen' }));
    expect(onRotate).toHaveBeenCalledWith(1);
  });
});
