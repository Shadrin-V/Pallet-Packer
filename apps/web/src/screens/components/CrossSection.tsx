// Cutaway SVG in mm coordinates (design-system §7). Calque background + 1000mm grid, thick vehicle
// frame, per-order colour+hatch rects. Strokes use non-scaling-stroke (px widths) so lines stay
// crisp regardless of the mm→px scale. Heights from the engine (z+dz), never tier counts.
// Top view supports manual stack drag (snap + revalidate) when onMoveStack is provided.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Layout, Load } from '@shadrin-v/engine';
import { HatchDefs } from '../../lib/swatch';
import { useT } from '../../i18n/LocaleContext';
import { topRects, sideRects, type CutRect } from './cutaway';
import type { StackSel } from './dragLayout';

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

export function CrossSection({
  load,
  layout,
  view,
  label,
  onMoveStack,
}: {
  load: Load;
  layout: Layout;
  view: 'top' | 'side';
  label: string;
  /** When provided (top view), stacks are draggable; called with the drop target in mm. */
  onMoveStack?: (sel: StackSel, toX: number, toY: number) => void;
}) {
  const tt = useT();
  const { length, width, height } = load.vehicle;
  const spanY = view === 'top' ? width : height;
  const rects: CutRect[] = view === 'top' ? topRects(load, layout) : sideRects(load, layout, height);
  // Uniform ×N label size across all stacks (independent of footprint), in top-view mm units.
  const countFont = width * 0.05;
  const draggable = view === 'top' && !!onMoveStack;

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const toSvg = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onDown = (r: CutRect) => (e: ReactPointerEvent) => {
    if (!draggable) return;
    const s = toSvg(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ sel: { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y }, startX: s.x, startY: s.y, dx: 0, dy: 0 });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const s = toSvg(e);
    setDrag({ ...drag, dx: s.x - drag.startX, dy: s.y - drag.startY });
  };
  const onUp = () => {
    if (!drag) return;
    onMoveStack?.(drag.sel, drag.sel.x + drag.dx, drag.sel.y + drag.dy);
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
        style={{ background: 'var(--paper)', display: 'block', touchAction: draggable ? 'none' : undefined }}
        onPointerMove={draggable ? onMove : undefined}
        onPointerUp={draggable ? onUp : undefined}
      >
        {/* coarse hatch tile (mm scale) so the pattern prints — incl. B/W — instead of a sub-pixel tint */}
        <HatchDefs tile={120} />
        {gridLines(length).map((x) => (
          <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={spanY} stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {gridLines(spanY).map((y) => (
          <line key={`hy${y}`} x1={0} y1={y} x2={length} y2={y} stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {rects.map((r, i) => {
          const isDragging = drag && drag.sel.x === r.x && drag.sel.y === r.y;
          const tf = isDragging ? `translate(${drag!.dx} ${drag!.dy})` : undefined;
          return (
            <g key={i} transform={tf} onPointerDown={draggable ? onDown(r) : undefined} style={draggable ? { cursor: 'grab' } : undefined}>
              {/* solid tint base (prints reliably, unlike a bare pattern fill) + hatch on top + colour outline */}
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`var(--s${r.series})`} fillOpacity={0.16} />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#pat-${r.series})`} />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={`var(--s${r.series})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              {view === 'top' && (r.count ?? 1) > 1 && (
                <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill="var(--ink)" fontSize={countFont} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                  ×{r.count}
                </text>
              )}
            </g>
          );
        })}
        <rect x={0} y={0} width={length} height={spanY} fill="none" stroke="var(--line-strong)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </svg>
    </figure>
  );
}
