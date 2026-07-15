// Site hero banner (top of the Setup page only; hidden in print — the Ladeplan document has its own
// SCHÄFER brand head). Token-only. The faint pallet-grid SVG is a THEMATIC PLACEHOLDER: swap it for
// a real image (<img>) or looped video (<video autoplay muted loop playsinline>) placed in
// apps/web/public/ — keep it inside the same absolute layer with a readable overlay.
import { useT } from '../i18n/LocaleContext';
import { LocaleSwitch } from './LocaleSwitch';

export function HeroHeader() {
  const tt = useT();
  return (
    <header className="relative isolate overflow-hidden border-b border-line bg-gradient-to-br from-[color:var(--sub)] via-[color:var(--paper)] to-[color:var(--mint-tint)] print:hidden">
      {/* Thematic placeholder: faint repeating pallet footprints (evokes the loading plan). */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-[0.07]" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="hero-pallets" width="72" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <rect x="5" y="5" width="62" height="38" rx="4" fill="none" stroke="var(--brand)" strokeWidth="2.5" />
            <line x1="36" y1="5" x2="36" y2="43" stroke="var(--brand)" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-pallets)" />
      </svg>

      <div className="relative mx-auto flex max-w-[1120px] items-center gap-4 px-5 py-6 sm:px-6">
        <img src="/logo.svg" alt={tt('ladeplan.brandName')} className="h-12 w-auto shrink-0 sm:h-14" />
        <div className="min-w-0">
          <h1 className="text-title font-[650] leading-tight">{tt('app.title')}</h1>
          <p className="text-caption text-muted">{tt('app.subtitle')}</p>
        </div>
        <div className="ml-auto shrink-0">
          <LocaleSwitch />
        </div>
      </div>
    </header>
  );
}
