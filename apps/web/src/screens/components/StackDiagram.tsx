// Axonometric (pseudo-3D) stack preview for the Setup screen (41e.3). Screen-only; the Ladeplan
// cutaways are unchanged. Dimension-aware: the model's length/width/height drive the projection.
// A neutral pallet base (with fork pockets) carries an order-coloured goods box; nested stacks
// telescope (step < base), entschachtelt sit flush (step = base). Heights come from the engine's
// StackPreview, never from tier counts.
import type { StackPreview } from '@shadrin-v/engine';
import { DY, boxFaces, polyPoints, project, stackViewBox, tierStep } from './stack3d';

/** Pallet-base band height cap, mm (a real EUR pallet is ~144). */
const PALLET_MAX = 150;

export function StackDiagram({
  preview,
  length,
  width,
  label,
  series = 1,
}: {
  preview: StackPreview;
  length: number;
  width: number;
  label: string;
  /** Order palette series (1..8) so the stack colour matches its order. */
  series?: number;
}) {
  const { count, height, base, hold } = preview;
  const step = tierStep(base, height, count);
  const oy = hold + width * DY;
  const vb = stackViewBox(length, width, hold);
  const color = `var(--s${series})`;
  const patId = `stack3d-h${series}`;
  const ph = Math.min(PALLET_MAX, base * 0.2);

  const p = (l: number, w: number, h: number) => project(l, w, h, 0, oy);

  return (
    <svg
      viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
      height={150}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={label}
      style={{ background: 'var(--paper)', display: 'block' }}
    >
      <defs>
        <pattern id={patId} width={150} height={150} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x2={0} y2={150} stroke={color} strokeWidth={30} opacity={0.5} />
        </pattern>
      </defs>

      {/* hold headroom frame: top face + three vertical risers, dashed */}
      <polygon
        points={polyPoints([p(0, 0, hold), p(length, 0, hold), p(length, width, hold), p(0, width, hold)])}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={1}
        strokeDasharray="7 6"
        vectorEffect="non-scaling-stroke"
      />
      {[
        [p(0, width, 0), p(0, width, hold)],
        [p(length, width, 0), p(length, width, hold)],
        [p(length, 0, 0), p(length, 0, hold)],
      ].map(([a, b], i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--line-strong)"
          strokeWidth={1}
          strokeDasharray="7 6"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* tiers, bottom → top so an upper unit overlaps the one below */}
      {Array.from({ length: count }, (_, i) => {
        const z0 = i * step;
        const pal = boxFaces(z0, length, width, ph, 0, oy);
        const goods = boxFaces(z0 + ph, length, width, base - ph, 0, oy);
        return (
          <g key={i} data-tier={i}>
            {/* pallet base — neutral */}
            <polygon points={polyPoints(pal.right)} fill="var(--sub)" stroke="var(--muted)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(pal.top)} fill="var(--card)" stroke="var(--muted)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(pal.front)} fill="var(--card)" stroke="var(--muted)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {/* fork pockets on the front face */}
            {[0.3, 0.58].map((gx) => (
              <polygon
                key={gx}
                points={polyPoints([
                  p(length * gx, 0, z0 + ph * 0.15),
                  p(length * (gx + 0.12), 0, z0 + ph * 0.15),
                  p(length * (gx + 0.12), 0, z0 + ph * 0.85),
                  p(length * gx, 0, z0 + ph * 0.85),
                ])}
                fill="var(--sub)"
                stroke="var(--faint)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* goods — order colour, shaded faces + front hatch */}
            <polygon points={polyPoints(goods.right)} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(goods.top)} fill={color} fillOpacity={0.34} stroke={color} strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(goods.front)} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(goods.front)} fill={`url(#${patId})`} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}
