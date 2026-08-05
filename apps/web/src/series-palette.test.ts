// Сторож зеркала палитры (LKWkalk-y5j). SERIES_HEX в lib/orderColor.ts — копия --s1..--s8 из
// theme.css «на всякий случай, когда var() не резолвится». Комментарий «keep in sync» ничем не
// проверялся, а палитр в theme.css две (ADR 025) — разъехаться может любая из них.
//
// Корень запуска — корень монорепо (vitest.config.ts лежит там же), как и в theme-alpha.test.ts:
// `import.meta.url` не годится, под jsdom он не файловая схема.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SERIES_HEX } from './lib/orderColor';

const THEME_CSS = join(process.cwd(), 'apps/web/src/theme.css');

/** Значения --s1..--s8 по палитрам: одна строка результата = одна палитра в порядке объявления. */
function palettes(css: string): string[][] {
  const byToken = SERIES_HEX.map((_, i) =>
    Array.from(css.matchAll(new RegExp(`--s${i + 1}:\\s*(#[0-9a-fA-F]{6})`, 'g')), (m) =>
      m[1].toLowerCase(),
    ),
  );
  const count = byToken[0].length;
  return Array.from({ length: count }, (_, palette) => byToken.map((values) => values[palette]));
}

describe('палитра заказов', () => {
  it('SERIES_HEX — точное зеркало --s1..--s8, и все палитры theme.css согласны между собой', () => {
    const declared = palettes(readFileSync(THEME_CSS, 'utf8'));
    expect(declared.length).toBeGreaterThanOrEqual(2); // две палитры бренда, ADR 025
    const expected = SERIES_HEX.map((hex) => hex.toLowerCase());
    for (const palette of declared) expect(palette).toEqual(expected);
  });
});
