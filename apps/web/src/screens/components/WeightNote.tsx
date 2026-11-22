import { useT } from '../../i18n/LocaleContext';

/** Вес движок не проверяет — говорим это прямо. Идёт и на экран, и в печать: печатный план читают
 * те, кто грузит машину (решение оркестратора), поэтому здесь нет print:hidden. */
export function WeightNote() {
  const tt = useT();
  return (
    <aside
      role="note"
      data-testid="weight-not-checked"
      className="flex flex-col gap-0.5 border-b border-line px-6 py-3 text-caption print:py-1"
      style={{ breakInside: 'avoid' }}
    >
      <span className="font-semibold">{tt('ladeplan.weightNotChecked')}</span>
      <span className="text-muted">{tt('ladeplan.weightNotCheckedHint')}</span>
    </aside>
  );
}
