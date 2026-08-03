// Site hero banner (top of the Setup page only; hidden in print — the Ladeplan document has its own
// SCHÄFER brand head). Token-only. The faint pallet-grid SVG is a THEMATIC PLACEHOLDER: swap it for
// a real image (<img>) or looped video (<video autoplay muted loop playsinline>) placed in
// apps/web/public/ — keep it inside the same absolute layer with a readable overlay.
import { useT } from '../i18n/LocaleContext';
import { LocaleSwitch } from './LocaleSwitch';
import { ThemeSwitch } from '../theme/ThemeSwitch';

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

      <div className="relative mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-6 sm:flex-nowrap sm:px-6">
        <img src="/logo.svg" alt={tt('ladeplan.brandName')} className="h-12 w-auto shrink-0 sm:h-14" />
        <div className="min-w-0 flex-1 sm:flex-initial">
          <h1 className="text-title font-[650] leading-tight">{tt('app.title')}</h1>
          <p className="text-caption text-muted">{tt('app.subtitle')}</p>
        </div>
        {/* Палитра и язык — оба персистентные настройки представления (не действия над текущим
            расчётом), поэтому живут в одной группе рядом друг с другом (находка ревью, дубль
            против SetupHeader).

            Находка финального ревью: ниже `sm` (640px) логотип+заголовок и эта группа больше не
            делят одну строку — заголовку в паре с двумя переключателями там физически не хватает
            места (ThemeSwitch добавил вторую пилюль рядом с LocaleSwitch), и `min-w-0` на соседнем
            блоке схлопывал его до 0–3.5px, а текст заголовка (без own overflow:hidden) рисовался
            поверх пилюль. `w-full` здесь форсирует перенос группы на свою строку ЯВНО — не через
            подбор hypothetical flex-basis у соседей, чьё поведение при переносе неочевидно — и
            release-строка получает под заголовок всю ширину шапки. От `sm` и выше — прежняя
            однострочная раскладка (там перенос не нужен). Alternative considered: hide ThemeSwitch
            below the breakpoint — rejected, palette choice is as persistent a view setting as
            locale and users on narrow screens should keep both. */}
        <div
          data-testid="hero-controls"
          className="flex w-full shrink-0 items-center justify-end gap-2 sm:ml-auto sm:w-auto"
        >
          <ThemeSwitch />
          <LocaleSwitch />
        </div>
      </div>
    </header>
  );
}
