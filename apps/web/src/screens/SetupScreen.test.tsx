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
    // default preset vehicle dimensions present (vehicle "Länge" is the first labelled field)
    expect((screen.getAllByLabelText('Länge')[0] as HTMLInputElement).value).toBe('13620');
    // one order id seeded
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
  });

  it('builds a Load with the order zone and calls onCalculate', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    expect(onCalculate).toHaveBeenCalledTimes(1);
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.vehicle.name).toBe('Sattelauflieger');
    expect(load.cargo).toHaveLength(1);
    expect(load.cargo[0].orderId).toBe('SO-1');
    expect(load.cargo[0].state).toBe('entschachtelt');
  });

  it('segmented Ent/Ver toggles the emitted cargo state', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // switch the single position to Verschachtelt
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0].state).toBe('verschachtelt');
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
