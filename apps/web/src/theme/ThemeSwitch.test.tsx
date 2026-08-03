import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../i18n/LocaleContext';
import { ThemeSwitch } from './ThemeSwitch';
import { THEME_STORAGE_KEY } from './useTheme';

describe('ThemeSwitch', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('группа имеет доступное имя, активная палитра помечена', () => {
    render(<LocaleProvider initial="de"><ThemeSwitch /></LocaleProvider>);
    const group = screen.getByRole('group', { name: 'Farbschema' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grün' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('нажатие переключает палитру и запоминает её', async () => {
    const user = userEvent.setup();
    render(<LocaleProvider initial="de"><ThemeSwitch /></LocaleProvider>);
    await user.click(screen.getByRole('button', { name: 'Warm' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('warm');
    expect(screen.getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'true');
  });
});
