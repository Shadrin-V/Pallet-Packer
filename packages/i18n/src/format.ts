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

/** Объём из внутренних мм³ (ADR 002) в м³ для показа: один знак после запятой, локальные
 *  разделители, единица из словаря. Целое печатается без дробной части — «0 m³», не «0,0 m³». */
export function formatVolume(mm3: number, locale: Locale): string {
  const m3 = mm3 / 1_000_000_000;
  const number = new Intl.NumberFormat(INTL_LOCALE_TAG[locale], {
    maximumFractionDigits: 1,
  }).format(m3);
  return `${number} ${t('unit.m3', locale)}`;
}
