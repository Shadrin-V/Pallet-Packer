// Locale-keyed string lookup (ADR 006). The engine returns ERR_* codes only; this is where a
// code or a UI key becomes human-readable text. Every TranslationKey has an entry in every
// locale (enforced by the Dictionary type and covered by dictionaries/index.test.ts).
import type { Locale } from './index';
import type { TranslationKey } from './keys';
import { DICTIONARIES } from './dictionaries/index';

/** Look up the display text for `key` in `locale`. */
export function t(key: TranslationKey, locale: Locale): string {
  return DICTIONARIES[locale][key];
}
