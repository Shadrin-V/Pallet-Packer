// Stack schematic (E8): side elevation of one floor position's stack, drawn inside a dashed frame
// the height of the cargo hold so the headroom is visible. Decks are spaced by a uniform increment
// derived from the engine's StackPreview (count + total height) — nested decks overlap (tint darkens),
// entschachtelt decks sit flush. Illustrative; the exact count/height/formula live next to it.
import type { StackPreview } from '@shadrin-v/engine';

export function StackDiagram({
  preview,
  length,
  label,
  series = 1,
}: {
  preview: StackPreview;
  length: number;
  label: string;
  /** Order palette series (1..8) so the stack colour matches its order. */
  series?: number;
}) {
  const { count, height, base, hold } = preview;
  const inc = count > 1 ? (height - base) / (count - 1) : 0;
  const decks = Array.from({ length: Math.max(count, 0) }, (_, i) => i);
  const color = `var(--s${series})`;
  return (
    <svg
      viewBox={`0 0 ${length} ${hold}`}
      height={140}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={label}
      style={{ background: 'var(--paper)', display: 'block' }}
    >
      {/* cargo-hold headroom frame */}
      <rect
        x={0}
        y={0}
        width={length}
        height={hold}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={1}
        strokeDasharray="6 5"
        vectorEffect="non-scaling-stroke"
      />
      {decks.map((i) => {
        const y = hold - (i * inc + base);
        return (
          <rect
            key={i}
            x={0}
            y={y}
            width={length}
            height={base}
            fill={color}
            fillOpacity={0.18}
            stroke={color}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
