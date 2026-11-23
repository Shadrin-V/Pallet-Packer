// Точное количество строки ERP (`sourceQuantity`) для показа. Оно бывает дробным (м³ у неразмещаемой
// строки, дробные штуки, которые сервер округлил вверх) — показывается как есть, без округления до
// целого. Только показ: в расчёт идёт целое `quantity`.
import type { Locale } from '@shadrin-v/i18n';

const INTL_TAG: Readonly<Record<Locale, string>> = { de: 'de-DE', ru: 'ru-RU' };

/** Число в формате локали, до трёх знаков после запятой: `12.4` → `12,4`, `2598` → `2.598`. */
export function formatSourceQuantity(n: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_TAG[locale], { maximumFractionDigits: 3 }).format(n);
}
