import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import browserslist from 'browserslist';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ROOT_PREFIXES,
  ERP_ARTIFACT_FILES,
  ERP_BASE,
  ERP_BROWSERSLIST,
  ERP_MOTOR_FILE,
  FIRST_PASS_REFERENCE,
  buildHerkunft,
  checkFirstPassReference,
  checkHerkunft,
  diffBuilds,
  hostileBuildEnv,
  findCssForbidden,
  findDynamicCode,
  findHostAccess,
  findModuleLinks,
  findRootAbsoluteLiterals,
  scanArtifactFiles,
  serializeHerkunft,
  sha256Hex,
} from '../apps/web/build/erpArtifact';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Сканеры и паспорт артефакта для ERP (контракт erp-y6tb9 §7, бид lp-erp-build).
describe('артефакт для ERP: значения контракта §7', () => {
  it('база, состав файлов и разрешённые адреса от корня — дословно', () => {
    expect(ERP_BASE).toBe('/assets/schaefer_erp/ladungsplaner/');
    expect([...ERP_ARTIFACT_FILES]).toEqual(['ladungsplaner.js', 'ladungsplaner.css', 'logo.svg', 'lkw_motor.js']);
    expect(ERP_MOTOR_FILE).toBe('lkw_motor.js');
    expect([...ALLOWED_ROOT_PREFIXES]).toEqual(['/api/method/schaefer_erp.ladungsplaner.api.', ERP_BASE]);
  });
});

describe('сканеры артефакта', () => {
  it('находит абсолютные пути от корня, кроме API и базы', () => {
    const js = 'f("/api/method/schaefer_erp.ladungsplaner.api."+m);a="/assets/schaefer_erp/ladungsplaner/logo.svg";b="/logo.svg";c=`/api/plans`;d="//cdn.example.com/x.js";e="https://reactjs.org/x";g="/"';
    expect(findRootAbsoluteLiterals(js)).toEqual(['/logo.svg', '/api/plans', '//cdn.example.com/x.js']);
  });

  it('запреты CSS: внешние url, @import, @font-face', () => {
    expect(findCssForbidden('a{background:url(/x.png)}@import "y.css";@font-face{font-family:X}b{background:url(data:image/png;base64,AA)}'))
      .toEqual(['url(/x.png)', '@import "y.css"', '@font-face']);
  });

  it('динамический код', () => {
    expect(findDynamicCode('eval("1");new Function("a");evaluate(1)')).toHaveLength(2);
  });
});

// erp-y6tb9.15, решение A′: lkw_motor.js — без сети, без ERP, без хоста и самодостаточный (🔬 У2).
describe('lkw_motor.js: замки', () => {
  it('замок «без сети и без ERP»: каждый запрещённый токен найден', () => {
    const tokens = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'frappe', 'window.',
      'globalThis', 'localStorage', 'sessionStorage', 'document.'];
    for (const tok of tokens) expect(findHostAccess(`const a=1;${tok}x;`)).toEqual([tok]);
    expect(findHostAccess('a=fetch (u)')).toEqual(['fetch (']);
    expect(findHostAccess('Symbol.for("react.element")')).toEqual(['react']);
    expect(findHostAccess('import*as R from"react-dom"')).toEqual(['react']);
  });

  it('замок «без сети и без ERP»: чистый модуль и похожие слова — пусто', () => {
    expect(findHostAccess('function f(a){return a.length*2}const prefetch=1;export{f as calculateCapacity};')).toEqual([]);
    expect(findHostAccess('"Reaktion";"windows";"documents"')).toEqual([]);
  });

  it('самодостаточность: import, import(), export … from — найдены; свой export {…} и похожие слова — нет', () => {
    expect(findModuleLinks('import{a}from"./x.js";')).toHaveLength(1);
    expect(findModuleLinks('import"./side.js";')).toHaveLength(1);
    expect(findModuleLinks('const m=import("./chunk.js");')).toHaveLength(1);
    expect(findModuleLinks('const m=import ("./chunk.js");')).toHaveLength(1);
    expect(findModuleLinks('const u=import.meta.url;')).toHaveLength(1);
    expect(findModuleLinks('export{a}from"./x.js";')).toHaveLength(1);
    expect(findModuleLinks('export * from "./x.js";')).toHaveLength(1);
    expect(findModuleLinks('export*as ns from"./x.js";')).toHaveLength(1);
    expect(findModuleLinks('const a=1,b=2;export{a as A,b as B};')).toEqual([]);
    expect(findModuleLinks('const important=1,imported=2,reimport=3;export{important};')).toEqual([]);
  });

  it('самодостаточность: ключи словаря вида "setup.import.failed" и свойство x.import — не ссылки модуля', () => {
    // Словари i18n вшиты в lkw_motor.js (подписи отсеков); их ключи `setup.import.*` — данные, не синтаксис.
    expect(findModuleLinks('const d={"setup.import.failed":"Auftrag konnte nicht importiert werden."};')).toEqual([]);
    expect(findModuleLinks('a.import(1);')).toEqual([]);
    // Слово import в начале строки-данных — осторожно считается: реальной формы модуля от данных не отличить.
    expect(findModuleLinks('const s="import x";')).toHaveLength(1);
  });

  it('сканеры прогоняются и по lkw_motor.js: адреса от корня, динамический код, сеть/ERP, внешние ссылки', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const clean = new Map([
      ['ladungsplaner.js', enc('fetch("/api/method/schaefer_erp.ladungsplaner.api.x");window.a=1')],
      ['ladungsplaner.css', enc('a{color:red}')],
      ['lkw_motor.js', enc('const f=a=>a*2;export{f as calculateCapacity};')],
    ]);
    expect(scanArtifactFiles(clean)).toEqual([]);
    const dirty = new Map(clean);
    dirty.set('lkw_motor.js', enc('const u="/api/plans";eval("1");fetch(u);const m=import("./c.js");export{m};'));
    const problems = scanArtifactFiles(dirty);
    expect(problems).toHaveLength(4);
    for (const p of problems) expect(p).toMatch(/^lkw_motor\.js: /);
    expect(problems.some((p) => p.includes('/api/plans'))).toBe(true);
    expect(problems.some((p) => p.includes('eval'))).toBe(true);
    expect(problems.some((p) => p.includes('fetch('))).toBe(true);
    expect(problems.some((p) => p.includes('import'))).toBe(true);
    // Без lkw_motor.js сканер не молчит: отсутствие файла — тоже нарушение.
    const missing = new Map(clean);
    missing.delete('lkw_motor.js');
    expect(scanArtifactFiles(missing)).toEqual([expect.stringContaining('lkw_motor.js')]);
  });
});

// Первый проход (страница) — побайтово как в коммите 5d67485: второй проход его не трогает (Focus 4).
describe('первый проход: эталон 5d67485', () => {
  it('эталон — дословно из паспорта 5d67485, ровно три файла страницы', () => {
    expect({ ...FIRST_PASS_REFERENCE }).toEqual({
      'ladungsplaner.js': '64df1b8d7b839f017c971fc480d5c1da0e675452c8d5391ef705ac9d056c23ba',
      'ladungsplaner.css': 'f0504847444b7ff079d189002a389261e0ecacb10ca31a0d42341ce52757965f',
      'logo.svg': 'aea33712175363e97a214ba5cebba06ef79b7fc9c712aceb77e8ced10121fac2',
    });
  });

  it('другие байты или отсутствующий файл страницы — нарушение по каждому файлу', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const other = new Map([['ladungsplaner.js', enc('j')], ['ladungsplaner.css', enc('c')], ['logo.svg', enc('s')], ['lkw_motor.js', enc('m')]]);
    const problems = checkFirstPassReference(other);
    expect(problems).toHaveLength(3);
    for (const name of ['ladungsplaner.js', 'ladungsplaner.css', 'logo.svg']) expect(problems.some((p) => p.startsWith(name))).toBe(true);
    expect(checkFirstPassReference(new Map())).toHaveLength(3);
  });
});

describe('HERKUNFT.json', () => {
  it('HERKUNFT: грязное дерево и чужой состав файлов — нарушения', () => {
    const h = buildHerkunft({ commit: 'c'.repeat(40), dirty: true, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
      files: Object.fromEntries(ERP_ARTIFACT_FILES.map((f) => [f, new TextEncoder().encode(f)])) });
    expect(checkHerkunft(h, { allowDirty: false })).toEqual([expect.stringContaining('dirty')]);
    expect(checkHerkunft(h, { allowDirty: true })).toEqual([]);
    expect(checkHerkunft({ ...h, dirty: false, files: { 'ladungsplaner.js': 'x' } }, { allowDirty: false })).not.toEqual([]);
  });

  it('HERKUNFT: паспорт ровно на 4 файла — прежние три без lkw_motor.js и пятый лишний — нарушения', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const base = { commit: 'c'.repeat(40), dirty: false, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1' };
    const three = buildHerkunft({ ...base, files: { 'ladungsplaner.js': enc('j'), 'ladungsplaner.css': enc('c'), 'logo.svg': enc('s') } });
    expect(checkHerkunft(three, { allowDirty: false })).toEqual([expect.stringContaining('lkw_motor.js')]);
    const four = buildHerkunft({ ...base, files: { 'ladungsplaner.js': enc('j'), 'ladungsplaner.css': enc('c'), 'logo.svg': enc('s'), 'lkw_motor.js': enc('m') } });
    expect(checkHerkunft(four, { allowDirty: false })).toEqual([]);
    const five = buildHerkunft({ ...base, files: { 'ladungsplaner.js': enc('j'), 'ladungsplaner.css': enc('c'), 'logo.svg': enc('s'), 'lkw_motor.js': enc('m'), 'lkw_motor-x.js': enc('x') } });
    expect(checkHerkunft(five, { allowDirty: false })).toEqual([expect.stringContaining('lkw_motor-x.js')]);
  });

  it('HERKUNFT: чужие база и контракт API — нарушения', () => {
    const h = buildHerkunft({ commit: 'c'.repeat(40), dirty: false, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
      files: Object.fromEntries(ERP_ARTIFACT_FILES.map((f) => [f, new TextEncoder().encode(f)])) });
    expect(checkHerkunft(h, { allowDirty: false })).toEqual([]);
    expect(checkHerkunft({ ...h, base: '/' }, { allowDirty: false })).toEqual([expect.stringContaining('base')]);
    expect(checkHerkunft({ ...h, erpApiContract: 'erp-y6tb9-v2' }, { allowDirty: false })).toEqual([expect.stringContaining('erpApiContract')]);
  });

  it('HERKUNFT детерминирован и с отсортированными файлами', () => {
    const input = { commit: 'c'.repeat(40), dirty: false, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
      files: { 'logo.svg': new TextEncoder().encode('s'), 'ladungsplaner.js': new TextEncoder().encode('j') } };
    expect(serializeHerkunft(buildHerkunft(input))).toBe(serializeHerkunft(buildHerkunft(input)));
    expect(Object.keys(buildHerkunft(input).files)).toEqual(['ladungsplaner.js', 'logo.svg']);
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  // Круг ревью 1, находка 3: проверка не мягче, чем `pruefe` в ERP (schaefer_erp/ladungsplaner/artefakt.py).
  const good = () => buildHerkunft({ commit: 'c'.repeat(40), dirty: false, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
    files: Object.fromEntries(ERP_ARTIFACT_FILES.map((f) => [f, new TextEncoder().encode(f)])) });
  const both = (h: unknown) => [checkHerkunft(h, { allowDirty: false }), checkHerkunft(h, { allowDirty: true })];

  it('dirty — только булево false (true — лишь с --allow-dirty): "false" и 0 — нарушения', () => {
    for (const dirty of ['false', 0, null, undefined]) {
      for (const problems of both({ ...good(), dirty })) expect(problems).toEqual([expect.stringContaining('dirty')]);
    }
    expect(both({ ...good(), dirty: true })).toEqual([[expect.stringContaining('dirty')], []]);
  });

  it('набор ключей паспорта — ровно ожидаемый: лишний и недостающий ключ — нарушения', () => {
    for (const problems of both({ ...good(), builtAt: '2026-11-23' })) expect(problems).toEqual([expect.stringContaining('builtAt')]);
    const { engineContractVersion: _drop, ...missing } = good();
    for (const problems of both(missing)) expect(problems.some((p) => p.includes('engineContractVersion'))).toBe(true);
  });

  it('типы значений — как требует ERP: версия движка — непустая строка, commit — 40 hex, files — объект строк', () => {
    for (const engineContractVersion of ['', '  ', 19]) {
      expect(checkHerkunft({ ...good(), engineContractVersion }, { allowDirty: false })).toEqual([expect.stringContaining('engineContractVersion')]);
    }
    expect(checkHerkunft({ ...good(), commit: 'C'.repeat(40) }, { allowDirty: false })).toEqual([expect.stringContaining('commit')]);
    expect(checkHerkunft({ ...good(), files: [] }, { allowDirty: false })).not.toEqual([]);
    expect(checkHerkunft({ ...good(), files: { ...good().files, 'logo.svg': 1 } }, { allowDirty: false })).toEqual([expect.stringContaining('logo.svg')]);
    expect(checkHerkunft(null, { allowDirty: false })).not.toEqual([]);
    expect(checkHerkunft([], { allowDirty: false })).not.toEqual([]);
  });

  it('паспорт — ровно поля контракта §7, без отметки времени; JSON с отступом 2 и переводом строки в конце', () => {
    const h = buildHerkunft({ commit: 'c'.repeat(40), dirty: false, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
      files: { 'ladungsplaner.js': new TextEncoder().encode('j') } });
    expect(Object.keys(h)).toEqual(['artifact', 'commit', 'dirty', 'engineContractVersion', 'erpApiContract', 'base', 'files']);
    expect(h.artifact).toBe('ladungsplaner');
    expect(h.base).toBe(ERP_BASE);
    expect(serializeHerkunft(h)).toBe(JSON.stringify(h, null, 2) + '\n');
  });
});

// Круг ревью 1, находка 1: входы сборки ERP не берутся из окружения машины.
describe('сборка ERP не зависит от окружения машины', () => {
  it('список браузеров задан явно и равен нынешнему умолчанию browserslist (CSS не меняется)', () => {
    expect([...ERP_BROWSERSLIST]).toEqual(browserslist.defaults);
  });

  it('«враждебное» окружение второй сборки verify:erp: dev-режим, чужие браузеры, сетка autoprefixer', () => {
    const env = hostileBuildEnv({ PATH: '/bin', HOME: '/home/x' });
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/home/x');
    expect(env.NODE_ENV).toBe('development');
    expect(env.BROWSERSLIST).toBeTruthy();
    expect(browserslist(env.BROWSERSLIST)).not.toEqual(browserslist([...ERP_BROWSERSLIST]));
    expect(env.BROWSERSLIST_ENV).toBe('development');
    expect(env.AUTOPREFIXER_GRID).toBe('autoplace');
  });

  it('сравнение двух сборок называет каждое расхождение: состав и байты', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const a = new Map([['a.js', enc('1')], ['b.css', enc('2')]]);
    expect(diffBuilds(a, new Map(a))).toEqual([]);
    expect(diffBuilds(a, new Map([['a.js', enc('1')], ['b.css', enc('3')]]))).toEqual([expect.stringContaining('b.css')]);
    expect(diffBuilds(a, new Map([['a.js', enc('1')]]))).toEqual([expect.stringContaining('b.css')]);
  });

  it('.gitattributes: текстовые входы сборки — с LF при любом core.autocrlf', () => {
    const paths = ['apps/web/public/logo.svg', 'apps/web/src/assets/truck-front-side.svg', 'apps/web/src/App.tsx',
      'apps/web/src/theme.css', 'apps/web/tailwind.config.js', 'apps/web/index.html', 'packages/i18n/src/dictionaries/de.ts',
      'packages/engine/src/index.ts'];
    const out = execFileSync('git', ['check-attr', 'eol', '--', ...paths], { cwd: REPO, encoding: 'utf8' });
    for (const p of paths) expect(out).toContain(`${p}: eol: lf`);
  });
});
