import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArmedDelete } from './ArmedDelete';

const props = { label: 'Entfernen', confirmLabel: 'Löschen bestätigen' };

describe('ArmedDelete', () => {
  it('shows the trash affordance when not armed and never deletes on its own', () => {
    const onConfirm = vi.fn();
    render(<ArmedDelete armed={false} onArm={vi.fn()} onConfirm={onConfirm} {...props} />);

    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('arms rather than deletes on the first press', async () => {
    const onArm = vi.fn();
    const onConfirm = vi.fn();
    render(<ArmedDelete armed={false} onArm={onArm} onConfirm={onConfirm} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));

    expect(onArm).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('deletes on the press that follows arming', async () => {
    const onConfirm = vi.fn();
    render(<ArmedDelete armed onArm={vi.fn()} onConfirm={onConfirm} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('marks its wrapper with data-armed-delete so a parent disarm-on-any-click listener can exempt the arming click — arming does not disarm itself', async () => {
    // Mirrors the real caller (SetupScreen): a document click listener that disarms on any click
    // EXCEPT one that lands inside [data-armed-delete]. The arming click must not trip it, or the
    // very click that arms the control would immediately disarm it again in the same gesture.
    const disarm = vi.fn();
    const onDocClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('[data-armed-delete]')) return;
      disarm();
    };
    document.addEventListener('click', onDocClick);
    try {
      render(<ArmedDelete armed={false} onArm={vi.fn()} onConfirm={vi.fn()} {...props} />);

      await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));

      expect(disarm).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', onDocClick);
    }
  });

  it('moves keyboard focus to the confirm button once arming makes it appear', () => {
    const { rerender } = render(
      <ArmedDelete armed={false} onArm={vi.fn()} onConfirm={vi.fn()} {...props} />,
    );

    rerender(<ArmedDelete armed onArm={vi.fn()} onConfirm={vi.fn()} {...props} />);

    expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toHaveFocus();
  });
});
