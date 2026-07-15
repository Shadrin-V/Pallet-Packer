import { useEffect, useState } from 'react';
import { calculateLayout, findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
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
    const layout = calculateLayout(load);
    // Domain invariant: never surface a layout with geometry violations.
    if (findGeometryViolations(load, layout).length > 0) return;
    setResult({ load, layout });
  };

  return (
    <LocaleProvider initial="de">
      {/* Setup is screen-only; printing yields just the Ladeplan document. */}
      <div className="print:hidden">
        <SetupScreen onCalculate={onCalculate} onReset={() => setResult(null)} />
      </div>
      {result && (
        <LadeplanScreen load={result.load} layout={result.layout} onBack={() => setResult(null)} />
      )}
    </LocaleProvider>
  );
}
