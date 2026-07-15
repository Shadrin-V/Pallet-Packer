import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider, useT } from '../i18n/LocaleContext';
import { LocaleSwitch } from './LocaleSwitch';

function Probe() {
  const tt = useT();
  return <span>{tt('action.calculate')}</span>;
}

describe('LocaleSwitch', () => {
  beforeEach(() => localStorage.clear());

  it('switches de→ru and updates translated text', async () => {
    render(
      <LocaleProvider initial="de">
        <LocaleSwitch />
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText('Berechnen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'RU' }));
    expect(screen.getByText('Рассчитать')).toBeInTheDocument();
  });

  it('persists the choice to localStorage', async () => {
    render(
      <LocaleProvider initial="de">
        <LocaleSwitch />
      </LocaleProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'RU' }));
    expect(localStorage.getItem('ladungsplaner.locale')).toBe('ru');
  });
});
