// Ladeplan / result screen (LKWkalk-73u, batch-2 LKWkalk-2ll) — эталон docs/lovable/ladeplan-reference.html,
// palette per docs/design/design-system.md. Brand head + meta band + figures + top/side cutaways +
// per-order legend. All totals live in the meta band — one source (D1). A4 landscape print (theme.css).
// Domain invariant: the rendered layout must be geometry-valid (findGeometryViolations = []).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  findGeometryViolations,
  moveStack,
  moveStacks,
  orientedDims,
  placeStack,
  resolveDrop,
  rotateStack,
  stackBuffer,
  unplaceStacks,
  type EngineError,
  type Layout,
  type Load,
  type StackRef,
} from '@shadrin-v/engine';
import { formatLength } from '@shadrin-v/i18n';
import { useLocale } from '../i18n/LocaleContext';
import { Button, InfoHint } from '../ui/primitives';
import { BrandMark } from './components/BrandMark';
import { CrossSection } from './components/CrossSection';
import { Legend } from './components/Legend';
import { orderIndexMap } from './components/cutaway';
import { orderBreakdown } from './components/orderBreakdown';
import { fillTemplate } from './components/stackFormula';
import { orderColorToken } from '../lib/orderColor';
import { exportPlanJson, exportPlanPng } from '../lib/exportPlan';
import { snap, type StackSel } from './components/editLayout';
import { StackShape } from './components/StackShape';
import { WarehouseFloor } from './components/WarehouseFloor';
import type { DropPreview } from './components/CrossSection';
import { warehouseFloor, insertionIndexAt, type BufferTile } from './components/warehouseLayout';

/** Ключ режима двора (LKWkalk-77g) — свой, а не поле в `ladungsplaner.load`: это настройка вида, и
 *  класть её в сохранённый план значило бы протащить её в контракт и в экспорт JSON. */
const YARD_GROUPING_STORAGE_KEY = 'ladungsplaner.yardGrouping';
function readYardGrouping(): boolean {
  try {
    return globalThis.localStorage?.getItem(YARD_GROUPING_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
function writeYardGrouping(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(YARD_GROUPING_STORAGE_KEY, String(on));
  } catch {
    /* ignore */
  }
}

/** Показ обвеса грузовика (LKWkalk-7i6) — по той же причине своя настройка вида, а не поле плана.
 *  Умолчание ПРОТИВОПОЛОЖНО режиму двора: грузовик показан, пока его явно не выключили, поэтому
 *  здесь проверяется строка 'false', а не 'true' — отсутствующий ключ должен читаться как «показан». */
const SHOW_TRUCK_STORAGE_KEY = 'ladungsplaner.showTruck';
function readShowTruck(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHOW_TRUCK_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}
function writeShowTruck(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(SHOW_TRUCK_STORAGE_KEY, String(on));
  } catch {
    /* ignore */
  }
}

// `danger` — это ровно показатель неразмещённого. Он экранный: на печатном листе неразмещённого нет
// вовсе (x7e, решение владельца), поэтому крючок печати висит на том же флаге, что и красный цвет.
function Figure({ value, label, danger = false }: { value: string; label: string; danger?: boolean }) {
  return (
    <div
      className={`text-right${danger ? ' print:hidden' : ''}`}
      data-testid={danger ? 'fig-unplaced' : undefined}
    >
      <div
        className={`text-title font-[700] leading-none tabular-nums ${danger ? 'text-danger' : 'text-brand'}`}
      >
        {value}
      </div>
      <div className={`mt-1 text-label uppercase tracking-wide ${danger ? 'text-danger' : 'text-muted'}`}>
        {label}
      </div>
    </div>
  );
}

/** A labelled cluster of controls on the action bar — the label says what the controls do (rgv.3). */
function ActionGroup({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-label uppercase tracking-wide text-faint">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label uppercase tracking-wide text-faint">{label}</span>
      <span className="text-body font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Engine error codes are plain strings on the wire (ADR 006); only known ones have a translation. */
const EDIT_ERROR_KEYS = [
  'ERR_EDIT_NO_STACK',
  'ERR_EDIT_OVERLAP',
  'ERR_EDIT_OUT_OF_BOUNDS',
  'ERR_EDIT_FORK_ACCESS',
  'ERR_EDIT_ROTATION',
  'ERR_EDIT_NOTHING_TO_PLACE',
] as const;
type EditErrorKey = (typeof EDIT_ERROR_KEYS)[number];
/** Новый порядок загонов поверх прежнего (41e.6, спека §3 решение 7): сначала список из жеста,
 *  затем те id прежнего `bayOrder`, которых в нём нет, в прежнем относительном порядке.
 *
 *  Слияние, а не замена: жест знает только про загоны, которые СЕЙЧАС во дворе, а `bayOrder` помнит
 *  и заказы, чьи стопки временно уехали в кузов. Замена стёрла бы их, и такой заказ вернулся бы во
 *  двор на место по умолчанию, хотя пользователь его уже переставлял. Чистить список не нужно:
 *  `groupByOrder` молча игнорирует id, которых в заявке нет.
 *
 *  Экспортируется ради теста: в отрисовке двора одинокий «забытый» заказ неразличим — слияние
 *  дописывает его в конец, и туда же его кладёт `groupByOrder` как неупомянутого. */
export function mergeBayOrder(next: string[], prev: string[]): string[] {
  return [...next, ...prev.filter((id) => !next.includes(id))];
}

const isEditErrorKey = (code: string): code is EditErrorKey =>
  (EDIT_ERROR_KEYS as readonly string[]).includes(code);

export function LadeplanScreen({
  load,
  layout,
  orderColors,
  onManualEditsChange,
}: {
  load: Load;
  layout: Layout;
  /** Stable orderId→palette slot from Setup, so plan colours survive a reorder and match Setup (QA #2). */
  orderColors?: Record<string, number>;
  /** Есть ли на плане ручные правки раскладки. Выбрасывает их теперь «Рассчитать» на другом экране
   *  (5nb этап 2: переключатели стратегии уехали в шапку «Настройки»), а знает о них только этот
   *  компонент — поэтому факт сообщается наверх, а предупреждает тот, кто правки теряет. */
  onManualEditsChange?: (hasEdits: boolean) => void;
}) {
  const { locale, tt } = useLocale();
  // An unknown code would be a contract drift; show the raw code rather than an empty red line.
  const editErrorText = (code: string) => (isEditErrorKey(code) ? tt(code) : code);
  const orderColorMap = orderColors ? new Map(Object.entries(orderColors)) : undefined;
  // Editable copy for manual stack edits (drag, rotate); reset whenever a fresh layout is computed.
  const [edited, setEdited] = useState<Layout>(layout);
  useEffect(() => {
    setEdited(layout);
    setEditError(null); // the refusal spoke about the previous layout; this one is fresh
    setBufferOrder([]); // the release order spoke about the previous plan's buffer; this one is fresh
    setBayOrder([]); // порядок загонов говорил о прежнем плане — в новом этих заказов может не быть
  }, [layout]);
  // `edited !== layout` истинно только после ручной правки: пересчёт возвращает обе ссылки к одному
  // объекту. Раньше этот же признак читал withDiscardGuard прямо здесь, потому что стратегию меняли
  // тоже здесь; теперь единственное, что выбрасывает правки, — «Рассчитать» на экране «Настройка»,
  // и признак приходится сообщать наверх. Уборка гасит флаг при размонтировании (план сняли со
  // страницы — терять больше нечего).
  useEffect(() => {
    onManualEditsChange?.(edited !== layout);
    return () => onManualEditsChange?.(false);
  }, [edited, layout, onManualEditsChange]);
  // The top view keeps its own selection and drag state, and those are only meaningful for the plan
  // they were made on: a selection is a list of floor coordinates, and a recompute repacks the hold
  // underneath it. Remount it whenever a NEW layout arrives — the very event the effect above answers
  // to — so the stale block cannot survive to be drawn, counted, or dragged.
  // Manual edits go through applyEdit and never touch the `layout` PROP, so they do not remount:
  // a group stays selected after its own move and can be nudged again (design 2026-07-21).
  // The generation is a pure function of the prop's object identity — same reference in, same key
  // out — so it cannot fall out of step with the effect the way a counter bumped from a handler
  // could.
  const planGen = useRef({ layout, n: 0 });
  if (planGen.current.layout !== layout) planGen.current = { layout, n: planGen.current.n + 1 };
  const planKey = planGen.current.n;
  // The engine refuses an impossible edit and says why (ADR 019); we show that reason instead of
  // leaving the user to guess why a control seems dead (dwc.4).
  const [editError, setEditError] = useState<EngineError | null>(null);
  /** Apply an edit: keep the new layout, or keep the old one and show why it was refused.
   *  The edit runs OUTSIDE the state updater — an updater must stay pure, and this one would
   *  otherwise set the error state again on every replayed render. */
  const applyEdit = (edit: (prev: Layout) => { layout: Layout; error?: EngineError }) => {
    const { layout: next, error } = edit(edited);
    setEditError(error ?? null);
    setEdited(next);
  };
  // toX/toY are already resolved by the magnet (ADR 020) — the strict core operation gets them as
  // they are. Re-snapping here would pull a flush fit back off its neighbour's edge.
  const onMoveStack = (sel: StackSel, toX: number, toY: number) =>
    applyEdit((prev) => moveStack(load, prev, sel, toX, toY));
  // A group moves by a common DELTA, already resolved by the magnet (ADR 021) — one edit, so the
  // block either lands whole or not at all.
  const onMoveStacks = (refs: StackRef[], dx: number, dy: number) =>
    applyEdit((prev) => moveStacks(load, prev, refs, dx, dy));
  const onRotateStack = (sel: StackSel) => applyEdit((prev) => rotateStack(load, prev, sel));

  // ---- buffer (dwc.3): stacks that are not in the hold — unplaced by the packer, or pulled out by
  // hand. Tiles keep their own yaw orientation, so a stack can be turned in the buffer and only then
  // dropped in — which is the way out of "no room to rotate in place".
  // Orientation is held per TILE (06w — owner: turn ONE, not the whole article). A buffer stack has no
  // natural identity (BufferStack is just {cargoTypeId, units}), so the key is the cargo type plus its
  // occurrence in the deterministic buffer order (stackBuffer follows Load.cargo, full stacks before
  // the remainder). Stable while the buffer's composition holds; dropping a tile in or pulling one out
  // re-indexes that type's later occurrences, which is harmless — the rotated tile is the one the user
  // then drops, so its orientation is consumed before any re-index matters.
  const [tileOrientation, setTileOrientation] = useState<Record<string, 'lwh' | 'wlh'>>({});
  const buffer = stackBuffer(load, edited);
  const seenOfType: Record<string, number> = {};
  const tileKeys = buffer.map((b) => {
    const occ = (seenOfType[b.cargoTypeId] = (seenOfType[b.cargoTypeId] ?? -1) + 1);
    return `${b.cargoTypeId}#${occ}`;
  });
  // `key` rides along on each tile (an extra field WarehouseFloor never reads) so rotate/pick-up/drag
  // can still find a tile's orientation slot after `orderedTiles` below has reshuffled its position —
  // `tileOrientation` is keyed by occurrence in `stackBuffer`'s own order, not by display position.
  const tiles: (BufferTile & { key: string })[] = buffer.map((b, i) => ({
    ...b,
    key: tileKeys[i],
    orientation: tileOrientation[tileKeys[i]] ?? 'lwh',
  }));

  // ---- bufferOrder (B): an explicit, user-steered display order for the warehouse strip, layered
  // OVER `tiles`' own order rather than replacing it — `stackBuffer` is re-derived from `edited` on
  // every render (full stacks before the remainder, per Load.cargo), so there is no stable array to
  // just splice into. Holds cargo TYPE ids, not tile keys: an occurrence key would go stale the
  // instant a tile of that type is added or removed, and staleness has to be harmless here, since a
  // recompute or an unrelated edit can shuffle `tiles`' composition without the user touching the
  // strip at all.
  // `orderedTiles` reconciles the two by FIFO dequeue: group `tiles` into one queue per cargo type
  // (preserving `tiles`' own order within each), then walk `bufferOrder` and, for each type mentioned,
  // dequeue one tile of it. A repeated id in `bufferOrder` (several dropped stacks of the same type)
  // dequeues that many; an id with an empty queue (the type left the buffer) or past the end of
  // `bufferOrder` (never mentioned) simply falls through. Whatever remains in every queue once
  // `bufferOrder` is exhausted is appended in `tiles`' own order — so a type `bufferOrder` never
  // mentions keeps its default position, and the strip degrades gracefully rather than dropping tiles.
  const [bufferOrder, setBufferOrder] = useState<string[]>([]);
  const orderedTiles: (BufferTile & { key: string })[] = (() => {
    const queues = new Map<string, (BufferTile & { key: string })[]>();
    for (const t of tiles) {
      const q = queues.get(t.cargoTypeId);
      if (q) q.push(t);
      else queues.set(t.cargoTypeId, [t]);
    }
    const out: (BufferTile & { key: string })[] = [];
    for (const id of bufferOrder) {
      const q = queues.get(id);
      if (q && q.length > 0) out.push(q.shift()!);
    }
    for (const q of queues.values()) out.push(...q);
    return out;
  })();

  // ---- bayOrder (41e.6): пользовательский порядок ЗАГОНОВ, слой поверх порядка по умолчанию
  // (заявка, 8z2) — как `bufferOrder` для стопок, но без FIFO-очередей: `orderId` уникален, и
  // достаточно «упомянутые сначала, остальные следом». Неизвестные и исчезнувшие id `groupByOrder`
  // игнорирует, поэтому пересчёт плана его не ломает.
  // Не переживает перезагрузку, в отличие от `yardGrouping`: это порядок содержимого КОНКРЕТНОГО
  // плана, а не настройка вида.
  const [bayOrder, setBayOrder] = useState<string[]>([]);

  /** Заказ типа груза — он же заказ любой его стопки: броском заказ не меняется, поэтому именно он
   *  выбирает загон, в который стопка сядет (41e.2). */
  const orderOfType = (cargoTypeId: string) =>
    load.cargo.find((c) => c.id === cargoTypeId)?.orderId ?? '';

  // Режим двора (LKWkalk-77g). Настройка ВИДА, а не часть Load: в контракт и в сохранённый план не
  // входит и пересчёта не запускает, поэтому и ключ свой, отдельный от `ladungsplaner.load`.
  // Умолчание — выключено: владелец после прода 41e.2 сказал «без неё удобнее».
  const [yardGrouped, setYardGrouped] = useState(readYardGrouping);
  const changeYardGrouping = (next: boolean) => {
    setYardGrouped(next);
    writeYardGrouping(next);
  };
  // Показ грузовика (7i6). Состояние живёт здесь, а не в разрезе: тумблер ОДИН на оба вида, и
  // печать с PNG-экспортом получают его даром — оба рисуют ровно те же svg, что и экран.
  const [showTruck, setShowTruck] = useState(readShowTruck);
  const changeShowTruck = (next: boolean) => {
    setShowTruck(next);
    writeShowTruck(next);
  };

  const [dragTile, setDragTile] = useState<{ index: number; x: number; y: number; pointerId: number } | null>(null);
  // The symmetric hold→warehouse carry (T3): the stack's own visual lives INSIDE the top-view svg and
  // is clipped the instant the pointer leaves it toward the warehouse strip below, so this page-level
  // ghost — outside that svg entirely — is what stays visible for the whole trip, same as `dragTile`
  // above covers the opposite direction. The type/units/orientation fields (B) additionally drive the
  // live gap preview on the warehouse floor while this carry is in flight.
  const [carry, setCarry] = useState<{
    count: number;
    label: string;
    x: number;
    y: number;
    cargoTypeId: string;
    units: number;
    orientation: 'lwh' | 'wlh';
  } | null>(null);

  const rotateTile = (i: number) =>
    setTileOrientation((prev) => {
      const key = orderedTiles[i]?.key;
      if (!key) return prev;
      return { ...prev, [key]: (prev[key] ?? 'lwh') === 'lwh' ? 'wlh' : 'lwh' };
    });

  // Declared before its readers: the drop preview reads it DURING RENDER (not just from a handler),
  // so a `const` further down the body would be in the temporal dead zone by the time it is reached.
  const sheetRef = useRef<HTMLDivElement>(null);
  // Also declared early: `phantomAt` below (read during render, same reason as `sheetRef`) resolves
  // through it via `toWarehouseMm`.
  const bufferRef = useRef<HTMLDivElement>(null);

  /** The top-view drop target: the NESTED cargo svg (data-hold), whose viewBox is 0 0 length spanY so
   *  its CTM maps client px straight to hold mm. NOT the outer svg[data-cutaway] — that one's viewBox
   *  includes the cab/ruler gutters, so its CTM would offset every aim by the front gutter (ki1). The
   *  PNG export separately picks the outer svgs by data-cutaway; the two roles use different handles. */
  const topSvg = () => sheetRef.current?.querySelector<SVGSVGElement>('svg[data-hold="top"]') ?? null;

  /** Client point → hold coordinates (mm), or null if it is not over the top view. */
  const toHoldMm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = topSvg();
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm || !svg.createSVGPoint) return null;
    const box = svg.getBoundingClientRect();
    if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /** The warehouse's own drop target — `WarehouseFloor`'s `<svg data-warehouse>`, picked out from
   *  under `bufferRef` by that stable marker rather than `role="img"` alone, which also matches the
   *  top/side cutaways. Mirrors `toHoldMm` exactly; the two never resolve the same svg; a carry can be
   *  over at most one of them at a time. */
  const warehouseSvg = () => bufferRef.current?.querySelector<SVGSVGElement>('svg[data-warehouse]') ?? null;

  /** Client point → warehouse coordinates (mm), or null if it is not over the warehouse floor. */
  const toWarehouseMm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = warehouseSvg();
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm || !svg.createSVGPoint) return null;
    const box = svg.getBoundingClientRect();
    if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /** The aim of a carried tile, in hold mm, or null when the pointer is not over the top view.
   *  The cursor holds the stack by its middle — that is where the user is pointing — so the corner
   *  is derived from it. The magnet does the rest; it also pulls a corner back inside the hold, so
   *  aiming at the far corner means "put it in the corner" rather than "hang out and be told off". */
  const tileAim = (index: number, clientX: number, clientY: number) => {
    const at = toHoldMm(clientX, clientY);
    const tile = orderedTiles[index];
    const cargo = tile && load.cargo.find((c) => c.id === tile.cargoTypeId);
    if (!at || !cargo) return null;
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, tile.orientation);
    return {
      tile,
      dx,
      dy,
      spec: {
        cargoTypeId: tile.cargoTypeId,
        x: snap(at.x - dx / 2),
        y: snap(at.y - dy / 2),
        orientation: tile.orientation,
        units: tile.units,
      },
    };
  };

  /** What the ghost over the hold shows while a tile is carried in from the warehouse. */
  const tilePreview: DropPreview | null = (() => {
    if (!dragTile) return null;
    const aim = tileAim(dragTile.index, dragTile.x, dragTile.y);
    if (!aim) return null; // not over the hold — nothing to promise
    const r = resolveDrop(load, edited, aim.spec);
    return { x: r.x, y: r.y, dx: aim.dx, dy: aim.dy, ok: r.ok, blocking: r.blocking };
  })();

  /** The stack in hand, drawn as itself (fyk). A text chip was all that followed the cursor out of the
   *  yard, while the tile it came from stayed in its slot at opacity 0.3 — measured in a real browser,
   *  the chip was 78×26 px against a 109×73 px tile, and "did I even pick it up?" was a fair question.
   *  The opposite direction never had to ask it: a stack carried out of the hold keeps its full-size
   *  shape under the cursor the whole way (CrossSection draws it inside its own svg).
   *
   *  The size comes from the warehouse svg's screen CTM — its mm→px scale — so the ghost is exactly as
   *  big as the tile it was lifted from, and, over the top view, exactly as big as it will be when it
   *  lands: the two surfaces are 1:1 by construction (LKWkalk-6n4).
   *
   *  Null when that scale cannot be read (no svg on screen yet) — the label alone still says what is in
   *  hand rather than nothing at all. */
  const carriedGhost = (() => {
    if (!dragTile) return null;
    const tile = orderedTiles[dragTile.index];
    const cargo = tile && load.cargo.find((c) => c.id === tile.cargoTypeId);
    if (!tile || !cargo) return null;
    const label = `${cargo.name} ×${tile.units}`;
    const scale = warehouseSvg()?.getScreenCTM?.()?.a;
    if (!scale) return { label, shape: null };
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, tile.orientation);
    const slot =
      orderColorMap?.get(cargo.orderId ?? '') ?? orderIndexMap(load).get(cargo.orderId ?? '') ?? 0;
    return {
      label,
      shape: { dx, dy, w: dx * scale, h: dy * scale, series: orderColorToken(slot).series },
    };
  })();

  const dropTileAt = (index: number, clientX: number, clientY: number) => {
    const aim = tileAim(index, clientX, clientY);
    if (!aim) {
      // Released outside the hold. Over the yard, with grouping off, that is a reorder within the
      // flow — the same magnet and the same `insertionIndexAt` that already drives a carry-in from the
      // hold, only with the yard itself as the source (Task 6, owner 2026-08-03). With grouping on,
      // the order is dictated by bays, and a manual reorder here would mean something else entirely —
      // the gesture stays the no-op it already was before this task.
      if (yardGrouped) return;
      const at = toWarehouseMm(clientX, clientY);
      if (!at) return; // not over the yard either — just put the tile back, no complaint
      // No third argument: grouping is off, so `bays` is empty and the function returns a plain flow
      // index — already an index into `orderedTiles`, nothing left to translate.
      const to = insertionIndexAt(
        warehouseFloor(load, orderedTiles, { grouped: yardGrouped, bayOrder, showTruck }),
        at,
      );
      reorderYard(index, to);
      return;
    }
    // Place where the ghost said it would go. Resolving again here (rather than reusing tilePreview)
    // keeps this correct even if the release carries a position no move event reported.
    const r = resolveDrop(load, edited, aim.spec);
    applyEdit((prev) => placeStack(load, prev, { ...aim.spec, x: r.x, y: r.y }));
  };

  /** Move a yard tile from `from` to `to` in the flow order (Task 6). `to` comes from
   *  `insertionIndexAt` as an INSERTION index, computed with the moved tile still standing in its old
   *  slot — so moving it to the RIGHT needs the target reduced by one, else the removal would shift
   *  everything after it back by one and the tile would land one slot further than the point aimed at.
   *  Landing on its own slot is a no-op: a gesture that changed nothing should not be recorded, the
   *  same reasoning the bay-tag carry in `WarehouseFloor` already follows.
   *
   *  The order is stored as `cargoTypeId` strings, not tile identities (see "Известное ограничение" in
   *  the task brief): two tiles of the SAME type are interchangeable in `bufferOrder`, so a reorder
   *  aimed between or past tiles of one's own type can produce the identical string list and read as a
   *  no-op even though the gesture itself was real. This is the existing buffer-order model — the
   *  hold→yard drop path (`onDropOutside`) already has the same property — not a regression here. */
  const reorderYard = (from: number, to: number) => {
    const target = to > from ? to - 1 : to;
    if (target === from) return;
    const next = orderedTiles.map((t) => t.cargoTypeId);
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    setBufferOrder(next);
  };

  // A tile is carried with global listeners: the drag starts in the warehouse (HTML) and ends over
  // the cutaway (SVG), so no single element sees the whole gesture.
  useEffect(() => {
    if (!dragTile) return;
    // Чужой указатель жеста не ведёт (LKWkalk-zyc): второй палец не должен ни двигать, ни завершать
    // этот перенос. pointerId фиксируется при подъёме бирки и дальше только сверяется — тот же
    // приём, что у переноса загона (WarehouseFloor, 36f).
    const mine = (e: PointerEvent) => e.pointerId === dragTile.pointerId;
    const move = (e: PointerEvent) => {
      if (!mine(e)) return;
      setDragTile((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    };
    const up = (e: PointerEvent) => {
      if (!mine(e)) return;
      dropTileAt(dragTile.index, e.clientX, e.clientY);
      setDragTile(null);
    };
    // Указатель забрала система (жест ОС, переключение приложения): бросать нечего, а без этой
    // ветки слушатели оставались и призрак висел до следующего клика (zyc).
    const cancel = (e: PointerEvent) => {
      if (mine(e)) setDragTile(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  });

  /** The live gap preview (B): while a stack is carried in from the hold and the pointer is over the
   *  warehouse floor, show where it would land — spliced into `orderedTiles`' own flow so real tiles
   *  reflow around it exactly as they would once the drop actually lands there. Off the floor (or
   *  between renders, briefly), there is nothing to show. */
  // The phantom's carry source: a stack lifted OUT of the hold (`carry`), or — Task 6 — a yard tile
  // itself, lifted to be reordered WITHIN the yard (`dragTile`), but only while grouping is off: with
  // grouping on, `dropTileAt` treats a release outside the hold as a no-op (the bays dictate the
  // order there), so a phantom would promise a move that never lands.
  const carrySource: { x: number; y: number; cargoTypeId: string; units: number; orientation: 'lwh' | 'wlh' } | null =
    carry ??
    (dragTile && !yardGrouped
      ? (() => {
          const tile = orderedTiles[dragTile.index];
          return tile
            ? { x: dragTile.x, y: dragTile.y, cargoTypeId: tile.cargoTypeId, units: tile.units, orientation: tile.orientation }
            : null;
        })()
      : null);
  const phantomAt: { index: number; tile: BufferTile } | null = (() => {
    if (!carrySource) return null;
    const pt = toWarehouseMm(carrySource.x, carrySource.y);
    if (!pt) return null;
    // Тот же режим, что рисует двор: иначе магнит целился бы в загоны, которых на экране нет. И тот
    // же ПОРЯДОК: вызовов `warehouseFloor` на этом экране три (отрисовка, `phantomAt`,
    // `onDropOutside`), и разошедшийся `bayOrder` целит магнит ровно туда же — в загоны, которых на
    // экране нет (грабли 77g, находка №4).
    const index = insertionIndexAt(
      warehouseFloor(load, orderedTiles, { grouped: yardGrouped, bayOrder, showTruck }),
      pt,
      { orderId: orderOfType(carrySource.cargoTypeId) },
    );
    return {
      index,
      tile: { cargoTypeId: carrySource.cargoTypeId, units: carrySource.units, orientation: carrySource.orientation },
    };
  })();

  /** Stacks dragged out of the hold and dropped on the strip go back to the buffer, all at once. */
  const onDropOutside = (refs: StackRef[], clientX: number, clientY: number): boolean => {
    const box = bufferRef.current?.getBoundingClientRect();
    if (!box) return false;
    const overBuffer =
      clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
    if (overBuffer) {
      // Land the dropped stacks where the user released them (B), not wherever `stackBuffer` happens
      // to re-emit them next render: snapshot the CURRENT display order, splice the dropped types in
      // at the release point, and store that as the new `bufferOrder`. The dropped stacks are not in
      // `tiles` yet — `unplaceStacks` runs below, and `edited` only updates on the next render — but
      // that is fine: once they appear, `orderedTiles`' FIFO dequeue places them per the order just
      // recorded here, correct by construction. `toWarehouseMm` returning null (pointer strayed off
      // the warehouse svg for this one event) falls back to the pre-B behaviour: unplace without
      // reordering, rather than lose the drop.
      const pt = toWarehouseMm(clientX, clientY);
      if (pt) {
        // Якорь берётся по заказу ПЕРВОЙ стопки группы: групповой бросок может смешивать заказы, но
        // раскладка всё равно разведёт их по своим загонам — точка броска задаёт лишь относительное
        // место внутри своего загона.
        // Тот же режим, что рисует двор (77g): с выключенной группировкой загонов нет, и точка
        // броска задаёт место в общем потоке — поведение до 41e.2. И тот же ПОРЯДОК загонов
        // (41e.6): третий из трёх вызовов `warehouseFloor`, и разойтись ему нельзя ровно так же.
        const idx = insertionIndexAt(
          warehouseFloor(load, orderedTiles, { grouped: yardGrouped, bayOrder, showTruck }),
          pt,
          { orderId: orderOfType(refs[0].cargoTypeId) },
        );
        const snapshot = orderedTiles.map((t) => t.cargoTypeId);
        snapshot.splice(idx, 0, ...refs.map((r) => r.cargoTypeId));
        setBufferOrder(snapshot);
      }
      applyEdit((prev) => unplaceStacks(load, prev, refs));
    }
    // The answer the cutaway needs: did these stacks leave the floor? Only then may it drop them
    // from the selection — a release beside the strip is a miss, and the block is still there.
    return overBuffer;
  };
  const violations = findGeometryViolations(load, edited).length;

  const v = load.vehicle;
  const grp = (mm: number) => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'de-DE').format(mm);
  const dims = `${grp(v.length)} × ${grp(v.width)} × ${formatLength(v.height, locale)}`;
  const orderIds = [...orderIndexMap(load).keys()].filter(Boolean);
  const m = edited.metrics;

  // Export (qrd.15) — always of `edited`, i.e. exactly what is on screen. PDF reuses the tuned A4
  // print sheet via the browser dialog; PNG recomposes the live cutaways off the sheet.
  // Single source for the summary figures: the meta band renders these, and the PNG carries the
  // same objects — the exported sheet cannot disagree with the screen it depicts.
  // Unplaced is the plan's worst news, so it rides with the figures (in danger colour) rather than
  // hiding in the legend — but only when there is bad news to tell (rgv.7). Это верно для ЭКРАНА:
  // с печатного листа неразмещённое убрано целиком (x7e, решение владельца) — и показатель здесь, и
  // приписки в легенде. PNG-экспорт ниже неразмещённое по-прежнему несёт.
  const unplacedTotal = edited.unplaced.reduce((sum, u) => sum + u.count, 0);
  const figures = [
    { label: tt('ladeplan.fig.pallets'), value: grp(m.totalPlaced) },
    { label: tt('ladeplan.fig.positions'), value: String(m.usedFloorPositions) },
    // "Заполнение пола", not just "Заполнение": next to the volume figure, the bare word is
    // ambiguous — and the precise strings already existed for the row this band replaces.
    { label: tt('results.floorFillPercent'), value: `${Math.round(m.floorFillPercent)} %` },
    { label: tt('results.volumeFillPercent'), value: `${Math.round(m.volumeFillPercent)} %` },
    ...(unplacedTotal > 0
      ? [{ label: tt('ladeplan.unplacedFig'), value: grp(unplacedTotal), danger: true }]
      : []),
  ];
  const handleExportPng = async () => {
    // The caption comes from the svg being exported, not from its position: a hard-coded array
    // indexed by DOM order would swap the captions the moment the sections are reordered — silently,
    // in a file the user sends on to someone else.
    const captionOf: Record<string, string> = { top: tt('ladeplan.top'), side: tt('ladeplan.side') };
    // Cutaways only — `role="img"` alone would also drag in legend swatches and stack diagrams.
    const svgs = [...(sheetRef.current?.querySelectorAll<SVGSVGElement>('svg[data-cutaway]') ?? [])];
    try {
      await exportPlanPng(v.name, {
        title: v.name,
        meta: [
          `${tt('ladeplan.vehicleInner')}: ${dims}`,
          ...(orderIds.length ? [`${tt('ladeplan.orders')}: ${orderIds.join(' · ')}`] : []),
        ],
        figures,
        legend: orderBreakdown(load, edited, orderColorMap).map((o) => ({
          // Unplaced units must travel with the image: an exported plan that silently omits them
          // reads as "everything fits" to whoever receives the PNG.
          label: `${o.orderId} — ${o.items
            .map(
              (it) =>
                `${it.name} ×${it.placed}` +
                (it.unplaced > 0
                  ? ` (${fillTemplate(tt('ladeplan.notPlaced'), { n: it.unplaced })})`
                  : ''),
            )
            .join(', ')}`,
          color: orderColorToken(o.colorIndex).colorVar,
        })),
        sections: svgs.map((svg) => ({ caption: captionOf[svg.dataset.cutaway ?? ''] ?? '', svg })),
      });
    } catch (err) {
      // Keep a trace: without it a prod report of "export does nothing" is undiagnosable.
      console.error('plan export failed', err);
      globalThis.alert(tt('action.exportFailed'));
    }
  };

  return (
    <main
      data-violations={violations}
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 print:max-w-none print:p-0"
    >
      {/* On-screen action bar (not printed). Стратегия отсюда уехала (5nb этап 2, решение
          владельца 2): её переключатели живут в липкой шапке «Настройки», которая и так всегда на
          экране, — два контрола с одним и тем же именем на одной странице были лишними и для
          скринридера, и для глаза. Здесь остался только вывод. */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 print:hidden">
        {/* Показ грузовика (7i6) — переключатель ПРЕДСТАВЛЕНИЯ, и живёт он над той поверхностью,
            которую меняет, ровно как флажок загонов над двором. В липкую шапку «Настройки» не
            уехал: там переключатели, гоняющие пересчёт, а этот не трогает ни план, ни контракт. */}
        <label className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
          <input
            type="checkbox"
            checked={showTruck}
            onChange={(e) => changeShowTruck(e.target.checked)}
          />
          <span>{tt('ladeplan.showTruck')}</span>
        </label>
        {/* Output group. PDF deliberately routes through the same print dialog as "Drucken" — the
            A4 sheet IS the report; the hint tells the user to pick "save as PDF" there. */}
        <ActionGroup label={tt('action.export')} className="ml-auto">
          <Button variant="secondary" onClick={() => window.print()}>
            {tt('action.exportPdf')}
          </Button>
          {/* aria-label must differ from the PDF button's own name, else the two are indistinguishable. */}
          <InfoHint
            ariaLabel={`${tt('action.export')} ${tt('action.exportPdf')}`}
            text={tt('action.exportPdfHint')}
            align="right"
          />
          <Button variant="secondary" onClick={handleExportPng}>
            {tt('action.exportPng')}
          </Button>
          <Button variant="secondary" onClick={() => exportPlanJson(load, edited)}>
            {tt('action.exportJson')}
          </Button>
          <span className="ml-2 border-l border-line pl-3">
            <Button variant="primary" onClick={() => window.print()}>
              {tt('action.print')}
            </Button>
          </span>
        </ActionGroup>
      </div>

      <div
        ref={sheetRef}
        /* `plan-sheet` — крючок для печати: в @media print лист становится колонкой ровно в одну
           страницу A4, а разрезы делят её остаток (7hx, theme.css). */
        className="plan-sheet overflow-hidden rounded-card bg-card shadow-card print:overflow-visible print:rounded-none print:shadow-none"
      >
        {/* brand head */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5 print:py-2">
          <BrandMark />
          <div className="text-right">
            <div className="text-label uppercase tracking-wider text-faint">{tt('ladeplan.kicker')}</div>
            <h1 className="mt-0.5 text-title font-[650]">{v.name}</h1>
          </div>
        </div>

        {/* meta band + figures */}
        {/* Печать: те же поля теснее (print:gap-*) — на A4 сводка так укладывается в ОДНУ строку
            вместо двух, и высвободившиеся ~13 мм достаются разрезам (7hx). Не влезло — перенос
            по-прежнему работает, лист просто отдаёт разрезам меньше. */}
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-line bg-sub px-6 py-3 print:gap-x-6 print:py-2">
          <MetaField label={tt('ladeplan.vehicleInner')} value={dims} />
          {orderIds.length > 0 && (
            <MetaField label={tt('ladeplan.orders')} value={orderIds.join(' · ')} />
          )}
          <div className="ml-auto flex items-end gap-6 print:gap-4">
            {figures.map((f) => (
              <Figure key={f.label} value={f.value} label={f.label} danger={f.danger} />
            ))}
          </div>
        </div>

        {/* diagrams — near-full-bleed on print for maximum width.
            Order (owner's batch): side view, then top view, then the warehouse. The hold and the
            warehouse end up adjacent, which is where the work happens — stacks travel between them. */}
        <div className="plan-figures flex flex-col gap-5 px-2 py-5 print:gap-2 print:px-1 print:py-2">
          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection load={load} layout={edited} view="side" label={tt('ladeplan.side')} orderColors={orderColorMap} showTruck={showTruck} />
          </div>

          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection
              key={planKey}
              load={load}
              layout={edited}
              view="top"
              label={tt('ladeplan.top')}
              orderColors={orderColorMap}
              showTruck={showTruck}
              onMoveStack={onMoveStack}
              onMoveStacks={onMoveStacks}
              onRotateStack={onRotateStack}
              onDropOutside={onDropOutside}
              preview={tilePreview}
              onCarry={(p) =>
                setCarry({
                  count: p.count,
                  label: p.label,
                  x: p.clientX,
                  y: p.clientY,
                  cargoTypeId: p.cargoTypeId,
                  units: p.units,
                  orientation: p.orientation,
                })
              }
              onCarryEnd={() => setCarry(null)}
            />
          </div>

          {/* Workbench, not document: the warehouse sits with the top view it feeds, and prints nothing. */}
          <div ref={bufferRef} className="print:hidden">
            <WarehouseFloor
              load={load}
              tiles={orderedTiles}
              orderColors={orderColorMap}
              onRotate={rotateTile}
              onPickUp={(index, e) => setDragTile({ index, x: e.clientX, y: e.clientY, pointerId: e.pointerId })}
              dragging={dragTile?.index ?? null}
              phantomAt={phantomAt}
              grouped={yardGrouped}
              onGroupedChange={changeYardGrouping}
              bayOrder={bayOrder}
              onBayOrderChange={(next) => setBayOrder((prev) => mergeBayOrder(next, prev))}
              showTruck={showTruck}
            />
            {editError && (
              <p role="status" data-testid="edit-error" className="mt-2 text-caption font-semibold text-danger">
                {editErrorText(editError.code)}
              </p>
            )}
          </div>
        </div>

        {/* foot: the per-order breakdown. All totals live in the meta band — one source, said once (D1). */}
        <div className="flex flex-col gap-4 border-t border-line px-6 py-4 print:gap-2 print:py-2" style={{ breakInside: 'avoid' }}>
          <Legend load={load} layout={edited} label={tt('ladeplan.legend')} orderColors={orderColorMap} />
        </div>
      </div>

      {/* The carried stack follows the cursor; pointer-events off so the drop lands on what is under it.
          Centred on the cursor rather than offset from it, because that is where the drop resolves:
          `tileAim` reads the pointer as the stack's MIDDLE (`snap(at.x − dx / 2)`), so a ghost drawn
          down-right of the cursor would promise a landing spot the release does not use. */}
      {dragTile && carriedGhost && (
        <div
          data-testid="drag-ghost"
          className="pointer-events-none fixed z-30"
          style={
            carriedGhost.shape
              ? {
                  left: dragTile.x - carriedGhost.shape.w / 2,
                  top: dragTile.y - carriedGhost.shape.h / 2,
                }
              : { left: dragTile.x + 12, top: dragTile.y + 12 }
          }
        >
          {carriedGhost.shape && (
            <svg
              data-testid="drag-ghost-shape"
              width={carriedGhost.shape.w}
              height={carriedGhost.shape.h}
              viewBox={`0 0 ${carriedGhost.shape.dx} ${carriedGhost.shape.dy}`}
              aria-hidden="true"
              style={{ display: 'block', overflow: 'visible' }}
            >
              <StackShape
                x={0}
                y={0}
                w={carriedGhost.shape.dx}
                h={carriedGhost.shape.dy}
                series={carriedGhost.shape.series}
                hatchSpacing={180}
                backing
              />
            </svg>
          )}
          {/* The name rides just below the shape, absolutely placed so it cannot resize the ghost —
              the box IS the stack's footprint, and the centring arithmetic above depends on that. */}
          <span
            className={`whitespace-nowrap rounded-ctl border border-brand bg-card px-2 py-1 text-caption font-semibold shadow-pop${
              carriedGhost.shape ? ' absolute left-1/2 top-full -translate-x-1/2' : ''
            }`}
          >
            {carriedGhost.label}
          </span>
        </div>
      )}

      {/* The symmetric direction: a stack carried OUT of the hold toward the warehouse strip. Its own
          visual is inside the cutaway svg and gets clipped the moment the cursor leaves it — this
          page-level twin stays visible over the whole page, including the warehouse below. */}
      {carry && (
        <div
          data-testid="hold-drag-ghost"
          className="pointer-events-none fixed z-30 rounded-ctl border border-brand bg-card px-2 py-1 text-caption font-semibold shadow-pop"
          style={{ left: carry.x + 12, top: carry.y + 12 }}
        >
          {carry.label} ×{carry.count}
        </div>
      )}
    </main>
  );
}
