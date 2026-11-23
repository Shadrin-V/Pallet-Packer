// Проверка артефакта для ERP перед сдачей (контракт erp-y6tb9 §7, бид lp-erp-build):
//
//   npm run verify:erp                  — сдача в ERP и CI: дерево обязано быть чистым (dirty: false)
//   npm run verify:erp -- --allow-dirty — только проверка до коммита
//
// Собирает `build:erp` ДВАЖДЫ и требует: оба прогона побайтово равны (ERP пересобирает сама и сравнивает
// побайтово); в `apps/web/dist-erp` ровно три файла артефакта и `HERKUNFT.json`, без `.html`; sha256 в
// паспорте — от файлов на диске; сканеры запретов пусты; паспорт годен (`checkHerkunft`), его коммит —
// текущий HEAD, версия движка — из собранного пакета. Иначе — exit 1 с перечнем нарушений.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ERP_ARTIFACT_FILES,
  HERKUNFT_FILE,
  checkHerkunft,
  findCssForbidden,
  findDynamicCode,
  findRootAbsoluteLiterals,
  sha256Hex,
  type Herkunft,
} from './erpArtifact';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(REPO, 'apps/web/dist-erp');
const allowDirty = process.argv.includes('--allow-dirty');

type Snapshot = Map<string, Buffer>;

function buildOnce(run: number): Snapshot {
  console.log(`\n=== verify:erp — сборка ${run} из 2 ===`);
  execFileSync('npm', ['run', 'build:erp'], { cwd: REPO, stdio: 'inherit' });
  const snap: Snapshot = new Map();
  for (const name of readdirSync(OUT).sort()) {
    const full = path.join(OUT, name);
    snap.set(name, statSync(full).isFile() ? readFileSync(full) : Buffer.alloc(0));
  }
  return snap;
}

function parseHerkunft(snap: Snapshot, problems: string[]): Herkunft | undefined {
  const raw = snap.get(HERKUNFT_FILE);
  if (!raw) {
    problems.push(`нет ${HERKUNFT_FILE}`);
    return undefined;
  }
  try {
    return JSON.parse(raw.toString('utf8')) as Herkunft;
  } catch {
    problems.push(`${HERKUNFT_FILE} — не JSON`);
    return undefined;
  }
}

async function main(): Promise<number> {
  const first = buildOnce(1);
  const second = buildOnce(2);
  const problems: string[] = [];

  // 1. Воспроизводимость: те же имена, те же байты, тот же паспорт.
  const names1 = [...first.keys()];
  const names2 = [...second.keys()];
  if (names1.join('\n') !== names2.join('\n')) problems.push(`прогоны дали разный состав: [${names1}] / [${names2}]`);
  for (const [name, bytes] of second) {
    const before = first.get(name);
    if (before && !before.equals(bytes)) problems.push(`${name}: прогоны дали разные байты (${sha256Hex(before)} / ${sha256Hex(bytes)})`);
  }
  const h1 = parseHerkunft(first, problems);
  const h = parseHerkunft(second, problems);
  if (h1 && h && JSON.stringify(h1.files) !== JSON.stringify(h.files)) problems.push('files в HERKUNFT двух прогонов различаются');

  // 2. Состав каталога: ровно три файла артефакта и паспорт, без .html и подкаталогов.
  const expected = [...ERP_ARTIFACT_FILES, HERKUNFT_FILE].sort();
  if (names2.join('\n') !== expected.join('\n')) problems.push(`dist-erp: [${names2.join(', ')}] ≠ [${expected.join(', ')}]`);
  for (const name of names2) if (name.endsWith('.html')) problems.push(`dist-erp: лишний ${name}`);

  // 3. Паспорт: годен, указывает на текущий HEAD и собранную версию движка, хэши — от файлов на диске.
  if (h) {
    problems.push(...checkHerkunft(h, { allowDirty }));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    if (h.commit !== head) problems.push(`commit: ${h.commit} ≠ HEAD ${head}`);
    const { ENGINE_CONTRACT_VERSION } = await import('@shadrin-v/engine');
    if (h.engineContractVersion !== ENGINE_CONTRACT_VERSION) {
      problems.push(`engineContractVersion: ${h.engineContractVersion} ≠ ${ENGINE_CONTRACT_VERSION}`);
    }
    for (const name of ERP_ARTIFACT_FILES) {
      const bytes = second.get(name);
      if (bytes && h.files[name] !== sha256Hex(bytes)) problems.push(`files["${name}"] не совпадает с sha256 файла`);
    }
  }

  // 4. Сканеры запретов (контракт §7).
  const js = second.get('ladungsplaner.js')?.toString('utf8') ?? '';
  const css = second.get('ladungsplaner.css')?.toString('utf8') ?? '';
  for (const x of findRootAbsoluteLiterals(js)) problems.push(`ladungsplaner.js: адрес от корня вне разрешённых: ${x}`);
  for (const x of findRootAbsoluteLiterals(css)) problems.push(`ladungsplaner.css: адрес от корня вне разрешённых: ${x}`);
  for (const x of findDynamicCode(js)) problems.push(`ladungsplaner.js: динамический код: ${x}`);
  for (const x of findCssForbidden(css)) problems.push(`ladungsplaner.css: запрещено: ${x}`);

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
  console.log(`OK: обе сборки побайтово равны; commit ${h!.commit}, dirty: ${h!.dirty}${allowDirty ? ' (--allow-dirty)' : ''}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
