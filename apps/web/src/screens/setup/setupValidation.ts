// Сводка загрузки и сообщения экрана «Настройка» (LKWkalk-5nb, спека §6). Чистый модуль: ни DOM,
// ни перевода — коды и адреса строк, текст подставляет компонент (та же граница, что у
// positionRules и stackFormula).
import type { Vehicle } from '@shadrin-v/engine';
import { stepInvalid } from '../components/stackFormula';
import { activeStep, dimsComplete, numOr0, type OrderState } from './setupState';

/** Коды сообщений = ключи локалей: строку выбирает компонент, модуль их не знает. */
export type SetupMessageCode =
  | 'setup.msg.stepInvalid'
  | 'setup.msg.dimsMissing'
  | 'setup.msg.tooTall'
  | 'setup.msg.volumeOver'
  | 'setup.msg.zeroQuantity';

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
    vehicleVolume: vehicle.length * vehicle.width * vehicle.height,
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
  const s = setupSummary(orders, vehicle);
  if (s.cargoVolume > s.vehicleVolume)
    warnings.push({ code: 'setup.msg.volumeOver', level: 'warning' });
  return [...errors, ...warnings];
}

/** Первая ошибка, к которой есть куда вести. Это и есть адрес, куда прыгает «Рассчитать» (§6). */
export function firstError(messages: SetupMessage[]): SetupMessage | null {
  return messages.find((m) => m.level === 'error' && m.where) ?? null;
}
