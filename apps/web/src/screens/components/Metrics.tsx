import type { Layout } from '@shadrin-v/engine';
import { useT } from '../../i18n/LocaleContext';

/** Compact result metrics — a single small row (design-system "foot"): fill percentages + counts.
 * The prominent per-order breakdown lives in <Legend>; these totals stay deliberately small. */
export function Metrics({ layout }: { layout: Layout }) {
  const tt = useT();
  const m = layout.metrics;
  const unplaced = layout.unplaced.reduce((n, u) => n + u.count, 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
      <span>
        {tt('results.floorFillPercent')}{' '}
        <b className="font-semibold tabular-nums text-ink">{Math.round(m.floorFillPercent)}%</b>
      </span>
      <span>
        {tt('results.volumeFillPercent')}{' '}
        <b className="font-semibold tabular-nums text-ink">{Math.round(m.volumeFillPercent)}%</b>
      </span>
      <span>
        <b className="font-semibold tabular-nums text-ink">{m.totalPlaced}</b> {tt('ladeplan.fig.pallets')}
      </span>
      <span>
        <b className="font-semibold tabular-nums text-ink">{m.usedFloorPositions}</b>{' '}
        {tt('ladeplan.fig.positions')}
      </span>
      {unplaced > 0 && (
        <span className="text-danger">
          {tt('results.unplaced')} <b className="font-semibold tabular-nums">{unplaced}</b>
        </span>
      )}
    </div>
  );
}
