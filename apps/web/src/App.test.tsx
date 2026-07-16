import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
});
