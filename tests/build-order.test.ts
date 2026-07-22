import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the root `build` script (LKWkalk-dsu). npm resolves `--workspaces`
 * alphabetically, which built @shadrin-v/contracts before the @shadrin-v/engine
 * it depends on and produced a broken .d.ts. The fix pins an explicit
 * `--workspace <name>` order; these tests fail if that order stops covering
 * every buildable workspace or stops respecting the dependency graph — so a
 * newly added package can never be silently skipped or misordered.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Workspace {
  name: string;
  hasBuild: boolean;
  internalDeps: string[];
}

const INTERNAL_SCOPES = ['@shadrin-v/', '@app/'];
const isInternal = (dep: string) => INTERNAL_SCOPES.some((s) => dep.startsWith(s));

function readWorkspaces(): Workspace[] {
  const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const globs: string[] = rootPkg.workspaces ?? [];
  const dirs = globs.flatMap((glob) => {
    if (!glob.endsWith('/*')) throw new Error(`Unsupported workspace glob: ${glob}`);
    const parent = join(repoRoot, glob.slice(0, -2));
    return readdirSync(parent).map((child) => join(parent, child));
  });

  return dirs
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .map((dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      return {
        name: pkg.name,
        hasBuild: Boolean(pkg.scripts?.build),
        internalDeps: Object.keys(allDeps).filter(isInternal),
      };
    });
}

function rootBuildOrder(): string[] {
  const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const script: string = rootPkg.scripts.build;
  // Extract the ordered `--workspace <name>` (or `-w <name>`) targets.
  const order: string[] = [];
  const re = /(?:--workspace|-w)[\s=]+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) order.push(m[1]);
  return order;
}

describe('root build script (LKWkalk-dsu)', () => {
  const workspaces = readWorkspaces();
  const order = rootBuildOrder();
  const buildable = workspaces.filter((w) => w.hasBuild).map((w) => w.name);

  it('does not fall back to alphabetical --workspaces', () => {
    const script = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts.build;
    expect(script).not.toMatch(/--workspaces\b/);
  });

  it('builds every workspace that has a build script', () => {
    expect([...order].sort()).toEqual([...buildable].sort());
  });

  it('lists each package after its internal workspace dependencies', () => {
    const position = new Map(order.map((name, i) => [name, i]));
    for (const ws of workspaces) {
      if (!ws.hasBuild) continue;
      for (const dep of ws.internalDeps) {
        // Only ordering-relevant if the dependency is itself built.
        if (!position.has(dep)) continue;
        expect(
          position.get(dep)!,
          `${ws.name} must be built after its dependency ${dep}`,
        ).toBeLessThan(position.get(ws.name)!);
      }
    }
  });
});
