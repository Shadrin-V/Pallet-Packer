import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, InfoHint } from './primitives';

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

describe('Button', () => {
  // Общий примитив: без новых пропов разметка ровно прежняя — ни атрибута, ни класса сверх старых.
  it('без aria-пропов рендерится как раньше', () => {
    const { container } = render(<Button variant="primary" onClick={() => {}}>Berechnen</Button>);
    expect(container.innerHTML).toBe(
      '<button type="button" class="rounded-ctl px-3.5 py-2 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50 disabled:cursor-not-allowed bg-brand text-brand-ink hover:bg-brand-strong">Berechnen</button>',
    );
  });

  it('ariaDisabled: остаётся фокусируемой и нажимаемой, несёт aria-disabled и описание причины', async () => {
    let clicks = 0;
    render(
      <>
        <Button variant="primary" ariaDisabled ariaDescribedBy="why" onClick={() => { clicks += 1; }}>Berechnen</Button>
        <p id="why">Noch nicht berechenbar</p>
      </>,
    );
    const btn = screen.getByRole('button', { name: 'Berechnen' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('aria-describedby', 'why');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAccessibleDescription('Noch nicht berechenbar');
    btn.focus();
    expect(btn).toHaveFocus();
    await userEvent.click(btn);
    expect(clicks).toBe(1); // решает обработчик экрана, примитив нажатие не глотает
  });

  it('без aria-пропов secondary тоже рендерится как раньше — без aria-busy', () => {
    const { container } = render(<Button variant="secondary" type="submit">Reise laden</Button>);
    expect(container.innerHTML).toBe(
      '<button type="submit" class="rounded-ctl px-3.5 py-2 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50 disabled:cursor-not-allowed border border-line-strong bg-card text-ink hover:border-brand hover:text-brand">Reise laden</button>',
    );
  });

  it('ariaBusy: несёт aria-busy; ariaBusy={false} атрибута не добавляет', () => {
    const { rerender } = render(<Button variant="secondary" ariaDisabled ariaBusy>Reise laden</Button>);
    const btn = screen.getByRole('button', { name: 'Reise laden' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
    rerender(<Button variant="secondary" ariaBusy={false}>Reise laden</Button>);
    expect(btn).not.toHaveAttribute('aria-busy');
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('ariaDisabled (%s): наведение не меняет вид', (variant) => {
    render(<Button variant={variant} ariaDisabled>Berechnen</Button>);
    expect(screen.getByRole('button', { name: 'Berechnen' }).className).not.toMatch(/(^|\s)hover:/);
  });
});
