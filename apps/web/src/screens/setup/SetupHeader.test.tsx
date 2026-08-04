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
    // getByRole('checkbox', …): роль сужает запрос до форм-контрола — имена галочки и её
    // подсказки с 2tp разные, но привязка к роли по-прежнему точнее голого getByLabelText.
    expect(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Berechnen' })).toBeInTheDocument();
  });

  // LKWkalk-2tp: у галочки и её кнопки-подсказки был один aria-label — скринридер объявлял два
  // разных элемента одним именем, а getByLabelText падал на неоднозначности (см. комментарий в
  // тесте про ужатый вид). У подсказки теперь своё имя — тот же приём, что у режима погрузки
  // (ladeplan.loadingModeHintLabel, LKWkalk-lu6).
  it('галочка группировки и её подсказка носят разные имена (2tp)', () => {
    renderHeader();
    expect(screen.getByLabelText('Dichte vor Auftragstrennung')).toBe(
      screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }),
    );
    expect(screen.getByRole('button', { name: 'Erklärung zur Auftragstrennung' })).toBeInTheDocument();
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

  // Подсказка приехала сюда вместе с переключателем (5nb этап 2): на ладеплане её больше нет, и
  // без этого теста она уже один раз молча пропала из продукта вместе с удалённой панелью.
  // «Hinten und Seite» — это доступ с двух сторон, из имени кнопки не видно, что считаются оба
  // варианта и показывается более плотный (находка QA).
  it('рядом с режимом погрузки есть подсказка, и её имя не спорит с именем переключателя', async () => {
    renderHeader();
    // Имя кнопки-подсказки отличается от 'Belademodus' — иначе на странице два элемента с одним
    // именем (та же коллизия, что у галочки группировки, LKWkalk-lu6).
    const hint = screen.getByRole('button', { name: 'Erklärung zum Belademodus' });
    expect(screen.getByRole('group', { name: 'Belademodus' })).toBeInTheDocument();
    await userEvent.click(hint);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/beide Varianten gerechnet und die dichtere gezeigt/);
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

  // LKWkalk-p3p (task 10): выбор автопоезда обязан протянуть отсеки — без этого преcет молча
  // выродился бы в один сплошной кузов длиной 16,6 м (та самая поломка, ради которой заведена
  // модель отсеков).
  it('выбор автопоезда передаёт compartments в onVehicleChange', async () => {
    const h = renderHeader();
    await userEvent.selectOptions(screen.getByLabelText('Fahrzeug'), 'LKW Gliederzug (Jumbo)');
    expect(h.onVehicleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'LKW Gliederzug (Jumbo)',
        compartments: [
          { id: 'tractor', name: 'vehicle.compartment.tractor', x: 0, length: 7700 },
          { id: 'trailer', name: 'vehicle.compartment.trailer', x: 8900, length: 7700 },
        ],
      }),
    );
  });

  // Легко упустить: если бы объект собирался через `{ ...vehicle, ... }`, отсеки предыдущего
  // выбора (автопоезда) утекли бы в следующий, односоставный кузов.
  it('выбор односоставного кузова после автопоезда не тащит его compartments', async () => {
    const trainVehicle: Vehicle = {
      id: 'lkw-gliederzug', name: 'LKW Gliederzug (Jumbo)', length: 16600, width: 2450, height: 3050,
      compartments: [
        { id: 'tractor', name: 'vehicle.compartment.tractor', x: 0, length: 7700 },
        { id: 'trailer', name: 'vehicle.compartment.trailer', x: 8900, length: 7700 },
      ],
    };
    const h = renderHeader({ vehicle: trainVehicle });
    await userEvent.selectOptions(screen.getByLabelText('Fahrzeug'), 'LKW Standard');
    expect(h.onVehicleChange).toHaveBeenCalledWith(
      expect.not.objectContaining({ compartments: expect.anything() }),
    );
  });
});
