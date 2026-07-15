import { useState } from 'react';
import { calculateLayout, findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from './i18n/LocaleContext';
import { SetupScreen } from './screens/SetupScreen';
import { LadeplanScreen } from './screens/LadeplanScreen';

export function App() {
  // Single page: SetupScreen stays mounted (its state never resets); the Ladeplan result renders
  // below it when a layout has been computed.
  const [result, setResult] = useState<{ load: Load; layout: Layout } | null>(null);

  const onCalculate = (load: Load) => {
    const layout = calculateLayout(load);
    // Domain invariant: never surface a layout with geometry violations.
    if (findGeometryViolations(load, layout).length > 0) return;
    setResult({ load, layout });
  };

  return (
    <LocaleProvider initial="de">
      <SetupScreen onCalculate={onCalculate} />
      {result && (
        <LadeplanScreen load={result.load} layout={result.layout} onBack={() => setResult(null)} />
      )}
    </LocaleProvider>
  );
}
