// A forklift parked on the warehouse floor (LKWkalk-wxi) — seen from above, like everything else on
// this surface. Decoration with a job: it says "this is a yard, not a second truck", and being drawn
// in the same millimetres as the pallets it stands next to, it also makes the 1:1 scale legible at a
// glance. A side-view silhouette would read faster but would put two projections on one drawing —
// the very confusion the side-view depth fix was about.
//
// Purely ornamental: aria-hidden and pointer-events none, so it never intercepts a drop.
export function ForkliftMark({ x, y }: { x: number; y: number }) {
  // Real proportions, in mm: body ~2300 × 1150, forks ~1200 long, mast across the front.
  const bodyW = 2300;
  const bodyH = 1150;
  const forkL = 1200;
  const stroke = 'var(--line-strong)';
  return (
    <g
      transform={`translate(${x} ${y})`}
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
      opacity={0.18}
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
    >
      {/* counterweight body */}
      <rect x={forkL} y={0} width={bodyW} height={bodyH} rx={90} />
      {/* operator cage */}
      <rect x={forkL + 780} y={190} width={780} height={770} rx={60} />
      {/* mast across the front */}
      <line x1={forkL - 60} y1={70} x2={forkL - 60} y2={bodyH - 70} strokeWidth={3} />
      {/* the two forks, reaching out to where a pallet would sit */}
      <line x1={0} y1={210} x2={forkL - 60} y2={210} strokeWidth={2.5} />
      <line x1={0} y1={bodyH - 210} x2={forkL - 60} y2={bodyH - 210} strokeWidth={2.5} />
      {/* rear wheels */}
      <line x1={forkL + 260} y1={-70} x2={forkL + 660} y2={-70} strokeWidth={4} />
      <line x1={forkL + 260} y1={bodyH + 70} x2={forkL + 660} y2={bodyH + 70} strokeWidth={4} />
    </g>
  );
}
