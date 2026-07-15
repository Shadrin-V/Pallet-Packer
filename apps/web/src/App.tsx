import { useState } from 'react';
import { calculateLayout, findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider, useT } from './i18n/LocaleContext';
import { SetupScreen } from './screens/SetupScreen';

export function App() {
  const [result, setResult] = useState<{ load: Load; layout: Layout } | null>(null);

  const onCalculate = (load: Load) => {
    const layout = calculateLayout(load);
    // Domain invariant: never surface a layout with geometry violations (empty on validation error).
    if (findGeometryViolations(load, layout).length > 0) return;
    setResult({ load, layout });
  };

  return (
    <LocaleProvider initial="de">
      <SetupScreen onCalculate={onCalculate} />
      {result && <ResultBridge layout={result.layout} />}
    </LocaleProvider>
  );
}

// Temporary result summary — replaced by the full Ladeplan screen (LKWkalk-73u).
function ResultBridge({ layout }: { layout: Layout }) {
  const tt = useT();
  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-10 sm:px-6">
      <div className="rounded-card bg-card p-4 shadow-card">
        <span className="text-eyebrow uppercase font-semibold text-faint">{tt('results.totalPlaced')}</span>
        <div className="text-title font-[650] tabular-nums text-brand">{layout.metrics.totalPlaced}</div>
        <div className="text-caption text-muted">
          {tt('results.volumeFillPercent')}: {layout.metrics.volumeFillPercent}%
        </div>
      </div>
    </div>
  );
}
