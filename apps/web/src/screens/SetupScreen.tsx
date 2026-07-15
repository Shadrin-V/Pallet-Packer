// Setup screen (LKWkalk-gxp) — эталон docs/lovable/setup-reference.html, палитра/компоненты по
// docs/design/design-system.md (Direction D). Token-only, i18n de/ru, движок для предпросмотра штабеля.
import { useState } from 'react';
import type { Load, Vehicle, CargoType, RotationRule, NestingState } from '@shadrin-v/engine';
import { computeStack } from '@shadrin-v/engine';
import { useT } from '../i18n/LocaleContext';
import { OrderSwatch } from '../lib/swatch';
import { Measure, TextField, Segmented, Select, Button, Chip } from '../ui/primitives';
import { LocaleSwitch } from '../ui/LocaleSwitch';
import { VEHICLE_PRESETS, PALLET_PRESETS } from '../data/presets';

// ---- state model ----------------------------------------------------------
type Num = number | '';

interface PositionState {
  id: string;
  name: string;
  length: Num;
  width: Num;
  height: Num;
  quantity: Num;
  state: NestingState;
  rotation: RotationRule;
  stepHeight: Num; // nesting step (verschachtelt)
  maxTiers: Num; // stacking cap
}

interface OrderState {
  key: string;
  orderId: string;
  positions: PositionState[];
}

export interface SetupScreenProps {
  initialVehicle?: Vehicle;
  initialOrders?: OrderState[];
  onCalculate: (load: Load) => void;
}


const uid = () => crypto.randomUUID();

const emptyPosition = (): PositionState => ({
  id: uid(),
  name: '',
  length: '',
  width: '',
  height: '',
  quantity: 1,
  state: 'entschachtelt',
  rotation: 'yawOnly',
  stepHeight: '',
  maxTiers: '',
});

const emptyOrder = (n: number): OrderState => ({
  key: uid(),
  orderId: `SO-${n}`,
  positions: [emptyPosition()],
});

const numOr0 = (v: Num): number => (v === '' ? 0 : v);

/** Build the engine CargoType for a position (used for both preview and the final Load). */
function toCargo(p: PositionState, orderId: string): CargoType {
  const nestable = p.state === 'verschachtelt' && numOr0(p.stepHeight) > 0;
  return {
    id: p.id,
    name: p.name || p.id,
    length: numOr0(p.length),
    width: numOr0(p.width),
    height: numOr0(p.height),
    quantity: numOr0(p.quantity),
    rotation: p.rotation,
    stacking: { stackable: true, ...(numOr0(p.maxTiers) > 0 ? { maxTiers: numOr0(p.maxTiers) } : {}) },
    nesting: nestable ? { nestable: true, stepHeight: numOr0(p.stepHeight) } : { nestable: false },
    state: p.state,
    orderId,
  };
}

// ---- component ------------------------------------------------------------
export function SetupScreen({ initialVehicle, initialOrders, onCalculate }: SetupScreenProps) {
  const tt = useT();
  const preset0 = VEHICLE_PRESETS[0];
  const [vehicle, setVehicle] = useState<Vehicle>(
    initialVehicle ?? { id: preset0.key, name: preset0.name, length: preset0.length, width: preset0.width, height: preset0.height },
  );
  const [orders, setOrders] = useState<OrderState[]>(initialOrders ?? [emptyOrder(1)]);

  const patchOrder = (key: string, patch: Partial<OrderState>) =>
    setOrders((os) => os.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const patchPosition = (okey: string, pid: string, patch: Partial<PositionState>) =>
    setOrders((os) =>
      os.map((o) =>
        o.key === okey
          ? { ...o, positions: o.positions.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }
          : o,
      ),
    );

  const addOrder = () => setOrders((os) => [...os, emptyOrder(os.length + 1)]);
  const addPosition = (okey: string) =>
    patchOrder(okey, {
      positions: [...(orders.find((o) => o.key === okey)?.positions ?? []), emptyPosition()],
    });

  const handleCalculate = () => {
    const cargo = orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId)));
    onCalculate({ vehicle, cargo });
  };

  const rotationOptions = [
    { value: 'none' as RotationRule, label: tt('cargoType.rotation.none') },
    { value: 'yawOnly' as RotationRule, label: tt('cargoType.rotation.yawOnly') },
    { value: 'full' as RotationRule, label: tt('cargoType.rotation.full') },
  ];

  return (
    <main className="mx-auto max-w-[1120px] px-5 py-6 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-[650] text-balance">{tt('app.title')}</h1>
          <p className="text-caption text-muted">{tt('app.subtitle')}</p>
        </div>
        <LocaleSwitch />
      </header>

      {/* Vehicle bar */}
      <section className="mb-6 rounded-card bg-card shadow-card">
        <div className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase font-semibold text-faint">{tt('vehicle.label')}</span>
            <Select
              ariaLabel={tt('vehicle.label')}
              value={vehicle.name}
              onChange={(name) => {
                const p = VEHICLE_PRESETS.find((v) => v.name === name);
                if (p) setVehicle({ id: p.key, name: p.name, length: p.length, width: p.width, height: p.height });
                else setVehicle((v) => ({ ...v, name: tt('setup.vehiclePreset.custom') }));
              }}
              options={[
                { value: tt('setup.vehiclePreset.custom'), label: tt('setup.vehiclePreset.custom') },
                ...VEHICLE_PRESETS.map((p) => ({ value: p.name, label: p.name })),
              ]}
            />
          </div>
          <MeasureField label={tt('field.length')} value={vehicle.length} onChange={(length) => setVehicle((v) => ({ ...v, length: numOr0(length) }))} />
          <MeasureField label={tt('field.width')} value={vehicle.width} onChange={(width) => setVehicle((v) => ({ ...v, width: numOr0(width) }))} />
          <MeasureField label={tt('field.height')} value={vehicle.height} onChange={(height) => setVehicle((v) => ({ ...v, height: numOr0(height) }))} />
        </div>
      </section>

      {/* Orders */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-eyebrow uppercase font-semibold text-faint">{tt('setup.orders')}</span>
        <Button variant="ghost" onClick={addOrder}>+ {tt('setup.addOrder')}</Button>
      </div>

      <div className="flex flex-col gap-4">
        {orders.map((o, oi) => (
          <OrderCard
            key={o.key}
            order={o}
            index={oi}
            vehicle={vehicle}
            rotationOptions={rotationOptions}
            tt={tt}
            onOrderIdChange={(orderId) => patchOrder(o.key, { orderId })}
            onPositionChange={(pid, patch) => patchPosition(o.key, pid, patch)}
            onAddPosition={() => addPosition(o.key)}
          />
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={handleCalculate}>{tt('action.calculate')}</Button>
      </div>
    </main>
  );
}

// ---- vehicle measure field (label + Measure) ------------------------------
function MeasureField({ label, value, onChange }: { label: string; value: Num; onChange: (v: Num) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label uppercase font-semibold text-faint">{label}</span>
      <span className="w-24">
        <Measure ariaLabel={label} value={value} onChange={onChange} />
      </span>
    </label>
  );
}

// ---- order card -----------------------------------------------------------
function OrderCard({
  order,
  index,
  vehicle,
  rotationOptions,
  tt,
  onOrderIdChange,
  onPositionChange,
  onAddPosition,
}: {
  order: OrderState;
  index: number;
  vehicle: Vehicle;
  rotationOptions: { value: RotationRule; label: string }[];
  tt: (k: import('@shadrin-v/i18n').TranslationKey) => string;
  onOrderIdChange: (v: string) => void;
  onPositionChange: (pid: string, patch: Partial<PositionState>) => void;
  onAddPosition: () => void;
}) {
  const colorVar = `var(--s${((index % 8) + 1)})`;
  return (
    <section className="overflow-hidden rounded-card bg-card shadow-card" style={{ borderLeft: `4px solid ${colorVar}` }}>
      <div className="flex items-center gap-3 bg-sub px-4 py-2.5">
        <OrderSwatch index={index} title={`${tt('setup.order')} ${order.orderId}`} />
        <TextField ariaLabel={tt('field.orderId')} value={order.orderId} onChange={onOrderIdChange} weight={700} />
        <span className="ml-auto text-caption text-muted">
          {order.positions.length} × {tt('cargoType.label')}
        </span>
      </div>

      <div className="divide-y divide-line">
        {order.positions.map((p) => (
          <PositionRow key={p.id} position={p} index={index} vehicle={vehicle} rotationOptions={rotationOptions} tt={tt} onChange={(patch) => onPositionChange(p.id, patch)} />
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

// ---- position row ---------------------------------------------------------
function PositionRow({
  position: p,
  index,
  vehicle,
  rotationOptions,
  tt,
  onChange,
}: {
  position: PositionState;
  index: number;
  vehicle: Vehicle;
  rotationOptions: { value: RotationRule; label: string }[];
  tt: (k: import('@shadrin-v/i18n').TranslationKey) => string;
  onChange: (patch: Partial<PositionState>) => void;
}) {
  const [open, setOpen] = useState(false);
  const dimsPresent = numOr0(p.length) > 0 && numOr0(p.width) > 0 && numOr0(p.height) > 0;
  let stackCount = 0;
  if (dimsPresent) {
    try {
      stackCount = computeStack(toCargo(p, 'preview'), vehicle).count;
    } catch {
      stackCount = 0;
    }
  }

  return (
    <div className="px-4 py-2.5">
      {/* desktop: one line; phone: wraps into a card */}
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <OrderSwatch index={index} width={12} height={26} />
        <Select
          ariaLabel={tt('cargoType.label')}
          value={PALLET_PRESETS.find((pp) => pp.length === p.length && pp.width === p.width && pp.height === p.height)?.key ?? 'custom'}
          onChange={(key) => {
            const preset = PALLET_PRESETS.find((pp) => pp.key === key);
            if (preset)
              onChange({ name: p.name || preset.name, length: preset.length, width: preset.width, height: preset.height });
          }}
          options={[
            { value: 'custom', label: tt('setup.vehiclePreset.custom') },
            ...PALLET_PRESETS.map((pp) => ({ value: pp.key, label: pp.name })),
          ]}
        />
        <span className="min-w-[8rem] flex-1">
          <TextField ariaLabel={tt('field.name')} value={p.name} onChange={(name) => onChange({ name })} placeholder={tt('cargoType.label')} />
        </span>
        <span className="w-20"><Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length })} /></span>
        <span className="w-20"><Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width })} /></span>
        <span className="w-20"><Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height })} /></span>
        <span className="w-16"><Measure ariaLabel={tt('field.quantity')} unit="×" value={p.quantity} onChange={(quantity) => onChange({ quantity })} /></span>
        <Segmented
          ariaLabel={tt('cargoType.nesting.label')}
          value={p.state}
          onChange={(state) => onChange({ state })}
          options={[
            { value: 'entschachtelt', label: tt('setup.state.ent') },
            { value: 'verschachtelt', label: tt('setup.state.ver') },
          ]}
        />
        <Select ariaLabel={tt('cargoType.rotation.label')} value={p.rotation} onChange={(rotation) => onChange({ rotation })} options={rotationOptions} />
        {stackCount > 0 && (
          <Chip tone={p.state === 'verschachtelt' ? 'mint' : 'default'}>
            {tt('setup.stack')} {stackCount}
          </Chip>
        )}
        <button type="button" aria-label="details" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ml-auto text-muted hover:text-brand">
          {open ? '⌃' : '⌄'}
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-4 border-t border-dashed border-line bg-sub px-2 py-2">
          <label className="flex flex-col gap-1">
            <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.stacking.label')}</span>
            <span className="w-24"><Measure ariaLabel={tt('cargoType.stacking.label')} unit="×" value={p.maxTiers} onChange={(maxTiers) => onChange({ maxTiers })} /></span>
          </label>
          {p.state === 'verschachtelt' && (
            <label className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.nesting.label')}</span>
              <span className="w-24"><Measure ariaLabel={tt('cargoType.nesting.label')} value={p.stepHeight} onChange={(stepHeight) => onChange({ stepHeight })} /></span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
