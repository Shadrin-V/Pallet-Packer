import { SUPPORTED_LOCALES, type Locale } from '@shadrin-v/i18n';
import { useLocale } from '../i18n/LocaleContext';
import { Segmented } from './primitives';

/** DE | RU language switch (design-system §5 segmented). Persists via LocaleProvider. */
export function LocaleSwitch() {
  const { locale, setLocale } = useLocale();
  return (
    <Segmented<Locale>
      ariaLabel="Sprache / Язык"
      value={locale}
      onChange={setLocale}
      options={SUPPORTED_LOCALES.map((l) => ({ value: l, label: l.toUpperCase() }))}
    />
  );
}
