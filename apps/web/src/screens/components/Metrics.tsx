import type { Layout } from '@shadrin-v/engine';
import { useT } from '../../i18n/LocaleContext';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-card px-4 py-3 shadow-card">
      <div className="text-label uppercase font-semibold text-faint">{label}</div>
      <div className="text-title font-[650] tabular-nums text-brand">{value}</div>
    </div>
  );
}

/** Compact result metrics (design-system: tiny metrics tiles). */
export function Metrics({ layout }: { layout: Layout }) {
  const tt = useT();
  const unplaced = layout.unplaced.reduce((n, u) => n + u.count, 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label={tt('results.totalPlaced')} value={String(layout.metrics.totalPlaced)} />
      <Tile label={tt('results.unplaced')} value={String(unplaced)} />
      <Tile label={tt('results.volumeFillPercent')} value={`${layout.metrics.volumeFillPercent}%`} />
      <Tile label={tt('results.floorFillPercent')} value={`${layout.metrics.floorFillPercent}%`} />
    </div>
  );
}
