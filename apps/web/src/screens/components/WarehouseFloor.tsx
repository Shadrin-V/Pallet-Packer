// The warehouse (LKWkalk-wxi): everything that is NOT in the hold — units the packer could not place,
// plus stacks the user pulled out by hand. It replaces the card strip that came before it.
//
// Owner, on the cards: "в буфере для каждой стопки не надо делать карточку — лучше нарисовать
// квадраты, которые выглядят так же, как в грузовике". On the live plan that strip was six identical
// cards repeating "EPAL 3 · 1000×1200 · ×18"; six squares say the same thing without saying it six
// times, and — being drawn at the hold's own scale — they also answer the question the cards could
// not: will this fit, and which way round?
//
// The 1:1 scale is structural, not measured: this SVG's viewBox is exactly as wide as the hold's
// (vehicle.length) and both render at width:100% inside the same column, so the mm→px factor is
// identical by construction. The floor grows in DEPTH instead, which is also what keeps it from
// reading as a second truck: three rows of EPAL are ~2800 mm against the hold's 2430.
//
// That construction is fragile in one specific way, and it has already bitten once: ANY horizontal
// padding, border or scrollbar between this section and the column narrows the svg, and the scale
// drifts while the viewBox still matches. So the section carries no horizontal padding or border —
// the header is padded on its own — and the floor does not scroll: a scrollbar that takes width
// (Windows, Linux) would silently break the very thing this surface exists to promise. A unit test
// can only pin the viewBox; the pixels are checked in a real browser.
//
// It is a workbench, not a document: screen-only (print:hidden), and the PNG export ignores it — it
// picks up `svg[data-cutaway]` only, and nothing here carries that marker.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { type Load } from '@shadrin-v/engine';
import { orderColorToken } from '../../lib/orderColor';
import { useT } from '../../i18n/LocaleContext';
import { fillTemplate } from './stackFormula';
import { orderIndexMap } from './cutaway';
import { StackShape } from './StackShape';
import { RotateHandle } from './RotateHandle';
import { WarehouseBackdrop } from './WarehouseBackdrop';
import { warehouseFloor, type BufferTile } from './warehouseLayout';

export type { BufferTile };

/** Below this pointer travel (px) a press is a click (select), not a drag (carry). */
const CLICK_SLOP_PX = 5;

export function WarehouseFloor({
  load,
  tiles,
  orderColors,
  onRotate,
  onPickUp,
  dragging,
  phantomAt,
}: {
  load: Load;
  tiles: BufferTile[];
  orderColors?: Map<string, number>;
  onRotate: (index: number) => void;
  /** Pointer went down on a tile: the parent takes over and drags it to the hold. */
  onPickUp: (index: number, e: ReactPointerEvent) => void;
  /** Index of the tile currently being dragged (dimmed in place), or null. */
  dragging: number | null;
  /** The live gap preview (B): while a stack is carried in from the hold and hovers over this floor,
   *  the parent computes where it would land (`insertionIndexAt`) and hands it here as a slot to open
   *  — not a real tile, so it carries no count and takes no pointer at all. Absent/null while nothing
   *  is being carried. */
  phantomAt?: { index: number; tile: BufferTile } | null;
}) {
  const tt = useT();
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const oidx = orderIndexMap(load);
  const total = tiles.reduce((s, t) => s + t.units, 0);
  const [sel, setSel] = useState<number | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);

  // The phantom is spliced into the FLOW, not overlaid afterwards — inserting it before real tiles
  // at `phantomAt.index` is what pushes them aside in `warehouseFloor`'s row-wrap layout, the same way
  // a real drop would once it lands there for real.
  const renderTiles: BufferTile[] = phantomAt
    ? [...tiles.slice(0, phantomAt.index), { ...phantomAt.tile, phantom: true }, ...tiles.slice(phantomAt.index)]
    : tiles;
  const floor = warehouseFloor(load, renderTiles);
  const empty = total === 0;
  // A minimum depth of one vehicle width, always: empty, the floor still needs a comfortable drop
  // target (8fy — a stack pulled out of the hold must have somewhere to land); with content, a single
  // shallow row must not shrink the surface (nor its scenery) to a sliver. A deeper buffer grows past
  // it. Pinning the minimum to the vehicle width also fixes the scenery's size for good: the backdrop's
  // yard depth is the same width, so its `unit` is now constant at every buffer depth.
  const floorHeight = Math.max(floor.height, Math.round(load.vehicle.width));
  // Uniform ×N label size, in the same mm units the hold uses for its own counts.
  const countFont = load.vehicle.width * 0.05;

  return (
    <section
      aria-label={tt('warehouse.title')}
      data-testid="warehouse-floor"
      // The yard fills the whole card: no coloured strips around it (owner feedback). The floor svg is
      // full-bleed and the header rides on top of it as an overlay with a soft scrim, so the asphalt is
      // the one background top to bottom. overflow-hidden clips the texture to the rounded corners.
      className="relative select-none overflow-hidden rounded-card print:hidden"
    >
      <div>
        <svg
          viewBox={`0 0 ${floor.width} ${floorHeight}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={tt('warehouse.title')}
          // A stable selector for the parent (LadeplanScreen's `toWarehouseMm`): it cannot reach into
          // this component's own refs, and `role="img"` alone also matches the top/side cutaways.
          data-warehouse
          style={{ background: 'var(--paper)', display: 'block', touchAction: 'none' }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSel(null);
          }}
        >
          {/* The yard behind everything: dock scenery at the edges, tiled asphalt between. Inert
              decoration under the real stacks — it replaces the old ForkliftMark (41e.5). */}
          <WarehouseBackdrop width={floor.width} height={floorHeight} sceneryDepth={load.vehicle.width} />
          {empty && (
            // A one-line invitation centred on the empty yard: the surface catches a stack pulled out
            // of the hold. The dashed outline is gone (owner feedback) — the yard art already reads as
            // a place to set things down. Decoration only; the drop is handled by the parent, which
            // hit-tests this whole section.
            <g data-testid="warehouse-dropzone" pointerEvents="none">
              <text
                x={floor.width / 2}
                y={floorHeight / 2}
                fill="var(--faint)"
                fontSize={countFont}
                textAnchor="middle"
                dominantBaseline="central"
                stroke="var(--paper)"
                strokeWidth={countFont * 0.18}
                strokeLinejoin="round"
                style={{ paintOrder: 'stroke' }}
              >
                {tt('warehouse.dropZone')}
              </text>
            </g>
          )}
          {floor.tiles.map((pt, i) => {
              const cargo = byId.get(pt.tile.cargoTypeId);
              if (!cargo) return null;
              // The gap preview stands in for a real tile in the flow (so its neighbours reflow
              // around it) but must not look, click or focus like one — no count, no rotate handle,
              // nothing for the pointer to catch. Just the promise of where the drop would land.
              if (pt.tile.phantom) {
                return (
                  <rect
                    key={`phantom-${pt.tile.cargoTypeId}-${i}`}
                    data-testid="warehouse-phantom"
                    x={pt.x}
                    y={pt.y}
                    width={pt.dx}
                    height={pt.dy}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    strokeDasharray="10 8"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                );
              }
              const slot = orderColors?.get(cargo.orderId ?? '') ?? oidx.get(cargo.orderId ?? '') ?? 0;
              const { series } = orderColorToken(slot);
              const rotatable = cargo.rotation !== 'none';
              // `i` runs over renderTiles, which SPLICES IN the phantom; the parent's onPickUp/onRotate/
              // dragging index its own `tiles` array, WITHOUT it. For any tile after the phantom the two
              // diverge by one, so map back before handing an index up (dwc.11). Reachable only with a
              // second pointer mid-carry, when phantomAt is live and a buffer tile is pressed.
              const realIndex = phantomAt && i > phantomAt.index ? i - 1 : i;
              return (
                <g
                  key={`${pt.tile.cargoTypeId}-${i}`}
                  data-testid="warehouse-tile"
                  role="button"
                  tabIndex={0}
                  aria-label={`${cargo.name} ×${pt.tile.units}`}
                  opacity={dragging === realIndex ? 0.3 : undefined}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    downAt.current = { x: e.clientX, y: e.clientY };
                    onPickUp(realIndex, e);
                  }}
                  onClick={(e) => {
                    // A press that barely travelled is a click: select the stack (revealing the
                    // rotate action) rather than treating it as a carry that went nowhere.
                    const d = downAt.current;
                    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_SLOP_PX) return;
                    setSel((cur) => (cur === i ? null : i));
                  }}
                  onKeyDown={(e) => {
                    // The ⟳ button is gone — without this, so is rotation from the keyboard.
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSel((cur) => (cur === i ? null : i));
                    }
                  }}
                >
                  <title>{`${cargo.name} ×${pt.tile.units}`}</title>
                  <StackShape x={pt.x} y={pt.y} w={pt.dx} h={pt.dy} series={series} hatchSpacing={180} backing />
                  <text
                    x={pt.x + pt.dx / 2}
                    y={pt.y + pt.dy / 2}
                    fill="var(--ink)"
                    fontSize={countFont}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    ×{pt.tile.units}
                  </text>
                  {sel === i && (
                    <>
                      <rect
                        x={pt.x}
                        y={pt.y}
                        width={pt.dx}
                        height={pt.dy}
                        fill="none"
                        stroke="var(--brand)"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                      {rotatable && (
                        <RotateHandle
                          cx={pt.x + pt.dx - Math.min(countFont * 0.8, pt.dx / 2)}
                          cy={pt.y + Math.min(countFont * 0.8, pt.dy / 2)}
                          size={countFont * 0.8}
                          label={tt('warehouse.rotate')}
                          onRotate={() => onRotate(realIndex)}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}
        </svg>
      </div>

      {/* Header over the yard, with a top-down paper scrim so the label stays legible over the dock
          scenery beneath it. Purely a caption — no pointer targets — so it never blocks a drop. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-6 pt-2"
        style={{ background: 'linear-gradient(to bottom, var(--paper) 35%, transparent)' }}
      >
        <span className="text-label uppercase tracking-wide text-faint">{tt('warehouse.title')}</span>
        {total > 0 && (
          <span className="text-caption font-semibold text-danger" data-testid="warehouse-count">
            {fillTemplate(tt('warehouse.count'), { n: total })}
          </span>
        )}
        <span className="text-caption text-muted">
          {total > 0 ? tt('warehouse.dropHint') : tt('warehouse.empty')}
        </span>
      </div>
    </section>
  );
}
