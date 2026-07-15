import type { Load } from '@shadrin-v/engine';
import { OrderSwatch } from '../../lib/swatch';
import { orderIndexMap } from './cutaway';

/** Order legend: colour + hatch + Auftrags-ID (mandatory for B/W print + colour blindness). */
export function Legend({ load, label }: { load: Load; label: string }) {
  const orders = [...orderIndexMap(load).entries()]; // [orderId, index]
  return (
    <section aria-label={label} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-label uppercase font-semibold text-faint">{label}</span>
      {orders.map(([orderId, index]) => (
        <span key={orderId} className="inline-flex items-center gap-2">
          <OrderSwatch index={index} title={orderId} />
          <span className="text-caption font-semibold tabular-nums">{orderId}</span>
        </span>
      ))}
    </section>
  );
}
