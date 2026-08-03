import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '../i18n/LocaleContext';
import { HeroHeader } from './HeroHeader';

// Финальное ревью: на 360/390px заголовок+подзаголовок схлопывались до 0–3.5px (`min-w-0` без
// нижней границы) и их текст рисовался поверх пилюль ThemeSwitch/LocaleSwitch (нет
// overflow:hidden на боксе). jsdom не считает раскладку — сам разрыв был проверен вживую в
// Chrome; здесь закрепляется структурное свойство, которое несёт исправление, а не измерение
// пикселей: группа переключателей вынесена в блок, который занимает всю ширину строки (значит —
// переносится на свою строку) ниже `sm` и возвращается в общую строку с шапкой от `sm` и выше.
describe('HeroHeader — перенос строки на узких экранах (структурный пин)', () => {
  it('группа переключателей помечена на полную ширину ниже sm и на auto — от sm', () => {
    render(
      <LocaleProvider initial="de">
        <HeroHeader />
      </LocaleProvider>,
    );
    const controls = screen.getByTestId('hero-controls');
    expect(controls.className).toContain('w-full');
    expect(controls.className).toContain('sm:w-auto');
  });

  it('контейнер шапки допускает перенос ниже sm и возвращается в одну строку от sm', () => {
    render(
      <LocaleProvider initial="de">
        <HeroHeader />
      </LocaleProvider>,
    );
    const controls = screen.getByTestId('hero-controls');
    const row = controls.parentElement;
    expect(row?.className).toContain('flex-wrap');
    expect(row?.className).toContain('sm:flex-nowrap');
  });

  it('заголовок остаётся текстом продукта — без усечения многоточием', () => {
    render(
      <LocaleProvider initial="de">
        <HeroHeader />
      </LocaleProvider>,
    );
    const title = screen.getByText('Ladungsplaner');
    expect(title.className).not.toMatch(/truncate|text-ellipsis/);
  });
});
