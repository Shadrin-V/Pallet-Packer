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
// The whole band takes 100% of the floor HEIGHT (owner's model): every slice is scaled by s = height /
// natH so the left dock, right dock and centre asphalt all span top to bottom. The centre then repeats
// ONLY horizontally (its tile is the full height, so there is exactly one row of tiles vertically — no
// vertical seam, no repeated lane). Two guards keep the horizontal tiling seamless — the owner spotted
// white seams before: the slice's near-white rightmost column is cropped off (WAREHOUSE_ASSET.centerW),
// so left and right edges match; and an opaque asphalt-toned base sits under the pattern so any residual
// sub-pixel gap between repeats shows asphalt, never the paper behind.
import leftUrl from '../../assets/warehouse-floor-left.png';
import centerUrl from '../../assets/warehouse-floor-center.png';
import rightUrl from '../../assets/warehouse-floor-right.png';

/** Native pixel dimensions of the owner's slices — all share one height (941), so a single scale
 *  s = height / natH maps them into mm with no distortion. The centre tile is 74 wide: the source
 *  slice's rightmost column was near-white and tiled into a visible seam, so it is cropped off (the
 *  remaining edges match, ~218 grey, and butt seamlessly). */
export const WAREHOUSE_ASSET = { natH: 941, leftW: 252, centerW: 74, rightW: 458 } as const;

/** The flat asphalt tone sampled from the centre slice's lane-free asphalt. It sits opaque under the
 *  tiled pattern (so any sub-pixel seam reads as asphalt, never paper) AND is exported so the section
 *  around this svg can paint the same tone as a fallback — one seamless asphalt card (owner feedback). */
export const ASPHALT = '#d9d4ce';

/** Muted so the coloured stacks (drawn opaque over the floor) still dominate, but present enough that
 *  the docks read clearly. Applied per-dock, NOT to the tiled asphalt, which is the floor itself. */
const SCENERY_OPACITY = 0.85;

const PATTERN_ID = 'warehouse-floor-tile';

/** The yard behind the buffer's stacks. `width`/`height` are the floor surface in mm (the same units
 *  the tiles are laid out in): width = vehicle length, height grows with the buffer's depth. The whole
 *  band spans the full height; the centre asphalt repeats only horizontally. */
export function WarehouseBackdrop({ width, height }: { width: number; height: number }) {
  const { natH, leftW, centerW, rightW } = WAREHOUSE_ASSET;
  const s = height / natH; // mm per native px — the band takes 100% of the floor height
  const capL = leftW * s;
  const capR = rightW * s;
  const tileW = centerW * s;
  return (
    <g aria-hidden="true" pointerEvents="none" data-testid="warehouse-backdrop">
      <defs>
        {/* One asphalt cell (with the lane), the FULL floor height, tiled only along x. One row of tiles
            vertically → no vertical seam. preserveAspectRatio="none" fills each cell edge-to-edge (aspect
            matches the cropped slice), so there are no gaps and no smear; the lane meets the docks' lane. */}
        <pattern id={PATTERN_ID} patternUnits="userSpaceOnUse" x={0} y={0} width={tileW} height={height}>
          <image href={centerUrl} x={0} y={0} width={tileW} height={height} preserveAspectRatio="none" />
        </pattern>
      </defs>
      {/* Opaque asphalt base — catches any sub-pixel seam between tiles, and a fallback for the section. */}
      <rect data-floor x={0} y={0} width={width} height={height} fill={ASPHALT} />
      {/* The owner's tiled asphalt, filling the WHOLE floor; horizontal repeat only. */}
      <rect data-asphalt x={0} y={0} width={width} height={height} fill={`url(#${PATTERN_ID})`} />
      {/* Left dock, pinned to the left edge, full height. */}
      <image
        data-cap="left"
        href={leftUrl}
        x={0}
        y={0}
        width={capL}
        height={height}
        opacity={SCENERY_OPACITY}
        preserveAspectRatio="none"
      />
      {/* Right dock (the forklift, facing up toward the truck), pinned to the right edge, full height. */}
      <image
        data-cap="right"
        href={rightUrl}
        x={width - capR}
        y={0}
        width={capR}
        height={height}
        opacity={SCENERY_OPACITY}
        preserveAspectRatio="none"
      />
    </g>
  );
}
