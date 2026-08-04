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

// Комментарии вырезаются ДО поиска блока, и это не косметика: пояснение вида «а не --mint-tint:
// тот держит…» разбиралось как объявление токена, чьё значение тянулось через весь комментарий до
// следующей `;` — и проглатывало настоящее объявление, стоящее следом. Гейт при этом оставался
// зелёным на мусоре. Поймано ровно так, вживую (2026-08-04).
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const block = (source: string, selector: string) => {
  const clean = stripComments(source);
  const i = clean.indexOf(selector);
  expect(i, `блок ${selector} не найден`).toBeGreaterThan(-1);
  return clean.slice(i, clean.indexOf('}', i));
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

/** Относительная яркость по WCAG 2.x (sRGB).
 *
 *  Разбор строгий и БРОСАЕТ, а не «ожидает»: мягкая проверка длины не прерывала бы выполнение, и
 *  `#55605b00` — валидный полностью ПРОЗРАЧНЫЙ цвет — разобрался бы по первым трём парам как
 *  непрозрачный `#55605b` с честными 6:1, хотя текст на экране невидим. Гейт, который можно обойти
 *  валидным значением, хуже отсутствующего (находка кросс-модельного ревью, 2026-08-04). */
const luminance = (hex: string) => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`токен обязан быть непрозрачным 6-значным hex, получено: ${hex}`);
  const [r, g, b] = m[1]
    .match(/../g)!
    .map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Гейт, а не благое пожелание: тёплую палитру приводили к норме вручную, а зелёная осталась с
// --faint 2.54:1 — и заметили это только через сессию. На --faint висят единицы измерения,
// микро-подписи и метки Vorne/Hinten, то есть носители смысла: WCAG 1.4.3 требует 4.5:1 для
// мелкого текста. Теперь ни одна палитра не сможет разойтись с нормой молча.
describe('чернильный ряд обеих палитр проходит WCAG 1.4.3 (4.5:1)', () => {
  // Сам разбор — часть гейта, поэтому проверяется отдельно: прозрачный «цвет» обязан ронять тест,
  // а не проходить по первым шести цифрам.
  it('прозрачный или неполный hex отвергается разбором, а не считается непрозрачным', () => {
    expect(() => contrast('#55605b00', '#ffffff')).toThrow(/hex/);
    expect(() => contrast('rgba(85, 96, 91, 0.2)', '#ffffff')).toThrow(/hex/);
    expect(contrast('#55605b', '#f5f8f6')).toBeCloseTo(6.12, 1);
  });

  for (const [name, selector] of [
    ['forest', ':root {'],
    ['warm', ":root[data-theme='warm']"],
  ] as const) {
    it(`${name}: --ink, --muted и --faint читаемы на --paper`, () => {
      const t = tokens(css, selector);
      for (const key of ['--ink', '--muted', '--faint']) {
        expect(contrast(t[key], t['--paper']), `${name} ${key} = ${t[key]} на ${t['--paper']}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    // Три ступени должны оставаться различимыми, иначе «поднять контраст» вырождается в один
    // цвет на всё: именно поэтому в тёплой палитре --muted ушёл темнее, а не --faint посветлел.
    it(`${name}: ступени ряда идут по убыванию яркости и не сливаются`, () => {
      const t = tokens(css, selector);
      const [ink, muted, faint] = ['--ink', '--muted', '--faint'].map((k) => contrast(t[k], t['--paper']));
      expect(ink).toBeGreaterThan(muted);
      expect(muted).toBeGreaterThan(faint);
      expect(muted / faint, `${name}: --muted и --faint слишком близки`).toBeGreaterThanOrEqual(1.15);
    });
  }
});

// Хвост градиента шапки — свой токен, а не `--mint-tint`: в тёплой палитре зелёный хвост делал
// шапку холоднее бежевого тела (владелец, 2026-08-04). Токен есть в обеих палитрах (требование
// ADR 025 о совпадении наборов), но значение в тёплой — тёплое.
describe('--hero-tint: хвост градиента шапки следует за температурой палитры', () => {
  const rgb = (v: string) => v.match(/[\d.]+/g)!.slice(0, 3).map(Number);

  it('объявлен в обеих палитрах', () => {
    expect(tokens(css, ':root {')['--hero-tint']).toBeTruthy();
    expect(tokens(css, ":root[data-theme='warm']")['--hero-tint']).toBeTruthy();
  });

  it('в forest холодный (зелёный), в warm тёплый (красный канал выше синего)', () => {
    const [fr, fg, fb] = rgb(tokens(css, ':root {')['--hero-tint']);
    expect(fg, 'forest: хвост зелёный — зелёный канал ведущий').toBeGreaterThan(fr);
    expect(fg).toBeGreaterThan(fb);
    const [wr, , wb] = rgb(tokens(css, ":root[data-theme='warm']")['--hero-tint']);
    expect(wr, 'warm: хвост тёплый — красный канал выше синего').toBeGreaterThan(wb);
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
