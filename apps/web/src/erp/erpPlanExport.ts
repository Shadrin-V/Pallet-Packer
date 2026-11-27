// Состав плана в сборке для ERP словами (макет, блок 4): строки «Nicht im LKW» и легенда/заметки
// картинки. Чистые функции: ни React, ни .tsx (замок — pureModules.test.ts), тексты — через `tt`.
// `layout` здесь всегда ТЕКУЩАЯ раскладка экрана (с ручными правками), а не первый результат
// расчёта: картинка и список говорят о том же плане, что видит пользователь.
// Арифметики упаковки нет: стопки неразмещённого даёт ядро (`stackBuffer`), счёт по позициям —
// `orderBreakdown` (соединение раскладки с заявкой).
import { stackBuffer, type Layout, type Load } from '@shadrin-v/engine';
import type { Locale, TranslationKey } from '@shadrin-v/i18n';
import { orderBreakdown } from '../screens/components/orderBreakdown';
import { fillTemplate } from '../screens/components/stackFormula';
import { orderColorToken } from '../lib/orderColor';
import { formatUom } from '../lib/uomLabel';
import { formatSourceQuantity } from './quantityFormat';
import type { PlanContext } from './planContext';

type Tt = (k: TranslationKey) => string;

export interface NotInTruckRow {
  /** id позиции: у размещаемой — `CargoType.id`, у неразмещаемой — `positionId`. */
  positionId: string;
  /** Только у размещаемой позиции (есть в `Load`). */
  cargoTypeId?: string;
  /** Знак позиции (задача 15), если карта знаков передана. */
  mark?: string;
  /** «68 Stk», «12,4 m³»; у неразмещаемой без `sourceQuantity` — нет. */
  amount?: string;
  /** Код артикула и имя. */
  item: string;
  /** «4 Stapel zu 17» — только при однородных стопках. */
  stacks?: string;
  /** «BE-40395 · Probe Tara TOV · direkt an AB-41990». */
  order: string;
  reason: string;
  kind: 'noRoom' | 'unplaceable';
}

const joinParts = (parts: (string | undefined)[], sep: string) => parts.filter(Boolean).join(sep);

/** Строка заказа: номер, поставщик, при прямой поставке — покупатель. */
export function orderLine(orderId: string, context: PlanContext | undefined, tt: Tt): string {
  const o = context && Object.hasOwn(context.orders, orderId) ? context.orders[orderId] : undefined;
  return joinParts(
    [orderId, o?.partner, o?.customer ? fillTemplate(tt('plan.directTo'), { customer: o.customer }) : undefined],
    ' · ',
  );
}

/** Код артикула позиции из контекста (нет контекста или кода — `undefined`). */
export function itemCodeOf(positionId: string, context: PlanContext | undefined): string | undefined {
  return context && Object.hasOwn(context.items, positionId) ? context.items[positionId].itemCode : undefined;
}

/** Всё, что не в машине: (а) неразмещённое текущей раскладки по позициям `Load`, (б) неразмещаемые
 *  строки ERP из контекста. */
export function notInTruckRows(a: {
  load: Load;
  layout: Layout;
  context?: PlanContext;
  marks?: ReadonlyMap<string, string>;
  tt: Tt;
  locale: Locale;
}): NotInTruckRow[] {
  const { load, layout, context, marks, tt, locale } = a;
  const withMark = (id: string) => (marks?.has(id) ? { mark: marks.get(id)! } : {});
  const buffer = stackBuffer(load, layout);
  const rows: NotInTruckRow[] = [];
  for (const o of orderBreakdown(load, layout)) {
    for (const it of o.items) {
      if (it.unplaced <= 0) continue;
      const stacks = buffer.filter((b) => b.cargoTypeId === it.cargoTypeId).map((b) => b.units);
      const uniform = stacks.length > 0 && stacks.every((u) => u === stacks[0]);
      rows.push({
        positionId: it.cargoTypeId,
        cargoTypeId: it.cargoTypeId,
        ...withMark(it.cargoTypeId),
        amount: `${formatSourceQuantity(it.unplaced, locale)} ${tt('uom.pieces')}`,
        item: joinParts([itemCodeOf(it.cargoTypeId, context), it.name], ' '),
        ...(uniform ? { stacks: fillTemplate(tt('plan.notInTruck.stacks'), { stacks: stacks.length, per: stacks[0] }) } : {}),
        order: orderLine(o.orderId, context, tt),
        reason: tt('plan.notInTruck.noRoom'),
        kind: 'noRoom',
      });
    }
  }
  for (const u of context?.unplaceable ?? []) {
    const uom = formatUom(u.uom, tt);
    rows.push({
      positionId: u.positionId,
      ...withMark(u.positionId),
      ...(u.sourceQuantity !== undefined
        ? { amount: joinParts([formatSourceQuantity(u.sourceQuantity, locale), uom], ' ') }
        : {}),
      item: joinParts([u.itemCode, u.itemName], ' '),
      order: orderLine(u.orderId, context, tt),
      reason: fillTemplate(tt(u.reason), { uom }),
      kind: 'unplaceable',
    });
  }
  return rows;
}

/** Одна строка «Nicht im LKW» текстом — для картинки. */
const rowText = (r: NotInTruckRow) =>
  joinParts([joinParts([r.mark, r.amount, r.item], ' '), r.stacks, r.order, r.reason], ' · ');

/** Легенда и заметки картинки ERP-плана — то же, что на экране: таблица позиций (без «max.»),
 *  «Nicht im LKW» и заметка о том, что вес не проверяется. */
export function erpExportParts(a: {
  load: Load;
  layout: Layout;
  context?: PlanContext;
  marks?: ReadonlyMap<string, string>;
  orderColors?: Map<string, number>;
  tt: Tt;
  locale: Locale;
}): { legend: { label: string; color: string }[]; notes: { title: string; lines: string[] }[] } {
  const { load, layout, context, marks, orderColors, tt, locale } = a;
  const legend = orderBreakdown(load, layout, orderColors).flatMap((o) =>
    o.items.map((it) => {
      const what = joinParts([itemCodeOf(it.cargoTypeId, context), it.name], ' ');
      const rest = it.unplaced > 0 ? ` (${formatSourceQuantity(it.unplaced, locale)} ${tt('plan.notInTruckShort')})` : '';
      return {
        label: `${joinParts([marks?.get(it.cargoTypeId), o.orderId], ' ')} — ${what} ×${formatSourceQuantity(it.placed, locale)}${rest}`,
        color: orderColorToken(o.colorIndex).colorVar,
      };
    }),
  );
  const rows = notInTruckRows({ load, layout, context, marks, tt, locale });
  const notes = [
    ...(rows.length > 0 ? [{ title: tt('plan.notInTruck.title'), lines: rows.map(rowText) }] : []),
    { title: tt('ladeplan.weightNotChecked'), lines: [tt('ladeplan.weightNotCheckedHint')] },
  ];
  return { legend, notes };
}
