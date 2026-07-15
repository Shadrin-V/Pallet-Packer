// Cutaway SVG in mm coordinates (design-system §7). Calque background + 1000mm grid, thick vehicle
// frame, per-order colour+hatch rects. Heights from the engine (z+dz), never tier counts.
import type { Layout, Load } from '@shadrin-v/engine';
import { HatchDefs } from '../../lib/swatch';
import { topRects, sideRects, type CutRect } from './cutaway';

function gridLines(max: number, step = 1000): number[] {
  const lines: number[] = [];
  for (let v = step; v < max; v += step) lines.push(v);
  return lines;
}

export function CrossSection({
  load,
  layout,
  view,
  label,
}: {
  load: Load;
  layout: Layout;
  view: 'top' | 'side';
  label: string;
}) {
  const { length, width, height } = load.vehicle;
  const spanY = view === 'top' ? width : height;
  const rects: CutRect[] =
    view === 'top' ? topRects(load, layout) : sideRects(load, layout, height);

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-label uppercase font-semibold text-faint">{label}</figcaption>
      <svg
        viewBox={`0 0 ${length} ${spanY}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        style={{ background: 'var(--paper)', display: 'block' }}
      >
        <HatchDefs />
        {/* 1000mm grid */}
        {gridLines(length).map((x) => (
          <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={spanY} stroke="var(--grid)" strokeOpacity={0.5} strokeWidth={2} />
        ))}
        {gridLines(spanY).map((y) => (
          <line key={`hy${y}`} x1={0} y1={y} x2={length} y2={y} stroke="var(--grid)" strokeOpacity={0.5} strokeWidth={2} />
        ))}
        {/* cargo rects */}
        {rects.map((r, i) => (
          <g key={i}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#pat-${r.series})`} />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={`var(--s${r.series})`} strokeWidth={6} />
            {view === 'top' && (r.count ?? 1) > 1 && (
              <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill="var(--ink)" fontSize={220} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                ×{r.count}
              </text>
            )}
          </g>
        ))}
        {/* vehicle frame */}
        <rect x={0} y={0} width={length} height={spanY} fill="none" stroke="var(--line-strong)" strokeWidth={10} />
      </svg>
    </figure>
  );
}
