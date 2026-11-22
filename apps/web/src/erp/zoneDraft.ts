// Зоны заказов ERP → черновик экрана «Настройка». Чистая адаптация чужих данных к состоянию экрана:
// ни React, ни экранных компонентов (замок — pureModules.test.ts), ни одного числа про упаковку.
import type { OrderZone } from '@shadrin-v/contracts';
import {
  isPristineDraft,
  nextColorIndex,
  orderStateFromZone,
  type OrderState,
} from '../screens/setup/setupState';

/** `lineRef` всех строк черновика — по ним повторный импорт узнаёт уже добавленные строки. */
export function draftLineRefs(orders: OrderState[]): Set<string> {
  const refs = new Set<string>();
  for (const o of orders) {
    for (const p of o.positions) if (p.lineRef !== undefined) refs.add(p.lineRef);
  }
  return refs;
}

/**
 * Дописывает зоны ответа ERP в черновик.
 *
 * - Строка с `lineRef`, уже присутствующим в черновике (в том числе добавленная этим же вызовом),
 *   пропускается и попадает в `skippedLineRefs`. Строка без `lineRef` не пропускается никогда.
 * - Зона, чей `orderId` (после `trim`) совпадает с карточкой черновика, дописывает строки в неё;
 *   иначе — новая карточка со слотом палитры `nextColorIndex`.
 * - Нетронутая заготовка (`isPristineDraft`) замещается первой новой карточкой, которая получает
 *   её слот; если добавить нечего, заготовка остаётся.
 * - Порядок зон и строк — как в ответе (контракт §4 п. 8); зона без оставшихся строк ничего не
 *   добавляет. Нетронутые карточки возвращаются теми же объектами; без добавлений — тот же массив.
 */
export function mergeZonesIntoDraft(
  orders: OrderState[],
  zones: OrderZone[],
): { orders: OrderState[]; addedPositions: number; skippedLineRefs: string[] } {
  const seen = draftLineRefs(orders);
  const skippedLineRefs: string[] = [];
  const pristine = isPristineDraft(orders);
  const out: OrderState[] = pristine ? [] : [...orders];
  let addedPositions = 0;

  for (const zone of zones) {
    const positions = zone.positions.filter((p) => {
      if (p.lineRef === undefined) return true;
      if (seen.has(p.lineRef)) {
        skippedLineRefs.push(p.lineRef);
        return false;
      }
      seen.add(p.lineRef);
      return true;
    });
    if (positions.length === 0) continue;
    addedPositions += positions.length;

    const id = zone.orderId.trim();
    const at = out.findIndex((o) => o.orderId.trim() === id);
    if (at === -1) {
      const slot = pristine && out.length === 0 ? orders[0].colorIndex : nextColorIndex(out);
      out.push(orderStateFromZone({ ...zone, positions }, slot));
      continue;
    }
    const card = out[at];
    const added = orderStateFromZone({ ...zone, positions }, card.colorIndex);
    out[at] = {
      ...card,
      ...(card.partner === undefined && added.partner !== undefined ? { partner: added.partner } : {}),
      ...(card.customer === undefined && added.customer !== undefined ? { customer: added.customer } : {}),
      positions: [...card.positions, ...added.positions],
    };
  }

  return { orders: addedPositions === 0 ? orders : out, addedPositions, skippedLineRefs };
}
