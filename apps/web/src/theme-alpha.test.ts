// Сторож токенов темы (5nb этап 2, финальное ревью, находка C1).
//
// Цвета темы объявлены в tailwind.config.js голым `var(--paper)`. Tailwind 3.4 подмешивает альфу
// (`bg-paper/95`) только в цвет, записанный с плейсхолдером `<alpha-value>` — на голую переменную
// он молча НЕ выпускает правило: класс есть в разметке, правила в собранном CSS нет, элемент
// остаётся с `rgba(0, 0, 0, 0)`. Так липкая шапка «Настройки» уехала на прод полностью прозрачной,
// и заметить это по исходнику нельзя — только по собранному бандлу.
//
// Тест читает список токенов прямо из конфига, поэтому новый цвет он начинает стеречь сам.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import tailwindConfig from '../tailwind.config.js';

// Корень запуска — корень монорепо (vitest.config.ts лежит там же). `import.meta.url` не годится:
// под jsdom он не файловая схема.
const SRC = join(process.cwd(), 'apps/web/src');

/** Имена цветовых токенов темы, как их пишет Tailwind в классе: `series.1` → `series-1`. */
function themeColorNames(): string[] {
  const colors = (tailwindConfig as { theme?: { extend?: { colors?: Record<string, unknown> } } })
    .theme?.extend?.colors;
  const names: string[] = [];
  for (const [key, value] of Object.entries(colors ?? {})) {
    if (typeof value === 'string') names.push(key);
    else for (const sub of Object.keys(value as Record<string, unknown>)) names.push(`${key}-${sub}`);
  }
  return names;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('токены темы', () => {
  it('нигде не используются с модификатором прозрачности — такое правило Tailwind не выпускает', () => {
    const names = themeColorNames();
    expect(names).toContain('paper');
    // `-token/<число>` в любой утилите (bg-, text-, border-, ring-, from-, …).
    const broken = new RegExp(`-(?:${names.join('|')})/\\d`, 'g');
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const hits = readFileSync(file, 'utf8').match(broken) ?? [];
      return hits.map((hit) => `${file.slice(SRC.length)}: ${hit}`);
    });
    expect(offenders).toEqual([]);
  });
});
