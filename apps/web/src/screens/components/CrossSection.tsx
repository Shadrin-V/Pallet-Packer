// Cutaway SVG in mm coordinates (design-system §7). Calque background + 1000mm grid, thick vehicle
// frame, per-order colour+hatch rects. Strokes use non-scaling-stroke (px widths) so lines stay
// crisp regardless of the mm→px scale. Heights from the engine (z+dz), never tier counts.
// Top view supports manual stack drag when onMoveStack is provided, and a click-to-select + 90° yaw
// rotate affordance when onRotateStack is (T5). Selection chrome is screen-only (print:hidden) — the
// printed Ladeplan shows the load, not the editing UI.
//
// A drag shows its outcome BEFORE the release (ADR 020): the engine resolves the aim on every move,
// the ghost sits where the stack would actually land — green if it may, red on the aim plus red
// outlines on whatever is in the way if it may not. The release then applies exactly what was shown;
// anything else would make the preview a lie.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { resolveDrop, type Layout, type Load, type StackRef } from '@shadrin-v/engine';
import { StackShape } from './StackShape';
import { RotateHandle } from './RotateHandle';
import { useT } from '../../i18n/LocaleContext';
import { topRects, sideRects, type CutRect } from './cutaway';
import { snap, type StackSel } from './editLayout';

/** Where a dragged stack would land, and whether it may — the engine's answer, drawn. */
export interface DropPreview {
  x: number;
  y: number;
  dx: number;
  dy: number;
  ok: boolean;
  blocking: StackRef[];
}

function gridLines(max: number, step = 1000): number[] {
  const lines: number[] = [];
  for (let v = step; v < max; v += step) lines.push(v);
  return lines;
}

interface DragState {
  sel: StackSel;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  /** The engine's verdict for the current pointer position, or null before the first move. */
  preview: DropPreview | null;
}

/** Below this pointer travel (mm) a press counts as a click (select), not a drag (move). */
const CLICK_SLOP_MM = 40;

const sameStack = (a: StackSel, b: StackSel) =>
  a.cargoTypeId === b.cargoTypeId && a.x === b.x && a.y === b.y;

export function CrossSection({
  load,
  layout,
  view,
  label,
  orderColors,
  onMoveStack,
  onRotateStack,
  onDropOutside,
  preview,
}: {
  load: Load;
  layout: Layout;
  view: 'top' | 'side';
  label: string;
  /** Stable orderId→palette slot so stack colours match the Setup screen after reorder (QA #2). */
  orderColors?: Map<string, number>;
  /** When provided (top view), stacks are draggable; called with the drop target in mm. */
  onMoveStack?: (sel: StackSel, toX: number, toY: number) => void;
  /** When provided (top view), a selected stack offers a 90° yaw rotation. */
  onRotateStack?: (sel: StackSel) => void;
  /** A stack dragged off the cutaway and dropped elsewhere (e.g. onto the buffer strip). Pointer
   *  capture keeps the events coming here even once the pointer has left this svg. */
  onDropOutside?: (sel: StackSel, clientX: number, clientY: number) => void;
  /** Preview for a drag the PARENT owns (a stack carried in from the warehouse). The component's own
   *  drags preview themselves; whichever is live gets drawn. */
  preview?: DropPreview | null;
}) {
  const tt = useT();
  const { length, width, height } = load.vehicle;
  const spanY = view === 'top' ? width : height;
  const rects: CutRect[] = view === 'top' ? topRects(load, layout, orderColors) : sideRects(load, layout, height, orderColors);
  // Side view: draw far rows before near ones, so a nearer stack overlays what it really hides.
  // Sorting by `depth` would be wrong: "hidden by two" does not mean "further back than hidden by
  // one" — that is a count, not an order. `rowY` is the order; x breaks ties, for determinism.
  const sortedRects =
    view === 'side'
      ? [...rects].sort((a, b) => (a.rowY ?? 0) - (b.rowY ?? 0) || a.x - b.x)
      : rects;
  // Uniform ×N label size across all stacks (independent of footprint), in top-view mm units.
  const countFont = width * 0.05;
  const draggable = view === 'top' && !!onMoveStack;
  const rotatable = view === 'top' && !!onRotateStack;

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sel, setSel] = useState<StackSel | null>(null);

  const toSvg = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm || !svg.createSVGPoint) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /** Ask the engine where this drag would land. Cheap enough for every pointermove: only bounds and
   *  overlap depend on position (ADR 020), so no throttling — and the ghost cannot promise what
   *  the drop would refuse, because both ask the same function. */
  const previewFor = (s: StackSel, dx: number, dy: number): DropPreview => {
    const r = rects.find((c) => c.cargoTypeId === s.cargoTypeId && c.x === s.x && c.y === s.y);
    const orientation = r?.orientation === 'wlh' ? 'wlh' : 'lwh';
    // The snap grid is the UI's own (it tidies the aim); the magnet then refines it to a real spot,
    // so the resolved coordinates are used as-is — snapping them again would undo a flush fit.
    const res = resolveDrop(
      load,
      layout,
      { cargoTypeId: s.cargoTypeId, x: snap(s.x + dx), y: snap(s.y + dy), orientation },
      { exclude: s },
    );
    return { x: res.x, y: res.y, dx: r?.w ?? 0, dy: r?.h ?? 0, ok: res.ok, blocking: res.blocking };
  };

  const onDown = (r: CutRect) => (e: ReactPointerEvent) => {
    if (!draggable) return;
    const s = toSvg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ sel: { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y }, startX: s.x, startY: s.y, dx: 0, dy: 0, preview: null });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const s = toSvg(e);
    const dx = s.x - drag.startX;
    const dy = s.y - drag.startY;
    setDrag({ ...drag, dx, dy, preview: previewFor(drag.sel, dx, dy) });
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    // Dropped outside the hold? Hand it to whoever owns that space (the buffer strip) rather than
    // clamping it back onto the floor.
    const box = svgRef.current?.getBoundingClientRect();
    const outside =
      !!box && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
    if (outside && onDropOutside) {
      onDropOutside(drag.sel, e.clientX, e.clientY);
      setSel(null);
      setDrag(null);
      return;
    }
    // A press that barely travelled is a click: select the stack (revealing the rotate action)
    // instead of moving it. Beyond the slop it is a drag → drop it at the pointer.
    if (Math.hypot(drag.dx, drag.dy) < CLICK_SLOP_MM) {
      if (rotatable) setSel((cur) => (cur && sameStack(cur, drag.sel) ? null : drag.sel));
    } else {
      // Apply what the ghost promised. Falling back to the raw aim would let the drop land somewhere
      // other than where the user watched it hover.
      const to = drag.preview ?? previewFor(drag.sel, drag.dx, drag.dy);
      onMoveStack?.(drag.sel, to.x, to.y);
      setSel(null);
    }
    setDrag(null);
  };

  return (
    <figure className="m-0 select-none">
      <figcaption className="mb-1 text-label uppercase font-semibold text-faint">{label}</figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${length} ${spanY}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        // Marks this svg as a projection of the plan: the PNG export picks the cutaways by this
        // attribute. role="img" alone would also match legend swatches and the stack diagram.
        data-cutaway={view}
        style={{ background: 'var(--paper)', display: 'block', touchAction: draggable ? 'none' : undefined }}
        onPointerMove={draggable ? onMove : undefined}
        onPointerUp={draggable ? onUp : undefined}
        onPointerDown={rotatable ? (e) => { if (e.target === svgRef.current) setSel(null); } : undefined}
      >
        {gridLines(length).map((x) => (
          <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={spanY} stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {gridLines(spanY).map((y) => (
          <line key={`hy${y}`} x1={0} y1={y} x2={length} y2={y} stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {sortedRects.map((r, i) => {
          const isDragging = drag && drag.sel.x === r.x && drag.sel.y === r.y;
          const tf = isDragging ? `translate(${drag!.dx} ${drag!.dy})` : undefined;
          // Rear rows: dim the FILL, never the outline. A low rear stack (a quarter-pallet at 864 of
          // 2650 mm) vanished when the whole group went to 0.4 — and the side view is now the first
          // thing on the sheet, so it has to stay readable behind the front row.
          const behind = view === 'side' && (r.depth ?? 0) > 0;
          const isSelected = !!sel && sameStack(sel, { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y });
          return (
            <g key={i} transform={tf} onPointerDown={draggable ? onDown(r) : undefined} style={draggable ? { cursor: 'grab' } : undefined}>
              <StackShape x={r.x} y={r.y} w={r.w} h={r.h} series={r.series} muted={behind} hatchSpacing={180} />
              {view === 'top' && (r.count ?? 1) > 1 && (
                <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill="var(--ink)" fontSize={countFont} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                  ×{r.count}
                </text>
              )}
              {isSelected && (
                <>
                  <rect
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    fill="none" stroke="var(--brand)" strokeWidth={2} strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke" pointerEvents="none" className="print:hidden"
                  />
                  <RotateHandle
                    // inset by one radius from the top-right corner so the whole handle sits inside
                    // the stack — a corner-anchored handle is clipped (and unclickable) for stacks at
                    // the truck edge (QA). Clamp the inset so it never crosses the rect's far side.
                    cx={r.x + r.w - Math.min(countFont * 0.8, r.w / 2)}
                    cy={r.y + Math.min(countFont * 0.8, r.h / 2)}
                    size={countFont * 0.8}
                    label={tt('ladeplan.rotateStack')}
                    onRotate={() => onRotateStack?.({ cargoTypeId: r.cargoTypeId, x: r.x, y: r.y })}
                  />
                </>
              )}
            </g>
          );
        })}
        {(() => {
          const shown = drag?.preview ?? preview;
          if (!shown || view !== 'top') return null;
          const tint = shown.ok ? 'var(--brand)' : 'var(--danger)';
          return (
            <g className="print:hidden" pointerEvents="none">
              {/* what is in the way — named by the engine, not guessed here */}
              {shown.blocking.map((b, i) => {
                const hit = rects.find((c) => c.cargoTypeId === b.cargoTypeId && c.x === b.x && c.y === b.y);
                return hit ? (
                  <rect
                    key={`blk${i}`}
                    data-testid="drop-blocker"
                    x={hit.x}
                    y={hit.y}
                    width={hit.w}
                    height={hit.h}
                    fill="var(--danger)"
                    fillOpacity={0.12}
                    stroke="var(--danger)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null;
              })}
              <rect
                data-testid="drop-preview"
                x={shown.x}
                y={shown.y}
                width={shown.dx}
                height={shown.dy}
                fill={tint}
                fillOpacity={0.14}
                stroke={tint}
                strokeWidth={2.5}
                strokeDasharray={shown.ok ? undefined : '8 5'}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })()}
        <rect x={0} y={0} width={length} height={spanY} fill="none" stroke="var(--line-strong)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </svg>
      {/* Vorne / Hinten belong to the TOP view and sit under it, inside its own figure (QA): both
          cutaways share the x axis (vehicle length), so one set of markers labels the pair — and
          hanging them above the side view read as if only that view had a front and a back. */}
      {view === 'top' && (
        <div className="mt-0.5 flex justify-between px-0.5 text-[10px] uppercase tracking-wide text-faint">
          <span>{tt('ladeplan.front')}</span>
          <span>{tt('ladeplan.back')}</span>
        </div>
      )}
    </figure>
  );
}
