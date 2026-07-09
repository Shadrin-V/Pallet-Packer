// @shadrin-v/i18n — public entry point.
// Production exports are added test-first (TDD).

/** Locales shipped in the MVP (ADR 006). Further languages add without code changes. */
export const SUPPORTED_LOCALES = ['de', 'ru'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
