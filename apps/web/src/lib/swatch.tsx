// Order identity marks: colour + hatch (design-system §6). The hatch is mandatory — it survives B/W
// print and colour blindness. Motifs by series: 1 "/", 2 "\", 3 "+", 4 dots, 5 "—", 6 "|", 7 "#",
// 8 dense dots. Colours come from --s1..--s8 tokens.
//
// The hatch is drawn as DIRECT <line>/<circle> elements (analytically clipped to the rect), NOT via
// an SVG <pattern>: Chrome does not print <pattern> fills (they vanish on paper), whereas direct
// stroked elements print reliably (same as the grid). Clipping is analytic so no <clipPath> is
// needed — the marks are plain children and move correctly with the top-view drag transform.
import { useId, type ReactNode } from 'react';
import { orderColorToken } from './orderColor';

/** Liang–Barsky: clip segment (x1,y1)-(x2,y2) to the axis-aligned rect; null if fully outside. */
function clipSeg(
  x1: number, y1: number, x2: number, y2: number,
  xmin: number, ymin: number, xmax: number, ymax: number,
): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const edges: [number, number][] = [
    [-dx, x1 - xmin], [dx, xmax - x1], [-dy, y1 - ymin], [dy, ymax - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null; // parallel and outside
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/**
 * Hatch marks for one series, clipped to the rect [x,y,w,h]. `spacing` is in the SVG's own units
 * (mm for cutaways, ~px for the legend swatch). Direct elements → print-safe.
 */
export function HatchMarks({
  x, y, w, h, series, spacing, strokeWidth = 1.4, opacity = 0.85,
}: {
  x: number; y: number; w: number; h: number; series: number;
  spacing: number; strokeWidth?: number; opacity?: number;
}) {
  const { colorVar } = orderColorToken(series - 1);
  const els: ReactNode[] = [];
  let k = 0;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    els.push(<line key={k++} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colorVar} strokeWidth={strokeWidth} strokeOpacity={opacity} vectorEffect="non-scaling-stroke" />);
  const dot = (cx: number, cy: number, r: number) =>
    els.push(<circle key={k++} cx={cx} cy={cy} r={r} fill={colorVar} fillOpacity={opacity} />);
  const diag = (down: boolean) => {
    for (let d = -h; d < w; d += spacing) {
      const seg = down
        ? clipSeg(x + d, y, x + d + h, y + h, x, y, x + w, y + h)
        : clipSeg(x + d, y + h, x + d + h, y, x, y, x + w, y + h);
      if (seg) line(...seg);
    }
  };
  const horiz = () => { for (let yy = y + spacing; yy < y + h; yy += spacing) line(x, yy, x + w, yy); };
  const vert = () => { for (let xx = x + spacing; xx < x + w; xx += spacing) line(xx, y, xx, y + h); };
  const dots = (r: number) => {
    for (let yy = y + spacing / 2; yy < y + h; yy += spacing)
      for (let xx = x + spacing / 2; xx < x + w; xx += spacing) dot(xx, yy, r);
  };
  const r = spacing * 0.17;
  switch (series) {
    case 1: diag(false); break;
    case 2: diag(true); break;
    case 3: horiz(); vert(); break;
    case 4: dots(r); break;
    case 5: horiz(); break;
    case 6: vert(); break;
    case 7: diag(false); diag(true); break;
    case 8: dots(r * 1.4); break;
    default: diag(false);
  }
  return <>{els}</>;
}

/**
 * Mini order swatch (legend / order card header): colour tint + hatch + outline. Self-contained SVG.
 */
export function OrderSwatch({
  index,
  width = 24,
  height = 16,
  title,
}: {
  index: number;
  width?: number;
  height?: number;
  title?: string;
}) {
  const { series, colorVar } = orderColorToken(index);
  const uid = useId();
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 16"
      role="img"
      aria-label={title ?? `Auftrag ${index + 1}`}
      data-testid={`swatch-${series}`}
      style={{ borderRadius: 3 }}
    >
      <clipPath id={`sw-${uid}`}>
        <rect width="24" height="16" />
      </clipPath>
      <rect width="24" height="16" fill={colorVar} fillOpacity={0.22} />
      <g clipPath={`url(#sw-${uid})`}>
        <HatchMarks x={0} y={0} w={24} h={16} series={series} spacing={4.5} strokeWidth={1.1} />
      </g>
      <rect width="24" height="16" fill="none" stroke={colorVar} strokeOpacity={0.75} />
    </svg>
  );
}
