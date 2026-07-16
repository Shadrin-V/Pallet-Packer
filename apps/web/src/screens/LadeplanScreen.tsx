// Ladeplan / result screen (LKWkalk-73u, batch-2 LKWkalk-2ll) — эталон docs/lovable/ladeplan-reference.html,
// palette per docs/design/design-system.md. Brand head + meta band + figures + top/side cutaways +
// per-order legend + compact metrics. Full-width sheet; A4 landscape print (theme.css).
// Domain invariant: the rendered layout must be geometry-valid (findGeometryViolations = []).
import { useEffect, useState } from 'react';
import {
  findGeometryViolations,
  type Layout,
  type Load,
  type LoadingMode,
  type OrderGrouping,
} from '@shadrin-v/engine';
import { formatLength } from '@shadrin-v/i18n';
import { useLocale } from '../i18n/LocaleContext';
import { Button, InfoHint } from '../ui/primitives';
import { LoadingModeSwitch } from '../ui/LoadingModeSwitch';
import { BrandMark } from './components/BrandMark';
import { CrossSection } from './components/CrossSection';
import { Legend } from './components/Legend';
import { Metrics } from './components/Metrics';
import { orderIndexMap } from './components/cutaway';
import { moveStack, rotateStack, type StackSel } from './components/editLayout';

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <div className="text-title font-[700] leading-none tabular-nums text-brand">{value}</div>
      <div className="mt-1 text-label uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label uppercase tracking-wide text-faint">{label}</span>
      <span className="text-body font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function LadeplanScreen({
  load,
  layout,
  onBack,
  onLoadingModeChange,
  onOrderGroupingChange,
}: {
  load: Load;
  layout: Layout;
  onBack?: () => void;
  onLoadingModeChange?: (mode: LoadingMode) => void;
  onOrderGroupingChange?: (grouping: OrderGrouping) => void;
}) {
  const { locale, tt } = useLocale();
  // Editable copy for manual stack edits (drag, rotate); reset whenever a fresh layout is computed.
  const [edited, setEdited] = useState<Layout>(layout);
  useEffect(() => setEdited(layout), [layout]);
  const onMoveStack = (sel: StackSel, toX: number, toY: number) =>
    setEdited((prev) => moveStack(load, prev, sel, toX, toY));
  const onRotateStack = (sel: StackSel) => setEdited((prev) => rotateStack(load, prev, sel));
  const violations = findGeometryViolations(load, edited).length;

  // Any strategy change recomputes from scratch, discarding manual edits. `edited !== layout` holds
  // only after a manual edit (both reset to the same reference on recompute), so warn only on loss.
  const withDiscardGuard = (recompute: () => void) => {
    if (edited !== layout && !globalThis.confirm(tt('ladeplan.discardEditsConfirm'))) return;
    recompute();
  };
  const handleLoadingModeChange = (mode: LoadingMode) =>
    withDiscardGuard(() => onLoadingModeChange?.(mode));
  const handleOrderGroupingChange = (checked: boolean) =>
    withDiscardGuard(() => onOrderGroupingChange?.(checked ? 'densityFirst' : 'strict'));

  const v = load.vehicle;
  const grp = (mm: number) => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'de-DE').format(mm);
  const dims = `${grp(v.length)} × ${grp(v.width)} × ${formatLength(v.height, locale)}`;
  const orderIds = [...orderIndexMap(load).keys()].filter(Boolean);
  const m = edited.metrics;

  return (
    <main
      data-violations={violations}
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 print:max-w-none print:p-0"
    >
      {/* on-screen action bar (not printed) */}
      <div className="mb-5 flex flex-wrap items-center justify-end gap-2 print:hidden">
        {onLoadingModeChange && (
          <LoadingModeSwitch value={load.loadingMode ?? 'combined'} onChange={handleLoadingModeChange} />
        )}
        {onOrderGroupingChange && (
          // InfoHint is a button and must stay OUTSIDE the <label>, else clicking it would activate
          // the label and toggle the checkbox (flip the strategy just from reading the hint).
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                aria-label={tt('ladeplan.orderGrouping')}
                checked={(load.orderGrouping ?? 'strict') === 'densityFirst'}
                onChange={(e) => handleOrderGroupingChange(e.target.checked)}
              />
              <span className="truncate">{tt('ladeplan.orderGrouping')}</span>
            </label>
            <InfoHint ariaLabel={tt('ladeplan.orderGrouping')} text={tt('ladeplan.orderGroupingHint')} />
          </span>
        )}
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {tt('action.back')}
          </Button>
        )}
        <Button variant="primary" onClick={() => window.print()}>
          {tt('action.print')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card bg-card shadow-card print:rounded-none print:shadow-none">
        {/* brand head */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5 print:py-2">
          <BrandMark />
          <div className="text-right">
            <div className="text-label uppercase tracking-wider text-faint">{tt('ladeplan.kicker')}</div>
            <h1 className="mt-0.5 text-title font-[650]">{v.name}</h1>
          </div>
        </div>

        {/* meta band + figures */}
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-line bg-sub px-6 py-3">
          <MetaField label={tt('ladeplan.vehicleInner')} value={dims} />
          {orderIds.length > 0 && (
            <MetaField label={tt('ladeplan.orders')} value={orderIds.join(' · ')} />
          )}
          <div className="ml-auto flex items-end gap-6">
            <Figure value={grp(m.totalPlaced)} label={tt('ladeplan.fig.pallets')} />
            <Figure value={String(m.usedFloorPositions)} label={tt('ladeplan.fig.positions')} />
            <Figure value={`${Math.round(m.floorFillPercent)} %`} label={tt('ladeplan.fig.load')} />
          </div>
        </div>

        {/* diagrams — near-full-bleed on print for maximum width */}
        <div className="flex flex-col gap-5 px-6 py-5 print:gap-2 print:px-1 print:py-2">
          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection load={load} layout={edited} view="top" label={tt('ladeplan.top')} onMoveStack={onMoveStack} onRotateStack={onRotateStack} />
          </div>
          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection load={load} layout={edited} view="side" label={tt('ladeplan.side')} />
          </div>
        </div>

        {/* foot: legend (prominent) + compact metrics */}
        <div className="flex flex-col gap-4 border-t border-line px-6 py-4 print:gap-2 print:py-2" style={{ breakInside: 'avoid' }}>
          <Legend load={load} layout={edited} label={tt('ladeplan.legend')} />
          <Metrics layout={edited} />
        </div>
      </div>
    </main>
  );
}
