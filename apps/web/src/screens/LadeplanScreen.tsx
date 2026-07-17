// Ladeplan / result screen (LKWkalk-73u, batch-2 LKWkalk-2ll) — эталон docs/lovable/ladeplan-reference.html,
// palette per docs/design/design-system.md. Brand head + meta band + figures + top/side cutaways +
// per-order legend + compact metrics. Full-width sheet; A4 landscape print (theme.css).
// Domain invariant: the rendered layout must be geometry-valid (findGeometryViolations = []).
import { useEffect, useRef, useState } from 'react';
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
import { orderBreakdown } from './components/orderBreakdown';
import { fillTemplate } from './components/stackFormula';
import { orderColorToken } from '../lib/orderColor';
import { exportPlanJson, exportPlanPng } from '../lib/exportPlan';
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
  orderColors,
  onLoadingModeChange,
  onOrderGroupingChange,
}: {
  load: Load;
  layout: Layout;
  onBack?: () => void;
  /** Stable orderId→palette slot from Setup, so plan colours survive a reorder and match Setup (QA #2). */
  orderColors?: Record<string, number>;
  onLoadingModeChange?: (mode: LoadingMode) => void;
  onOrderGroupingChange?: (grouping: OrderGrouping) => void;
}) {
  const { locale, tt } = useLocale();
  const orderColorMap = orderColors ? new Map(Object.entries(orderColors)) : undefined;
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

  // Export (qrd.15) — always of `edited`, i.e. exactly what is on screen. PDF reuses the tuned A4
  // print sheet via the browser dialog; PNG recomposes the live cutaways off the sheet.
  const sheetRef = useRef<HTMLDivElement>(null);
  // Single source for the summary figures: the meta band renders these, and the PNG carries the
  // same objects — the exported sheet cannot disagree with the screen it depicts.
  const figures = [
    { label: tt('ladeplan.fig.pallets'), value: grp(m.totalPlaced) },
    { label: tt('ladeplan.fig.positions'), value: String(m.usedFloorPositions) },
    { label: tt('ladeplan.fig.load'), value: `${Math.round(m.floorFillPercent)} %` },
  ];
  const handleExportPng = async () => {
    const captions = [tt('ladeplan.top'), tt('ladeplan.side')];
    // Cutaways only — `role="img"` alone would also drag in legend swatches and stack diagrams.
    const svgs = [...(sheetRef.current?.querySelectorAll<SVGSVGElement>('svg[data-cutaway]') ?? [])];
    try {
      await exportPlanPng(v.name, {
        title: v.name,
        meta: [
          `${tt('ladeplan.vehicleInner')}: ${dims}`,
          ...(orderIds.length ? [`${tt('ladeplan.orders')}: ${orderIds.join(' · ')}`] : []),
        ],
        figures,
        legend: orderBreakdown(load, edited, orderColorMap).map((o) => ({
          // Unplaced units must travel with the image: an exported plan that silently omits them
          // reads as "everything fits" to whoever receives the PNG.
          label: `${o.orderId} — ${o.items
            .map(
              (it) =>
                `${it.name} ×${it.placed}` +
                (it.unplaced > 0
                  ? ` (${fillTemplate(tt('ladeplan.notPlaced'), { n: it.unplaced })})`
                  : ''),
            )
            .join(', ')}`,
          color: orderColorToken(o.colorIndex).colorVar,
        })),
        sections: svgs.map((svg, i) => ({ caption: captions[i] ?? '', svg })),
      });
    } catch (err) {
      // Keep a trace: without it a prod report of "export does nothing" is undiagnosable.
      console.error('plan export failed', err);
      globalThis.alert(tt('action.exportFailed'));
    }
  };

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
        {/* Export group. PDF deliberately routes through the same print dialog as "Drucken" — the
            A4 sheet IS the report; the hint tells the user to pick "save as PDF" there. */}
        <span className="inline-flex items-center gap-1.5">
          <span className="text-caption font-semibold text-muted">{tt('action.export')}</span>
          <Button variant="secondary" onClick={() => window.print()}>
            {tt('action.exportPdf')}
          </Button>
          {/* aria-label must differ from the PDF button's own name, else the two are indistinguishable. */}
          <InfoHint
            ariaLabel={`${tt('action.export')} ${tt('action.exportPdf')}`}
            text={tt('action.exportPdfHint')}
          />
          <Button variant="secondary" onClick={handleExportPng}>
            {tt('action.exportPng')}
          </Button>
          <Button variant="secondary" onClick={() => exportPlanJson(load, edited)}>
            {tt('action.exportJson')}
          </Button>
        </span>
        <Button variant="primary" onClick={() => window.print()}>
          {tt('action.print')}
        </Button>
      </div>

      <div
        ref={sheetRef}
        className="overflow-hidden rounded-card bg-card shadow-card print:rounded-none print:shadow-none"
      >
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
            {figures.map((f) => (
              <Figure key={f.label} value={f.value} label={f.label} />
            ))}
          </div>
        </div>

        {/* diagrams — near-full-bleed on print for maximum width */}
        <div className="flex flex-col gap-5 px-6 py-5 print:gap-2 print:px-1 print:py-2">
          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection load={load} layout={edited} view="top" label={tt('ladeplan.top')} orderColors={orderColorMap} onMoveStack={onMoveStack} onRotateStack={onRotateStack} />
          </div>
          <div className="cut" style={{ breakInside: 'avoid' }}>
            <CrossSection load={load} layout={edited} view="side" label={tt('ladeplan.side')} orderColors={orderColorMap} />
          </div>
        </div>

        {/* foot: legend (prominent) + compact metrics */}
        <div className="flex flex-col gap-4 border-t border-line px-6 py-4 print:gap-2 print:py-2" style={{ breakInside: 'avoid' }}>
          <Legend load={load} layout={edited} label={tt('ladeplan.legend')} orderColors={orderColorMap} />
          <Metrics layout={edited} />
        </div>
      </div>
    </main>
  );
}
