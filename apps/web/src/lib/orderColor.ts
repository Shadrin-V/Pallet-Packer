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
}

export function orderColorToken(index: number): OrderColorToken {
  const series = (((index % 8) + 8) % 8) + 1; // 1..8, safe for negative index
  return { series, hatchId: `pat-${series}`, colorVar: `var(--s${series})` };
}
