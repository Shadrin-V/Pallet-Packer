import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { SetupScreen } from './SetupScreen';

function renderSetup(onCalculate: (l: Load) => void) {
  return render(
    <LocaleProvider initial="de">
      <SetupScreen onCalculate={onCalculate} />
    </LocaleProvider>,
  );
}

describe('SetupScreen', () => {
  it('renders the localized title and a default vehicle + order', () => {
    renderSetup(() => {});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ladungsplaner');
    // default preset vehicle dimensions present (LKW Standard; vehicle "Länge" is the first field)
    expect((screen.getAllByLabelText('Länge')[0] as HTMLInputElement).value).toBe('13600');
    // one order id seeded
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
  });

  it('builds a Load with the order zone and calls onCalculate', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    expect(onCalculate).toHaveBeenCalledTimes(1);
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.vehicle.name).toBe('LKW Standard');
    expect(load.cargo).toHaveLength(1);
    expect(load.cargo[0].orderId).toBe('SO-1');
    expect(load.cargo[0].state).toBe('entschachtelt');
  });

  it('Verschachtelt without a valid Δh disables Berechnen', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(screen.getByRole('button', { name: 'Berechnen' })).toBeDisabled();
  });

  it('Verschachtelt with a valid Δh emits nesting and enables Berechnen', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
    await userEvent.type(screen.getByLabelText('Höhenzuwachs je Palette (Δh)'), '22');
    const berechnen = screen.getByRole('button', { name: 'Berechnen' });
    expect(berechnen).toBeEnabled();
    await userEvent.click(berechnen);

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0].state).toBe('verschachtelt');
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'sequential' });
  });

  it('applies an EPAL pallet preset to the position dimensions', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.selectOptions(screen.getByLabelText('Ladungsart'), 'epal2');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0]).toMatchObject({ length: 1200, width: 1000, height: 162 });
  });

  it('adds a second order zone', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getByRole('button', { name: /Auftrag hinzufügen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls[0][0] as Load;
    const orderIds = [...new Set(load.cargo.map((c) => c.orderId))];
    expect(orderIds).toEqual(['SO-1', 'SO-2']);
  });
});
