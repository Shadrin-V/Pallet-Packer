// The warehouse floor's scenery (LKWkalk-41e.5) — a top-down yard the owner drew: dock edges with
// crates/racks on the left, a forklift facing UP toward the truck on the right, and open asphalt with
// a lane marking in between. It replaces the hand-drawn ForkliftMark: instead of parking one line-art
// forklift in a free corner, the whole surface reads as a yard, and the real buffer stacks (hatched,
// coloured, ×N) sit on top and dominate.
//
// Why raster caps and not the flat currentColor vector the original brief asked for: the docks and
// forklift are a pencil-textured render whose value IS their texture and shading — flattening them to
// line-art throws that away, and auto-tracing produced 3.3 MB of junk. So they stay PNG (the project's
// own lesson: don't hand-vectorise realistic illustrations). Trade-off: they do not recolour with the
// theme token; they are a fixed warm-grey, held muted by OPACITY so the coloured stacks always win.
//
// Why it lives INSIDE the floor's <svg> (mm space) and not as a CSS background: this surface's whole
// contract is a 1:1 scale locked to the hold by a shared viewBox width, and the file that hosts it
// warns that ANY px-level drift breaks that. Embedded in the same mm coordinates, the backdrop shares
// the tiles' scale by construction — it can never drift.
//
// The open floor between the docks is a FLAT asphalt fill, not the owner's tiled centre slice: an SVG
// <pattern> of a raster tile antialiases every tile edge into faint vertical seams (owner spotted them),
// and the slice's asphalt is all but flat anyway (tone ~#d9d4ce end to end). So the whole floor is that
// one tone — seamless at any width or depth — with the lane drawn as a native dashed line that meets the
// docks' own baked lane. The centre PNG is dropped; only the two textured docks remain as images.
//
// The docks are a FIXED size, not scaled to the floor's depth (owner's call, 41e.5): the buffer floor
// grows deeper as stacks wrap into more rows, but the forklift must not balloon with it. So the caps are
// scaled to one fixed `unit` = the yard depth (a truck width) and pinned to the TOP (the truck side).
import leftUrl from '../../assets/warehouse-floor-left.png';
import rightUrl from '../../assets/warehouse-floor-right.png';

/** Native pixel dimensions of the owner's dock slices — both share one height (941), so a single scale
 *  s = unit / natH maps them into mm with no distortion. */
export const WAREHOUSE_ASSET = { natH: 941, leftW: 252, rightW: 458 } as const;

/** The asphalt tone sampled from the slices' lane-free asphalt — the whole floor, matching the docks. */
const ASPHALT = '#d9d4ce';

/** Where the docks' baked lane sits, as a fraction of the dock height — the native lane line is drawn
 *  here so it runs unbroken from the left dock, across the open floor, into the right dock. */
const LANE_FRAC = 0.22;

/** Muted so the coloured stacks (drawn opaque over it) still dominate, but present enough that the yard
 *  reads clearly. Tuned by eye in a real screenshot. */
const OPACITY = 0.85;

/** The yard behind the buffer's stacks. `width`/`height` are the floor surface in mm (the same units
 *  the tiles are laid out in): width = vehicle length, height grows with the buffer's depth.
 *  `sceneryDepth` is the fixed yard depth the docks are scaled to (the vehicle width) — the scenery
 *  never grows past it, so a deep buffer shows more open asphalt rather than a giant forklift. */
export function WarehouseBackdrop({
  width,
  height,
  sceneryDepth,
}: {
  width: number;
  height: number;
  sceneryDepth: number;
}) {
  const { natH, leftW, rightW } = WAREHOUSE_ASSET;
  // The dock unit: the fixed yard depth, but never taller than the floor itself (so on a floor
  // shallower than a truck width the docks fit rather than overflow). With the floor's own minimum
  // height pinned to the vehicle width upstream, this is simply the vehicle width in practice.
  const unit = Math.min(height, sceneryDepth);
  const s = unit / natH; // mm per native px
  const capL = leftW * s;
  const capR = rightW * s;
  const laneY = unit * LANE_FRAC;
  return (
    <g aria-hidden="true" pointerEvents="none" opacity={OPACITY} data-testid="warehouse-backdrop">
      {/* Flat asphalt across the whole floor — one tone, seamless at any width or depth. */}
      <rect data-floor x={0} y={0} width={width} height={height} fill={ASPHALT} />
      {/* Lane marking near the truck side; the docks (painted over the ends) carry it to the edges. */}
      <line
        data-lane
        x1={0}
        y1={laneY}
        x2={width}
        y2={laneY}
        stroke="#ffffff"
        strokeOpacity={0.7}
        strokeWidth={unit * 0.014}
        strokeDasharray={`${unit * 0.09} ${unit * 0.06}`}
      />
      {/* Left dock, pinned to the left edge, fixed depth. */}
      <image data-cap="left" href={leftUrl} x={0} y={0} width={capL} height={unit} preserveAspectRatio="none" />
      {/* Right dock (the forklift, facing up toward the truck), pinned to the right edge, fixed depth. */}
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
