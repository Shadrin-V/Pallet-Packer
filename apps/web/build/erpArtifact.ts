// Артефакт программы для встраивания в ERP (контракт erp-y6tb9 api-vertrag §7, бид lp-erp-build):
// постоянные имена файлов, паспорт `HERKUNFT.json` и сканеры запретов. ERP принимает артефакт только
// после пересборки из названного коммита с побайтовым совпадением, поэтому паспорт не несёт ничего,
// что меняется от прогона к прогону (времени сборки, путей машины), а ключи `files` отсортированы.
//
// Модуль — инструмент сборки (Node), не код страницы: в `ladungsplaner.js` он не попадает.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export const ERP_BASE = '/assets/schaefer_erp/ladungsplaner/';
export const ERP_ARTIFACT_FILES = ['ladungsplaner.js', 'ladungsplaner.css', 'logo.svg'] as const;
export const ALLOWED_ROOT_PREFIXES = ['/api/method/schaefer_erp.ladungsplaner.api.', ERP_BASE] as const;
export const HERKUNFT_FILE = 'HERKUNFT.json';
const ERP_API_CONTRACT_EXPECTED = 'erp-y6tb9-v1';

export interface Herkunft {
  artifact: 'ladungsplaner';
  commit: string;
  dirty: boolean;
  engineContractVersion: string;
  erpApiContract: string;
  base: string;
  files: Record<string, string>;
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Паспорт артефакта; порядок полей — как в контракте §7, ключи `files` отсортированы. */
export function buildHerkunft(input: {
  commit: string;
  dirty: boolean;
  engineContractVersion: string;
  erpApiContract: string;
  files: Record<string, Uint8Array>;
}): Herkunft {
  const files: Record<string, string> = {};
  for (const name of Object.keys(input.files).sort()) files[name] = sha256Hex(input.files[name]);
  return {
    artifact: 'ladungsplaner',
    commit: input.commit,
    dirty: input.dirty,
    engineContractVersion: input.engineContractVersion,
    erpApiContract: input.erpApiContract,
    base: ERP_BASE,
    files,
  };
}

export function serializeHerkunft(h: Herkunft): string {
  return JSON.stringify(h, null, 2) + '\n';
}

// ---- сканеры ----------------------------------------------------------------------------------

/**
 * Строки в кавычках или бэктиках, начинающиеся с `/` + буква/`_` (адрес от корня сайта) или с `//`
 * (адрес другого хоста без схемы), кроме начинающихся с разрешённого префикса. Сам `"/"` и полные
 * адресы со схемой (`https://…` — тексты библиотек) не считаются.
 */
export function findRootAbsoluteLiterals(js: string, allowed: readonly string[] = ALLOWED_ROOT_PREFIXES): string[] {
  const found: string[] = [];
  for (const m of js.matchAll(/(["'`])(\/(?:\/|[A-Za-z_])[^"'`\n]*)\1/g)) {
    const literal = m[2];
    if (!allowed.some((prefix) => literal.startsWith(prefix))) found.push(literal);
  }
  return found;
}

/** Запреты стилей (контракт §7): `url(…)` кроме `data:`, `@import`, `@font-face`. */
export function findCssForbidden(css: string): string[] {
  return [...css.matchAll(/url\(\s*(?!["']?data:)[^)]*\)|@import[^;]*|@font-face/gi)].map((m) => m[0]);
}

/**
 * Динамический код (контракт §7; CSP оболочки без `unsafe-eval`): `eval(` и `new Function(`, а
 * также вызов `Function(` без `new` — CSP запрещает его точно так же.
 */
export function findDynamicCode(js: string): string[] {
  return [...js.matchAll(/\beval\s*\(|(?:\bnew\s+)?\bFunction\s*\(/g)].map((m) => m[0]);
}

const HERKUNFT_KEYS = ['artifact', 'commit', 'dirty', 'engineContractVersion', 'erpApiContract', 'base', 'files'] as const;

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const show = (x: unknown): string => (x === undefined ? 'undefined' : JSON.stringify(x));

/**
 * Нарушения паспорта; пустой список — паспорт годен для сдачи в ERP. Принимает и разобранный JSON:
 * правила не мягче `pruefe` в ERP (`schaefer_erp/ladungsplaner/artefakt.py`) — ровно семь ключей, `dirty`
 * строго `false` (`true` — только с `--allow-dirty`, до коммита), версия движка — непустая строка, commit —
 * 40 hex в нижнем регистре, `files` — объект ровно трёх файлов со строками sha256.
 */
export function checkHerkunft(h: unknown, opts: { allowDirty: boolean }): string[] {
  if (!isPlainObject(h)) return [`${HERKUNFT_FILE}: не JSON-объект`];
  const problems: string[] = [];
  const keys = Object.keys(h);
  const extra = keys.filter((k) => !(HERKUNFT_KEYS as readonly string[]).includes(k));
  const missing = HERKUNFT_KEYS.filter((k) => !keys.includes(k));
  if (extra.length > 0 || missing.length > 0) {
    problems.push(`ключи: лишние [${extra.sort().join(', ')}], недостающие [${missing.join(', ')}]`);
  }
  if (h.artifact !== 'ladungsplaner') problems.push(`artifact: ${show(h.artifact)} ≠ "ladungsplaner"`);
  if (!(typeof h.commit === 'string' && /^[0-9a-f]{40}$/.test(h.commit))) problems.push(`commit: ${show(h.commit)} — не 40 hex`);
  if (h.dirty !== false && !(h.dirty === true && opts.allowDirty)) {
    problems.push(
      h.dirty === true
        ? 'dirty: сборка из дерева с незакоммиченными изменениями (ERP принимает только dirty: false)'
        : `dirty: ${show(h.dirty)} — не булево false`,
    );
  }
  const version = h.engineContractVersion;
  if (!(typeof version === 'string' && version.trim() !== '')) problems.push(`engineContractVersion: ${show(version)} — не непустая строка`);
  if (h.erpApiContract !== ERP_API_CONTRACT_EXPECTED) {
    problems.push(`erpApiContract: ${show(h.erpApiContract)} ≠ "${ERP_API_CONTRACT_EXPECTED}"`);
  }
  if (h.base !== ERP_BASE) problems.push(`base: ${show(h.base)} ≠ "${ERP_BASE}"`);
  if (!isPlainObject(h.files)) {
    problems.push(`files: ${show(h.files)} — не объект`);
    return problems;
  }
  const names = Object.keys(h.files).sort();
  const expected = [...ERP_ARTIFACT_FILES].sort();
  if (names.join('\n') !== expected.join('\n')) {
    problems.push(`files: [${names.join(', ')}] ≠ [${expected.join(', ')}]`);
  }
  for (const [name, hash] of Object.entries(h.files)) {
    if (!(typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))) problems.push(`files["${name}"]: ${show(hash)} — не sha256 hex`);
  }
  return problems;
}

// ---- устойчивость к окружению машины (круг ревью 1, находка 1) --------------------------------

/**
 * Браузеры для autoprefixer в сборке ERP — явно, тем же набором, что сейчас даёт умолчание browserslist
 * (`browserslist.defaults`): так ни `.browserslistrc`/`package.json` в родительских каталогах, ни переменные
 * `BROWSERSLIST*` не меняют `ladungsplaner.css`. Сменить набор — осознанно, с новой приёмкой в ERP.
 */
export const ERP_BROWSERSLIST = ['> 0.5%', 'last 2 versions', 'Firefox ESR', 'not dead'] as const;

/**
 * Окружение второй сборки `verify:erp`: всё, что сборка ERP обязана игнорировать — dev-режим `NODE_ENV`,
 * другой набор браузеров и его выбор по окружению, сетка autoprefixer. Хэши обязаны совпасть с первой сборкой.
 */
export function hostileBuildEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...base,
    NODE_ENV: 'development',
    BROWSERSLIST: 'ie 11, safari 9',
    BROWSERSLIST_ENV: 'development',
    AUTOPREFIXER_GRID: 'autoplace',
  };
}

/** Расхождения двух сборок: состав каталога и байты каждого файла. */
export function diffBuilds(a: ReadonlyMap<string, Uint8Array>, b: ReadonlyMap<string, Uint8Array>): string[] {
  const problems: string[] = [];
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(name);
    const y = b.get(name);
    if (!x || !y) problems.push(`${name}: есть только в ${x ? 'первой' : 'второй'} сборке`);
    else if (sha256Hex(x) !== sha256Hex(y)) problems.push(`${name}: сборки дали разные байты (${sha256Hex(x)} / ${sha256Hex(y)})`);
  }
  return problems;
}

// ---- плагин сборки ----------------------------------------------------------------------------

const git = (cwd: string, args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

/**
 * Пишет `HERKUNFT.json` в каталог сборки после записи бандла (`public/logo.svg` к этому моменту уже
 * скопирован). `commit` — `git rev-parse HEAD`, `dirty` — непустой `git status --porcelain`. Версии
 * контрактов берутся из собранных пакетов в момент сборки (сам модуль их не импортирует: проверка
 * `verify:erp` запускается и на клоне, где пакеты ещё не собраны).
 */
export function herkunftPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'ladungsplaner-herkunft',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const { ENGINE_CONTRACT_VERSION } = await import('@shadrin-v/engine');
      const { ERP_API_CONTRACT } = await import('@shadrin-v/contracts');
      const files: Record<string, Uint8Array> = {};
      for (const name of ERP_ARTIFACT_FILES) files[name] = readFileSync(path.join(outDir, name));
      const herkunft = buildHerkunft({
        commit: git(config.root, ['rev-parse', 'HEAD']).trim(),
        dirty: git(config.root, ['status', '--porcelain']).trim() !== '',
        engineContractVersion: ENGINE_CONTRACT_VERSION,
        erpApiContract: ERP_API_CONTRACT,
        files,
      });
      writeFileSync(path.join(outDir, HERKUNFT_FILE), serializeHerkunft(herkunft));
    },
  };
}
