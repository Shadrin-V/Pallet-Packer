import { describe, it, expect } from 'vitest';
import type { Vehicle } from '@shadrin-v/engine';
import { setupSummary, setupMessages, firstError } from './setupValidation';
import type { OrderState, PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 };

const pos = (p: Partial<PositionState> = {}): PositionState => ({
  id: 'p1', name: 'EPAL 1', length: 1200, width: 800, height: 144, quantity: 10,
  state: 'entschachtelt', rotation: 'yawOnly', nestStepPairwise: '', nestStepSequential: '',
  nestingMode: 'pairwise', maxNested: '', allowUnpairedTop: false, maxTiers: '', ...p,
});
const order = (positions: PositionState[], orderId = 'SO-1001'): OrderState => ({
  key: 'o1', orderId, colorIndex: 0, positions,
});

describe('setupSummary', () => {
  it('считает заказы, позиции, единицы и объёмы', () => {
    const s = setupSummary([order([pos(), pos({ id: 'p2', quantity: 5 })])], vehicle);
    expect(s).toEqual({
      orders: 1,
      positions: 2,
      units: 15,
      cargoVolume: 1200 * 800 * 144 * 15,
      vehicleVolume: 13600 * 2450 * 2450,
    });
  });

  it('пустое количество и незаполненные габариты считает нулём, а не NaN', () => {
    const s = setupSummary([order([pos({ quantity: '', length: '' })])], vehicle);
    expect(s.units).toBe(0);
    expect(s.cargoVolume).toBe(0);
  });
});

describe('setupMessages', () => {
  it('нет сообщений на здоровой заявке', () => {
    expect(setupMessages([order([pos()])], vehicle)).toEqual([]);
  });

  it('ошибка: verschachtelt без шага', () => {
    const [m] = setupMessages([order([pos({ state: 'verschachtelt' })])], vehicle);
    expect(m).toMatchObject({
      code: 'setup.msg.stepInvalid', level: 'error',
      where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1',
    });
  });

  it('ошибка: незаполненные габариты', () => {
    const [m] = setupMessages([order([pos({ width: '' })])], vehicle);
    expect(m).toMatchObject({ code: 'setup.msg.dimsMissing', level: 'error' });
  });

  it('предупреждение: позиция выше кузова', () => {
    const [m] = setupMessages([order([pos({ height: 2600 })])], vehicle);
    expect(m).toMatchObject({ code: 'setup.msg.tooTall', level: 'warning' });
  });

  it('предупреждение: количество 0 — расчёт не блокируется', () => {
    const ms = setupMessages([order([pos({ quantity: 0 })])], vehicle);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ code: 'setup.msg.zeroQuantity', level: 'warning' });
    expect(firstError(ms)).toBeNull();
  });

  it('предупреждение про объём — про весь план, без адреса строки', () => {
    const ms = setupMessages([order([pos({ quantity: 100000 })])], vehicle);
    const m = ms.find((x) => x.code === 'setup.msg.volumeOver');
    expect(m).toMatchObject({ level: 'warning' });
    expect(m?.where).toBeUndefined();
  });

  // LKWkalk-pkm: движок группирует груз в зоны по orderId, легенда и цвета — тоже. Два заказа с
  // одинаковым Auftrags-ID ниже по конвейеру — ОДИН заказ: одна зона, один цвет, одна строка
  // легенды, что бы ни показывала «Настройка». Дубль почти всегда опечатка, поэтому сводка
  // предупреждает (решение владельца 2026-07-30: предупреждение, не ошибка — расчёт с дублем
  // корректен, зоны законно объединяются).
  describe('предупреждение: Auftrags-ID повторяется (pkm)', () => {
    const twoOrders = (idA: string, idB: string): OrderState[] => [
      { key: 'oA', orderId: idA, colorIndex: 0, positions: [pos()] },
      { key: 'oB', orderId: idB, colorIndex: 1, positions: [pos({ id: 'pB', name: 'EPAL 2' })] },
    ];

    it('дубль даёт предупреждение на ВТОРОЙ карточке, с адресом её первой позиции', () => {
      const msgs = setupMessages(twoOrders('SO-1', 'SO-1'), vehicle);
      expect(msgs).toEqual([
        {
          code: 'setup.msg.duplicateOrderId',
          level: 'warning',
          where: { orderKey: 'oB', positionId: 'pB' },
          orderId: 'SO-1',
          name: 'EPAL 2',
        },
      ]);
    });

    it('разные ID предупреждения не дают; пробелы вокруг ID не делают его другим', () => {
      expect(setupMessages(twoOrders('SO-1', 'SO-2'), vehicle)).toEqual([]);
      expect(setupMessages(twoOrders('SO-1', ' SO-1 '), vehicle)).toHaveLength(1);
    });

    it('три карточки с одним ID — два предупреждения (по одному на каждый дубль)', () => {
      const three = [
        ...twoOrders('SO-1', 'SO-1'),
        { key: 'oC', orderId: 'SO-1', colorIndex: 2, positions: [pos({ id: 'pC' })] },
      ];
      const dups = setupMessages(three, vehicle).filter((m) => m.code === 'setup.msg.duplicateOrderId');
      expect(dups).toHaveLength(2);
      expect(dups.map((m) => m.where?.orderKey)).toEqual(['oB', 'oC']);
    });
  });

  it('ошибки идут раньше предупреждений, порядок строк сохраняется', () => {
    const ms = setupMessages(
      [order([pos({ id: 'p1', quantity: 0 }), pos({ id: 'p2', state: 'verschachtelt' })])],
      vehicle,
    );
    expect(ms.map((m) => m.code)).toEqual(['setup.msg.stepInvalid', 'setup.msg.zeroQuantity']);
  });

  it('firstError возвращает первую ошибку с адресом', () => {
    const ms = setupMessages(
      [order([pos({ id: 'p1', width: '' }), pos({ id: 'p2', state: 'verschachtelt' })])],
      vehicle,
    );
    expect(firstError(ms)?.where).toEqual({ orderKey: 'o1', positionId: 'p1' });
  });
});
