// Состояние экрана «Настройка» без DOM (LKWkalk-5nb): типы, умолчания, персистентность, сборка
// CargoType. Извлечено из SetupScreen.tsx дословно — поведение не менялось.
import type { CargoType, NestingMode, NestingState, RotationRule, ForkAccess, ForkAxis, Vehicle } from '@shadrin-v/engine';
import type { ArticleErpField } from '@shadrin-v/contracts';
import type { ArticleSuggestion } from '../components/ArticleCombobox';

// ---- state model ----------------------------------------------------------
export type Num = number | '';

/** Which fields ERPNext supplied for the bound article, per ADR 022 provenance — never inferred
 *  from "value present", only from `ArticleSuggestion.erpFields`. Dimensions read-only when locked
 *  here; `name` is not wired to `readOnly` (Task 4) — the field doubles as the combobox's search
 *  input, so typing must stay possible even when the name is ERP-owned. */
export type LockedFields = Partial<Record<ArticleErpField, true>>;

export interface PositionState {
  id: string;
  name: string;
  length: Num;
  width: Num;
  height: Num;
  quantity: Num;
  state: NestingState;
  rotation: RotationRule;
  forkAccess?: ForkAccess; // forklift access (ADR 018); undefined = all4
  forkAxis?: ForkAxis; // fork-entry axis for a two-sided pallet; default 'length'
  /** Constructive nesting increments (spec Q6): pairwise = top deck board thickness, sequential =
   *  the one-into-one increment. Both are physical properties, both come from the article. */
  nestStepPairwise: Num;
  nestStepSequential: Num;
  nestingMode: NestingMode;
  maxNested: Num; // nesting cap
  allowUnpairedTop: boolean; // pairwise only
  maxTiers: Num; // stacking cap
  /** Catalogue article this row is bound to; undefined = free text, not saved anywhere. */
  articleCode?: string;
  /** Constructive fields ERPNext already filled — read-only in the form (spec Q5). */
  locked?: LockedFields;
  /** Where this row was bound when the user started editing the name, and only when that article's
   *  name came from ERPNext. Drives the "the name is changed in ERPNext" notice — without it the
   *  row would simply look like free text and a save would fork a second article silently. */
  unboundFromErp?: { itemCode: string; name: string };
}

export interface OrderState {
  key: string;
  orderId: string;
  /** Stable palette slot (0-based), assigned at creation and never renumbered — so an order keeps
   *  its colour + hatch when the list is reordered, on both Setup and the Ladeplan (QA). */
  colorIndex: number;
  positions: PositionState[];
}

// ---- persistence (survives page refresh; cleared by the reset button) ---------------------------
// The persisted form is a client-side working draft. ERPNext import (future) sets the same state and
// then persists here; the source of truth for imported data stays the Sales Order. Reset clears it.
export const SETUP_STORAGE_KEY = 'ladungsplaner.setup';
export interface PersistedSetup {
  vehicle: Vehicle;
  orders: OrderState[];
}
export function loadSetup(): PersistedSetup | null {
  try {
    const raw = globalThis.localStorage?.getItem(SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSetup;
    if (parsed?.vehicle && Array.isArray(parsed.orders) && parsed.orders.length) {
      // Backfill colorIndex for drafts saved before stable colours existed (by array position).
      // Drafts saved before the two constructive steps existed carry a single `stepHeight`.
      const orders = parsed.orders.map((o, i) => ({
        ...o,
        colorIndex: o.colorIndex ?? i,
        positions: o.positions.map((p) => {
          const legacy = (p as PositionState & { stepHeight?: Num }).stepHeight;
          if (legacy === undefined) return p;
          const { stepHeight: _drop, ...rest } = p as PositionState & { stepHeight?: Num };
          return p.nestingMode === 'sequential'
            ? { ...rest, nestStepSequential: legacy, nestStepPairwise: '' as Num }
            : { ...rest, nestStepPairwise: legacy, nestStepSequential: '' as Num };
        }),
      }));
      return { ...parsed, orders };
    }
  } catch {
    /* corrupt / unavailable — ignore */
  }
  return null;
}
export function saveSetup(s: PersistedSetup): void {
  try {
    globalThis.localStorage?.setItem(SETUP_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const uid = () => crypto.randomUUID();

export const emptyPosition = (): PositionState => ({
  id: uid(),
  name: '',
  length: '',
  width: '',
  height: '',
  quantity: 1,
  state: 'entschachtelt',
  rotation: 'yawOnly',
  forkAxis: 'length',
  nestStepPairwise: '',
  nestStepSequential: '',
  nestingMode: 'pairwise',
  maxNested: '',
  allowUnpairedTop: false,
  maxTiers: '',
});

/** `colorIndex` defaults to `n - 1` (1-based n → 0-based palette slot) for the single-order
 *  call sites (initial state, reset, "collapsed to empty") where a fresh list of exactly one
 *  order always wants slot 0. `addOrder` passes an explicit slot from `nextColorIndex` instead —
 *  see that function for why the id number cannot supply it. */
export const emptyOrder = (n: number, colorIndex: number = n - 1): OrderState => ({
  key: uid(),
  orderId: `SO-${n}`,
  colorIndex,
  positions: [emptyPosition()],
});

/** Next unused SO-n suffix: the highest existing `SO-<n>` id plus one, not `os.length + 1`.
 *  Deleting an order frees no number for reuse while others survive it — otherwise a later
 *  addOrder can mint an id that collides with a surviving order (Finding 1: create SO-1/SO-2,
 *  delete SO-1, add → both `os.length + 1` formulas would land on 2 again). Orders renamed to
 *  non-`SO-n` ids are simply not counted. Colour slots are a separate concern — see
 *  `nextColorIndex` — because an id is user-editable text and a slot is not. */
export function nextOrderNumber(os: OrderState[]): number {
  const nums = os
    .map((o) => /^SO-(\d+)$/.exec(o.orderId)?.[1])
    .filter((s): s is string => s !== undefined)
    .map(Number);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

/** Next unused palette slot: the lowest non-negative integer not already held by any surviving
 *  order's `colorIndex`. Review fix (Finding 1, wave 2): deriving colorIndex from the order's id
 *  number (as `nextOrderNumber(os) - 1` once did, via emptyOrder's `n - 1` default) reused a slot
 *  the moment an order was renamed away from `SO-n` — `nextOrderNumber` cannot see it any more, so
 *  the freed-looking number it hands out can already be taken by the renamed order's OWN slot.
 *  `Auftrags-ID` is freely editable (its whole purpose is to carry the real order number), so
 *  "rename the default order, then add a second" is the ordinary first-use flow, not an edge case.
 *  Slots must therefore be tracked independently of what the id currently says. */
export function nextColorIndex(os: OrderState[]): number {
  const used = new Set(os.map((o) => o.colorIndex));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

export const numOr0 = (v: Num): number => (v === '' ? 0 : v);

export const dimsComplete = (p: PositionState): boolean =>
  numOr0(p.length) > 0 && numOr0(p.width) > 0 && numOr0(p.height) > 0;

/** The increment that belongs to the position's current nesting mode. */
export function activeStep(p: PositionState): Num {
  return p.nestingMode === 'pairwise' ? p.nestStepPairwise : p.nestStepSequential;
}

/** Which PositionState field the single on-screen step input writes to. */
export function activeStepField(p: PositionState): 'nestStepPairwise' | 'nestStepSequential' {
  return p.nestingMode === 'pairwise' ? 'nestStepPairwise' : 'nestStepSequential';
}

/** orderId → stable palette slot, sent with every computed plan so the Ladeplan colours an order the
 *  same as Setup regardless of list order (QA #2). */
export const buildOrderColors = (os: OrderState[]): Record<string, number> =>
  Object.fromEntries(os.map((o) => [o.orderId, o.colorIndex]));

/** Build the engine CargoType for a position (used for both preview and the final Load). */
export function toCargo(p: PositionState, orderId: string): CargoType {
  const step = numOr0(activeStep(p));
  const nestable = p.state === 'verschachtelt' && step > 0;
  return {
    id: p.id,
    name: p.name || p.id,
    length: numOr0(p.length),
    width: numOr0(p.width),
    height: numOr0(p.height),
    quantity: numOr0(p.quantity),
    rotation: p.rotation,
    ...(p.forkAccess === 'twoSides'
      ? { forkAccess: 'twoSides' as const, forkAxis: p.forkAxis ?? 'length' }
      : {}),
    stacking: { stackable: true, ...(numOr0(p.maxTiers) > 0 ? { maxTiers: numOr0(p.maxTiers) } : {}) },
    nesting: nestable
      ? {
          nestable: true,
          stepHeight: step,
          nestingMode: p.nestingMode,
          ...(numOr0(p.maxNested) > 0 ? { maxNested: numOr0(p.maxNested) } : {}),
          ...(p.nestingMode === 'pairwise' ? { allowUnpairedTop: p.allowUnpairedTop } : {}),
        }
      : { nestable: false },
    state: p.state,
    orderId,
  };
}

/** Locked = exactly the fields ERPNext supplied (Task 2 provenance; ADR 022 adds `name` to the
 *  set). Never inferred from "value present": a value the user typed into a field ERPNext left
 *  blank must stay editable. Shared by picking a suggestion and by binding a row to the article a
 *  save returned. */
export function lockedFieldsFrom(fields: readonly ArticleErpField[]): LockedFields {
  const locked: LockedFields = {};
  for (const f of fields) locked[f] = true;
  return locked;
}

/** Apply a picked suggestion to a position: name, constructive fields, rules; quantity untouched. */
export function applySuggestion(s: ArticleSuggestion): Partial<PositionState> {
  const r = s.rules ?? {};
  return {
    articleCode: s.itemCode,
    name: s.name,
    length: s.length ?? '',
    width: s.width ?? '',
    height: s.height ?? '',
    nestStepPairwise: s.nestStepPairwise ?? '',
    nestStepSequential: s.nestStepSequential ?? '',
    ...(r.state ? { state: r.state } : {}),
    ...(r.nestingMode ? { nestingMode: r.nestingMode } : {}),
    ...(r.rotation ? { rotation: r.rotation } : {}),
    ...(r.forkAccess ? { forkAccess: r.forkAccess } : {}),
    ...(r.forkAxis ? { forkAxis: r.forkAxis } : {}),
    ...(r.maxNested !== undefined ? { maxNested: r.maxNested } : {}),
    ...(r.maxTiers !== undefined ? { maxTiers: r.maxTiers } : {}),
    ...(r.allowUnpairedTop !== undefined ? { allowUnpairedTop: r.allowUnpairedTop } : {}),
    locked: lockedFieldsFrom(s.erpFields),
    unboundFromErp: undefined,
  };
}
