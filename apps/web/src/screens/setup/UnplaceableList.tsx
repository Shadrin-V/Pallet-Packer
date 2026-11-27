// Неразмещаемые строки ERP (макет, блок 3): сервер решил, что строку не планируют (м³, нет артикула,
// …), поэтому строкой в карточке заказа она не рисуется — только здесь, с причиной. Полей ввода нет:
// исправлять в такой строке нечего, её можно лишь убрать из списка.
import { ArmedDelete } from '../components/ArmedDelete';
import { fillTemplate } from '../components/stackFormula';
import { useLocale, useT } from '../../i18n/LocaleContext';
import { formatUom } from '../../lib/uomLabel';
import { formatSourceQuantity } from '../../erp/quantityFormat';
import type { OrderState } from './setupState';

export interface UnplaceableListProps {
  orders: OrderState[];
  /** Взведённое удаление экрана — одно на весь экран (ADR 022). */
  armed: { kind: 'position' | 'order'; key: string } | null;
  onArm: (a: { kind: 'position'; key: string }) => void;
  onRemove: (orderKey: string, positionId: string) => void;
}

export function UnplaceableList({ orders, armed, onArm, onRemove }: UnplaceableListProps) {
  const tt = useT();
  const { locale } = useLocale();
  const items = orders.flatMap((o) =>
    o.positions.flatMap((p) => (p.unplaceable ? [{ order: o, p, reason: p.unplaceable }] : [])),
  );
  if (items.length === 0) return null;
  return (
    <ul data-testid="unplaceable-list" className="flex flex-col divide-y divide-line rounded-card bg-card shadow-card">
      {items.map(({ order, p, reason }) => {
        const uom = formatUom(p.uom, tt);
        const amount = p.sourceQuantity !== undefined ? `${formatSourceQuantity(p.sourceQuantity, locale)} ${uom}` : uom;
        return (
          <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
            <span className="rounded-pill border border-warning px-2 py-0.5 text-caption text-warning">
              {fillTemplate(tt(reason), { uom })}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-body">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-ink">{`${order.orderId} · ${[p.articleCode, p.name].filter(Boolean).join(' ')}`}</span>
                {amount && <span className="font-semibold tabular-nums text-ink">{amount}</span>}
              </span>
              {reason === 'ERR_LINE_UNIT_NOT_PIECES' && (
                <span className="text-caption text-muted">{tt('unplaceable.unitHint')}</span>
              )}
            </span>
            {order.partner && <span className="text-caption text-muted">{order.partner}</span>}
            <ArmedDelete
              armed={armed?.kind === 'position' && armed.key === p.id}
              onArm={() => onArm({ kind: 'position', key: p.id })}
              onConfirm={() => onRemove(order.key, p.id)}
              label={tt('setup.deletePosition')}
              confirmLabel={tt('action.confirmDelete')}
            />
          </li>
        );
      })}
    </ul>
  );
}
