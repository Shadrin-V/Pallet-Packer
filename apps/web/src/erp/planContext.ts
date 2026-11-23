// Контекст плана — то, что экрану плана нужно сверх `Load`: заказ (поставщик, покупатель), рейс,
// коды артикулов и неразмещаемые строки. Чистая адаптация состояния черновика: ни React, ни
// экранных компонентов (замок — pureModules.test.ts), ни одного числа про упаковку.
import { isUnplaceableReason, type UnplaceableReason } from '@shadrin-v/contracts';
import type { OrderState, TripRef } from '../screens/setup/setupState';

export interface PlanContextUnplaceable {
  positionId: string;
  orderId: string;
  itemCode?: string;
  itemName: string;
  uom?: string;
  sourceQuantity?: number;
  reason: UnplaceableReason;
}

export interface PlanContext {
  trip?: TripRef;
  /** Ключ — orderId. */
  orders: Record<string, { partner?: string; customer?: string }>;
  /** Ключ — id позиции = CargoType.id. */
  items: Record<string, { itemCode?: string }>;
  /** id ВСЕХ позиций плана (размещаемых и неразмещаемых) в порядке показа: заказы черновика по
   *  порядку, позиции в заказе по порядку. */
  positionOrder: string[];
  unplaceable: PlanContextUnplaceable[];
}

/**
 * Рейс, которым можно подписать план черновика: `trip`, только если КАЖДАЯ позиция пришла из него
 * (`fromTrip`). Груз двух рейсов, рейс с добавленными строками или ручными позициями, черновик старого
 * вида (позиции без происхождения) и пустой черновик — своя подборка: номера рейса нет нигде (заголовок
 * плана, строка рейса над заказами, экспорт-картинка, печать). Иначе план груза рейсов A и B был бы
 * подписан последним загруженным рейсом.
 */
export function draftTrip(orders: OrderState[], trip?: TripRef): TripRef | undefined {
  if (!trip) return undefined;
  const positions = orders.flatMap((o) => o.positions);
  return positions.length > 0 && positions.every((p) => p.fromTrip === trip.tripId) ? trip : undefined;
}

/** `trip` — последний загруженный рейс черновика; в контекст он попадает только по правилу `draftTrip`. */
export function planContextFrom(orders: OrderState[], trip?: TripRef): PlanContext {
  const shownTrip = draftTrip(orders, trip);
  const ctx: PlanContext = {
    ...(shownTrip ? { trip: shownTrip } : {}),
    orders: {},
    items: {},
    positionOrder: [],
    unplaceable: [],
  };
  for (const o of orders) {
    // Дубль orderId движок кладёт одной зоной; подпись берётся у первой карточки.
    if (!Object.hasOwn(ctx.orders, o.orderId)) {
      ctx.orders[o.orderId] = {
        ...(o.partner !== undefined ? { partner: o.partner } : {}),
        ...(o.customer !== undefined ? { customer: o.customer } : {}),
      };
    }
    for (const p of o.positions) {
      const itemCode = p.articleCode ? { itemCode: p.articleCode } : {};
      ctx.items[p.id] = itemCode;
      ctx.positionOrder.push(p.id);
      if (p.unplaceable) {
        ctx.unplaceable.push({
          positionId: p.id,
          orderId: o.orderId,
          ...itemCode,
          itemName: p.name,
          ...(p.uom !== undefined ? { uom: p.uom } : {}),
          ...(p.sourceQuantity !== undefined ? { sourceQuantity: p.sourceQuantity } : {}),
          reason: p.unplaceable,
        });
      }
    }
  }
  return ctx;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const optString = (x: unknown): boolean => x === undefined || typeof x === 'string';

function isUnplaceableEntry(x: unknown): x is PlanContextUnplaceable {
  return (
    isRecord(x) &&
    typeof x.positionId === 'string' &&
    typeof x.orderId === 'string' &&
    typeof x.itemName === 'string' &&
    optString(x.itemCode) &&
    optString(x.uom) &&
    (x.sourceQuantity === undefined || (typeof x.sourceQuantity === 'number' && Number.isFinite(x.sourceQuantity))) &&
    isUnplaceableReason(x.reason)
  );
}

/** Проверка формы при чтении из хранилища: испорченная запись не доезжает до экрана плана. */
export function isPlanContext(x: unknown): x is PlanContext {
  if (!isRecord(x)) return false;
  const { trip, orders, items, positionOrder, unplaceable } = x;
  if (trip !== undefined && !(isRecord(trip) && typeof trip.tripId === 'string' && optString(trip.loadingDate)))
    return false;
  if (!isRecord(orders) || !Object.values(orders).every((o) => isRecord(o) && optString(o.partner) && optString(o.customer)))
    return false;
  if (!isRecord(items) || !Object.values(items).every((i) => isRecord(i) && optString(i.itemCode))) return false;
  if (!Array.isArray(positionOrder) || !positionOrder.every((id) => typeof id === 'string')) return false;
  return Array.isArray(unplaceable) && unplaceable.every(isUnplaceableEntry);
}
