import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import local from './tools/eslint/index.js';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.beads/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Гейты интерфейса (LKWkalk-y5j). Тесты исключены: фикстуры законно держат литералы.
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/**/*.test.tsx'],
    plugins: { local },
    rules: {
      'local/no-untranslated-text': 'error',
    },
  },
);
