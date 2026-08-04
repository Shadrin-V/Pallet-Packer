// Сводка загрузки и сообщения экрана «Настройка» (LKWkalk-5nb, спека §6). Чистый модуль: ни DOM,
// ни перевода — коды и адреса строк, текст подставляет компонент (та же граница, что у
// positionRules и stackFormula).
import { compartmentsOf, type Vehicle } from '@shadrin-v/engine';
import { stepInvalid } from '../components/stackFormula';
import { activeStep, dimsComplete, numOr0, type OrderState } from './setupState';

/** Коды сообщений = ключи локалей: строку выбирает компонент, модуль их не знает. */
export type SetupMessageCode =
  | 'setup.msg.stepInvalid'
  | 'setup.msg.dimsMissing'
  | 'setup.msg.tooTall'
  | 'setup.msg.volumeOver'
  | 'setup.msg.zeroQuantity'
  | 'setup.msg.duplicateOrderId';

/** Адрес строки: ключ заказа + id позиции — ровно то, чем экран выбирает строку (`Selection`). */
export interface SetupMessageWhere {
  orderKey: string;
  positionId: string;
}

export interface SetupMessage {
  code: SetupMessageCode;
  /** error — расчёт невозможен; warning — расчёт возможен, результат предсказуемо неполный. */
  level: 'error' | 'warning';
  /** Нет у сообщений про весь план (объём): им некуда вести. */
  where?: SetupMessageWhere;
  orderId?: string;
  name?: string;
}

export interface SetupSummary {
  orders: number;
  positions: number;
  units: number;
  /** мм³ (ADR 002); в м³ переводит formatVolume на границе UI. */
  cargoVolume: number;
  vehicleVolume: number;
}

export function setupSummary(orders: OrderState[], vehicle: Vehicle): SetupSummary {
  let positions = 0;
  let units = 0;
  let cargoVolume = 0;
  for (const o of orders) {
    for (const p of o.positions) {
      positions += 1;
      const q = numOr0(p.quantity);
      units += q;
      cargoVolume += numOr0(p.length) * numOr0(p.width) * numOr0(p.height) * q;
    }
  }
  return {
    orders: orders.length,
    positions,
    units,
    cargoVolume,
    // Автопоезд (p3p): `length` — полный пролёт, включая разрыв между отсеками, а не грузовой
    // объём. `compartmentsOf` тотальна (нет `compartments` → один неявный отсек), так что для
    // односоставного кузова сумма равна прежнему `l × w × h`.
    vehicleVolume: compartmentsOf(vehicle).reduce((a, c) => a + c.length * vehicle.width * vehicle.height, 0),
  };
}

export function setupMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[] {
  const errors: SetupMessage[] = [];
  const warnings: SetupMessage[] = [];
  for (const o of orders) {
    for (const p of o.positions) {
      const at = { where: { orderKey: o.key, positionId: p.id }, orderId: o.orderId, name: p.name };
      if (!dimsComplete(p)) errors.push({ code: 'setup.msg.dimsMissing', level: 'error', ...at });
      if (stepInvalid(p.state, activeStep(p), p.height))
        errors.push({ code: 'setup.msg.stepInvalid', level: 'error', ...at });
      if (numOr0(p.height) > vehicle.height)
        warnings.push({ code: 'setup.msg.tooTall', level: 'warning', ...at });
      // Обнулить количество — законный способ временно исключить позицию, не удаляя её (§6).
      if (numOr0(p.quantity) === 0)
        warnings.push({ code: 'setup.msg.zeroQuantity', level: 'warning', ...at });
    }
  }
  // Дубль Auftrags-ID (LKWkalk-pkm): движок группирует груз в зоны по orderId, легенда и цвета —
  // тоже, так что две карточки с одним ID лягут ОДНИМ заказом, что бы ни показывала «Настройка».
  // Дубль почти всегда опечатка → предупреждение на каждой карточке после первой (решение
  // владельца 2026-07-30: не ошибка — расчёт с дублем корректен, зоны законно объединяются).
  // trim: «SO-1» и « SO-1 » — один заказ и для движка, которому ID достаётся как есть из формы.
  const seenIds = new Set<string>();
  for (const o of orders) {
    const id = o.orderId.trim();
    const first = o.positions[0];
    if (seenIds.has(id) && first) {
      warnings.push({
        code: 'setup.msg.duplicateOrderId',
        level: 'warning',
        where: { orderKey: o.key, positionId: first.id },
        orderId: o.orderId,
        name: first.name,
      });
    }
    seenIds.add(id);
  }
  const s = setupSummary(orders, vehicle);
  if (s.cargoVolume > s.vehicleVolume)
    warnings.push({ code: 'setup.msg.volumeOver', level: 'warning' });
  return [...errors, ...warnings];
}

/** Первая ошибка, к которой есть куда вести. Это и есть адрес, куда прыгает «Рассчитать» (§6). */
export function firstError(messages: SetupMessage[]): SetupMessage | null {
  return messages.find((m) => m.level === 'error' && m.where) ?? null;
}
