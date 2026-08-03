import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Anchor the scan to the repo root derived from THIS file's own location, not from process.cwd().
// A cwd-relative glob passes trivially (0 files, "0 failures") when run from any other directory —
// same class of bug as the open bead LKWkalk-fwl (another test wrongly tied to process.cwd()).
// This file sits at apps/web/src/theme/, so the repo root is four levels up.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// Единственные законные места для hex. theme.css — источник цвета; orderColor.ts — восемь цветов
// серий, нужных в JS для экспорта PNG и одинаковых в обеих палитрах (ADR 025).
const ALLOWED = [
  path.join(ROOT, 'apps/web/src/theme.css'),
  path.join(ROOT, 'apps/web/src/lib/orderColor.ts'),
];

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

// "#face", "#deadbeef", "#a1b2c3" etc. are valid hex-alphabet strings but, in these contexts,
// SVG/DOM fragment references rather than colours: fill="url(#hero-pallets)", href="#pat-1",
// xlink:href="#...", id="...". Without this exclusion a future gradient or clip-path named with
// hex-looking letters would be reported as a hardcoded colour.
const REFERENCE_CONTEXT = /(url\(|href="|xlink:href="|id=")$/;

function hasHardcodedHex(text: string): boolean {
  for (const match of text.matchAll(HEX)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 20), start);
    if (!REFERENCE_CONTEXT.test(before)) return true;
  }
  return false;
}

describe('гейт: ни одного hex вне темы', () => {
  it('в исходниках apps/web нет захардкоженных цветов', () => {
    const files = globSync(path.join(ROOT, 'apps/web/src/**/*.{ts,tsx,svg,css}')).filter(
      (f) => !ALLOWED.includes(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
    );
    // Sanity-check the scan itself before trusting its result: if the root anchoring above ever
    // breaks (e.g. someone "simplifies" the glob back to a cwd-relative pattern), `files` silently
    // becomes empty and the assertion below passes having scanned nothing — a gate that reads as
    // protection while proving nothing is worse than no gate. ~106 files matched when this was
    // written; 50 is comfortably below that and far above zero.
    expect(
      files.length,
      'гейт ничего не просканировал — путь сбился, проверка ничего не доказывает',
    ).toBeGreaterThan(50);

    const offenders = files.filter((f) => hasHardcodedHex(readFileSync(f, 'utf8')));
    expect(
      offenders,
      `hex вне темы (замени на токен из theme.css): ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
