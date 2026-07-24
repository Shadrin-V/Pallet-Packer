// The warehouse floor's scenery (LKWkalk-41e.5) — a top-down yard the owner drew: dock edges with
// crates/racks on the left, a forklift facing UP toward the truck on the right, and the owner's tiling
// asphalt pattern (with lane markings) filling everything between. It replaces the hand-drawn
// ForkliftMark: the whole surface reads as a yard, and the real buffer stacks (hatched, coloured, ×N)
// sit on top and dominate.
//
// Why raster and not the flat currentColor vector the original brief asked for: the art is a
// pencil-textured render whose value IS its texture and shading — flattening it to line-art throws that
// away, and auto-tracing produced 3.3 MB of junk. So it stays PNG (the project's own lesson: don't
// hand-vectorise realistic illustrations). Trade-off: it does not recolour with the theme token; it is
// a fixed warm-grey, held muted so the coloured stacks always win.
//
// Why it lives INSIDE the floor's <svg> (mm space) and not as a CSS background: this surface's whole
// contract is a 1:1 scale locked to the hold by a shared viewBox width, and the file that hosts it
// warns that ANY px-level drift breaks that. Embedded in the same mm coordinates, the backdrop shares
// the tiles' scale by construction — it can never drift.
//
// The centre asphalt is the owner's `centerUrl` slice, tiled on BOTH axes to fill the whole floor at any
// depth (its lane repeats as yard-bay lines). Two guards keep the tiling seamless — the owner spotted
// white seams before: the slice's near-white rightmost column is cropped off (WAREHOUSE_ASSET.centerW),
// so left and right edges match and butt cleanly; and an opaque asphalt-toned base sits under the pattern
// so any residual sub-pixel gap between repeats shows asphalt, never the paper behind.
//
// The docks are a FIXED size, not scaled to the floor's depth (owner's call, 41e.5): the buffer floor
// grows deeper as stacks wrap into more rows, but the forklift must not balloon with it. So the caps are
// scaled to one fixed `unit` = the yard depth (a truck width) and pinned to the TOP (the truck side).
import leftUrl from '../../assets/warehouse-floor-left.png';
import centerUrl from '../../assets/warehouse-floor-center.png';
import rightUrl from '../../assets/warehouse-floor-right.png';

/** Native pixel dimensions of the owner's slices — all share one height (941), so a single scale
 *  s = unit / natH maps them into mm with no distortion. The centre tile is 74 wide: the source slice's
 *  rightmost column was near-white and tiled into a visible seam, so it is cropped off (the remaining
 *  edges match, ~218 grey, and butt seamlessly). */
export const WAREHOUSE_ASSET = { natH: 941, leftW: 252, centerW: 74, rightW: 458 } as const;

/** The flat asphalt tone sampled from the centre slice's lane-free asphalt. It sits opaque under the
 *  tiled pattern (so any sub-pixel seam reads as asphalt, never paper) AND is exported so the section
 *  around this svg can paint the same tone behind its header — one seamless asphalt card (owner
 *  feedback), with no differently-coloured strip. */
export const ASPHALT = '#d9d4ce';

/** Muted so the coloured stacks (drawn opaque over the floor) still dominate, but present enough that
 *  the docks read clearly. Applied per-dock, NOT to the tiled asphalt, which is the floor itself. */
const SCENERY_OPACITY = 0.85;

const PATTERN_ID = 'warehouse-floor-tile';

/** The yard behind the buffer's stacks. `width`/`height` are the floor surface in mm (the same units
 *  the tiles are laid out in): width = vehicle length, height grows with the buffer's depth.
 *  `sceneryDepth` is the fixed yard depth the docks are scaled to (the vehicle width) — the scenery
 *  never grows past it, so a deep buffer shows more open (tiled) asphalt rather than a giant forklift. */
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
  // The dock/tile unit: the fixed yard depth, but never taller than the floor itself (so on a floor
  // shallower than a truck width the docks fit rather than overflow). With the floor's own minimum
  // height pinned to the vehicle width upstream, this is simply the vehicle width in practice.
  const unit = Math.min(height, sceneryDepth);
  const s = unit / natH; // mm per native px
  const capL = leftW * s;
  const capR = rightW * s;
  const tileW = centerW * s;
  return (
    <g aria-hidden="true" pointerEvents="none" data-testid="warehouse-backdrop">
      <defs>
        {/* One asphalt cell (with the lane), tiled on BOTH axes at the unit height to fill any depth.
            preserveAspectRatio="none" fills each cell edge-to-edge (aspect matches the cropped slice),
            so there are no gaps and no smear; the lane meets the docks' lane at the same height. */}
        <pattern id={PATTERN_ID} patternUnits="userSpaceOnUse" x={0} y={0} width={tileW} height={unit}>
          <image href={centerUrl} x={0} y={0} width={tileW} height={unit} preserveAspectRatio="none" />
        </pattern>
      </defs>
      {/* Opaque asphalt base — catches any sub-pixel seam between tiles, and matches the header strip. */}
      <rect data-floor x={0} y={0} width={width} height={height} fill={ASPHALT} />
      {/* The owner's tiled asphalt, filling the WHOLE floor (both axes). */}
      <rect data-asphalt x={0} y={0} width={width} height={height} fill={`url(#${PATTERN_ID})`} />
      {/* Left dock, pinned to the left edge, fixed depth. */}
      <image
        data-cap="left"
        href={leftUrl}
        x={0}
        y={0}
        width={capL}
        height={unit}
        opacity={SCENERY_OPACITY}
        preserveAspectRatio="none"
      />
      {/* Right dock (the forklift, facing up toward the truck), pinned to the right edge, fixed depth. */}
      <image
        data-cap="right"
        href={rightUrl}
        x={width - capR}
        y={0}
        width={capR}
        height={unit}
        opacity={SCENERY_OPACITY}
        preserveAspectRatio="none"
      />
    </g>
  );
}
