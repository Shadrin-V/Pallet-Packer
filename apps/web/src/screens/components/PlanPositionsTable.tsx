// Таблица позиций плана в сборке для ERP (макет, блок 4) — вместо легенды обычной сборки: по строке
// на позицию — заказ (цвет + штриховка, номер, поставщик, прямая поставка), артикул, сколько
// запрошено, в машине, не в машине и сколько этого артикула вошло бы в пустую машину.
// `layout` — ТЕКУЩАЯ раскладка экрана (с ручными правками): числа идут за тем, что на экране.
// Колонка «max.» — экранная (печать её не несёт, решение оркестратора); «nicht im LKW» печатается.
import type { Layout, Load } from '@shadrin-v/engine';
import { formatLength } from '@shadrin-v/i18n';
import { useLocale } from '../../i18n/LocaleContext';
import { OrderSwatch } from '../../lib/swatch';
import { formatSourceQuantity } from '../../erp/quantityFormat';
import { itemCodeOf } from '../../erp/erpPlanExport';
import type { PlanContext } from '../../erp/planContext';
import { orderBreakdown } from './orderBreakdown';
import { fillTemplate } from './stackFormula';

export interface PlanPositionsTableProps {
  load: Load;
  layout: Layout;
  context?: PlanContext;
  /** cargoTypeId → максимум единиц в пустом кузове (ядро, `capacityMap`). */
  capacity: ReadonlyMap<string, number>;
  orderColors?: Map<string, number>;
  /** id позиции → знак позиции (задача 15); без карты знака нет. */
  marks?: ReadonlyMap<string, string>;
}

const TH = 'border-b border-line px-2 py-1.5 font-semibold text-muted';
const TD = 'px-2 py-1.5';

export function PlanPositionsTable({ load, layout, context, capacity, orderColors, marks }: PlanPositionsTableProps) {
  const { locale, tt } = useLocale();
  const num = (n: number) => formatSourceQuantity(n, locale);
  const quantityOf = new Map(load.cargo.map((c) => [c.id, c.quantity]));
  const orders = orderBreakdown(load, layout, orderColors);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-caption">
        <thead>
          <tr className="text-left">
            <th scope="col" className={TH}>{tt('plan.col.order')}</th>
            <th scope="col" className={TH}>{tt('plan.col.item')}</th>
            <th scope="col" className={`${TH} text-right`}>{tt('plan.col.qty')}</th>
            <th scope="col" className={`${TH} text-right`}>{tt('plan.col.inTruck')}</th>
            <th scope="col" className={`${TH} text-right`}>{tt('plan.col.notInTruck')}</th>
            <th scope="col" className={`${TH} text-right print:hidden`}>{tt('plan.col.max')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const info = context && Object.hasOwn(context.orders, o.orderId) ? context.orders[o.orderId] : undefined;
            return o.items.map((it, i) => {
              const itemCode = itemCodeOf(it.cargoTypeId, context);
              const mark = marks?.get(it.cargoTypeId);
              return (
                <tr key={it.cargoTypeId} data-cargo-type={it.cargoTypeId} className="border-b border-line align-top">
                  {i === 0 && (
                    <td rowSpan={o.items.length} className={TD}>
                      <span className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">
                          <OrderSwatch index={o.colorIndex} title={o.orderId} />
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="font-semibold tabular-nums">{o.orderId}</span>
                          {(info?.partner || info?.customer) && (
                            <span className="text-muted">
                              {info.partner && <span>{info.partner}</span>}
                              {info.partner && info.customer && ' · '}
                              {info.customer && <span>{fillTemplate(tt('plan.directTo'), { customer: info.customer })}</span>}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                  )}
                  <td className={TD}>
                    <span className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-baseline gap-x-1.5">
                        {mark && (
                          <span data-testid="position-mark" className="font-bold text-ink">
                            {mark}
                          </span>
                        )}
                        {itemCode && <span className="font-semibold tabular-nums">{itemCode}</span>}
                        <span>{it.name}</span>
                      </span>
                      <span className="tabular-nums text-faint">
                        {`${num(it.length)} × ${num(it.width)} × ${formatLength(it.height, locale)}`}
                      </span>
                    </span>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{num(quantityOf.get(it.cargoTypeId) ?? 0)}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{num(it.placed)}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {it.unplaced > 0 ? (
                      <span className="font-semibold text-danger">{`${num(it.unplaced)} ${tt('plan.notInTruckShort')}`}</span>
                    ) : (
                      <span className="text-faint">{num(0)}</span>
                    )}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-brand print:hidden`}>
                    {capacity.has(it.cargoTypeId) ? num(capacity.get(it.cargoTypeId)!) : ''}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
