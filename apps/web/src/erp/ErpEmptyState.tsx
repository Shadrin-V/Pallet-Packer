// Пустое состояние «Einrichten» в сборке для ERP (макет, блок 5): в LKW ещё нет позиций. Кнопка
// ведёт к первому шагу — фокус в поле рейса; браузер сам прокручивает к сфокусированному полю.
import type { JSX } from 'react';
import { useT } from '../i18n/LocaleContext';
import { Button } from '../ui/primitives';
import { PICKER_TRIP_INPUT_ID } from './ErpCargoPicker';

/** Увести фокус в поле рейса шага выбора груза (кнопки «Positionen wählen» и «Positionen ändern»). */
export function focusTripInput(): void {
  document.getElementById(PICKER_TRIP_INPUT_ID)?.focus();
}

export function ErpEmptyState(): JSX.Element {
  const tt = useT();
  return (
    <section
      aria-labelledby="lp-empty-title"
      data-testid="erp-empty-state"
      className="flex flex-col items-center gap-2 rounded-card bg-card px-6 py-10 text-center shadow-card"
    >
      <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-pill bg-sub text-brand">
        <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M5 8.25l2 2 4-4.5" />
        </svg>
      </span>
      <h2 id="lp-empty-title" className="text-h2 font-semibold text-ink">{tt('erp.empty.title')}</h2>
      <p className="max-w-prose text-caption text-muted">{tt('erp.empty.text')}</p>
      <div className="mt-2">
        <Button variant="primary" onClick={focusTripInput}>{tt('erp.empty.action')}</Button>
      </div>
    </section>
  );
}
