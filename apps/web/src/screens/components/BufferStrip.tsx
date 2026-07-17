// The stack buffer (LKWkalk-dwc.3): everything that is NOT in the hold — units the packer could not
// place, plus stacks the user pulled out by hand. A horizontal strip under the top view, in the same
// reading direction as the plan: the hold is 13.6 m of landscape drawing, so a side panel would eat
// the width where the work actually happens.
//
// It is a workbench, not a document: screen-only (print:hidden), and the PNG export ignores it — it
// picks up `svg[data-cutaway]` only, and nothing here carries that marker.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { orientedDims, type BufferStack, type Load } from '@shadrin-v/engine';
import { HatchMarks } from '../../lib/swatch';
import { orderColorToken } from '../../lib/orderColor';
import { useT } from '../../i18n/LocaleContext';
import { fillTemplate } from './stackFormula';
import { orderIndexMap } from './cutaway';

/** One buffer tile with the orientation the user has turned it to (yaw only, ADR 013). */
export interface BufferTile extends BufferStack {
  orientation: 'lwh' | 'wlh';
}

const TILE_W = 76;
const TILE_H = 52;

/** A footprint drawn to fit the tile box, in the order's colour + hatch (design-system §6). */
function TileFigure({ dx, dy, series }: { dx: number; dy: number; series: number }) {
  // Fit the mm footprint into the tile box, keeping the aspect ratio — the tile shows the SHAPE
  // (which way round the stack is), never a to-scale drawing.
  const pad = 4;
  const k = Math.min((TILE_W - pad * 2) / dx, (TILE_H - pad * 2) / dy);
  const w = dx * k;
  const h = dy * k;
  return (
    <svg width={TILE_W} height={TILE_H} viewBox={`0 0 ${TILE_W} ${TILE_H}`} aria-hidden="true">
      <g transform={`translate(${(TILE_W - w) / 2} ${(TILE_H - h) / 2})`}>
        <rect x={0} y={0} width={w} height={h} fill={`var(--s${series})`} fillOpacity={0.16} />
        <HatchMarks x={0} y={0} w={w} h={h} series={series} spacing={7} strokeWidth={1} opacity={0.8} />
        <rect x={0} y={0} width={w} height={h} fill="none" stroke={`var(--s${series})`} strokeWidth={1.5} />
      </g>
    </svg>
  );
}

export function BufferStrip({
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

  return (
    <section
      aria-label={tt('buffer.title')}
      data-testid="buffer-strip"
      className="select-none rounded-card border border-line bg-sub px-4 py-3 print:hidden"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-label uppercase tracking-wide text-faint">{tt('buffer.title')}</span>
        {total > 0 && (
          <span className="text-caption font-semibold text-danger" data-testid="buffer-count">
            {fillTemplate(tt('buffer.count'), { n: total })}
          </span>
        )}
        <span className="text-caption text-muted">{total > 0 ? tt('buffer.dropHint') : tt('buffer.empty')}</span>
      </div>

      {total > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tiles.map((tile, i) => {
            const cargo = byId.get(tile.cargoTypeId);
            if (!cargo) return null;
            const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, tile.orientation);
            const slot = orderColors?.get(cargo.orderId ?? '') ?? oidx.get(cargo.orderId ?? '') ?? 0;
            const { series } = orderColorToken(slot);
            return (
              <div
                key={`${tile.cargoTypeId}-${i}`}
                data-testid="buffer-tile"
                className={`flex shrink-0 items-center gap-2 rounded-ctl border border-line bg-card px-2 py-1.5 ${
                  dragging === i ? 'opacity-30' : ''
                }`}
              >
                {/* The figure is the drag handle: press it and carry the stack into the hold. */}
                <span
                  role="button"
                  aria-label={`${cargo.name} ×${tile.units}`}
                  onPointerDown={(e) => onPickUp(i, e)}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                >
                  <TileFigure dx={dx} dy={dy} series={series} />
                </span>
                <span className="flex flex-col gap-0.5 pr-1 text-caption leading-tight">
                  <span className="font-semibold">{cargo.name}</span>
                  <span className="tabular-nums text-faint">
                    {dx}×{dy}
                  </span>
                  <span className="font-semibold tabular-nums text-ink">×{tile.units}</span>
                </span>
                <button
                  type="button"
                  aria-label={`${tt('buffer.rotate')}: ${cargo.name}`}
                  // Fixed-orientation cargo has nothing to turn (rotation rule, never overridden by
                  // a manual edit). A turn that breaks fork access is refused on drop, with a reason.
                  disabled={cargo.rotation === 'none'}
                  onClick={() => onRotate(i)}
                  className="grid h-6 w-6 place-items-center rounded-full border border-line-strong text-caption text-muted hover:border-brand hover:text-brand disabled:opacity-30 disabled:hover:border-line-strong disabled:hover:text-muted"
                >
                  ⟳
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
