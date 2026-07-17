import type { Layout, Load } from '@shadrin-v/engine';
import { OrderSwatch } from '../../lib/swatch';
import { orderBreakdown } from './orderBreakdown';
import { fillTemplate } from './stackFormula';
import { useT } from '../../i18n/LocaleContext';

/** Order legend + breakdown: per order — colour + hatch + Auftrags-ID, and each position as
 * "name × placed" (with "(N nicht platziert)" when some units did not fit). The colour/hatch pair
 * is mandatory for B/W print and colour blindness (design-system §6). */
export function Legend({
  load,
  layout,
  label,
  orderColors,
}: {
  load: Load;
  layout: Layout;
  label: string;
  /** Stable orderId→palette slot, so legend colours match the Setup screen after reorder (QA #2). */
  orderColors?: Map<string, number>;
}) {
  const tt = useT();
  const orders = orderBreakdown(load, layout, orderColors);
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <span className="text-label uppercase font-semibold text-faint">{label}</span>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {orders.map((o) => (
          <div key={o.orderId} className="inline-flex items-start gap-2">
            <span className="mt-0.5 shrink-0">
              <OrderSwatch index={o.colorIndex} title={o.orderId} />
            </span>
            <div className="text-caption leading-snug">
              <span className="font-semibold tabular-nums">{o.orderId}</span>
              {/* Load-composition reference: article · dimensions · placed count (compact for A4). */}
              <ul className="mt-0.5 text-muted">
                {o.items.map((it) => (
                  <li key={it.cargoTypeId} className="tabular-nums">
                    {it.name} <span className="text-faint">{it.length}×{it.width}×{it.height}</span>{' '}
                    <b className="font-semibold text-ink">×{it.placed}</b>
                    {it.unplaced > 0 && (
                      <span className="text-danger">
                        {' '}
                        ({fillTemplate(tt('ladeplan.notPlaced'), { n: it.unplaced })})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
