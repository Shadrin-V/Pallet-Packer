import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { LoadSummary } from './LoadSummary';
import type { SetupMessage, SetupSummary } from './setupValidation';

const summary: SetupSummary = {
  orders: 2, positions: 3, units: 40,
  cargoVolume: 18_400_000_000, vehicleVolume: 81_644_000_000,
};
// LocaleProvider в этом проекте принимает `initial`, а не `initialLocale` (см. LocaleContext.tsx).
const renderIt = (messages: SetupMessage[] = [], onGoTo = vi.fn()) => {
  render(
    <LocaleProvider initial="de">
      <LoadSummary summary={summary} messages={messages} onGoTo={onGoTo} />
    </LocaleProvider>,
  );
  return onGoTo;
};

describe('LoadSummary', () => {
  it('показывает счётчики и объём груза против объёма кузова', () => {
    renderIt();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Aufträge')).toBeInTheDocument();
    expect(screen.getByText(/18,4 m³/)).toBeInTheDocument();
    expect(screen.getByText(/81,6 m³/)).toBeInTheDocument();
  });

  it('без сообщений говорит, что всё готово', () => {
    renderIt();
    expect(screen.getByText('Alles bereit zur Berechnung.')).toBeInTheDocument();
  });

  it('ошибка и предупреждение стоят под своими заголовками', () => {
    renderIt([
      { code: 'setup.msg.dimsMissing', level: 'error', where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1' },
      { code: 'setup.msg.zeroQuantity', level: 'warning', where: { orderKey: 'o1', positionId: 'p2' }, orderId: 'SO-1001', name: 'EPAL 2' },
    ]);
    expect(screen.getByText('Berechnung nicht möglich')).toBeInTheDocument();
    expect(screen.getByText('Hinweise')).toBeInTheDocument();
    expect(screen.getByText(/Maße unvollständig/)).toBeInTheDocument();
  });

  it('клик по сообщению ведёт к его строке', async () => {
    const onGoTo = renderIt([
      { code: 'setup.msg.dimsMissing', level: 'error', where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /EPAL 1/ }));
    expect(onGoTo).toHaveBeenCalledWith({ orderKey: 'o1', positionId: 'p1' });
  });

  it('сообщение про весь план не кликабельно — вести некуда', () => {
    renderIt([{ code: 'setup.msg.volumeOver', level: 'warning' }]);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/übersteigt den Laderaum/)).toBeInTheDocument();
  });
});
