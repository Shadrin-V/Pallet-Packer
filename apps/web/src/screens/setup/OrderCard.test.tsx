import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Vehicle } from '@shadrin-v/engine';
import { t } from '@shadrin-v/i18n';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { fillTemplate } from '../components/stackFormula';
import { OrderCard } from './OrderCard';
import { emptyOrder, emptyPosition } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

function renderCard(positionCount: number) {
  const order = {
    ...emptyOrder(1),
    positions: Array.from({ length: positionCount }, () => emptyPosition()),
  };
  render(
    <LocaleProvider initial="ru">
      <OrderCard
        order={order}
        index={0}
        vehicle={vehicle}
        reorderable={false}
        panelDocked
        canMoveUp={false}
        canMoveDown={false}
        onMove={() => {}}
        onOrderIdChange={() => {}}
        onPositionChange={() => {}}
        onAddPosition={() => {}}
        armed={null}
        onArm={() => {}}
        onRemoveOrder={() => {}}
        onRemovePosition={() => {}}
        selectedPositionId={null}
        onSelectPosition={() => {}}
        onDeselectPosition={() => {}}
      />
    </LocaleProvider>,
  );
}

describe('OrderCard', () => {
  // LKWkalk-5gi п.3: счётчик позиций в шапке собирался конкатенацией в коде
  // (`{n} × {tt('cargoType.label')}`) — переводчик не контролировал ни порядок слов, ни
  // разделитель. Теперь строка целиком приходит из словаря (`setup.positionCount`), код только
  // подставляет операнды. Тест берёт эталон из самого словаря: изменится шаблон — изменится и
  // ожидание, а вот возврат к конкатенации с другим порядком/разделителем упадёт.
  it('renders the position counter from the dictionary template, not by concatenation', () => {
    renderCard(3);
    const expected = fillTemplate(t('setup.positionCount', 'ru'), {
      count: 3,
      label: t('cargoType.label', 'ru'),
    });
    expect(expected).toContain('3'); // страховка от вакуумного шаблона без {count}
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
