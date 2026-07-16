// Setup screen (LKWkalk-gxp) — эталон docs/lovable/setup-reference.html, палитра/компоненты по
// docs/design/design-system.md (Direction D). Token-only, i18n de/ru, движок для предпросмотра штабеля.
import { useEffect, useRef, useState } from 'react';
import type {
  Load,
  Vehicle,
  CargoType,
  RotationRule,
  NestingState,
  NestingMode,
  StackPreview,
} from '@shadrin-v/engine';
import { computeStack } from '@shadrin-v/engine';
import { formulaKey, fillTemplate, formulaVars, stepInvalid } from './components/stackFormula';
import { StackDiagram } from './components/StackDiagram';
import { useT } from '../i18n/LocaleContext';
import { OrderSwatch } from '../lib/swatch';
import { orderColorToken } from '../lib/orderColor';
import { Measure, TextField, Segmented, Select, Button, Chip, InfoHint } from '../ui/primitives';
import { HeroHeader } from '../ui/HeroHeader';
import { VEHICLE_PRESETS, PALLET_PRESETS, type DimPreset } from '../data/presets';
import { loadUserPallets, addUserPallet, removeUserPallet, isUserPreset } from '../data/userPresets';
import { demoSetup } from '../data/demo';

// ---- state model ----------------------------------------------------------
type Num = number | '';

export interface PositionState {
  id: string;
  name: string;
  length: Num;
  width: Num;
  height: Num;
  quantity: Num;
  state: NestingState;
  rotation: RotationRule;
  stepHeight: Num; // nesting step: Δh (sequential) or h_д (pairwise)
  nestingMode: NestingMode;
  maxNested: Num; // nesting cap
  allowUnpairedTop: boolean; // pairwise only
  maxTiers: Num; // stacking cap
}

export interface OrderState {
  key: string;
  orderId: string;
  positions: PositionState[];
}

export interface SetupScreenProps {
  initialVehicle?: Vehicle;
  initialOrders?: OrderState[];
  onCalculate: (load: Load) => void;
  /** Called by the reset button, so the parent can also clear the computed Ladeplan. */
  onReset?: () => void;
}

// ---- persistence (survives page refresh; cleared by the reset button) ---------------------------
// The persisted form is a client-side working draft. ERPNext import (future) sets the same state and
// then persists here; the source of truth for imported data stays the Sales Order. Reset clears it.
const SETUP_STORAGE_KEY = 'ladungsplaner.setup';
interface PersistedSetup {
  vehicle: Vehicle;
  orders: OrderState[];
}
function loadSetup(): PersistedSetup | null {
  try {
    const raw = globalThis.localStorage?.getItem(SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSetup;
    if (parsed?.vehicle && Array.isArray(parsed.orders) && parsed.orders.length) return parsed;
  } catch {
    /* corrupt / unavailable — ignore */
  }
  return null;
}
function saveSetup(s: PersistedSetup): void {
  try {
    globalThis.localStorage?.setItem(SETUP_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
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
  nestingMode: 'pairwise',
  maxNested: '',
  allowUnpairedTop: false,
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
    nesting: nestable
      ? {
          nestable: true,
          stepHeight: numOr0(p.stepHeight),
          nestingMode: p.nestingMode,
          ...(numOr0(p.maxNested) > 0 ? { maxNested: numOr0(p.maxNested) } : {}),
          ...(p.nestingMode === 'pairwise' ? { allowUnpairedTop: p.allowUnpairedTop } : {}),
        }
      : { nestable: false },
    state: p.state,
    orderId,
  };
}

// ---- component ------------------------------------------------------------
export function SetupScreen({ initialVehicle, initialOrders, onCalculate, onReset }: SetupScreenProps) {
  const tt = useT();
  const preset0 = VEHICLE_PRESETS[0];
  const defaultVehicle = (): Vehicle => ({ id: preset0.key, name: preset0.name, length: preset0.length, width: preset0.width, height: preset0.height });
  const [vehicle, setVehicle] = useState<Vehicle>(() => initialVehicle ?? loadSetup()?.vehicle ?? defaultVehicle());
  const [orders, setOrders] = useState<OrderState[]>(() => initialOrders ?? loadSetup()?.orders ?? [emptyOrder(1)]);
  // User pallet catalogue (T4): kept at screen level so a preset saved in one row shows up in the
  // dropdowns of all the others. Reset clears the draft, never this catalogue.
  const [userPallets, setUserPallets] = useState<DimPreset[]>(() => loadUserPallets());

  // Persist the working draft on every change so a page refresh does not lose input.
  useEffect(() => {
    saveSetup({ vehicle, orders });
  }, [vehicle, orders]);

  /** Fill a rich demo plan and compute it right away (build the Load from the demo data directly —
   *  setState is async, so we must not read it back in this tick). */
  const handleDemo = () => {
    const d = demoSetup();
    setVehicle(d.vehicle);
    setOrders(d.orders);
    onCalculate({
      vehicle: d.vehicle,
      cargo: d.orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId))),
    });
  };

  const handleReset = () => {
    if (typeof window !== 'undefined' && !window.confirm(tt('setup.resetConfirm'))) return;
    setVehicle(defaultVehicle());
    setOrders([emptyOrder(1)]);
    try {
      globalThis.localStorage?.removeItem(SETUP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    onReset?.();
  };

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

  // A nestable position with an invalid Δh/h_д blocks calculation (ERR_INVALID_NESTING otherwise).
  const anyInvalid = orders.some((o) =>
    o.positions.some((p) => stepInvalid(p.state, p.stepHeight, p.height)),
  );

  const handleCalculate = () => {
    if (anyInvalid) return;
    const cargo = orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId)));
    onCalculate({ vehicle, cargo });
  };

  const rotationOptions = [
    { value: 'none' as RotationRule, label: tt('cargoType.rotation.none') },
    { value: 'yawOnly' as RotationRule, label: tt('cargoType.rotation.yawOnly') },
    { value: 'full' as RotationRule, label: tt('cargoType.rotation.full') },
  ];

  return (
    <>
      <HeroHeader />
      <main className="mx-auto max-w-[1120px] px-5 py-6 sm:px-6">
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
            userPallets={userPallets}
            onSavePreset={(p) => setUserPallets(addUserPallet(p))}
            onDeletePreset={(key) => setUserPallets(removeUserPallet(key))}
            tt={tt}
            onOrderIdChange={(orderId) => patchOrder(o.key, { orderId })}
            onPositionChange={(pid, patch) => patchPosition(o.key, pid, patch)}
            onAddPosition={() => addPosition(o.key)}
          />
        ))}
      </div>

      {/* Duplicate add-order action below the last order (E10). */}
      <div className="mt-3 flex justify-center">
        <Button variant="ghost" onClick={addOrder}>+ {tt('setup.addOrder')}</Button>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={handleDemo}>{tt('action.demo')}</Button>
        <Button variant="secondary" onClick={handleReset}>{tt('action.reset')}</Button>
        <Button variant="primary" onClick={handleCalculate} disabled={anyInvalid}>{tt('action.calculate')}</Button>
      </div>
      </main>
    </>
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
  userPallets,
  onSavePreset,
  onDeletePreset,
  tt,
  onOrderIdChange,
  onPositionChange,
  onAddPosition,
}: {
  order: OrderState;
  index: number;
  vehicle: Vehicle;
  rotationOptions: { value: RotationRule; label: string }[];
  userPallets: DimPreset[];
  onSavePreset: (p: Omit<DimPreset, 'key'>) => void;
  onDeletePreset: (key: string) => void;
  tt: (k: import('@shadrin-v/i18n').TranslationKey) => string;
  onOrderIdChange: (v: string) => void;
  onPositionChange: (pid: string, patch: Partial<PositionState>) => void;
  onAddPosition: () => void;
}) {
  // Accordion: at most one position's nesting panel is open per order (keeps the form tidy).
  const [openId, setOpenId] = useState<string | null>(null);
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
          <PositionRow
            key={p.id}
            position={p}
            index={index}
            vehicle={vehicle}
            rotationOptions={rotationOptions}
            userPallets={userPallets}
            onSavePreset={onSavePreset}
            onDeletePreset={onDeletePreset}
            tt={tt}
            open={openId === p.id}
            onSetOpen={(o) => setOpenId(o ? p.id : null)}
            onChange={(patch) => onPositionChange(p.id, patch)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setOpenId(null); // adding an article collapses the open nesting panel (E16/#1)
          onAddPosition();
        }}
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
  userPallets,
  onSavePreset,
  onDeletePreset,
  tt,
  open,
  onSetOpen,
  onChange,
}: {
  position: PositionState;
  index: number;
  vehicle: Vehicle;
  rotationOptions: { value: RotationRule; label: string }[];
  userPallets: DimPreset[];
  onSavePreset: (p: Omit<DimPreset, 'key'>) => void;
  onDeletePreset: (key: string) => void;
  tt: (k: import('@shadrin-v/i18n').TranslationKey) => string;
  open: boolean;
  onSetOpen: (open: boolean) => void;
  onChange: (patch: Partial<PositionState>) => void;
}) {
  const dimsPresent = numOr0(p.length) > 0 && numOr0(p.width) > 0 && numOr0(p.height) > 0;
  // Built-ins and the user catalogue behave alike: a preset is "selected" when its dimensions match.
  const allPallets = [...PALLET_PRESETS, ...userPallets];
  const currentPreset = allPallets.find(
    (pp) => pp.length === p.length && pp.width === p.width && pp.height === p.height,
  );
  const invalid = stepInvalid(p.state, p.stepHeight, p.height);
  let preview: StackPreview | null = null;
  if (dimsPresent && !invalid) {
    try {
      preview = computeStack(toCargo(p, 'preview'), vehicle);
    } catch {
      preview = null;
    }
  }

  // Any click outside this row (add order/position, another row, elsewhere) collapses the panel.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Listen on 'click', NOT 'mousedown': collapsing on mousedown reflows the page before mouseup,
    // so the browser dispatches the click on an ancestor instead of the button the user pressed
    // (e.g. "+ Position") and its handler never runs. On 'click' the button's React handler (root
    // delegation) fires first, then this closes the panel.
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onSetOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open, onSetOpen]);

  return (
    <div ref={rootRef} className="px-4 py-2.5">
      {/* desktop (≥xl, wider than the 1120px content): one line; below: wraps into a card.
          Tight gaps + shrinkable name/selects keep the single line comfortably inside 1120px. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 xl:flex-nowrap">
        <OrderSwatch index={index} width={12} height={26} />
        <Select
          ariaLabel={tt('cargoType.label')}
          value={currentPreset?.key ?? 'custom'}
          onChange={(key) => {
            // Picking another article collapses the nesting-rules panel (E16).
            onSetOpen(false);
            const preset = allPallets.find((pp) => pp.key === key);
            if (preset)
              onChange({ name: p.name || preset.name, length: preset.length, width: preset.width, height: preset.height });
          }}
          options={[
            { value: 'custom', label: tt('setup.vehiclePreset.custom') },
            ...allPallets.map((pp) => ({ value: pp.key, label: pp.name })),
          ]}
        />
        <span className="min-w-[5.5rem] flex-1">
          <TextField ariaLabel={tt('field.name')} value={p.name} onChange={(name) => onChange({ name })} placeholder={tt('cargoType.label')} />
        </span>
        <span className="w-24"><Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length })} /></span>
        <span className="w-24"><Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width })} /></span>
        <span className="w-24"><Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height })} /></span>
        <span className="w-20"><Measure ariaLabel={tt('field.quantity')} unit="×" value={p.quantity} onChange={(quantity) => onChange({ quantity })} align="left" /></span>
        <Segmented
          ariaLabel={tt('cargoType.nesting.label')}
          value={p.state}
          onChange={(state) => {
            onChange({ state });
            // Verschachtelt exposes nesting rules → auto-open the details panel (E9).
            if (state === 'verschachtelt') onSetOpen(true);
          }}
          options={[
            { value: 'entschachtelt', label: tt('setup.state.ent') },
            { value: 'verschachtelt', label: tt('setup.state.ver') },
          ]}
        />
        {/* fixed width + truncate so a long RU rotation label can't blow out the row width */}
        <span className="w-[10.5rem] shrink-0">
          <Select ariaLabel={tt('cargoType.rotation.label')} value={p.rotation} onChange={(rotation) => onChange({ rotation })} options={rotationOptions} className="w-full" />
        </span>
        {preview && preview.count > 0 && (
          <Chip tone={p.state === 'verschachtelt' ? 'mint' : 'default'}>
            {tt('setup.stack')} {preview.count}
          </Chip>
        )}
        <button type="button" aria-label="details" aria-expanded={open} onClick={() => onSetOpen(!open)} className="ml-auto text-muted hover:text-brand">
          {open ? '⌃' : '⌄'}
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-3 border-t border-dashed border-line bg-sub px-2 py-2">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint inline-flex items-center gap-1.5">
                {tt('cargoType.stacking.label')}
                <InfoHint ariaLabel={tt('cargoType.stacking.label')} text={tt('cargoType.stacking.hint')} />
              </span>
              <span className="w-24"><Measure ariaLabel={tt('cargoType.stacking.label')} unit="×" value={p.maxTiers} onChange={(maxTiers) => onChange({ maxTiers })} /></span>
            </label>

            {p.state === 'verschachtelt' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.nesting.mode')}</span>
                  <Select
                    ariaLabel={tt('cargoType.nesting.mode')}
                    value={p.nestingMode}
                    onChange={(nestingMode) => onChange({ nestingMode })}
                    options={[
                      { value: 'sequential' as NestingMode, label: tt('cargoType.nesting.modeSequential') },
                      { value: 'pairwise' as NestingMode, label: tt('cargoType.nesting.modePairwise') },
                    ]}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase font-semibold text-faint">
                    {tt(p.nestingMode === 'pairwise' ? 'cargoType.nesting.stepHeightPair' : 'cargoType.nesting.stepHeightSeq')}
                  </span>
                  <span className="w-24">
                    <Measure
                      ariaLabel={tt('cargoType.nesting.stepHeightSeq')}
                      value={p.stepHeight}
                      onChange={(stepHeight) => onChange({ stepHeight })}
                      invalid={invalid}
                    />
                  </span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.nesting.maxNested')}</span>
                  <span className="w-24"><Measure ariaLabel={tt('cargoType.nesting.maxNested')} unit="×" value={p.maxNested} onChange={(maxNested) => onChange({ maxNested })} /></span>
                </label>

                {p.nestingMode === 'pairwise' && (
                  <label className="flex items-center gap-2 pb-1.5 text-body">
                    <input type="checkbox" checked={p.allowUnpairedTop} onChange={(e) => onChange({ allowUnpairedTop: e.target.checked })} />
                    {tt('cargoType.nesting.allowUnpairedTop')}
                  </label>
                )}
              </>
            )}
          </div>

          {/* pallet catalogue actions — in the details panel, the row itself is already at its
              width limit (long RU labels). Name comes from the article field, fallback L×W×H. */}
          {dimsPresent && !currentPreset && (
            <div>
              <Button
                variant="ghost"
                onClick={() =>
                  onSavePreset({
                    name: p.name || `${numOr0(p.length)}×${numOr0(p.width)}×${numOr0(p.height)}`,
                    length: numOr0(p.length),
                    width: numOr0(p.width),
                    height: numOr0(p.height),
                  })
                }
              >
                {tt('setup.savePreset')}
              </Button>
            </div>
          )}
          {currentPreset && isUserPreset(currentPreset.key) && (
            <div>
              <Button variant="ghost" onClick={() => onDeletePreset(currentPreset.key)}>
                {tt('setup.deletePreset')}
              </Button>
            </div>
          )}

          {/* validation hint + live formula */}
          {p.state === 'verschachtelt' && (
            <p className={`text-caption ${invalid ? 'text-danger' : 'text-muted'}`}>
              {fillTemplate(tt('cargoType.nesting.stepHeightHint'), { H: numOr0(p.height) })}
            </p>
          )}
          {preview && (
            <div className="flex flex-wrap items-stretch gap-3 rounded-ctl bg-card px-3 py-2">
              <div className="min-w-[12rem] flex-1">
                <div className="text-caption text-muted">
                  {fillTemplate(tt('stack.result'), { count: preview.count, height: `${preview.height} mm` })}
                </div>
                <div className="mt-1 font-mono text-formula text-ink">
                  <span className="text-faint">{tt('stack.formula.label')}: </span>
                  {fillTemplate(tt(formulaKey(preview)), formulaVars(preview))}
                  {preview.cappedBy && preview.cappedBy !== 'notStackable' && (
                    <> {fillTemplate(tt('stack.formula.cap'), formulaVars(preview))}</>
                  )}
                </div>
              </div>
              {preview.count > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-label uppercase font-semibold text-faint">{tt('stack.diagram')}</span>
                  <StackDiagram preview={preview} length={numOr0(p.length)} label={tt('stack.diagram')} series={orderColorToken(index).series} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
