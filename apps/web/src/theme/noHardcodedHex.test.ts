import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Единственные законные места для hex. theme.css — источник цвета; orderColor.ts — восемь цветов
// серий, нужных в JS для экспорта PNG и одинаковых в обеих палитрах (ADR 025).
const ALLOWED = ['apps/web/src/theme.css', 'apps/web/src/lib/orderColor.ts'];

const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe('гейт: ни одного hex вне темы', () => {
  it('в исходниках apps/web нет захардкоженных цветов', () => {
    const files = globSync('apps/web/src/**/*.{ts,tsx,svg,css}').filter(
      (f) => !ALLOWED.includes(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
    );
    const offenders = files.filter((f) => HEX.test(readFileSync(f, 'utf8')));
    expect(offenders, `hex вне темы: ${offenders.join(', ')}`).toEqual([]);
  });
});
