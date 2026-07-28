// Карточка заказа (LKWkalk-5nb, спека §2): худые строки позиций + шапка колонок. Разбор правил
// живёт в RulesPanel (Task 4), выбранной панелью управляет SetupScreen — здесь только выбор строки.
// Извлечено из SetupScreen.tsx: аккордеон `openId` удалён целиком, его роль перешла к выбору строки.
import type { Vehicle } from '@shadrin-v/engine';
import { ArmedDelete } from '../components/ArmedDelete';
import { OrderSwatch } from '../../lib/swatch';
import { TextField } from '../../ui/primitives';
import { useT } from '../../i18n/LocaleContext';
import { PositionRow } from './PositionRow';
import type { OrderState, PositionState } from './setupState';

export interface OrderCardProps {
  order: OrderState;
  index: number; // палитра заказа
  vehicle: Vehicle;
  reorderable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onOrderIdChange: (v: string) => void;
  onPositionChange: (pid: string, patch: Partial<PositionState>) => void;
  onAddPosition: () => void;
  armed: { kind: 'position' | 'order'; key: string } | null;
  onArm: (a: { kind: 'position' | 'order'; key: string }) => void;
  onRemoveOrder: () => void;
  onRemovePosition: (pid: string) => void;
  /** Позиция, чей разбор сейчас открыт в RulesPanel (или ничьей, если панель показывает пустое
   *  состояние либо разбирается позиция другого заказа). */
  selectedPositionId: string | null;
  onSelectPosition: (pid: string) => void;
  /** Registers/unregisters a position's chip button with the parent, keyed by position id — Task 6
   *  uses this to return focus to the chip that opened the narrow-screen drawer when it closes. */
  onChipRef?: (pid: string, el: HTMLButtonElement | null) => void;
  /** Same registration, for the row's article-name input — Task 7 (LKWkalk-78x) uses this to return
   *  focus to a sibling row after a position delete instead of evicting it from the card. */
  onNameRef?: (pid: string, el: HTMLInputElement | null) => void;
}

export function OrderCard({
  order,
  index,
  vehicle,
  reorderable,
  canMoveUp,
  canMoveDown,
  onMove,
  onOrderIdChange,
  onPositionChange,
  onAddPosition,
  armed,
  onArm,
  onRemoveOrder,
  onRemovePosition,
  selectedPositionId,
  onSelectPosition,
  onChipRef,
  onNameRef,
}: OrderCardProps) {
  const tt = useT();
  const colorVar = `var(--s${((index % 8) + 1)})`;
  return (
    <section className="overflow-hidden rounded-card bg-card shadow-card" style={{ borderLeft: `4px solid ${colorVar}` }}>
      {/* flex-wrap (Finding 6, final review wave): this header only survived unwrapped because the
          order-ID field carries min-w-0 — an accident, not a guarantee. Wrap explicitly so the wide
          armed confirm button (ArmedDelete) has somewhere to go instead of overflowing the
          overflow-hidden section, same fix already applied to the position row below. */}
      <div className="flex flex-wrap items-center gap-3 bg-sub px-4 py-2.5">
        <OrderSwatch index={index} title={`${tt('setup.order')} ${order.orderId}`} />
        <TextField ariaLabel={tt('field.orderId')} value={order.orderId} onChange={onOrderIdChange} weight={700} />
        <span className="ml-auto text-caption text-muted">
          {order.positions.length} × {tt('cargoType.label')}
        </span>
        {/* Reorder the order queue — list order = priority (4bj.11). Hidden when there is nothing
            to reorder; ends are disabled. Only UI: moving a card reorders the semantic cargo list. */}
        {reorderable && (
          <div className="flex items-center">
            <button
              type="button"
              aria-label={tt('setup.moveOrderUp')}
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
              className="px-1 text-muted hover:text-brand disabled:opacity-30 disabled:hover:text-muted"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={tt('setup.moveOrderDown')}
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
              className="px-1 text-muted hover:text-brand disabled:opacity-30 disabled:hover:text-muted"
            >
              ↓
            </button>
          </div>
        )}
        {/* Remove the whole order from THIS calculation — the catalogue is untouched (ADR 022). */}
        <ArmedDelete
          armed={armed?.kind === 'order' && armed.key === order.key}
          onArm={() => onArm({ kind: 'order', key: order.key })}
          onConfirm={onRemoveOrder}
          label={tt('setup.deleteOrder')}
          confirmLabel={tt('action.confirmDelete')}
        />
      </div>

      {/* Column headings for the position fields (rgv.6, спека §2: видны всегда, не только на
          широком экране — раньше aria-labels на полях несли смысл ниже xl, теперь у экрана всегда
          есть вторая колонка с панелью, так что заголовки нужны на любой ширине). Widths mirror
          PositionRow exactly; the sixth column names the rule chip at the row's trailing edge. */}
      <div className="flex items-center gap-1.5 border-b border-line bg-sub px-4 pb-1 pt-2 text-label uppercase tracking-wide text-faint">
        <span className="w-3 shrink-0" />
        <span className="w-64 shrink-0">{tt('article.label')}</span>
        <span className="w-24">{tt('field.length')}</span>
        <span className="w-24">{tt('field.width')}</span>
        <span className="w-24">{tt('field.height')}</span>
        <span className="w-20">{tt('field.quantity')}</span>
        <span className="ml-auto">{tt('setup.col.rules')}</span>
      </div>

      <div className="divide-y divide-line">
        {order.positions.map((p) => (
          <PositionRow
            key={p.id}
            position={p}
            index={index}
            vehicle={vehicle}
            selected={selectedPositionId === p.id}
            onSelect={() => onSelectPosition(p.id)}
            onChange={(patch) => onPositionChange(p.id, patch)}
            armed={armed?.kind === 'position' && armed.key === p.id}
            onArm={() => onArm({ kind: 'position', key: p.id })}
            onRemove={() => onRemovePosition(p.id)}
            chipRef={onChipRef ? (el) => onChipRef(p.id, el) : undefined}
            nameRef={onNameRef ? (el) => onNameRef(p.id, el) : undefined}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAddPosition}
        className="w-full border-t border-dashed border-line-strong bg-sub py-2 text-caption font-semibold text-muted hover:text-brand"
      >
        + {tt('setup.addPosition')}
      </button>
    </section>
  );
}
