import { describe, it, expect } from 'vitest';
import type { Vehicle } from '@shadrin-v/engine';
import { VALIDATION_ERROR_CODES } from '@shadrin-v/engine';
import { TRANSLATION_KEYS } from '@shadrin-v/i18n';
import { setupSummary, setupMessages, allMessages, firstError } from './setupValidation';
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

  // Автопоезд (p3p): разрыв между тягачом и прицепом — не грузовой объём. `l × w × h` завышает
  // кузов на разрыв; правильный объём — сумма по отсекам (compartmentsOf).
  it('автопоезд: объём кузова — сумма по отсекам, разрыв не считается', () => {
    const train: Vehicle = {
      id: 't', name: 't', length: 16600, width: 2450, height: 3050,
      compartments: [
        { id: 'tractor', x: 0, length: 7700 },
        { id: 'trailer', x: 8900, length: 7700 },
      ],
    };
    const s = setupSummary([order([pos()])], train);
    expect(s.vehicleVolume).toBe((7700 + 7700) * 2450 * 3050);
    expect(s.vehicleVolume).not.toBe(train.length * train.width * train.height);
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

describe('allMessages — коды движка рядом с локальными проверками', () => {
  const train: Vehicle = {
    id: 't', name: 't', length: 16600, width: 2450, height: 3050,
    compartments: [{ id: 'tractor', x: 0, length: 7700 }, { id: 'trailer', x: 8900, length: 7700 }],
  };

  it('груз длиннее любого отсека → адресуемая ошибка движка', () => {
    const ms = allMessages([order([pos({ length: 8000, rotation: 'none' })])], train);
    expect(ms).toContainEqual(expect.objectContaining({
      code: 'ERR_CARGO_EXCEEDS_VEHICLE', level: 'error',
      where: { orderKey: 'o1', positionId: 'p1' }, orderId: 'SO-1001', name: 'EPAL 1',
    }));
  });

  // ADR 013: движок смотрит ВСЕ разрешённые ориентации, локальная проверка — только исходную
  // высоту. Груз с вращением «все 6» ляжет набок, поэтому ошибки нет, а предупреждение есть.
  it('высокий груз с вращением full (все 6) → только предупреждение, ошибки движка нет', () => {
    const ms = allMessages([order([pos({ height: 2600, rotation: 'full' })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('setup.msg.tooTall');
    expect(ms.map((m) => m.code)).not.toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('высокий груз с запретом вращения → ошибка движка, tooTall спрятан как более слабый', () => {
    const ms = allMessages([order([pos({ height: 2600, rotation: 'none' })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
    expect(ms.map((m) => m.code)).not.toContain('setup.msg.tooTall');
  });

  it('незаполненные размеры → одно «укажите размеры», а не три ERR_INVALID_DIMENSION', () => {
    const ms = allMessages([order([pos({ length: '', width: '', height: '' })])], vehicle);
    expect(ms.filter((m) => m.code === 'setup.msg.dimsMissing')).toHaveLength(1);
    expect(ms.map((m) => m.code)).not.toContain('ERR_INVALID_DIMENSION');
  });

  it('неверный шаг вложения → локальный stepInvalid, ERR_INVALID_NESTING подавлен', () => {
    const ms = allMessages([order([pos({ state: 'verschachtelt' })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('setup.msg.stepInvalid');
    expect(ms.map((m) => m.code)).not.toContain('ERR_INVALID_NESTING');
  });

  it('длина отсека 0 → безадресный ERR_INVALID_COMPARTMENTS', () => {
    const broken: Vehicle = { ...train, compartments: [{ id: 'tractor', x: 0, length: 0 }, { id: 'trailer', x: 8900, length: 7700 }] };
    const m = allMessages([order([pos()])], broken).find((x) => x.code === 'ERR_INVALID_COMPARTMENTS');
    expect(m).toMatchObject({ level: 'error' });
    expect(m?.where).toBeUndefined();
  });

  // Предупреждение о дубле относится к ЗАКАЗУ, а адресовано первой его строке: широкое правило
  // «ошибка движка съедает warnings строки» проглотило бы его молча.
  it('дубль Auftrags-ID переживает ошибку движка на той же строке', () => {
    const ms = allMessages(
      [
        order([pos({ id: 'p1' })], 'SO-1'),
        order([pos({ id: 'p2', length: 8000, rotation: 'none' })], 'SO-1'),
      ],
      train,
    );
    expect(ms.map((m) => m.code)).toContain('setup.msg.duplicateOrderId');
    expect(ms.map((m) => m.code)).toContain('ERR_CARGO_EXCEEDS_VEHICLE');
  });

  it('нулевая позиция с габаритами больше кузова расчёт не блокирует', () => {
    const ms = allMessages([order([pos({ id: 'p1', length: 8000, rotation: 'none', quantity: 0 }), pos({ id: 'p2' })])], train);
    expect(ms.filter((m) => m.level === 'error')).toEqual([]);
  });

  // Обнуление исключает строку из груза, но не отменяет незаконченную работу (решение 6 спеки).
  it('нулевая позиция с незаполненными размерами всё равно блокирует', () => {
    const ms = allMessages([order([pos({ id: 'p1', quantity: 0, length: '' }), pos({ id: 'p2' })])], vehicle);
    expect(ms.some((m) => m.code === 'setup.msg.dimsMissing' && m.level === 'error')).toBe(true);
  });

  it('все позиции нулевые → ERR_EMPTY_LOAD', () => {
    const ms = allMessages([order([pos({ quantity: 0 })])], vehicle);
    expect(ms.map((m) => m.code)).toContain('ERR_EMPTY_LOAD');
  });

  it('порядок детерминирован: локальные ошибки, ошибки движка, потом предупреждения', () => {
    const ms = allMessages(
      [order([pos({ id: 'p1', length: '' }), pos({ id: 'p2', length: 8000, rotation: 'none' }), pos({ id: 'p3', quantity: 0 })])],
      train,
    );
    expect(ms.map((m) => m.level)).toEqual([...ms.map((m) => m.level)].sort((a, b) => (a === b ? 0 : a === 'error' ? -1 : 1)));
    expect(ms[0].code).toBe('setup.msg.dimsMissing');
  });
});

// Гейт: код движка без перевода превратился бы в пустое место на экране (движок отдаёт коды,
// текст — на стороне UI, ADR 006).
describe('коды движка переводимы', () => {
  it('каждый VALIDATION_ERROR_CODES есть в TRANSLATION_KEYS', () => {
    for (const code of VALIDATION_ERROR_CODES) expect(TRANSLATION_KEYS).toContain(code);
  });
});
