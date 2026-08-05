// Сводка загрузки и сообщения экрана «Настройка» (LKWkalk-5nb, спека §6). Чистый модуль: ни DOM,
// ни перевода — коды и адреса строк, текст подставляет компонент (та же граница, что у
// positionRules и stackFormula).
import { compartmentsOf, validateLoad, type ValidationErrorCode, type Vehicle } from '@shadrin-v/engine';
import { stepInvalid } from '../components/stackFormula';
import {
  activeStep,
  dimsComplete,
  numOr0,
  toCargoList,
  type OrderState,
  type SetupMessageWhere,
} from './setupState';

export type { SetupMessageWhere };

/** Коды локальных проверок = ключи локалей: строку выбирает компонент, модуль их не знает. */
export type LocalMessageCode =
  | 'setup.msg.stepInvalid'
  | 'setup.msg.dimsMissing'
  | 'setup.msg.tooTall'
  | 'setup.msg.volumeOver'
  | 'setup.msg.zeroQuantity'
  | 'setup.msg.duplicateOrderId';

/** Сообщение панели — либо локальная проверка, либо код движка: для экрана это одно множество. */
export type SetupMessageCode = LocalMessageCode | ValidationErrorCode;

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

/** Коды `validateLoad` как сообщения панели (p3p.16). Все они — ошибки: движок отвергает ввод
 *  целиком, полутонов у него нет. Ошибка про груз адресуется строке через карту `toCargoList`;
 *  ошибки кузова и отсеков адреса не имеют — как `volumeOver`, им некуда вести.
 *
 *  Адрес честен ровно настолько, насколько уникальны `p.id`: `loadSetup` уникальность не проверяет,
 *  и испорченный черновик с двумя одинаковыми id подсветит одну строку из двух. Чинится это не
 *  здесь, а в LKWkalk-p3p.15 (ERR_DUPLICATE_CARGO_ID в самом движке). */
export function engineMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[] {
  const { cargo, addressOf } = toCargoList(orders);
  const byId = new Map(cargo.map((c) => [c.id, c] as const));
  return validateLoad({ vehicle, cargo }).map((e) => {
    const id = typeof e.details?.cargoTypeId === 'string' ? e.details.cargoTypeId : undefined;
    const where = id ? addressOf.get(id) : undefined;
    const c = id ? byId.get(id) : undefined;
    return {
      code: e.code as ValidationErrorCode,
      level: 'error' as const,
      ...(where ? { where } : {}),
      ...(c ? { orderId: c.orderId, name: c.name } : {}),
    };
  });
}

/** Всё, что экран показывает и считает: локальные проверки плюс коды движка.
 *
 *  Подавление узкое и намеренно несимметричное:
 *  — локальная ОШИБКА по строке глушит коды движка по ней же: недозаполненная строка должна дать
 *    одно человеческое «укажите размеры», а не три ERR_INVALID_DIMENSION;
 *  — обратно — ровно одна пара: ERR_CARGO_EXCEEDS_VEHICLE прячет tooTall, потому что «не влезает ни
 *    в одной ориентации» строго сильнее «выше кузова». Широкое правило «ошибка движка съедает
 *    warnings строки» отвергнуто: duplicateOrderId относится к заказу, а адресован первой строке,
 *    и любая ошибка движка на ней проглотила бы его молча.
 *
 *  Порядок фиксирован (ошибки, потом предупреждения) — от него зависит, к какой строке прыгает
 *  «Рассчитать»: плавающий порядок означал бы разный прыжок на одном и том же вводе. */
export function allMessages(orders: OrderState[], vehicle: Vehicle): SetupMessage[] {
  const local = setupMessages(orders, vehicle);
  const engine = engineMessages(orders, vehicle);

  const rowsWithLocalError = new Set(
    local.filter((m) => m.level === 'error' && m.where).map((m) => m.where!.positionId),
  );
  const engineShown = engine.filter((m) => !(m.where && rowsWithLocalError.has(m.where.positionId)));

  const rowsThatDoNotFit = new Set(
    engineShown.filter((m) => m.code === 'ERR_CARGO_EXCEEDS_VEHICLE' && m.where).map((m) => m.where!.positionId),
  );
  const localShown = local.filter(
    (m) => !(m.code === 'setup.msg.tooTall' && m.where && rowsThatDoNotFit.has(m.where.positionId)),
  );

  return [
    ...localShown.filter((m) => m.level === 'error'),
    ...engineShown,
    ...localShown.filter((m) => m.level === 'warning'),
  ];
}

/** Первая ошибка, к которой есть куда вести. Это и есть адрес, куда прыгает «Рассчитать» (§6). */
export function firstError(messages: SetupMessage[]): SetupMessage | null {
  return messages.find((m) => m.level === 'error' && m.where) ?? null;
}
