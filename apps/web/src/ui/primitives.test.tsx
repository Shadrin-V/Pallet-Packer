import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoHint } from './primitives';

describe('InfoHint', () => {
  it('hides the hint text until the info button is activated', async () => {
    render(<InfoHint ariaLabel="Stapelbar Info" text="Maximale Ebenen im Stapel." />);
    // hidden initially
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Stapelbar Info' });
    await userEvent.click(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Maximale Ebenen im Stapel.');
    // toggles off
    await userEvent.click(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
