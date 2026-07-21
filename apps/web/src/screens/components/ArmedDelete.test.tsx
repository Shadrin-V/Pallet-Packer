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

  it('keeps its own clicks from reaching the document, so arming does not immediately disarm', async () => {
    const onDocClick = vi.fn();
    document.addEventListener('click', onDocClick);
    try {
      render(<ArmedDelete armed={false} onArm={vi.fn()} onConfirm={vi.fn()} {...props} />);

      await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));

      expect(onDocClick).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', onDocClick);
    }
  });
});
