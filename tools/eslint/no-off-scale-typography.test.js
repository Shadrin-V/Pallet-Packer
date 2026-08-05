import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { noOffScaleTypography } from './no-off-scale-typography.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run('no-off-scale-typography', noOffScaleTypography, {
  valid: [
    // Именованные ступени шкалы — единственный разрешённый способ.
    { code: 'const a = <b className="text-label uppercase tracking-wide" />;' },
    { code: 'const a = <b className="text-caption leading-tight" />;' },
    // Веса шкалой §3 санкционированы.
    { code: 'const a = <h1 className="text-title font-[650]" />;' },
    { code: 'const a = <b className="text-title font-[700] tabular-nums" />;' },
    // Произвольный ЦВЕТ — не размер, шкала §3 его не описывает.
    { code: "const v = { danger: 'bg-danger text-[color:var(--danger-ink)]' };" },
    // Не типографские оси правило не трогает.
    { code: 'const a = <b className="w-[37px] top-[3px]" />;' },
  ],
  invalid: [
    {
      code: 'const a = <b className="text-[10px]" />;',
      errors: [{ messageId: 'offScale', data: { cls: 'text-[10px]' } }],
    },
    {
      code: 'const a = <b className="px-2 text-[10.5px] text-faint" />;',
      errors: [{ messageId: 'offScale', data: { cls: 'text-[10.5px]' } }],
    },
    {
      code: 'const a = <b className="leading-[1.35]" />;',
      errors: [{ messageId: 'offScale' }],
    },
    {
      code: 'const a = <b className="tracking-[0.2em]" />;',
      errors: [{ messageId: 'offScale' }],
    },
    // В шаблонной строке класса — тоже ошибка.
    {
      code: 'const a = <b className={`px-1 ${x} text-[13px]`} />;',
      errors: [{ messageId: 'offScale' }],
    },
    // И в отдельно лежащей карте вариантов, а не только в атрибуте.
    {
      code: "const variants = { small: 'text-[9px] font-medium' };",
      errors: [{ messageId: 'offScale' }],
    },
    {
      code: 'const a = <b className="text-[10px] leading-[1.1]" />;',
      errors: [{ messageId: 'offScale' }, { messageId: 'offScale' }],
    },
  ],
});
