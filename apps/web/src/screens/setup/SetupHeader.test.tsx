import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { SetupHeader } from './SetupHeader';
import type { SetupSummary } from './setupValidation';

const vehicle: Vehicle = { id: 'v', name: 'LKW Standard', length: 13600, width: 2450, height: 2450 };
const summary: SetupSummary = {
  orders: 2, positions: 3, units: 40, cargoVolume: 18_400_000_000, vehicleVolume: 81_644_000_000,
};

const renderHeader = (props: Partial<React.ComponentProps<typeof SetupHeader>> = {}) => {
  const handlers = {
    onVehicleChange: vi.fn(), onDemo: vi.fn(), onReset: vi.fn(), onCalculate: vi.fn(),
    onLoadingModeChange: vi.fn(), onOrderGroupingChange: vi.fn(),
  };
  render(
    // Бриф даёт LocaleProvider проп initialLocale — это ошибка брифа. Реальный проп называется
    // `initial` (см. LocaleContext.tsx и все существующие тесты, напр. RulesPanel.test.tsx).
    <LocaleProvider initial="de">
      <SetupHeader
        vehicle={vehicle} summary={summary} errorCount={0} compact={false}
        loadingMode="combined" orderGrouping="strict" {...handlers} {...props}
      />
    </LocaleProvider>,
  );
  return handlers;
};

describe('SetupHeader', () => {
  it('в полном виде показывает кузов, габариты и сводку', () => {
    renderHeader();
    expect(screen.getByLabelText('Fahrzeug')).toHaveValue('LKW Standard');
    expect(screen.getByLabelText('Länge')).toHaveValue(13600);
    expect(screen.getByText(/18,4 m³/)).toBeInTheDocument();
  });

  it('в ужатом виде остаются кузов, сводка, режим погрузки с галочкой и «Рассчитать»', () => {
    renderHeader({ compact: true });
    expect(screen.getByText('LKW Standard')).toBeInTheDocument();
    expect(screen.queryByLabelText('Länge')).toBeNull();       // габариты уходят
    expect(screen.queryByRole('button', { name: 'Demo' })).toBeNull(); // «Демо» и «Сброс» тоже
    expect(screen.getByRole('group', { name: 'Belademodus' })).toBeInTheDocument();
    // getByRole, не getByLabelText: OrderGroupingToggle даёт одинаковый aria-label и галочке, и
    // кнопке InfoHint (дословно с ладеплана, LadeplanScreen.tsx) — getByLabelText матчит ЛЮБОЙ
    // элемент с этим атрибутом (testing-library queryAllByAttribute), а не только форм-контролы,
    // поэтому находит оба и падает на неоднозначности. getByRole('checkbox', …) фильтрует по роли.
    expect(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Berechnen' })).toBeInTheDocument();
  });

  it('режим погрузки и галочка группировки зовут свои колбэки, а не считают сами', async () => {
    const h = renderHeader();
    // Segmented — это role="group" из <button>, а не радиогруппа (ui/primitives.tsx).
    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }));
    expect(h.onLoadingModeChange).toHaveBeenCalledWith('rear');
    expect(h.onOrderGroupingChange).toHaveBeenCalledWith('densityFirst');
    expect(h.onCalculate).not.toHaveBeenCalled();
  });

  it('«Рассчитать» НЕ гаснет при ошибках, но объявляет их числом', () => {
    renderHeader({ errorCount: 2 });
    const calc = screen.getByRole('button', { name: /Berechnen/ });
    expect(calc).toBeEnabled();
    expect(screen.getByText('Berechnung nicht möglich: 2 Fehler')).toBeInTheDocument();
  });

  it('действия зовут свои колбэки', async () => {
    const h = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
    expect(h.onCalculate).toHaveBeenCalledOnce();
    expect(h.onDemo).toHaveBeenCalledOnce();
  });
});
