// Maps an order's index to its categorical identity: colour token + hatch pattern id.
// Order identity is ALWAYS colour + hatch (design-system §6) so it survives B/W print and colour
// blindness. Palette is --s1..--s8 (8 series), wrapping for more orders.

export interface OrderColorToken {
  /** 1..8 */
  series: number;
  /** SVG pattern id, e.g. "pat-1" — matches <pattern> from <HatchDefs> in swatch.tsx. */
  hatchId: string;
  /** CSS custom property for the series colour, e.g. "var(--s1)". */
  colorVar: string;
  /** Concrete hex for the series colour. Mirrors theme.css --s1..--s8. Used ONLY inside SVG
   *  `<pattern>` motifs, whose `var()` paints do not resolve when printing (Chrome) — concrete
   *  colours print reliably. Elsewhere use `colorVar`. Keep in sync with theme.css. */
  hex: string;
}

/** Concrete --s1..--s8 values (theme.css). Print-safe hatch colours. */
export const SERIES_HEX = [
  '#2e7d32', '#1565c0', '#c62828', '#8e44ad',
  '#ef6c00', '#0097a7', '#a0522d', '#b08900',
] as const;

export function orderColorToken(index: number): OrderColorToken {
  const series = (((index % 8) + 8) % 8) + 1; // 1..8, safe for negative index
  return { series, hatchId: `pat-${series}`, colorVar: `var(--s${series})`, hex: SERIES_HEX[series - 1] };
}
