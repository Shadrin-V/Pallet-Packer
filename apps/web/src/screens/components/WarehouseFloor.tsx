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
// identical by construction. A test pins that equality — if the widths drift, the scale drifts
// silently. The floor grows in DEPTH instead, which is also what keeps it from reading as a second
// truck: three rows of EPAL are ~2800 mm against the hold's 2430.
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
import { ForkliftMark } from './ForkliftMark';
import { warehouseFloor, type BufferTile } from './warehouseLayout';

export type { BufferTile };

/** Below this pointer travel (px) a press is a click (select), not a drag (carry). */
const CLICK_SLOP_PX = 5;

/** Footprint the forklift needs, in mm — it is only drawn where it does not sit on the cargo. */
const FORKLIFT_W = 3500;
const FORKLIFT_H = 1150;
const PAD = 200;

export function WarehouseFloor({
  load,
  tiles,
  orderColors,
  onRotate,
  onPickUp,
  dragging,
}: {
  load: Load;
  tiles: BufferTile[];
  orderColors?: Map<string, number>;
  onRotate: (index: number) => void;
  /** Pointer went down on a tile: the parent takes over and drags it to the hold. */
  onPickUp: (index: number, e: ReactPointerEvent) => void;
  /** Index of the tile currently being dragged (dimmed in place), or null. */
  dragging: number | null;
}) {
  const tt = useT();
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const oidx = orderIndexMap(load);
  const total = tiles.reduce((s, t) => s + t.units, 0);
  const [sel, setSel] = useState<number | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);

  const floor = warehouseFloor(load, tiles);
  // Uniform ×N label size, in the same mm units the hold uses for its own counts.
  const countFont = load.vehicle.width * 0.05;

  // Park the forklift bottom-right, but only where it does not stand on the cargo: it is scenery, and
  // scenery must never look like a stack nor hide one.
  const bay = {
    x: floor.width - PAD - FORKLIFT_W,
    y: floor.height - PAD - FORKLIFT_H,
    w: FORKLIFT_W,
    h: FORKLIFT_H,
  };
  const bayFree =
    bay.x > PAD &&
    bay.y > PAD &&
    !floor.tiles.some(
      (t) => t.x < bay.x + bay.w && bay.x < t.x + t.dx && t.y < bay.y + bay.h && bay.y < t.y + t.dy,
    );

  return (
    <section
      aria-label={tt('warehouse.title')}
      data-testid="warehouse-floor"
      className="select-none rounded-card border border-line bg-sub px-4 py-3 print:hidden"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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

      {total > 0 && (
        // The floor is capped on screen and scrolls: 108 unplaced pallets are three metres of yard,
        // and they must not push the plan itself off the page.
        <div className="max-h-[340px] overflow-y-auto">
          <svg
            viewBox={`0 0 ${floor.width} ${floor.height}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={tt('warehouse.title')}
            style={{ background: 'var(--paper)', display: 'block', touchAction: 'none' }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSel(null);
            }}
          >
            {bayFree && <ForkliftMark x={bay.x} y={bay.y} />}
            {floor.tiles.map((pt, i) => {
              const cargo = byId.get(pt.tile.cargoTypeId);
              if (!cargo) return null;
              const slot = orderColors?.get(cargo.orderId ?? '') ?? oidx.get(cargo.orderId ?? '') ?? 0;
              const { series } = orderColorToken(slot);
              const rotatable = cargo.rotation !== 'none';
              return (
                <g
                  key={`${pt.tile.cargoTypeId}-${i}`}
                  data-testid="warehouse-tile"
                  role="button"
                  tabIndex={0}
                  aria-label={`${cargo.name} ×${pt.tile.units}`}
                  opacity={dragging === i ? 0.3 : undefined}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    downAt.current = { x: e.clientX, y: e.clientY };
                    onPickUp(i, e);
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
                  <StackShape x={pt.x} y={pt.y} w={pt.dx} h={pt.dy} series={series} hatchSpacing={180} />
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
                          onRotate={() => onRotate(i)}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
