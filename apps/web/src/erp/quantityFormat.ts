// Точное количество строки ERP (`sourceQuantity`) для показа. Оно бывает дробным (м³ у неразмещаемой
// строки, дробные штуки, которые сервер округлил вверх) — показывается как есть, без округления до
// целого. Только показ: в расчёт идёт целое `quantity`.
import type { Locale } from '@shadrin-v/i18n';

const INTL_TAG: Readonly<Record<Locale, string>> = { de: 'de-DE', ru: 'ru-RU' };

/** Число в формате локали, до шести знаков после запятой, лишние нули не показываются:
 *  `12.4` → `12,4`, `12.34567` → `12,34567`, `2598` → `2.598`. Контракт отдаёт количество точным —
 *  показ не должен его округлять (до 3 знаков `12.34567` превратилось бы в `12,346`). */
export function formatSourceQuantity(n: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_TAG[locale], { maximumFractionDigits: 6 }).format(n);
}
