// Setup screen (LKWkalk-gxp, пересобран в мастер-деталь LKWkalk-5nb) — эталон
// docs/lovable/setup-reference.html, палитра/компоненты по docs/design/design-system.md
// (Direction D). Token-only, i18n de/ru, движок для предпросмотра штабеля.
// Тонкий координатор: состояние, выбор строки, персистентность, сборка Load, раскладка в две
// колонки от xl. Собственно строка (PositionRow), карточка заказа (OrderCard) и разбор правил
// (RulesPanel) живут в ./setup/ — здесь их только соединяют.
import { useEffect, useRef, useState } from 'react';
import type { Load, Vehicle } from '@shadrin-v/engine';
import { fillTemplate, stepInvalid } from './components/stackFormula';
import { useT } from '../i18n/LocaleContext';
import { Measure, Select, Button } from '../ui/primitives';
import { HeroHeader } from '../ui/HeroHeader';
import { VEHICLE_PRESETS } from '../data/presets';
import { DEMO_VARIANTS } from '../data/demo';
import { useOptionalDataProvider } from '../data/DataProviderContext';
import type { Article } from '@shadrin-v/contracts';
import { OrderCard } from './setup/OrderCard';
import { RulesPanel } from './setup/RulesPanel';
import { RULES_PANEL_ID } from './setup/PositionRow';
import { useIsWide } from './setup/useIsWide';

import {
  activeStep, applySuggestion, buildOrderColors, dimsComplete, emptyOrder,
  emptyPosition, loadSetup, lockedFieldsFrom, nextColorIndex, nextOrderNumber, numOr0, saveSetup,
  SETUP_STORAGE_KEY, toCargo,
  type LockedFields, type Num, type OrderState, type PositionState,
} from './setup/setupState';

export {
  activeStep, applySuggestion, lockedFieldsFrom, toCargo,
  type LockedFields, type OrderState, type PositionState,
};

export interface SetupScreenProps {
  initialVehicle?: Vehicle;
  initialOrders?: OrderState[];
  /** `persist: false` computes a throwaway preview (Demo) that must not overwrite the saved plan.
   *  `orderColors` maps orderId → stable palette slot so plan colours match Setup after reorder. */
  onCalculate: (load: Load, opts?: { persist?: boolean; orderColors?: Record<string, number> }) => void;
  /** Called by the reset button, so the parent can also clear the computed Ladeplan. */
  onReset?: () => void;
}

/** How long an armed delete waits before disarming itself (ADR 022). */
const ARM_TIMEOUT_MS = 4000;

/**
 * Guard for the document-level disarm listener: `true` means this event must NOT disarm the armed
 * delete. Exported only so a test can pin the detached-target case (LKWkalk-yxn) without having to
 * reach into a closure.
 *
 * Two ways an event is exempt:
 *  - it landed inside an armed-delete control (`[data-armed-delete]`) — same `closest(...)` idiom as
 *    the rootRef checks in PositionRow and ArticleCombobox;
 *  - its target is no longer connected to the document. A node detached mid-dispatch (React 18
 *    flushes discrete-event updates synchronously, so the trash button unmounts while its own click
 *    is still bubbling) carries no usable ancestry: `closest` walks the orphan subtree only and
 *    returns null, which would read as "clicked outside" and disarm. A detached target never proves
 *    an outside press, so the safe answer is to keep the control armed.
 */
export function keepsArmed(target: EventTarget | null): boolean {
  const el = target as (Element & { isConnected?: boolean }) | null;
  if (!el || typeof el.closest !== 'function') return true;
  if (el.isConnected === false) return true;
  return el.closest('[data-armed-delete]') !== null;
}

/** Which position is being examined in the rules panel: a slot in the plan, not part of it — the
 *  same view/content boundary already drawn for `bayOrder` (LKWkalk-36f). Never persisted; if the
 *  row it names disappears (deleted, or an order it belonged to was replaced), the panel simply
 *  shows its empty state instead of crashing (spec §7). */
interface Selection {
  orderKey: string;
  positionId: string;
}

// ---- component ------------------------------------------------------------
export function SetupScreen({ initialVehicle, initialOrders, onCalculate, onReset }: SetupScreenProps) {
  const tt = useT();
  const preset0 = VEHICLE_PRESETS[0];
  const defaultVehicle = (): Vehicle => ({ id: preset0.key, name: preset0.name, length: preset0.length, width: preset0.width, height: preset0.height });
  const [vehicle, setVehicle] = useState<Vehicle>(() => initialVehicle ?? loadSetup()?.vehicle ?? defaultVehicle());
  const [orders, setOrders] = useState<OrderState[]>(() => initialOrders ?? loadSetup()?.orders ?? [emptyOrder(1)]);
  // Article catalogue (Task 8): saving a row's article goes through the DataProvider seam, so it
  // must tolerate rendering outside a provider (existing tests do this).
  const dp = useOptionalDataProvider();

  // Which position's rules are open in the panel. View state only — not persisted, not part of the
  // saved draft (see the Selection doc comment above).
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedOrder = orders.find((o) => o.key === selection?.orderKey) ?? null;
  const selectedPosition = selectedOrder?.positions.find((p) => p.id === selection?.positionId) ?? null;

  // Below the two-column threshold (spec §7) the panel becomes a drawer over the list instead of a
  // sticky sidebar. `wide` picks the layout; `chipRefs` remembers each row's chip button so closing
  // the drawer can return focus to it — otherwise a keyboard user is dropped onto <body> (the same
  // class of bug fixed for ArmedDelete in LKWkalk-yxn). The Esc handler itself is wired up further
  // down (after `armed` exists — see the comment there for why the two must coordinate).
  const wide = useIsWide();
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  // Same idea, keyed the same way, for each row's article-name input — Task 7 (LKWkalk-78x) uses
  // this to return focus to a sibling row after a position delete instead of evicting it onto
  // "+ Auftrag hinzufügen" (see removePosition below).
  const nameRefs = useRef(new Map<string, HTMLInputElement>());
  const closePanel = () => {
    const id = selection?.positionId;
    setSelection(null);
    if (id) chipRefs.current.get(id)?.focus();
  };
  const drawerOpen = !wide && !!selectedPosition;

  // Demo is a transient preview: it loads the demo into state but must NOT persist over the user's
  // saved draft (QA). This one-shot flag skips the very next save (the demo state change); any later
  // edit the user makes clears it implicitly and persists as normal.
  const skipNextSaveRef = useRef(false);
  // Demo carousel position (rgv.5). Not persisted — the demo itself is transient.
  const [demoIndex, setDemoIndex] = useState(0);
  /** Which variant the form currently holds (index into DEMO_VARIANTS), or null for the user's own
   *  input. Drives the caption; cleared as soon as the user edits anything. */
  const [loadedDemo, setLoadedDemo] = useState<number | null>(null);

  // Exactly one delete may be armed at a time — one value for the whole screen, so that invariant
  // holds by construction instead of by keeping a flag per row in step (ADR 022).
  const [armed, setArmed] = useState<{ kind: 'position' | 'order'; key: string } | null>(null);

  // Esc closes the drawer. A document-level listener (not onKeyDown on the dialog element) because
  // opening the drawer does not move focus into it — the chip that opened it keeps focus, so a
  // handler scoped to the dialog's own subtree would never see the keydown bubble through it.
  // Depends on `selection` (not just the open/closed flag) so switching to a different row while
  // the drawer stays open still returns focus to THAT row's chip, not a stale one.
  //
  // Review finding (Task 6): below xl the drawer has no backdrop, so the list (and its per-row
  // ArmedDelete controls, see the `armed` effect right below) stays fully interactive while the
  // drawer is open. Without a guard, arming a delete on one row and pressing Esc to cancel it would
  // ALSO close the drawer for an unrelated row — one keypress undoing two different things the user
  // did not both ask to undo. `armed` is the more recent, more dangerous state (a slip here deletes
  // data), so it must win: while something is armed, Esc only disarms (via the effect below) and this
  // handler no-ops; the drawer only closes on a later Esc once nothing is armed.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || armed) return;
      closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // `closePanel` closes over `selection`, so it must be treated as reactive: the effect is
    // re-established (with a fresh closePanel closure) whenever selection changes, so switching to a
    // different row while the drawer stays open still returns focus to THAT row's chip.
  }, [drawerOpen, selection, armed]);

  useEffect(() => {
    if (!armed) return;
    const disarm = () => setArmed(null);
    const timer = setTimeout(disarm, ARM_TIMEOUT_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disarm();
    };
    const onOutside = (e: Event) => {
      if (keepsArmed(e.target)) return;
      disarm();
    };
    // LKWkalk-yxn: disarm on POINTERDOWN, not on click. In a real browser the click that arms a
    // trash button carries the <svg> as its target; React 18 flushes discrete-event state updates
    // synchronously, so the trash (and its <svg>) is already unmounted by the time the click
    // reaches this document listener — the guard saw a detached node, `closest` found nothing, and
    // the very gesture that armed the control disarmed it again. Nobody could ever arm it outside
    // jsdom, where `act()` defers the re-render until after dispatch. A pointerdown is evaluated
    // before that re-render (and, for the arming press, before `armed` is even set — so this
    // listener does not exist yet). The click listener stays as a keyboard-activation fallback
    // (Enter on some other button fires click but no pointerdown); `keepsArmed` makes both safe.
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [armed]);

  // Persist the working draft on every change so a page refresh does not lose input.
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    // A save means the user edited the form: what is on screen is their draft, not the demo.
    setLoadedDemo(null);
    saveSetup({ vehicle, orders });
  }, [vehicle, orders]);

  /** Fill a demo plan and compute it right away (build the Load from the demo data directly —
   *  setState is async, so we must not read it back in this tick). Transient: neither the demo setup
   *  nor its computed plan is persisted, so a reload returns to the user's pre-demo state (QA).
   *  Each click advances the carousel by one and wraps (rgv.5) — a fixed cycle, not a random pick. */
  const handleDemo = () => {
    const d = DEMO_VARIANTS[demoIndex].build();
    setDemoIndex((i) => (i + 1) % DEMO_VARIANTS.length);
    setLoadedDemo(demoIndex);
    skipNextSaveRef.current = true; // don't overwrite the saved draft with the demo
    setVehicle(d.vehicle);
    setOrders(d.orders);
    // Pin the strategy so the showcase is deterministic (4bj.12); rear loading makes the two-sided
    // fork-access position an effective constraint, so the feature is visible (4bj.13).
    onCalculate(
      {
        vehicle: d.vehicle,
        cargo: d.orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId))),
        loadingMode: 'rear',
        orderGrouping: 'strict',
      },
      { persist: false, orderColors: buildOrderColors(d.orders) },
    );
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

  const addOrder = () =>
    setOrders((os) => [...os, emptyOrder(nextOrderNumber(os), nextColorIndex(os))]);
  // Reorder an order in the list. List order = order priority → zones (strict) and packing queue
  // (densityFirst) follow it; the engine/contract are untouched (ADR 017). 4bj.11.
  const moveOrder = (key: string, dir: -1 | 1) =>
    setOrders((os) => {
      const i = os.findIndex((o) => o.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= os.length) return os;
      const next = [...os];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addPosition = (okey: string) =>
    patchOrder(okey, {
      positions: [...(orders.find((o) => o.key === okey)?.positions ?? []), emptyPosition()],
    });

  // Finding 5 (final review wave): ArmedDelete focuses its confirm button while armed, but that
  // button unmounts the instant a delete is confirmed — nothing claimed focus afterwards, so it
  // fell to <body> and a keyboard user lost their place. The "+ Auftrag hinzufügen" button above
  // the order list (`addOrderRef`) is the target for whichever outcome leaves no row of the same
  // card behind: a whole-order delete, or the cascade that replaces the last order/position with a
  // fresh empty one. When a sibling row survives (removePosition below, ordinary case), focus stays
  // inside the card instead — riding out to this button would make a keyboard user tab back through
  // the Auftrags-ID, the reorder buttons and every surviving row just to resume editing (LKWkalk-78x).
  const addOrderRef = useRef<HTMLButtonElement>(null);

  /** Remove one position from the calculation. The catalogue article is untouched — this says
   *  "not on this truck", not "no such article". An order that loses its last position goes too:
   *  an order with no positions is a state nothing can compute (ADR 022).
   *
   *  Focus (LKWkalk-78x): a sibling row of the SAME card is the natural landing spot — the next
   *  one, or the previous one if the last row was deleted. Only when the deleted position was the
   *  order's last (so the whole card disappears with it) does focus fall back to "+ Auftrag
   *  hinzufügen", same as removeOrder. `order`/`neighbour` are computed from the pre-delete state,
   *  since the position being removed is still in it at this point. */
  const removePosition = (okey: string, pid: string) => {
    setArmed(null);
    // The panel must never name a row that no longer exists, even though the derived
    // selectedPosition already resolves to null once the row is gone (belt-and-suspenders: the
    // `selection` value itself should not go on carrying a stale positionId either).
    if (selection?.positionId === pid) setSelection(null);
    const order = orders.find((o) => o.key === okey);
    const i = order?.positions.findIndex((p) => p.id === pid) ?? -1;
    const neighbour =
      order && order.positions.length > 1 ? (order.positions[i + 1] ?? order.positions[i - 1]) : undefined;
    setOrders((os) => {
      // Drop-if-now-empty applies only to the order being edited (`okey`) — filtering ALL orders
      // would also delete an unrelated order that happened to already be empty (Finding 4; not
      // reachable through the UI today, since the screen never lets an order go empty).
      const next = os
        .map((o) => (o.key === okey ? { ...o, positions: o.positions.filter((p) => p.id !== pid) } : o))
        .filter((o) => o.key !== okey || o.positions.length > 0);
      return next.length > 0 ? next : [emptyOrder(1)];
    });
    if (neighbour) nameRefs.current.get(neighbour.id)?.focus();
    else addOrderRef.current?.focus();
  };

  /** Remove a whole order. The last one is replaced by a fresh empty order, never left empty. */
  const removeOrder = (okey: string) => {
    setArmed(null);
    setOrders((os) => {
      const next = os.filter((o) => o.key !== okey);
      return next.length > 0 ? next : [emptyOrder(1)];
    });
    addOrderRef.current?.focus();
  };

  // Save (or update) a position's dimensions/rules as a catalogue article. No-op outside a
  // provider. Returns the saved Article so the caller (RulesPanel) can bind the row to it —
  // otherwise the row stays unbound after a successful save and the button never flips to
  // "update" (Finding 1).
  const saveArticle = async (p: PositionState): Promise<Article | undefined> => {
    if (!dp) return undefined;
    const itemCode = (p.articleCode ?? p.name).trim();
    if (!itemCode || !dimsComplete(p)) return undefined;
    return dp.upsertArticle({
      itemCode,
      name: p.name.trim(),
      length: numOr0(p.length),
      width: numOr0(p.width),
      height: numOr0(p.height),
      ...(numOr0(p.nestStepPairwise) > 0 ? { nestStepPairwise: numOr0(p.nestStepPairwise) } : {}),
      ...(numOr0(p.nestStepSequential) > 0 ? { nestStepSequential: numOr0(p.nestStepSequential) } : {}),
      rules: {
        state: p.state,
        nestingMode: p.nestingMode,
        rotation: p.rotation,
        ...(p.forkAccess ? { forkAccess: p.forkAccess } : {}),
        ...(p.forkAxis ? { forkAxis: p.forkAxis } : {}),
        ...(numOr0(p.maxNested) > 0 ? { maxNested: numOr0(p.maxNested) } : {}),
        ...(numOr0(p.maxTiers) > 0 ? { maxTiers: numOr0(p.maxTiers) } : {}),
        ...(p.nestingMode === 'pairwise' ? { allowUnpairedTop: p.allowUnpairedTop } : {}),
      },
    });
  };

  // A nestable position with an invalid Δh/h_д blocks calculation (ERR_INVALID_NESTING otherwise).
  const anyInvalid = orders.some((o) =>
    o.positions.some((p) => stepInvalid(p.state, activeStep(p), p.height)),
  );

  const handleCalculate = () => {
    if (anyInvalid) return;
    const cargo = orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId)));
    onCalculate({ vehicle, cargo }, { orderColors: buildOrderColors(orders) });
  };

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

      {/* Orders. Demo lives here, with the input it fills — not next to the destructive Reset (rgv.4). */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-eyebrow uppercase font-semibold text-faint">{tt('setup.orders')}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={handleDemo}>{tt('action.demo')}</Button>
          <Button ref={addOrderRef} variant="ghost" onClick={addOrder}>+ {tt('setup.addOrder')}</Button>
        </div>
      </div>
      {loadedDemo !== null && (
        // What this demo IS comes first; how to get the next one is an aside at the end (QA).
        <p className="mb-3 text-caption text-muted" data-testid="demo-caption">
          {fillTemplate(tt('setup.demoLoaded'), {
            n: loadedDemo + 1,
            total: DEMO_VARIANTS.length,
            name: tt(DEMO_VARIANTS[loadedDemo].nameKey),
          })}{' '}
          {tt(DEMO_VARIANTS[loadedDemo].hintKey)}{' '}
          <span className="text-faint">{tt('setup.demoNext')}</span>
        </p>
      )}

      {/* Master-detail (spec §7): order cards + the selected position's rules panel. From xl
          (1280px) side by side, panel ≈320px and sticky. Below that threshold (`!wide`) the list
          keeps the full width and the panel becomes a drawer over it instead — there simply isn't
          room for two columns (useIsWide). */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* gap-8 between order cards, not gap-4 (LKWkalk-9u7): a card ends with the dashed
            "+ position" strip, which reads as one more row, so at 16px two orders ran together into
            a single list. The gap between the ORDERS must beat the densest rhythm INSIDE an order
            (row divider ≈ 0, header 10px) by enough to be seen without counting — 32px does, 16px
            did not. Scale value, not a hand-picked number. */}
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {orders.map((o, oi) => (
            <OrderCard
              key={o.key}
              order={o}
              index={o.colorIndex}
              vehicle={vehicle}
              reorderable={orders.length > 1}
              canMoveUp={oi > 0}
              canMoveDown={oi < orders.length - 1}
              onMove={(dir) => moveOrder(o.key, dir)}
              onOrderIdChange={(orderId) => patchOrder(o.key, { orderId })}
              onPositionChange={(pid, patch) => patchPosition(o.key, pid, patch)}
              onAddPosition={() => addPosition(o.key)}
              armed={armed}
              onArm={(a) => setArmed(a)}
              onRemoveOrder={() => removeOrder(o.key)}
              onRemovePosition={(pid) => removePosition(o.key, pid)}
              selectedPositionId={selection?.orderKey === o.key ? selection.positionId : null}
              onSelectPosition={(pid) => setSelection({ orderKey: o.key, positionId: pid })}
              onChipRef={(pid, el) => {
                if (el) chipRefs.current.set(pid, el);
                else chipRefs.current.delete(pid);
              }}
              onNameRef={(pid, el) => {
                if (el) nameRefs.current.set(pid, el);
                else nameRefs.current.delete(pid);
              }}
            />
          ))}
        </div>
        {wide && (
          // `id` (review finding 3, final wave): stable target for the chip's `aria-controls`
          // (PositionRow.tsx) so assistive tech can relate the two, even though the panel sits after
          // the whole order list in DOM order. `<aside>` names the landmark; `w-80` replaces the
          // arbitrary `xl:w-[20rem]` with the equivalent step already on the scale (design-system.md).
          <aside id={RULES_PANEL_ID} className="w-full shrink-0 xl:sticky xl:top-4 xl:w-80">
            <RulesPanel
              // Review finding (Task 5, round 2): RulesPanel keeps its own `saveError` state, and this
              // is now a SINGLE persistent instance (unlike the old per-row accordion, which unmounted
              // with the row). Without a `key` tied to the selected row, a failed save on row A would
              // still show "Speichern fehlgeschlagen…" once the user selected row B, though B was never
              // saved. Keying on the selection forces React to remount (and so reset saveError) on
              // every row change, and on entering/leaving the empty state.
              key={selection ? `${selection.orderKey}/${selection.positionId}` : 'empty'}
              position={selectedPosition}
              orderId={selectedOrder?.orderId ?? null}
              index={selectedOrder?.colorIndex ?? 0}
              vehicle={vehicle}
              onChange={(patch) => selection && patchPosition(selection.orderKey, selection.positionId, patch)}
              onSaveArticle={() => (selectedPosition ? saveArticle(selectedPosition) : Promise.resolve(undefined))}
            />
          </aside>
        )}
      </div>

      {/* Drawer mode (Task 6, spec §7): below the two-column threshold the panel opens over the list
          on selection instead of sitting beside it. Esc closes it (via the document-level effect
          above, which fires regardless of where focus is — see that effect's comment for why) and
          focus returns to the chip that opened it (closePanel / the effect's own handler). */}
      {!wide && selectedPosition && (
        // `id` (review finding 3, final wave): lets the chip's `aria-controls` (PositionRow.tsx)
        // point at this panel too, same as the wide `<aside>` above.
        // `aria-modal` removed (review finding 4, final wave): it asserts everything else on the
        // page is inert, but focus is deliberately left wherever it was (the Esc listener on
        // `document` depends on that — see the effect above) and there is no focus trap or `inert`
        // on the list behind it. Keeping the claim without the behavior actively misleads assistive
        // tech; full modality is tracked separately (LKWkalk-tn9).
        <div
          id={RULES_PANEL_ID}
          role="dialog"
          aria-label={tt('setup.panel.rules')}
          className="fixed inset-y-0 right-0 z-30 w-full max-w-sm overflow-y-auto bg-card shadow-pop"
        >
          <RulesPanel
            key={selection ? `${selection.orderKey}/${selection.positionId}` : 'empty'}
            position={selectedPosition}
            orderId={selectedOrder?.orderId ?? null}
            index={selectedOrder?.colorIndex ?? 0}
            vehicle={vehicle}
            onChange={(patch) => selection && patchPosition(selection.orderKey, selection.positionId, patch)}
            onSaveArticle={() => (selectedPosition ? saveArticle(selectedPosition) : Promise.resolve(undefined))}
            onClose={closePanel}
          />
        </div>
      )}

      {/* Duplicate add-order action below the last order (E10). */}
      <div className="mt-3 flex justify-center">
        <Button variant="ghost" onClick={addOrder}>+ {tt('setup.addOrder')}</Button>
      </div>

      <div className="mt-6 flex justify-end gap-2">
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
