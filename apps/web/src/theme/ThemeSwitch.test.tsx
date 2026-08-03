import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  // Ревью: useTheme раньше был приватным useState на каждый монтаж — состояние делят DOM-атрибут
  // и localStorage, а не React, поэтому второй экземпляр не узнавал бы о переключении в первом.
  // Два переключателя на странице сегодня не встречаются, но имя хука общее и приглашает к
  // повторному использованию (HeroHeader теперь держит ThemeSwitch, а не только SetupHeader).
  it('два экземпляра переключателя делят одно состояние', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initial="de">
        <div data-testid="a"><ThemeSwitch /></div>
        <div data-testid="b"><ThemeSwitch /></div>
      </LocaleProvider>,
    );
    const [firstWarm, secondWarm] = screen.getAllByRole('button', { name: 'Warm' });
    await user.click(firstWarm);
    expect(secondWarm).toHaveAttribute('aria-pressed', 'true');
  });

  // Ревью (finding 3): getSnapshot читал localStorage, а не DOM. В Safari private mode
  // setItem бросает и проглатывается applyTheme — атрибут на <html> при этом уже стоит верно
  // (setAttribute кинуть не может), но снимок из хранилища оставался бы 'forest': кнопка
  // «Warm» рендерилась бы ненажатой, хотя каскад уже применил тёплую палитру — скринридер
  // объявил бы противоположность увиденному.
  describe('когда localStorage.setItem бросает (Safari private mode)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('DOM-атрибут и кнопка согласны друг с другом, даже если запомнить не удалось', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      const user = userEvent.setup();
      render(<LocaleProvider initial="de"><ThemeSwitch /></LocaleProvider>);
      await user.click(screen.getByRole('button', { name: 'Warm' }));
      expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
      expect(screen.getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
