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
// Stable orderId→palette slot, persisted separately so the Load format stays unchanged (QA #2).
const ORDER_COLORS_STORAGE_KEY = 'ladungsplaner.orderColors';

/** Rebuild the last computed plan from the persisted Load (layout is derived, not stored). */
function loadPersistedResult(): { load: Load; layout: Layout; orderColors?: Record<string, number> } | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOAD_STORAGE_KEY);
    if (!raw) return null;
    const load = JSON.parse(raw) as Load;
    const layout = calculateLayout(load);
    if (findGeometryViolations(load, layout).length > 0) return null;
    let orderColors: Record<string, number> | undefined;
    try {
      const rc = globalThis.localStorage?.getItem(ORDER_COLORS_STORAGE_KEY);
      if (rc) orderColors = JSON.parse(rc) as Record<string, number>;
    } catch {
      /* ignore */
    }
    return { load, layout, orderColors };
  } catch {
    return null;
  }
}

export function App() {
  // Single page: SetupScreen stays mounted (its state never resets); the Ladeplan result renders
  // below it when a layout has been computed. Both survive a refresh via localStorage.
  // `transient` marks a Demo preview: shown in the UI but never persisted, so a reload returns to
  // the user's saved plan (QA).
  const [result, setResult] = useState<{ load: Load; layout: Layout; transient?: boolean; orderColors?: Record<string, number> } | null>(() => loadPersistedResult());

  useEffect(() => {
    try {
      if (result?.transient) return; // preview: leave the previously saved plan untouched
      if (result) {
        globalThis.localStorage?.setItem(LOAD_STORAGE_KEY, JSON.stringify(result.load));
        if (result.orderColors) globalThis.localStorage?.setItem(ORDER_COLORS_STORAGE_KEY, JSON.stringify(result.orderColors));
        else globalThis.localStorage?.removeItem(ORDER_COLORS_STORAGE_KEY);
      } else {
        globalThis.localStorage?.removeItem(LOAD_STORAGE_KEY);
        globalThis.localStorage?.removeItem(ORDER_COLORS_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [result]);

  const onCalculate = (load: Load, opts?: { persist?: boolean; orderColors?: Record<string, number> }) => {
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
    // Strategy-only recomputes (selectors) don't pass orderColors → keep the current plan's map.
    setResult({ load: next, layout, transient: opts?.persist === false, orderColors: opts?.orderColors ?? result?.orderColors });
  };

  // Recompute the current plan under a new loading strategy (ADR 012). Manual edits are intentionally
  // discarded — the fresh layout resets LadeplanScreen's editable copy. Preserve transience: toggling
  // a strategy on a Demo preview must NOT turn it into a persisted plan (QA).
  const onLoadingModeChange = (mode: LoadingMode) => {
    if (!result) return;
    onCalculate({ ...result.load, loadingMode: mode }, { persist: !result.transient });
  };

  const onOrderGroupingChange = (grouping: OrderGrouping) => {
    if (!result) return;
    onCalculate({ ...result.load, orderGrouping: grouping }, { persist: !result.transient });
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
          orderColors={result.orderColors}
          onBack={() => setResult(null)}
          onLoadingModeChange={onLoadingModeChange}
          onOrderGroupingChange={onOrderGroupingChange}
        />
      )}
    </LocaleProvider>
  );
}
