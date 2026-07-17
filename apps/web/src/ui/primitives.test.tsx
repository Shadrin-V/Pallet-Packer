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

  it('opens to the left when align="right" so an edge hint is not clipped (4bj.13/QA)', async () => {
    const { rerender } = render(<InfoHint ariaLabel="Info" text="hint" />);
    await userEvent.click(screen.getByRole('button', { name: 'Info' }));
    // default anchors the tooltip's left edge at the button (opens rightward)
    expect(screen.getByRole('tooltip').className).toContain('left-0');

    rerender(<InfoHint ariaLabel="Info" text="hint" align="right" />);
    // align="right" anchors the right edge so the box extends leftward, staying on-screen
    const tip = screen.getByRole('tooltip');
    expect(tip.className).toContain('right-0');
    expect(tip.className).not.toContain('left-0');
  });
});
