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
/**
 * Файлы артефакта в паспорте. Первые три — страница (первый проход, `vite.erp.config.ts`); `lkw_motor.js` —
 * фасад ёмкости для Desk-страницы ERP (второй проход, `vite.erp-motor.config.ts`; ADR 027, поправка
 * 2026-11-25, решение A′).
 */
export const ERP_MOTOR_FILE = 'lkw_motor.js';
export const ERP_ARTIFACT_FILES = ['ladungsplaner.js', 'ladungsplaner.css', 'logo.svg', ERP_MOTOR_FILE] as const;
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

/**
 * Замок «без сети и без ERP» для `lkw_motor.js` (erp-y6tb9.15, 🔬 У2): фасад — чистые функции, поэтому в
 * бандле нет ни сетевых API, ни Frappe, ни глобалов и хранилищ хоста, ни DOM, ни React. Список не ослаблять:
 * если он сработал на код бандлера — разбирать причину, а не убирать токен.
 */
export function findHostAccess(js: string): string[] {
  const re =
    /\bfetch\s*\(|\bXMLHttpRequest|\bWebSocket|\bEventSource|\bsendBeacon|frappe|\bwindow\.|\bglobalThis|\blocalStorage|\bsessionStorage|\bdocument\.|\breact\b/gi;
  return [...js.matchAll(re)].map((m) => m[0]);
}

/**
 * Самодостаточность `lkw_motor.js`: ни одной внешней ссылки модуля — `import` в любой форме (статический,
 * `import(…)`, `import.meta`) и реэкспорт `export … from`. Свой `export { … }` без `from` разрешён.
 * Ни одна форма `import` в коде не стоит после `.` или буквы, поэтому сегмент имени через точку не
 * считается: в бандл вшиты словари i18n (подписи отсеков), и их ключи `setup.import.*` — данные.
 */
export function findModuleLinks(js: string): string[] {
  const re = /(?<![\w$.])import\b|\bexport\s*(?:\*|\{[^}]*\})\s*(?:as\s+[\w$]+\s*)?from\s*["'`]/g;
  return [...js.matchAll(re)].map((m) => m[0]);
}

/** Все сканеры запретов по файлам артефакта (контракт §7; для `lkw_motor.js` — и замки решения A′). */
export function scanArtifactFiles(files: ReadonlyMap<string, Uint8Array>): string[] {
  const text = (name: string) => {
    const bytes = files.get(name);
    return bytes ? Buffer.from(bytes).toString('utf8') : undefined;
  };
  const problems: string[] = [];
  const js = text('ladungsplaner.js') ?? '';
  const css = text('ladungsplaner.css') ?? '';
  for (const x of findRootAbsoluteLiterals(js)) problems.push(`ladungsplaner.js: адрес от корня вне разрешённых: ${x}`);
  for (const x of findRootAbsoluteLiterals(css)) problems.push(`ladungsplaner.css: адрес от корня вне разрешённых: ${x}`);
  for (const x of findDynamicCode(js)) problems.push(`ladungsplaner.js: динамический код: ${x}`);
  for (const x of findCssForbidden(css)) problems.push(`ladungsplaner.css: запрещено: ${x}`);
  const motor = text(ERP_MOTOR_FILE);
  if (motor === undefined) {
    problems.push(`${ERP_MOTOR_FILE}: нет файла`);
    return problems;
  }
  for (const x of findRootAbsoluteLiterals(motor)) problems.push(`${ERP_MOTOR_FILE}: адрес от корня вне разрешённых: ${x}`);
  for (const x of findDynamicCode(motor)) problems.push(`${ERP_MOTOR_FILE}: динамический код: ${x}`);
  for (const x of findHostAccess(motor)) problems.push(`${ERP_MOTOR_FILE}: сеть, ERP или хост: ${x}`);
  for (const x of findModuleLinks(motor)) problems.push(`${ERP_MOTOR_FILE}: внешняя ссылка модуля: ${x}`);
  return problems;
}

// ---- эталон первого прохода -------------------------------------------------------------------

/**
 * sha256 файлов страницы из паспорта коммита 5d67485 (последняя приёмка ERP до `lkw_motor.js`). Второй
 * проход сборки обязан не менять первый: эти три файла — побайтово те же. Константа, а не чтение
 * `dist-erp/HERKUNFT.json` (его перезаписывает каждая сборка). Tailwind сканирует весь `src/**`, так что
 * новый файл исходников может изменить CSS — тогда искать причину, а не менять эталон. Сменить эталон —
 * только осознанно, вместе с новой приёмкой страницы в ERP.
 */
export const FIRST_PASS_REFERENCE: Readonly<Record<string, string>> = Object.freeze({
  'ladungsplaner.js': '64df1b8d7b839f017c971fc480d5c1da0e675452c8d5391ef705ac9d056c23ba',
  'ladungsplaner.css': 'f0504847444b7ff079d189002a389261e0ecacb10ca31a0d42341ce52757965f',
  'logo.svg': 'aea33712175363e97a214ba5cebba06ef79b7fc9c712aceb77e8ced10121fac2',
});

/** Расхождения файлов страницы с эталоном 5d67485; пустой список — первый проход не изменился. */
export function checkFirstPassReference(files: ReadonlyMap<string, Uint8Array>): string[] {
  const problems: string[] = [];
  for (const [name, expected] of Object.entries(FIRST_PASS_REFERENCE)) {
    const bytes = files.get(name);
    if (!bytes) problems.push(`${name}: нет файла (эталон 5d67485 ${expected})`);
    else if (sha256Hex(bytes) !== expected) problems.push(`${name}: sha256 ${sha256Hex(bytes)} ≠ эталон 5d67485 ${expected}`);
  }
  return problems;
}

const HERKUNFT_KEYS = ['artifact', 'commit', 'dirty', 'engineContractVersion', 'erpApiContract', 'base', 'files'] as const;

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const show = (x: unknown): string => (x === undefined ? 'undefined' : JSON.stringify(x));

/**
 * Нарушения паспорта; пустой список — паспорт годен для сдачи в ERP. Принимает и разобранный JSON:
 * правила не мягче `pruefe` в ERP (`schaefer_erp/ladungsplaner/artefakt.py`) — ровно семь ключей, `dirty`
 * строго `false` (`true` — только с `--allow-dirty`, до коммита), версия движка — непустая строка, commit —
 * 40 hex в нижнем регистре, `files` — объект ровно файлов `ERP_ARTIFACT_FILES` (четырёх) со строками sha256.
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
 * Пишет `HERKUNFT.json` в каталог сборки после записи бандла. Подключён только ко второму проходу
 * (`vite.erp-motor.config.ts`, `lkw_motor.js`): к этому моменту первый проход уже положил страницу и
 * `logo.svg`, так что паспорт идёт по всем четырём файлам `ERP_ARTIFACT_FILES`.
 * `commit` — `git rev-parse HEAD`, `dirty` — непустой `git status --porcelain`. Версии
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
