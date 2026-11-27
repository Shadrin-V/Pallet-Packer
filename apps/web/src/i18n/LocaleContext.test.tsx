import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TranslationKey } from '@shadrin-v/i18n';
import { LocaleProvider, useLocale, useT } from './LocaleContext';

function Probe({ k }: { k: TranslationKey }) {
  return <span>{useT()(k)}</span>;
}

function SwitchToRu() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale('ru')}>ru</button>;
}

describe('LocaleProvider', () => {
  it('overrides подменяет ключ', () => {
    render(<LocaleProvider initial="de" persist={false} overrides={{ 'action.calculate': 'action.print' }}><Probe k="action.calculate" /></LocaleProvider>);
    expect(screen.getByText('Drucken')).toBeInTheDocument();
  });

  it('persist=false: сохранённый язык не читается и смена языка не пишется', async () => {
    localStorage.setItem('ladungsplaner.locale', 'ru');
    render(<LocaleProvider initial="de" persist={false}><Probe k="action.print" /><SwitchToRu /></LocaleProvider>);
    expect(screen.getByText('Drucken')).toBeInTheDocument();
    localStorage.removeItem('ladungsplaner.locale');
    await userEvent.click(screen.getByRole('button', { name: 'ru' }));
    expect(screen.queryByText('Drucken')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.locale')).toBeNull();
  });

  it('по умолчанию язык читается из хранилища и пишется в него, как раньше', async () => {
    localStorage.setItem('ladungsplaner.locale', 'ru');
    render(<LocaleProvider initial="de"><Probe k="action.print" /><SwitchToRu /></LocaleProvider>);
    expect(screen.queryByText('Drucken')).toBeNull();
    localStorage.removeItem('ladungsplaner.locale');
    await userEvent.click(screen.getByRole('button', { name: 'ru' }));
    expect(localStorage.getItem('ladungsplaner.locale')).toBe('ru');
  });
});
