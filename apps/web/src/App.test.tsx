import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateLayout, type Load } from '@shadrin-v/engine';
import { App } from './App';

describe('App shell (single page)', () => {
  it('renders the Setup title', () => {
    render(<App />);
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Ladungsplaner');
  });

  it('keeps Setup mounted and preserves input after Berechnen (no reset)', async () => {
    render(<App />);
    const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderId);
    await userEvent.type(orderId, 'SO-42');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    // Ladeplan result appears on the same page…
    expect(screen.getByRole('img', { name: 'Draufsicht' })).toBeInTheDocument();
    // …and the Setup input is still there with its value (SetupScreen was not remounted).
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-42');
  });

  it('defaults the loading-mode switch to combined and recomputes+persists on change', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    // Default strategy is combined → "Automatisch" is the pressed option.
    expect(screen.getByRole('button', { name: 'Automatisch' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));

    // The recomputed plan is persisted with the chosen loadingMode (layout is derived, not stored).
    const persisted = JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}');
    expect(persisted.loadingMode).toBe('rear');
    expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('order-grouping toggle defaults off (strict) and recomputes+persists densityFirst on change', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const toggle = screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false); // strict by default

    await userEvent.click(toggle);
    expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('densityFirst');

    await userEvent.click(toggle);
    expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('strict');
  });

  it('clicking the order-grouping info hint does not toggle the strategy', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    // The hint's "i" button shares the aria-label but is a button, not the checkbox.
    await userEvent.click(screen.getByRole('button', { name: 'Dichte vor Auftragstrennung' }));
    expect((screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(false);
  });

  describe('strategy is preserved across a Setup recompute (4bj.12)', () => {
    it('keeps the chosen loadingMode when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
      await userEvent.click(screen.getByRole('button', { name: 'Von hinten' })); // pick rear

      // Edit the setup and recompute — the strategy must survive.
      const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
      await userEvent.clear(orderId);
      await userEvent.type(orderId, 'SO-7');
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').loadingMode).toBe('rear');
      expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the chosen orderGrouping when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })); // densityFirst

      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('densityFirst');
      expect((screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(true);
    });

    it('Demo pins the rear strategy explicitly to showcase fork access (4bj.13)', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
      // combined is the current default; Demo overrides it to rear (not inherited from prior state).
      expect(screen.getByRole('button', { name: 'Automatisch' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(screen.getByRole('button', { name: 'Demo' }));

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').loadingMode).toBe('rear');
      expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('Demo actually places the two-sided position so fork access is visible (4bj.13)', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
      await userEvent.click(screen.getByRole('button', { name: 'Demo' }));

      // The showcase is pointless if the two-sided position never lands (it sits in an over-filled
      // demo). Rebuild the layout from the real persisted Load and assert it has placements.
      const load = JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}') as Load;
      const twoSided = load.cargo.find((c) => c.forkAccess === 'twoSides');
      expect(twoSided).toBeDefined();
      const layout = calculateLayout(load);
      const placed = layout.placements.filter((p) => p.cargoTypeId === twoSided!.id).length;
      expect(placed).toBeGreaterThan(0);
    });

    it('Reset clears the strategy so the next plan is fresh combined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
      await userEvent.click(screen.getByRole('button', { name: 'Von hinten' })); // rear

      await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').loadingMode ?? 'combined').toBe('combined');
      expect(screen.getByRole('button', { name: 'Automatisch' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
