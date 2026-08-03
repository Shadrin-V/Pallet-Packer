import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Anchor to the repo root derived from THIS file's own location, not from process.cwd() — the
// same fix `noHardcodedHex.test.ts` already applies, and the same bug class as the open bead
// LKWkalk-fwl: a cwd-relative path passes trivially (wrong file silently not found → assertions
// vacuously true, or resolved against an unrelated directory) when the suite is run from anywhere
// but the repo root (финальное ревью, находка 5). This file sits at apps/web/src/theme/, so the
// repo root is four levels up.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// Читаем файл темы как текст: jsdom не считает каскад из @tailwind-директив, а проверить надо
// именно объявления.
const css = readFileSync(path.join(ROOT, 'apps/web/src/theme.css'), 'utf8');

const block = (source: string, selector: string) => {
  const i = source.indexOf(selector);
  expect(i, `блок ${selector} не найден`).toBeGreaterThan(-1);
  return source.slice(i, source.indexOf('}', i));
};

const tokens = (source: string, selector: string) =>
  Object.fromEntries(
    [...block(source, selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );

describe('две фирменные палитры', () => {
  it('тёплая палитра объявляет тот же набор токенов, что и forest', () => {
    const forest = Object.keys(tokens(css, ':root {'));
    const warm = Object.keys(tokens(css, ":root[data-theme='warm']"));
    expect(warm.sort()).toEqual(forest.sort());
  });

  it('цвета серий в обеих палитрах совпадают', () => {
    const forest = tokens(css, ':root {');
    const warm = tokens(css, ":root[data-theme='warm']");
    for (const k of ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8']) {
      expect(warm[k], `${k} обязан совпадать: палитра серий проверена на дальтонизм и печать`).toBe(forest[k]);
    }
  });

  it('семантические цвета в обеих палитрах совпадают', () => {
    const forest = tokens(css, ':root {');
    const warm = tokens(css, ":root[data-theme='warm']");
    for (const k of ['--danger', '--success', '--warning', '--info']) {
      expect(warm[k], `${k} обязан значить одно и то же в обеих темах`).toBe(forest[k]);
    }
  });
});

// Финальное ревью, находка 4: ничто не гарантировало, что `docs/design/theme.css` (источник
// истины, ADR 025) и `apps/web/src/theme.css` (заявленный дословный порт) остаются идентичны в
// своих палитровых блоках — до сих пор это держалось только прозой в ADR и заголовках обоих
// файлов. Пара уже расходилась однажды (`--truck`/`--yard-mark` отсутствовали в доках-копии и
// были исправлены посреди этой же ветки), так что тест нужен, а не благое пожелание.
describe('docs/design/theme.css и apps/web/src/theme.css — палитры идентичны', () => {
  const docsCss = readFileSync(path.join(ROOT, 'docs/design/theme.css'), 'utf8');

  for (const selector of [':root {', ":root[data-theme='warm']"]) {
    it(`${selector} — один и тот же набор токенов и значений`, () => {
      const appTokens = tokens(css, selector);
      const docsTokens = tokens(docsCss, selector);
      expect(Object.keys(appTokens).sort()).toEqual(Object.keys(docsTokens).sort());
      expect(appTokens).toEqual(docsTokens);
    });
  }
});
