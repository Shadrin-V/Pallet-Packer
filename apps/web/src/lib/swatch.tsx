// Order identity swatches: colour + hatch (design-system §6). The hatch is mandatory — it survives
// B/W print and colour blindness. 8 motifs by series: 1 "/", 2 "\", 3 "+", 4 dots, 5 "—", 6 "|",
// 7 "#", 8 dense dots. Colours come from --s1..--s8 tokens (never hardcoded hex).
import { orderColorToken } from './orderColor';

const TILE = 8;

/** The repeating motif for a series, drawn in the given colour. Used inside <pattern>. */
function motif(series: number, color: string) {
  const line = (d: string, w = 1.4) => (
    <path d={d} stroke={color} strokeWidth={w} strokeOpacity={0.7} fill="none" />
  );
  const dot = (cx: number, cy: number, r: number) => (
    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.7} />
  );
  switch (series) {
    case 1:
      return line('M0,8 L8,0');
    case 2:
      return line('M0,0 L8,8');
    case 3:
      return line('M4,0 L4,8 M0,4 L8,4');
    case 4:
      return dot(4, 4, 1.3);
    case 5:
      return line('M0,4 L8,4');
    case 6:
      return line('M4,0 L4,8');
    case 7:
      return line('M0,3 L8,3 M0,6 L8,6 M3,0 L3,8 M6,0 L6,8', 1);
    case 8:
      return (
        <>
          {dot(2, 2, 1)}
          {dot(6, 6, 1)}
        </>
      );
    default:
      return null;
  }
}

/** One <pattern> definition for a series (userSpaceOnUse). `tile` scales the motif: the small swatch
 * uses the base 8-unit tile; the mm-scale cutaways use a much larger tile so the hatch is coarse
 * enough to survive print (incl. B/W) instead of collapsing to a sub-pixel tint. */
export function HatchPattern({ series, tile = TILE }: { series: number; tile?: number }) {
  // Concrete hex, not var(--sN): var() paints inside <pattern> do not resolve when Chrome prints,
  // so the hatch would vanish on paper. Direct elements (outline, tint) keep the token.
  const { hex } = orderColorToken(series - 1);
  return (
    <pattern
      id={`pat-${series}`}
      patternUnits="userSpaceOnUse"
      width={tile}
      height={tile}
      data-testid={`pat-${series}`}
    >
      <g transform={`scale(${tile / TILE})`}>{motif(series, hex)}</g>
    </pattern>
  );
}

/** All 8 hatch patterns — drop once per SVG document that references url(#pat-N). Pass `tile` to
 * coarsen the hatch for large (mm-scale) diagrams. */
export function HatchDefs({ tile }: { tile?: number } = {}) {
  return (
    <defs>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
        <HatchPattern key={s} series={s} tile={tile} />
      ))}
    </defs>
  );
}

/**
 * Mini order swatch (legend / order card header): colour tint + hatch. Self-contained SVG
 * (own <defs>) so it can be used anywhere without a shared pattern registry.
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
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 16"
      role="img"
      aria-label={title ?? `Auftrag ${index + 1}`}
      style={{ borderRadius: 3 }}
    >
      <defs>
        <HatchPattern series={series} />
      </defs>
      <rect width="24" height="16" fill={colorVar} fillOpacity={0.22} />
      <rect width="24" height="16" fill={`url(#pat-${series})`} />
      <rect width="24" height="16" fill="none" stroke={colorVar} strokeOpacity={0.75} />
    </svg>
  );
}
