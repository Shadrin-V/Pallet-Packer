// Календарная дата ERP (`ГГГГ-ММ-ДД`: срок строки закупки, дата погрузки рейса) для показа. Чистая
// функция: ни React, ни экранных модулей (замок — pureModules.test.ts).
import type { Locale } from '@shadrin-v/i18n';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INTL_TAG: Readonly<Record<Locale, string>> = { de: 'de-DE', ru: 'ru-RU' };

/** ISO-дата в формате локали (`24.11.2026`); не дата — как пришла. Без часового пояса: дата
 *  календарная, сдвиг на сутки в браузере западнее UTC недопустим. */
export function formatIsoDate(iso: string, locale: Locale): string {
  const m = ISO_DATE.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(INTL_TAG[locale], { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);
}
