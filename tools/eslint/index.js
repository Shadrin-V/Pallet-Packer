// Локальные правила репозитория (LKWkalk-y5j). Подключается в eslint.config.js как плагин `local`.
import { noUntranslatedText } from './no-untranslated-text.js';
import { noOffScaleTypography } from './no-off-scale-typography.js';

export default {
  meta: { name: 'lkwkalk-local' },
  rules: {
    'no-untranslated-text': noUntranslatedText,
    'no-off-scale-typography': noOffScaleTypography,
  },
};
