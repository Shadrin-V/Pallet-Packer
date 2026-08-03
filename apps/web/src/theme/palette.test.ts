import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Читаем файл темы как текст: jsdom не считает каскад из @tailwind-директив, а проверить надо
// именно объявления. Путь от корня репозитория — тесты гоняются оттуда.
const css = readFileSync('apps/web/src/theme.css', 'utf8');

const block = (selector: string) => {
  const i = css.indexOf(selector);
  expect(i, `блок ${selector} не найден`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

const tokens = (selector: string) =>
  Object.fromEntries(
    [...block(selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );

describe('две фирменные палитры', () => {
  it('тёплая палитра объявляет тот же набор токенов, что и forest', () => {
    const forest = Object.keys(tokens(':root {'));
    const warm = Object.keys(tokens(":root[data-theme='warm']"));
    expect(warm.sort()).toEqual(forest.sort());
  });

  it('цвета серий в обеих палитрах совпадают', () => {
    const forest = tokens(':root {');
    const warm = tokens(":root[data-theme='warm']");
    for (const k of ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8']) {
      expect(warm[k], `${k} обязан совпадать: палитра серий проверена на дальтонизм и печать`).toBe(forest[k]);
    }
  });

  it('семантические цвета в обеих палитрах совпадают', () => {
    const forest = tokens(':root {');
    const warm = tokens(":root[data-theme='warm']");
    for (const k of ['--danger', '--success', '--warning', '--info']) {
      expect(warm[k], `${k} обязан значить одно и то же в обеих темах`).toBe(forest[k]);
    }
  });
});
