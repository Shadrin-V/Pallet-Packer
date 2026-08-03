// Обещание 1:1: стопка во дворе ровно того размера, каким встанет в кузов. Держится равенством ширин
// ВНЕШНИХ viewBox — оба svg рисуются width:100% в одной колонке, значит мм→px совпадает by
// construction. Это единственный тест, который пинит само обещание; всё остальное — его следствия.
// Расходится оно молча (LKWkalk-6n4: 41e.1 добавила разрезу поле под кабину, двор остался как был).
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { calculateLayout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { CrossSection } from './CrossSection';
import { WarehouseFloor } from './WarehouseFloor';
import type { BufferTile } from './warehouseLayout';

// Wechselbrücke — случай владельца с прода: короткий кузов, где расхождение доходит до 23%.
const V = { id: 'v', name: 'Wechselbrücke', length: 7150, width: 2450, height: 2700 };
const load: Load = {
  vehicle: V,
  cargo: [
    {
      id: 'p',
      name: 'EPAL 3',
      length: 1000,
      width: 1200,
      height: 144,
      quantity: 8,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1',
    },
  ],
};
const tiles: BufferTile[] = [{ cargoTypeId: 'p', units: 4, orientation: 'lwh' }];

const viewBoxWidth = (svg: Element) => Number(svg.getAttribute('viewBox')!.split(' ')[2]);

describe('масштаб двора и кузова', () => {
  it.each([true, false])('yard and cutaway share one mm→px scale (showTruck=%s)', (showTruck) => {
    render(
      <LocaleProvider initial="de">
        <CrossSection
          load={load}
          layout={calculateLayout(load)}
          view="top"
          label="Draufsicht"
          showTruck={showTruck}
        />
        <WarehouseFloor
          load={load}
          tiles={tiles}
          onRotate={() => {}}
          onPickUp={() => {}}
          dragging={null}
          showTruck={showTruck}
        />
      </LocaleProvider>,
    );
    const hold = document.querySelector('svg[data-cutaway="top"]')!;
    const yard = document.querySelector('svg[data-warehouse]')!;
    expect(viewBoxWidth(yard)).toBe(viewBoxWidth(hold));
  });
});
