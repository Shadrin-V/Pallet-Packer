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

/** Нарушения паспорта; пустой список — паспорт годен для сдачи в ERP. */
export function checkHerkunft(h: Herkunft, opts: { allowDirty: boolean }): string[] {
  const problems: string[] = [];
  if (h.artifact !== 'ladungsplaner') problems.push(`artifact: "${h.artifact}" ≠ "ladungsplaner"`);
  if (!/^[0-9a-f]{40}$/.test(h.commit)) problems.push(`commit: "${h.commit}" — не 40-значный sha`);
  if (h.dirty && !opts.allowDirty) problems.push('dirty: сборка из дерева с незакоммиченными изменениями (ERP принимает только dirty: false)');
  if (h.base !== ERP_BASE) problems.push(`base: "${h.base}" ≠ "${ERP_BASE}"`);
  if (h.erpApiContract !== ERP_API_CONTRACT_EXPECTED) {
    problems.push(`erpApiContract: "${h.erpApiContract}" ≠ "${ERP_API_CONTRACT_EXPECTED}"`);
  }
  const names = Object.keys(h.files).sort();
  const expected = [...ERP_ARTIFACT_FILES].sort();
  if (names.join('\n') !== expected.join('\n')) {
    problems.push(`files: [${names.join(', ')}] ≠ [${expected.join(', ')}]`);
  }
  for (const [name, hash] of Object.entries(h.files)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) problems.push(`files["${name}"]: "${hash}" — не sha256 hex`);
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
