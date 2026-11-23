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
  buildHerkunft,
  checkHerkunft,
  diffBuilds,
  hostileBuildEnv,
  findCssForbidden,
  findDynamicCode,
  findRootAbsoluteLiterals,
  serializeHerkunft,
  sha256Hex,
} from '../apps/web/build/erpArtifact';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Сканеры и паспорт артефакта для ERP (контракт erp-y6tb9 §7, бид lp-erp-build).
describe('артефакт для ERP: значения контракта §7', () => {
  it('база, состав файлов и разрешённые адреса от корня — дословно', () => {
    expect(ERP_BASE).toBe('/assets/schaefer_erp/ladungsplaner/');
    expect([...ERP_ARTIFACT_FILES]).toEqual(['ladungsplaner.js', 'ladungsplaner.css', 'logo.svg']);
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

describe('HERKUNFT.json', () => {
  it('HERKUNFT: грязное дерево и чужой состав файлов — нарушения', () => {
    const h = buildHerkunft({ commit: 'c'.repeat(40), dirty: true, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
      files: Object.fromEntries(ERP_ARTIFACT_FILES.map((f) => [f, new TextEncoder().encode(f)])) });
    expect(checkHerkunft(h, { allowDirty: false })).toEqual([expect.stringContaining('dirty')]);
    expect(checkHerkunft(h, { allowDirty: true })).toEqual([]);
    expect(checkHerkunft({ ...h, dirty: false, files: { 'ladungsplaner.js': 'x' } }, { allowDirty: false })).not.toEqual([]);
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
