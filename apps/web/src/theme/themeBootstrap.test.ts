import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from './useTheme';

// Финальное ревью, находка 6: без инлайнового bootstrap-скрипта в <head> первая отрисовка каждой
// сессии показывает дефолтную (forest) палитру, даже когда пользователь выбрал warm — applyTheme
// в useTheme.ts выставляет data-theme только после того, как модуль импортирован, то есть уже
// после парсинга бандла. jsdom не рисует страницу, так что здесь пиновается не отсутствие мелька-
// ния (это факт про реальный браузер), а структурное свойство: index.html содержит синхронный
// inline-скрипт, читающий тот же ключ localStorage и выставляющий тот же атрибут ДО <div id="root">.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const html = readFileSync(path.join(ROOT, 'apps/web/index.html'), 'utf8');

describe('index.html — синхронный bootstrap темы до первой отрисовки', () => {
  it('инлайновый скрипт в <head> ставит data-theme по тому же ключу localStorage, что и useTheme', () => {
    const headEnd = html.indexOf('</head>');
    const rootDiv = html.indexOf('id="root"');
    expect(headEnd).toBeGreaterThan(-1);
    expect(rootDiv).toBeGreaterThan(headEnd); // #root монтируется после </head>, скрипт — до него

    const head = html.slice(0, headEnd);
    expect(head).toContain('<script>');
    expect(head).toContain(THEME_STORAGE_KEY);
    expect(head).toContain("setAttribute('data-theme', 'warm')");
  });
});
