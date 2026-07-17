// Cutaway SVG in mm coordinates (design-system §7). Calque background + 1000mm grid, thick vehicle
// frame, per-order colour+hatch rects. Strokes use non-scaling-stroke (px widths) so lines stay
// crisp regardless of the mm→px scale. Heights from the engine (z+dz), never tier counts.
// Top view supports manual stack drag (snap + revalidate) when onMoveStack is provided, and a
// click-to-select + 90° yaw rotate affordance when onRotateStack is (T5). Selection chrome is
// screen-only (print:hidden) — the printed Ladeplan shows the load, not the editing UI.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Layout, Load } from '@shadrin-v/engine';
import { HatchMarks } from '../../lib/swatch';
import { useT } from '../../i18n/LocaleContext';
import { topRects, sideRects, type CutRect } from './cutaway';
import type { StackSel } from './editLayout';

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
}

/** Below this pointer travel (mm) a press counts as a click (select), not a drag (move). */
const CLICK_SLOP_MM = 40;

const sameStack = (a: StackSel, b: StackSel) =>
  a.cargoTypeId === b.cargoTypeId && a.x === b.x && a.y === b.y;

/** Circular-arrow handle on a selected stack's top-right corner (screen only, in mm units). */
function RotateHandle({
  cx,
  cy,
  size,
  label,
  onRotate,
}: {
  cx: number;
  cy: number;
  size: number;
  label: string;
  onRotate: () => void;
}) {
  const a = size * 0.5; // arc radius
  const t = size * 0.22; // arrowhead half-height
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      role="button"
      aria-label={label}
      tabIndex={0}
      className="print:hidden"
      style={{ cursor: 'pointer' }}
      // stop the press from starting a drag of the stack underneath
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onRotate();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onRotate();
      }}
    >
      <circle r={size} fill="var(--card)" stroke="var(--brand)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* 270° arc + arrowhead: the universal "rotate 90°" mark */}
      <path
        d={`M 0 ${-a} A ${a} ${a} 0 1 1 ${-a} 0`}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path d={`M 0 ${-a - t} L 0 ${-a + t} L ${t * 1.6} ${-a} Z`} fill="var(--brand)" />
    </g>
  );
}

export function CrossSection({
  load,
  layout,
  view,
  label,
  orderColors,
  onMoveStack,
  onRotateStack,
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
}) {
  const tt = useT();
  const { length, width, height } = load.vehicle;
  const spanY = view === 'top' ? width : height;
  const rects: CutRect[] = view === 'top' ? topRects(load, layout, orderColors) : sideRects(load, layout, height, orderColors);
  // Side view: draw rear rows (higher depth) first so the front row overlays them.
  const sortedRects =
    view === 'side' ? [...rects].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0)) : rects;
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

  const onDown = (r: CutRect) => (e: ReactPointerEvent) => {
    if (!draggable) return;
    const s = toSvg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ sel: { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y }, startX: s.x, startY: s.y, dx: 0, dy: 0 });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const s = toSvg(e);
    setDrag({ ...drag, dx: s.x - drag.startX, dy: s.y - drag.startY });
  };
  const onUp = () => {
    if (!drag) return;
    // A press that barely travelled is a click: select the stack (revealing the rotate action)
    // instead of moving it. Beyond the slop it is a drag → drop it at the pointer.
    if (Math.hypot(drag.dx, drag.dy) < CLICK_SLOP_MM) {
      if (rotatable) setSel((cur) => (cur && sameStack(cur, drag.sel) ? null : drag.sel));
    } else {
      onMoveStack?.(drag.sel, drag.sel.x + drag.dx, drag.sel.y + drag.dy);
      setSel(null);
    }
    setDrag(null);
  };

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-label uppercase font-semibold text-faint">{label}</figcaption>
      {/* Vorne / Hinten sit above the diagram (out of the way of the stacks), small and muted. */}
      {view === 'side' && (
        <div className="mb-0.5 flex justify-between px-0.5 text-[10px] uppercase tracking-wide text-faint">
          <span>{tt('ladeplan.front')}</span>
          <span>{tt('ladeplan.back')}</span>
        </div>
      )}
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
          // Side view: dim rear rows (depth > 0) so back-row loads read as "behind" the front row.
          const dim = view === 'side' && (r.depth ?? 0) > 0;
          const isSelected = !!sel && sameStack(sel, { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y });
          return (
            <g key={i} transform={tf} opacity={dim ? 0.4 : undefined} onPointerDown={draggable ? onDown(r) : undefined} style={draggable ? { cursor: 'grab' } : undefined}>
              {/* solid tint base + direct-line hatch (prints, unlike a <pattern>) + colour outline */}
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`var(--s${r.series})`} fillOpacity={0.16} />
              <HatchMarks x={r.x} y={r.y} w={r.w} h={r.h} series={r.series} spacing={180} strokeWidth={1.3} opacity={0.8} />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={`var(--s${r.series})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
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
        <rect x={0} y={0} width={length} height={spanY} fill="none" stroke="var(--line-strong)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </svg>
    </figure>
  );
}
