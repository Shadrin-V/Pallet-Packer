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
});
