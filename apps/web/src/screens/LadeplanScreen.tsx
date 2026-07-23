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
  type LoadingMode,
  type OrderGrouping,
  type StackRef,
} from '@shadrin-v/engine';
import { formatLength } from '@shadrin-v/i18n';
import { useLocale } from '../i18n/LocaleContext';
import { Button, InfoHint } from '../ui/primitives';
import { LoadingModeSwitch } from '../ui/LoadingModeSwitch';
import { BrandMark } from './components/BrandMark';
import { CrossSection } from './components/CrossSection';
import { Legend } from './components/Legend';
import { orderIndexMap } from './components/cutaway';
import { orderBreakdown } from './components/orderBreakdown';
import { fillTemplate } from './components/stackFormula';
import { orderColorToken } from '../lib/orderColor';
import { exportPlanJson, exportPlanPng } from '../lib/exportPlan';
import { snap, type StackSel } from './components/editLayout';
import { WarehouseFloor } from './components/WarehouseFloor';
import type { DropPreview } from './components/CrossSection';
import type { BufferTile } from './components/warehouseLayout';

function Figure({ value, label, danger = false }: { value: string; label: string; danger?: boolean }) {
  return (
    <div className="text-right" data-testid={danger ? 'fig-unplaced' : undefined}>
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
  ariaGroup = true,
  children,
}: {
  label: string;
  className?: string;
  /** false when a child already exposes a group with this same name (e.g. the Segmented switch) —
   *  two nested groups sharing one name are ambiguous to assistive tech. */
  ariaGroup?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-label uppercase tracking-wide text-faint">{label}</span>
      <div
        role={ariaGroup ? 'group' : undefined}
        aria-label={ariaGroup ? label : undefined}
        className="flex flex-wrap items-center gap-1.5"
      >
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
const isEditErrorKey = (code: string): code is EditErrorKey =>
  (EDIT_ERROR_KEYS as readonly string[]).includes(code);

export function LadeplanScreen({
  load,
  layout,
  orderColors,
  onLoadingModeChange,
  onOrderGroupingChange,
}: {
  load: Load;
  layout: Layout;
  /** Stable orderId→palette slot from Setup, so plan colours survive a reorder and match Setup (QA #2). */
  orderColors?: Record<string, number>;
  onLoadingModeChange?: (mode: LoadingMode) => void;
  onOrderGroupingChange?: (grouping: OrderGrouping) => void;
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
  }, [layout]);
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
  const tiles: BufferTile[] = buffer.map((b, i) => ({
    ...b,
    orientation: tileOrientation[tileKeys[i]] ?? 'lwh',
  }));
  const [dragTile, setDragTile] = useState<{ index: number; x: number; y: number } | null>(null);
  // The symmetric hold→warehouse carry (T3): the stack's own visual lives INSIDE the top-view svg and
  // is clipped the instant the pointer leaves it toward the warehouse strip below, so this page-level
  // ghost — outside that svg entirely — is what stays visible for the whole trip, same as `dragTile`
  // above covers the opposite direction.
  const [carry, setCarry] = useState<{ count: number; label: string; x: number; y: number } | null>(null);

  const rotateTile = (i: number) =>
    setTileOrientation((prev) => {
      const key = tileKeys[i];
      return { ...prev, [key]: (prev[key] ?? 'lwh') === 'lwh' ? 'wlh' : 'lwh' };
    });

  // Declared before its readers: the drop preview reads it DURING RENDER (not just from a handler),
  // so a `const` further down the body would be in the temporal dead zone by the time it is reached.
  const sheetRef = useRef<HTMLDivElement>(null);

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

  /** The aim of a carried tile, in hold mm, or null when the pointer is not over the top view.
   *  The cursor holds the stack by its middle — that is where the user is pointing — so the corner
   *  is derived from it. The magnet does the rest; it also pulls a corner back inside the hold, so
   *  aiming at the far corner means "put it in the corner" rather than "hang out and be told off". */
  const tileAim = (index: number, clientX: number, clientY: number) => {
    const at = toHoldMm(clientX, clientY);
    const tile = tiles[index];
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

  const dropTileAt = (index: number, clientX: number, clientY: number) => {
    const aim = tileAim(index, clientX, clientY);
    if (!aim) return; // released outside the hold — just put the tile back, no complaint
    // Place where the ghost said it would go. Resolving again here (rather than reusing tilePreview)
    // keeps this correct even if the release carries a position no move event reported.
    const r = resolveDrop(load, edited, aim.spec);
    applyEdit((prev) => placeStack(load, prev, { ...aim.spec, x: r.x, y: r.y }));
  };

  // A tile is carried with global listeners: the drag starts in the warehouse (HTML) and ends over
  // the cutaway (SVG), so no single element sees the whole gesture.
  useEffect(() => {
    if (!dragTile) return;
    const move = (e: PointerEvent) => setDragTile((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      dropTileAt(dragTile.index, e.clientX, e.clientY);
      setDragTile(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  /** Stacks dragged out of the hold and dropped on the strip go back to the buffer, all at once. */
  const bufferRef = useRef<HTMLDivElement>(null);
  const onDropOutside = (refs: StackRef[], clientX: number, clientY: number): boolean => {
    const box = bufferRef.current?.getBoundingClientRect();
    if (!box) return false;
    const overBuffer =
      clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
    if (overBuffer) applyEdit((prev) => unplaceStacks(load, prev, refs));
    // The answer the cutaway needs: did these stacks leave the floor? Only then may it drop them
    // from the selection — a release beside the strip is a miss, and the block is still there.
    return overBuffer;
  };
  const violations = findGeometryViolations(load, edited).length;

  // Any strategy change recomputes from scratch, discarding manual edits. `edited !== layout` holds
  // only after a manual edit (both reset to the same reference on recompute), so warn only on loss.
  const withDiscardGuard = (recompute: () => void) => {
    if (edited !== layout && !globalThis.confirm(tt('ladeplan.discardEditsConfirm'))) return;
    recompute();
  };
  const handleLoadingModeChange = (mode: LoadingMode) =>
    withDiscardGuard(() => onLoadingModeChange?.(mode));
  const handleOrderGroupingChange = (checked: boolean) =>
    withDiscardGuard(() => onOrderGroupingChange?.(checked ? 'densityFirst' : 'strict'));

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
  // hiding in the legend — but only when there is bad news to tell (rgv.7).
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
      {/* On-screen action bar (not printed). Two named groups — strategy on the left, output on the
          right — instead of one undifferentiated row of controls (rgv.3). */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 print:hidden">
        {(onLoadingModeChange || onOrderGroupingChange) && (
          <ActionGroup label={tt('ladeplan.loadingMode')} ariaGroup={false}>
            {onLoadingModeChange && (
              <>
                <LoadingModeSwitch value={load.loadingMode ?? 'combined'} onChange={handleLoadingModeChange} />
                {/* "Hinten und Seite" names the access (both doors open), not a magic mode — the hint
                    spells out that both variants are computed and the denser one is shown (QA). */}
                <InfoHint
                  ariaLabel={tt('ladeplan.loadingMode')}
                  text={tt('ladeplan.loadingModeHint')}
                />
              </>
            )}
            {onOrderGroupingChange && (
              // InfoHint is a button and must stay OUTSIDE the <label>, else clicking it would activate
              // the label and toggle the checkbox (flip the strategy just from reading the hint).
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label={tt('ladeplan.orderGrouping')}
                    checked={(load.orderGrouping ?? 'strict') === 'densityFirst'}
                    onChange={(e) => handleOrderGroupingChange(e.target.checked)}
                  />
                  <span className="truncate">{tt('ladeplan.orderGrouping')}</span>
                </label>
                <InfoHint ariaLabel={tt('ladeplan.orderGrouping')} text={tt('ladeplan.orderGroupingHint')} />
              </span>
            )}
          </ActionGroup>
        )}

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
        className="overflow-hidden rounded-card bg-card shadow-card print:rounded-none print:shadow-none"
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
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-line bg-sub px-6 py-3">
          <MetaField label={tt('ladeplan.vehicleInner')} value={dims} />
          {orderIds.length > 0 && (
            <MetaField label={tt('ladeplan.orders')} value={orderIds.join(' · ')} />
          )}
          <div className="ml-auto flex items-end gap-6">
            {figures.map((f) => (
              <Figure key={f.label} value={f.value} label={f.label} danger={f.danger} />
            ))}
          </div>
        </div>

        {/* diagrams — near-full-bleed on print for maximum width.
            Order (owner's batch): side view, then top view, then the warehouse. The hold and the
            warehouse end up adjacent, which is where the work happens — stacks travel between them. */}
        <div className="flex flex-col gap-5 px-2 py-5 print:gap-2 print:px-1 print:py-2">
          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection load={load} layout={edited} view="side" label={tt('ladeplan.side')} orderColors={orderColorMap} />
          </div>

          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection
              key={planKey}
              load={load}
              layout={edited}
              view="top"
              label={tt('ladeplan.top')}
              orderColors={orderColorMap}
              onMoveStack={onMoveStack}
              onMoveStacks={onMoveStacks}
              onRotateStack={onRotateStack}
              onDropOutside={onDropOutside}
              preview={tilePreview}
              onCarry={(p) => setCarry({ count: p.count, label: p.label, x: p.clientX, y: p.clientY })}
              onCarryEnd={() => setCarry(null)}
            />
          </div>

          {/* Workbench, not document: the warehouse sits with the top view it feeds, and prints nothing. */}
          <div ref={bufferRef} className="print:hidden">
            <WarehouseFloor
              load={load}
              tiles={tiles}
              orderColors={orderColorMap}
              onRotate={rotateTile}
              onPickUp={(index, e) => setDragTile({ index, x: e.clientX, y: e.clientY })}
              dragging={dragTile?.index ?? null}
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

      {/* The carried stack follows the cursor; pointer-events off so the drop lands on what is under it. */}
      {dragTile && (
        <div
          data-testid="drag-ghost"
          className="pointer-events-none fixed z-30 rounded-ctl border border-brand bg-card px-2 py-1 text-caption font-semibold shadow-pop"
          style={{ left: dragTile.x + 12, top: dragTile.y + 12 }}
        >
          {load.cargo.find((c) => c.id === tiles[dragTile.index]?.cargoTypeId)?.name} ×
          {tiles[dragTile.index]?.units}
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
