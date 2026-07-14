import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';
import { t } from '@shadrin-v/i18n';

export function App() {
  // Smoke wiring: prove engine + i18n resolve from the SPA. Screens (Tasks 6/7)
  // replace this shell with the real Setup/Ladeplan views.
  return (
    <main className="min-h-screen bg-paper text-ink font-sans p-6">
      <h1 className="text-[20px] font-[650] tracking-[-0.01em]">{t('app.title', 'de')}</h1>
      <p className="text-faint text-xs">engine {ENGINE_CONTRACT_VERSION}</p>
    </main>
  );
}
