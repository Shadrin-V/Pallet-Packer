import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ROOT_PREFIXES,
  ERP_ARTIFACT_FILES,
  ERP_BASE,
  buildHerkunft,
  checkHerkunft,
  findCssForbidden,
  findDynamicCode,
  findRootAbsoluteLiterals,
  serializeHerkunft,
  sha256Hex,
} from '../apps/web/build/erpArtifact';

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

  it('паспорт — ровно поля контракта §7, без отметки времени; JSON с отступом 2 и переводом строки в конце', () => {
    const h = buildHerkunft({ commit: 'c'.repeat(40), dirty: false, engineContractVersion: '0.19.0', erpApiContract: 'erp-y6tb9-v1',
      files: { 'ladungsplaner.js': new TextEncoder().encode('j') } });
    expect(Object.keys(h)).toEqual(['artifact', 'commit', 'dirty', 'engineContractVersion', 'erpApiContract', 'base', 'files']);
    expect(h.artifact).toBe('ladungsplaner');
    expect(h.base).toBe(ERP_BASE);
    expect(serializeHerkunft(h)).toBe(JSON.stringify(h, null, 2) + '\n');
  });
});
