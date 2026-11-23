// Полоса шагов сборки для ERP (макет, блоки 2–4): какой шаг текущий и какие пройдены.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleContext';
import { currentErpStep, ERP_STEP_ANCHORS, ErpSteps } from './ErpSteps';
import { PICKER_SECTION_ID } from './ErpCargoPicker';

describe('ErpSteps', () => {
  it('текущий шаг и пройденные шаги', () => {
    expect(currentErpStep({ positions: 0, hasPlan: false })).toBe('select');
    expect(currentErpStep({ positions: 3, hasPlan: false })).toBe('setup');
    expect(currentErpStep({ positions: 3, hasPlan: true })).toBe('plan');
    render(<LocaleProvider initial="de" persist={false}><ErpSteps positions={3} hasPlan={false} /></LocaleProvider>);
    expect(screen.getByRole('link', { name: /Positionen wählen/ })).toHaveAttribute('data-done');
    expect(screen.getByRole('link', { name: /Einrichten/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: /Ladeplan/ })).toHaveAttribute('href', '#lp-plan');
  });

  it('у списка шагов есть имя; шаг выбора ведёт к секции выбора груза; непройденный шаг без отметки', () => {
    expect(ERP_STEP_ANCHORS.select).toBe(PICKER_SECTION_ID);
    render(<LocaleProvider initial="de" persist={false}><ErpSteps positions={0} hasPlan={false} /></LocaleProvider>);
    expect(screen.getByRole('list', { name: 'Schritte' })).toBeInTheDocument();
    const select = screen.getByRole('link', { name: /Positionen wählen/ });
    expect(select).toHaveAttribute('aria-current', 'step');
    expect(select).toHaveAttribute('href', '#lp-select');
    expect(select).not.toHaveAttribute('data-done');
    expect(screen.getByRole('link', { name: /Einrichten/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Einrichten/ })).toHaveAttribute('href', '#lp-setup');
  });

  it('подписи по-русски', () => {
    render(<LocaleProvider initial="ru" persist={false}><ErpSteps positions={3} hasPlan /></LocaleProvider>);
    expect(screen.getByRole('link', { name: /Выбор позиций/ })).toHaveAttribute('data-done');
    expect(screen.getByRole('link', { name: /Настройка/ })).toHaveAttribute('data-done');
    expect(screen.getByRole('link', { name: /План погрузки/ })).toHaveAttribute('aria-current', 'step');
  });
});
