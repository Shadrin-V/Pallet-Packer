import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Замок слоя erp/: приведение данных ERP к состоянию экрана — чистые модули без React и без
// экранных .tsx-компонентов (решение оркестратора по находке «доменная логика в UI»).
// Корень репозитория — от расположения ЭТОГО файла (apps/web/src/erp/), а не от process.cwd():
// путь от cwd из другого каталога дал бы 0 файлов и ложный зелёный прогон.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ERP_DIR = path.join(ROOT, 'apps/web/src/erp');

/** Все цели импорта модуля, кроме чисто типовых: static `import … from`, `export … from`, побочный `import 'x'`, динамический `import('x')`. */
function runtimeImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [
    ...[...code.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map((m) => m[1]),
  ];
}
const isReact = (spec: string) => /^react(-dom)?(\/.*)?$/.test(spec); // react, react-dom, react/jsx-runtime, react-dom/client …
const isTsx = (spec: string, from: string) =>
  spec.endsWith('.tsx') ||
  (spec.startsWith('.') && (existsSync(path.resolve(from, spec + '.tsx')) || existsSync(path.resolve(from, spec, 'index.tsx'))));

describe('слой erp/', () => {
  it('модули erp/*.ts — чистые: ни React, ни .tsx-модулей ни в каком виде импорта (кроме import type)', () => {
    const files = readdirSync(ERP_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files).toEqual(expect.arrayContaining(['zoneDraft.ts', 'planContext.ts']));
    for (const f of files) {
      for (const spec of runtimeImports(readFileSync(path.join(ERP_DIR, f), 'utf8'))) {
        expect(isReact(spec), `${f} → ${spec}`).toBe(false);
        expect(isTsx(spec, ERP_DIR), `${f} → ${spec} (.tsx)`).toBe(false);
      }
    }
  });

  it('сам замок ловит все формы импорта', () => {
    const bad = [
      "import { useState } from 'react';", "import React from 'react';", "import 'react';", "import { jsx } from 'react/jsx-runtime';",
      "import { createRoot } from 'react-dom/client';", "export { x } from 'react';", "const m = await import('react-dom');",
      "import { UnplaceableList } from '../screens/setup/UnplaceableList.tsx';", "const c = import('../screens/setup/UnplaceableList.tsx');",
    ];
    for (const line of bad) expect(runtimeImports(line).some((sp) => isReact(sp) || isTsx(sp, ERP_DIR)), line).toBe(true);
    expect(runtimeImports("import type { ReactNode } from 'react';")).toEqual([]);
    expect(runtimeImports("import { formatUom } from '../lib/uomLabel';").some((sp) => isReact(sp) || isTsx(sp, ERP_DIR))).toBe(false);
  });
});
