// The warehouse floor's scenery (LKWkalk-41e.5) — a top-down yard the owner drew: dock edges with
// crates/racks on the left, a forklift facing UP toward the truck on the right, and open asphalt with
// a lane marking in between. It replaces the hand-drawn ForkliftMark: instead of parking one line-art
// forklift in a free corner, the whole surface reads as a yard, and the real buffer stacks (hatched,
// coloured, ×N) sit on top and dominate.
//
// Why a raster asset and not the flat currentColor vector the original brief asked for: the art is a
// pencil-textured render whose value IS its texture and shading — flattening it to line-art throws
// that away, and auto-tracing produced 3.3 MB of junk. So it stays PNG (the project's own lesson:
// don't hand-vectorise realistic illustrations). Trade-off: it does not recolour with the theme token;
// it is a fixed warm-grey, held muted by OPACITY so the coloured stacks always win.
//
// Why it lives INSIDE the floor's <svg> (mm space) and not as a CSS background: this surface's whole
// contract is a 1:1 scale locked to the hold by a shared viewBox width, and the file that hosts it
// warns that ANY px-level drift breaks that. Embedded as <image>/<pattern> in the same mm coordinates,
// the backdrop shares the tiles' scale by construction — it can never drift.
//
// The scenery is a FIXED size, not scaled to the floor's depth (owner's call, 41e.5): the buffer floor
// grows deeper as stacks wrap into more rows, but the forklift and docks must not balloon with it. So
// the caps and the lane band are scaled to one fixed `unit` = the natural yard depth (a truck width),
// pinned to the TOP (the truck side); a floor deeper than that shows open asphalt below, never a bigger
// forklift. Composition, bottom to top: flat asphalt fills the whole floor (seamless at any depth) →
// the lane/texture band tiles across the top at `unit` height → the two docks are painted over the
// edges. The band and caps share one scale, so the lane runs unbroken from dock to dock.
import leftUrl from '../../assets/warehouse-floor-left.png';
import centerUrl from '../../assets/warehouse-floor-center.png';
import rightUrl from '../../assets/warehouse-floor-right.png';

/** Native pixel dimensions of the owner's slices — the caps and centre tile share one height (941),
 *  so a single scale s = unit / natH maps all three into mm with no distortion. */
export const WAREHOUSE_ASSET = { natH: 941, leftW: 252, centerW: 75, rightW: 458 } as const;

/** The flat asphalt tone sampled from the centre slice (its lane-free asphalt) — fills the whole floor
 *  under the tiled band so any depth below the band reads as the same open asphalt, with no seam. */
const ASPHALT = '#d9d4ce';

/** Muted so the coloured, hatched real stacks always dominate. The brief's 0.1 was for schematic
 *  line-art; a pencil render at 0.1 would vanish, so this is tuned by eye in a real screenshot. */
const OPACITY = 0.55;

const PATTERN_ID = 'warehouse-floor-tile';

/** The yard behind the buffer's stacks. `width`/`height` are the floor surface in mm (the same units
 *  the tiles are laid out in): width = vehicle length, height grows with the buffer's depth.
 *  `sceneryDepth` is the fixed yard depth the docks and lane are scaled to (the vehicle width) — the
 *  scenery never grows past it, so a deep buffer shows open asphalt rather than a giant forklift. */
export function WarehouseBackdrop({
  width,
  height,
  sceneryDepth,
}: {
  width: number;
  height: number;
  sceneryDepth: number;
}) {
  const { natH, leftW, centerW, rightW } = WAREHOUSE_ASSET;
  // The scenery's vertical unit: the fixed yard depth, but never taller than the floor itself (a
  // shallow one-row floor shrinks the docks to fit rather than overflowing — they only ever shrink,
  // never balloon). One uniform scale for every slice keeps each undistorted and the lane aligned.
  const unit = Math.min(height, sceneryDepth);
  const s = unit / natH; // mm per native px
  const capL = leftW * s;
  const capR = rightW * s;
  const tileW = centerW * s;
  return (
    <g aria-hidden="true" pointerEvents="none" opacity={OPACITY} data-testid="warehouse-backdrop">
      <defs>
        {/* One asphalt column (with the lane), repeated along x at the unit height. Its aspect matches
            the source slice, so preserveAspectRatio="none" fills each tile edge-to-edge without
            distorting — no gaps, no smear, and the lane meets the caps' lane at the same height. */}
        <pattern id={PATTERN_ID} patternUnits="userSpaceOnUse" x={0} y={0} width={tileW} height={unit}>
          <image href={centerUrl} x={0} y={0} width={tileW} height={unit} preserveAspectRatio="none" />
        </pattern>
      </defs>
      {/* Open asphalt on the full floor — any depth below the top band reads as this same tone. */}
      <rect data-floor x={0} y={0} width={width} height={height} fill={ASPHALT} />
      {/* Lane + texture band across the top (truck side), fixed depth. */}
      <rect data-lane-band x={0} y={0} width={width} height={unit} fill={`url(#${PATTERN_ID})`} />
      {/* Left dock, pinned to the left edge. */}
      <image data-cap="left" href={leftUrl} x={0} y={0} width={capL} height={unit} preserveAspectRatio="none" />
      {/* Right dock (the forklift, facing up toward the truck), pinned to the right edge. */}
      <image
        data-cap="right"
        href={rightUrl}
        x={width - capR}
        y={0}
        width={capR}
        height={unit}
        preserveAspectRatio="none"
      />
    </g>
  );
}
