// Empty state for the plan section (LKWkalk-rgv.2). The page is ONE page: the plan section is part
// of it from the start and stands in for the sheet until the first "Berechnen". Screen-only —
// printing must yield the Ladeplan document, never a placeholder.
import { useT } from '../../i18n/LocaleContext';

export function EmptyPlan() {
  const tt = useT();
  return (
    <section
      aria-label={tt('ladeplan.title')}
      data-testid="empty-plan"
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 print:hidden"
    >
      <div className="rounded-card border border-dashed border-line-strong bg-card px-6 py-14 text-center shadow-card">
        <div className="text-label uppercase tracking-wider text-faint">{tt('ladeplan.title')}</div>
        <p className="mx-auto mt-2 max-w-md text-body text-muted">{tt('ladeplan.emptyHint')}</p>
      </div>
    </section>
  );
}
