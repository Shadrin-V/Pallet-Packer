import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { SetupScreen } from './SetupScreen';

function renderSetup(onCalculate: (l: Load) => void, onReset?: () => void) {
  return render(
    <LocaleProvider initial="de">
      <SetupScreen onCalculate={onCalculate} onReset={onReset} />
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
    // switching to Ver auto-expands the details panel (E9) — no separate details click needed
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.type(screen.getByLabelText('Höhenzuwachs je Palette (Δh)'), '22');
    const berechnen = screen.getByRole('button', { name: 'Berechnen' });
    expect(berechnen).toBeEnabled();
    await userEvent.click(berechnen);

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0].state).toBe('verschachtelt');
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });

  it('auto-expands details on Ver and defaults the nesting mode to pairwise (E5/E9)', async () => {
    renderSetup(() => {});
    // no details click: switching to Ver opens the panel by itself (E9)
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect((screen.getByLabelText('Verschachtelungsmodus') as HTMLSelectElement).value).toBe('pairwise');
    // pairwise step-height label is shown (Höhe der oberen Bretter), and the allow-unpaired toggle appears
    expect(screen.getByText('Höhe der oberen Bretter (h_d)')).toBeInTheDocument();
    expect(screen.getByText('Einzelne Palette oben zulassen')).toBeInTheDocument();
  });

  it('adding a position collapses the panel AND still triggers the button (T1)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Ver' })); // auto-opens details
    expect(screen.getByLabelText('Verschachtelungsmodus')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Ladungsart')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ }));

    // panel collapsed…
    expect(screen.queryByLabelText('Verschachtelungsmodus')).not.toBeInTheDocument();
    // …and the click-outside handler did not swallow the button: a position was actually added
    expect(screen.getAllByLabelText('Ladungsart')).toHaveLength(2);
  });

  it('reveals the Stapelbar hint tooltip on demand (E1)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // the info button carries the Stapelbar label; there are two such elements (field + info) → pick the button
    await userEvent.click(screen.getByRole('button', { name: 'Stapelbar' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Ebenen/);
  });

  it('applies an EPAL pallet preset to the position dimensions', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.selectOptions(screen.getByLabelText('Ladungsart'), 'epal2');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0]).toMatchObject({ length: 1200, width: 1000, height: 162 });
  });

  it('persists the setup across a remount (no reset on refresh, #4)', async () => {
    const { unmount } = renderSetup(() => {});
    const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderId);
    await userEvent.type(orderId, 'SO-99');
    unmount();
    renderSetup(() => {});
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-99');
  });

  it('Demo fills a multi-order plan and computes it immediately (T3)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));

    // form filled: 4 demo orders, several positions
    const orderIds = (screen.getAllByLabelText('Auftrags-ID') as HTMLInputElement[]).map((i) => i.value);
    expect(orderIds).toEqual(['SO-1001', 'SO-1002', 'SO-1003', 'SO-1004']);
    expect(screen.getAllByLabelText('Ladungsart').length).toBeGreaterThan(4);

    // and computed straight away, exercising the whole feature set
    expect(onCalculate).toHaveBeenCalledTimes(1);
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.vehicle.name).toBe('LKW Standard');
    expect(new Set(load.cargo.map((c) => c.orderId)).size).toBe(4);
    expect(load.cargo.some((c) => c.state === 'verschachtelt')).toBe(true);
    expect(load.cargo.some((c) => c.state === 'entschachtelt')).toBe(true);
    expect(load.cargo.some((c) => c.nesting.nestingMode === 'sequential')).toBe(true);
    expect(load.cargo.some((c) => c.nesting.nestingMode === 'pairwise')).toBe(true);
    expect(new Set(load.cargo.map((c) => c.rotation))).toEqual(new Set(['yawOnly', 'full', 'none']));
    expect(load.cargo.some((c) => c.stacking.maxTiers === 6)).toBe(true);
  });

  it('reset clears the setup back to defaults (#4)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onReset = vi.fn();
    renderSetup(() => {}, onReset);
    const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderId);
    await userEvent.type(orderId, 'SO-77');
    await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
    expect(onReset).toHaveBeenCalled();
  });

  it('adds a second order zone (add-order action is duplicated top + bottom, E10)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    const addButtons = screen.getAllByRole('button', { name: /Auftrag hinzufügen/ });
    expect(addButtons.length).toBe(2); // top bar + below the last order
    await userEvent.click(addButtons[1]); // the bottom duplicate
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls[0][0] as Load;
    const orderIds = [...new Set(load.cargo.map((c) => c.orderId))];
    expect(orderIds).toEqual(['SO-1', 'SO-2']);
  });
});
