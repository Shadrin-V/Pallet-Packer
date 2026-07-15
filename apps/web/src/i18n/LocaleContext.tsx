import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { t, type Locale, type TranslationKey } from '@shadrin-v/i18n';

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Bound translate: t(key, currentLocale). */
  tt: (key: TranslationKey) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({
  children,
  initial = 'de',
}: {
  children: ReactNode;
  initial?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initial);
  const value = useMemo<LocaleCtx>(
    () => ({ locale, setLocale, tt: (key) => t(key, locale) }),
    [locale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('LocaleProvider missing');
  return ctx;
}

/** Convenience hook: the bound translate function. */
export function useT(): (key: TranslationKey) => string {
  return useLocale().tt;
}
