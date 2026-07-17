// How a stack looks — the one place that decides it, for both the hold and the warehouse floor
// (LKWkalk-rue). A stack the packer placed and the same stack waiting on the floor are the same
// object; drawing them differently was what made the buffer read as a list of cards rather than as
// cargo you can pick up.
//
// Design-system §6: solid tint base + direct-line hatch (Chrome does not print an SVG <pattern>, so
// the hatch is real <line>s) + colour outline. Coordinates are the caller's units (mm).
import { HatchMarks } from '../../lib/swatch';

export function StackShape({
  x,
  y,
  w,
  h,
  series,
  muted = false,
  hatchSpacing = 180,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  series: number;
  /** Fade the fill and hatch — a rear row in the side view. The outline is NEVER faded: a low rear
   *  stack disappears entirely when the whole shape is dimmed (a quarter-pallet is 864 of 2650 mm). */
  muted?: boolean;
  /** Hatch pitch in the caller's units. */
  hatchSpacing?: number;
}) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={`var(--s${series})`} fillOpacity={muted ? 0.06 : 0.16} />
      <HatchMarks
        x={x}
        y={y}
        w={w}
        h={h}
        series={series}
        spacing={hatchSpacing}
        strokeWidth={1.3}
        opacity={muted ? 0.25 : 0.8}
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={`var(--s${series})`}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}
