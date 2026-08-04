// Локальные правила репозитория (LKWkalk-y5j). Подключается в eslint.config.js как плагин `local`.
import { noUntranslatedText } from './no-untranslated-text.js';

export default {
  meta: { name: 'lkwkalk-local' },
  rules: {
    'no-untranslated-text': noUntranslatedText,
  },
};
