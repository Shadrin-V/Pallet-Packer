import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { t, SUPPORTED_LOCALES, type Locale, type TranslationKey } from '@shadrin-v/i18n';

const STORAGE_KEY = 'ladungsplaner.locale';

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Bound translate: t(key, currentLocale). */
  tt: (key: TranslationKey) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

function readStored(fallback: Locale): Locale {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v && (SUPPORTED_LOCALES as readonly string[]).includes(v)) return v as Locale;
  } catch {
    /* localStorage unavailable — ignore */
  }
  return fallback;
}

export function LocaleProvider({
  children,
  initial = 'de',
}: {
  children: ReactNode;
  initial?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => readStored(initial));
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore persistence failure */
    }
  };
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
