// Подписи программы, которые в сборке для ERP говорят словами макета (бид lp-erp-steps): App ставит
// их в `LocaleProvider overrides` только при хосте ERP. Ключи и подписи обычной сборки не меняются.
import type { TranslationKey } from '@shadrin-v/i18n';

export const ERP_KEY_OVERRIDES: Partial<Record<TranslationKey, TranslationKey>> = {
  'setup.orders': 'erp.label.orders',
  'setup.summary.orders': 'erp.label.orders',
  'ladeplan.orders': 'erp.label.orders',
  'action.calculate': 'erp.label.calculate',
  'ladeplan.emptyHint': 'erp.label.emptyHint',
};
