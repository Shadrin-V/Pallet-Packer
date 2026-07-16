import { useEffect, useState } from 'react';
import {
  calculateLayout,
  findGeometryViolations,
  type Layout,
  type Load,
  type LoadingMode,
  type OrderGrouping,
} from '@shadrin-v/engine';
import { LocaleProvider } from './i18n/LocaleContext';
import { SetupScreen } from './screens/SetupScreen';
import { LadeplanScreen } from './screens/LadeplanScreen';

const LOAD_STORAGE_KEY = 'ladungsplaner.load';

/** Rebuild the last computed plan from the persisted Load (layout is derived, not stored). */
function loadPersistedResult(): { load: Load; layout: Layout } | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOAD_STORAGE_KEY);
    if (!raw) return null;
    const load = JSON.parse(raw) as Load;
    const layout = calculateLayout(load);
    if (findGeometryViolations(load, layout).length > 0) return null;
    return { load, layout };
  } catch {
    return null;
  }
}

export function App() {
  // Single page: SetupScreen stays mounted (its state never resets); the Ladeplan result renders
  // below it when a layout has been computed. Both survive a refresh via localStorage.
  const [result, setResult] = useState<{ load: Load; layout: Layout } | null>(() => loadPersistedResult());

  useEffect(() => {
    try {
      if (result) globalThis.localStorage?.setItem(LOAD_STORAGE_KEY, JSON.stringify(result.load));
      else globalThis.localStorage?.removeItem(LOAD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [result]);

  const onCalculate = (load: Load) => {
    // Preserve the strategy chosen on the Ladeplan across a Setup recompute (4bj.12): "Berechnen"
    // builds a Load without loadingMode/orderGrouping, so fall back to the current plan's choice.
    // The strategy selectors and Demo pass these fields explicitly, so they win over the fallback.
    const next: Load = {
      ...load,
      loadingMode: load.loadingMode ?? result?.load.loadingMode,
      orderGrouping: load.orderGrouping ?? result?.load.orderGrouping,
    };
    const layout = calculateLayout(next);
    // Domain invariant: never surface a layout with geometry violations.
    if (findGeometryViolations(next, layout).length > 0) return;
    setResult({ load: next, layout });
  };

  // Recompute the current plan under a new loading strategy (ADR 012). Manual edits are intentionally
  // discarded — the fresh layout resets LadeplanScreen's editable copy.
  const onLoadingModeChange = (mode: LoadingMode) => {
    if (!result) return;
    onCalculate({ ...result.load, loadingMode: mode });
  };

  const onOrderGroupingChange = (grouping: OrderGrouping) => {
    if (!result) return;
    onCalculate({ ...result.load, orderGrouping: grouping });
  };

  return (
    <LocaleProvider initial="de">
      {/* Setup is screen-only; printing yields just the Ladeplan document. */}
      <div className="print:hidden">
        <SetupScreen onCalculate={onCalculate} onReset={() => setResult(null)} />
      </div>
      {result && (
        <LadeplanScreen
          load={result.load}
          layout={result.layout}
          onBack={() => setResult(null)}
          onLoadingModeChange={onLoadingModeChange}
          onOrderGroupingChange={onOrderGroupingChange}
        />
      )}
    </LocaleProvider>
  );
}
