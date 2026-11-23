// Точное количество строки ERP (`sourceQuantity`) для показа. Оно бывает дробным (м³ у неразмещаемой
// строки, дробные штуки, которые сервер округлил вверх) — показывается как есть, без округления до
// целого. Только показ: в расчёт идёт целое `quantity`.
import type { Locale } from '@shadrin-v/i18n';

const INTL_TAG: Readonly<Record<Locale, string>> = { de: 'de-DE', ru: 'ru-RU' };

/** Число в формате локали, до девяти знаков после запятой (наибольшая точность числовых полей Frappe),
 *  лишние нули не показываются: `12.4` → `12,4`, `12.123456789` → `12,123456789`, `2598` → `2.598`.
 *  Контракт отдаёт количество точным — внутри этой точности показ его не округляет; машинная
 *  погрешность за девятым знаком (`0.1 + 0.2`) не видна: `0,3`. */
export function formatSourceQuantity(n: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_TAG[locale], { maximumFractionDigits: 9 }).format(n);
}
