import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../i18n/LocaleContext';
import { LoadingModeSwitch } from './LoadingModeSwitch';

function renderSwitch(value: 'rear' | 'side' | 'combined', onChange = vi.fn()) {
  render(
    <LocaleProvider initial="de">
      <LoadingModeSwitch value={value} onChange={onChange} />
    </LocaleProvider>,
  );
  return onChange;
}

describe('LoadingModeSwitch', () => {
  it('renders the three loading modes as a labelled segmented group', () => {
    renderSwitch('combined');
    expect(screen.getByRole('group', { name: 'Belademodus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Automatisch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Von hinten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Von der Seite' })).toBeInTheDocument();
  });

  it('marks the current mode as pressed', () => {
    renderSwitch('combined');
    expect(screen.getByRole('button', { name: 'Automatisch' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('emits the engine mode value when another mode is picked', async () => {
    const onChange = renderSwitch('combined');
    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    expect(onChange).toHaveBeenCalledWith('rear');
  });
});
