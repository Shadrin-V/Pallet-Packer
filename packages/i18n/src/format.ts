// Locale-aware length formatting (ADR 002: values are integer millimetres internally; display
// formatting happens only at the UI boundary).
import type { Locale } from './index';
import { t } from './translate';

const INTL_LOCALE_TAG: Record<Locale, string> = { de: 'de-DE', ru: 'ru-RU' };

/** Format an integer millimetre value with locale-appropriate grouping and the localized unit. */
export function formatLength(mm: number, locale: Locale): string {
  const number = new Intl.NumberFormat(INTL_LOCALE_TAG[locale]).format(mm);
  return `${number} ${t('unit.mm', locale)}`;
}
