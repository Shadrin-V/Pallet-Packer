// Ladeplan / result screen (LKWkalk-73u) — эталон docs/lovable/ladeplan-reference.html, palette per
// docs/design/design-system.md. Clean card под скриншот: header, top+side cutaways, legend, metrics,
// A4 print. Domain invariant: the rendered layout must be geometry-valid (findGeometryViolations = []).
import { useEffect, useState } from 'react';
import { findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
import { useT } from '../i18n/LocaleContext';
import { Button } from '../ui/primitives';
import { CrossSection } from './components/CrossSection';
import { Legend } from './components/Legend';
import { Metrics } from './components/Metrics';
import { moveStack, type StackSel } from './components/dragLayout';

export function LadeplanScreen({
  load,
  layout,
  onBack,
}: {
  load: Load;
  layout: Layout;
  onBack?: () => void;
}) {
  const tt = useT();
  // Editable copy for manual stack drag; reset whenever a fresh layout is computed.
  const [edited, setEdited] = useState<Layout>(layout);
  useEffect(() => setEdited(layout), [layout]);
  const onMoveStack = (sel: StackSel, toX: number, toY: number) =>
    setEdited((prev) => moveStack(load, prev, sel, toX, toY));
  const violations = findGeometryViolations(load, edited).length;

  return (
    <main
      data-violations={violations}
      className="mx-auto max-w-[1120px] px-5 py-6 sm:px-6 print:max-w-none print:p-0"
    >
      <header className="app-chrome mb-5 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-title font-[650]">{tt('ladeplan.title')}</h1>
          <p className="text-caption text-muted">{load.vehicle.name}</p>
        </div>
        <div className="flex gap-2">
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              {tt('action.back')}
            </Button>
          )}
          <Button variant="primary" onClick={() => window.print()}>
            {tt('action.print')}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-card print:shadow-none print:rounded-none">
        {/* print-only title */}
        <div className="hidden print:block">
          <h1 className="text-title font-[650]">{tt('ladeplan.title')} — {load.vehicle.name}</h1>
        </div>

        <div className="cut" style={{ breakInside: 'avoid' }}>
          <CrossSection load={load} layout={edited} view="top" label={tt('ladeplan.top')} onMoveStack={onMoveStack} />
        </div>
        <div className="cut" style={{ breakInside: 'avoid' }}>
          <CrossSection load={load} layout={edited} view="side" label={tt('ladeplan.side')} />
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <Legend load={load} label={tt('ladeplan.legend')} />
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <Metrics layout={edited} />
        </div>
      </div>
    </main>
  );
}
