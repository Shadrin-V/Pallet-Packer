// Проверка артефакта для ERP перед сдачей (контракт erp-y6tb9 §7, бид lp-erp-build):
//
//   npm run verify:erp                  — сдача в ERP и CI: дерево обязано быть чистым (dirty: false)
//   npm run verify:erp -- --allow-dirty — только проверка до коммита
//
// Собирает `build:erp` ДВАЖДЫ — вторую с заведомо «враждебным» окружением (`hostileBuildEnv`: dev-режим,
// чужие браузеры, сетка autoprefixer) — и требует: обе сборки побайтово равны (ERP пересобирает на своей
// машине и сравнивает побайтово); в `apps/web/dist-erp` ровно четыре обычных файла артефакта (страница и
// `lkw_motor.js`, ADR 027, поправка 2026-11-25) и `HERKUNFT.json`, без `.html`, ссылок, подкаталогов и
// лишних чанков; размеры — в пределах ERP; файлы страницы побайтово равны эталону 5d67485 (второй проход
// не меняет первый); паспорт — в канонической форме, годен (`checkHerkunft`, правила `pruefe` ERP), его
// коммит — текущий HEAD, версия движка — из собранного пакета, sha256 — от файлов на диске; сканеры
// запретов (для `lkw_motor.js` — и замки «без сети и без ERP» и самодостаточности) пусты; собранный
// `lkw_motor.js` после каждой из двух сборок загружается и отдаёт ровно экспорт фасада, версии и пробный
// расчёт (`checkMotorModule`). Иначе — exit 1 с перечнем нарушений.
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ERP_ARTIFACT_FILES,
  ERP_MOTOR_FILE,
  HERKUNFT_FILE,
  checkFirstPassReference,
  checkHerkunft,
  checkMotorModule,
  diffBuilds,
  hostileBuildEnv,
  scanArtifactFiles,
  serializeHerkunft,
  sha256Hex,
  type Herkunft,
} from './erpArtifact';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(REPO, 'apps/web/dist-erp');
const allowDirty = process.argv.includes('--allow-dirty');
/** Пределы `pruefe` в ERP: паспорт — 64 КиБ, файл артефакта — 8 МиБ. */
const MAX_HERKUNFT = 64 * 1024;
const MAX_FILE = 8 * 1024 * 1024;

type Snapshot = Map<string, Buffer>;

function buildOnce(label: string, env: NodeJS.ProcessEnv, problems: string[]): Snapshot {
  console.log(`\n=== verify:erp — ${label} ===`);
  execFileSync('npm', ['run', 'build:erp'], { cwd: REPO, stdio: 'inherit', env });
  const snap: Snapshot = new Map();
  for (const name of readdirSync(OUT).sort()) {
    const full = path.join(OUT, name);
    if (!lstatSync(full).isFile()) {
      problems.push(`dist-erp: ${name} — не обычный файл (ссылка или каталог)`);
      continue;
    }
    snap.set(name, readFileSync(full));
  }
  return snap;
}

/**
 * Загружает только что собранный `lkw_motor.js` (по file-URL с номером сборки — без кэша модулей между
 * сборками) и проверяет поверхность экспорта против паспорта той же сборки (`checkMotorModule`).
 * Вызывается сразу после каждой сборки, пока следующая не перезаписала `dist-erp/`.
 */
async function checkBuiltMotor(build: number, snap: Snapshot, problems: string[]): Promise<void> {
  const label = `сборка ${build}`;
  if (!snap.has(ERP_MOTOR_FILE)) return; // отсутствие файла называет состав каталога и сканеры
  let engineContractVersion: unknown;
  try {
    engineContractVersion = (JSON.parse(snap.get(HERKUNFT_FILE)?.toString('utf8') ?? 'null') as Record<string, unknown> | null)
      ?.engineContractVersion;
  } catch {
    engineContractVersion = undefined; // паспорт разбирает и называет шаг 3
  }
  try {
    const url = `${pathToFileURL(path.join(OUT, ERP_MOTOR_FILE)).href}?build=${build}`;
    const mod = (await import(url)) as Record<string, unknown>;
    for (const p of checkMotorModule({ ...mod }, engineContractVersion)) problems.push(`${label}: ${p}`);
  } catch (e) {
    problems.push(`${label}: ${ERP_MOTOR_FILE} не загружается как ES-модуль: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Разобранный паспорт; каноническая форма (`serializeHerkunft`) исключает и повтор ключей. */
function parseHerkunft(snap: Snapshot, problems: string[]): Record<string, unknown> | undefined {
  const raw = snap.get(HERKUNFT_FILE);
  if (!raw) {
    problems.push(`нет ${HERKUNFT_FILE}`);
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    problems.push(`${HERKUNFT_FILE} — не JSON`);
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    problems.push(`${HERKUNFT_FILE} — не JSON-объект`);
    return undefined;
  }
  if (raw.toString('utf8') !== serializeHerkunft(parsed as Herkunft)) problems.push(`${HERKUNFT_FILE} — не в канонической форме`);
  return parsed as Record<string, unknown>;
}

async function main(): Promise<number> {
  const problems: string[] = [];
  const first = buildOnce('сборка 1 из 2 (окружение как есть)', process.env, problems);
  await checkBuiltMotor(1, first, problems);
  const second = buildOnce('сборка 2 из 2 (враждебное окружение: NODE_ENV=development, BROWSERSLIST, AUTOPREFIXER_GRID)', hostileBuildEnv(process.env), problems);
  await checkBuiltMotor(2, second, problems);

  // 1. Воспроизводимость и устойчивость к окружению: тот же состав, те же байты (включая паспорт).
  problems.push(...diffBuilds(first, second));
  const names = [...second.keys()];

  // 2. Состав каталога: ровно четыре файла артефакта и паспорт — без .html и без лишних чанков второго
  //    прохода; размеры — в пределах ERP.
  const expected = [...ERP_ARTIFACT_FILES, HERKUNFT_FILE].sort();
  if (names.join('\n') !== expected.join('\n')) problems.push(`dist-erp: [${names.join(', ')}] ≠ [${expected.join(', ')}]`);
  for (const name of names) if (name.endsWith('.html')) problems.push(`dist-erp: лишний ${name}`);
  for (const [name, bytes] of second) {
    const limit = name === HERKUNFT_FILE ? MAX_HERKUNFT : MAX_FILE;
    if (bytes.length > limit) problems.push(`${name}: ${bytes.length} B больше предела ERP ${limit} B`);
  }

  // 2а. Первый проход (страница) — побайтово эталон 5d67485.
  problems.push(...checkFirstPassReference(second));

  // 3. Паспорт: годен, указывает на текущий HEAD и собранную версию движка, хэши — от файлов на диске.
  const h = parseHerkunft(second, problems);
  if (h) {
    problems.push(...checkHerkunft(h, { allowDirty }));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    if (h.commit !== head) problems.push(`commit: ${String(h.commit)} ≠ HEAD ${head}`);
    const { ENGINE_CONTRACT_VERSION } = await import('@shadrin-v/engine');
    if (h.engineContractVersion !== ENGINE_CONTRACT_VERSION) {
      problems.push(`engineContractVersion: ${String(h.engineContractVersion)} ≠ ${ENGINE_CONTRACT_VERSION}`);
    }
    const files = (typeof h.files === 'object' && h.files !== null ? h.files : {}) as Record<string, unknown>;
    for (const name of ERP_ARTIFACT_FILES) {
      const bytes = second.get(name);
      if (bytes && files[name] !== sha256Hex(bytes)) problems.push(`files["${name}"] не совпадает с sha256 файла`);
    }
  }

  // 4. Сканеры запретов (контракт §7) и замки `lkw_motor.js` (решение A′).
  problems.push(...scanArtifactFiles(second));

  console.log('\n=== verify:erp — итог ===');
  if (problems.length > 0) {
    console.error(`НАРУШЕНИЯ (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  for (const name of expected) {
    const bytes = second.get(name)!;
    console.log(`  ${sha256Hex(bytes)}  ${String(bytes.length).padStart(9)} B  ${name}`);
  }
  console.log(`OK: обе сборки (вторая — во враждебном окружении) побайтово равны; commit ${String(h!.commit)}, dirty: ${String(h!.dirty)}${allowDirty ? ' (--allow-dirty)' : ''}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
