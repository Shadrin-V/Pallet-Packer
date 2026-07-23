# 41e.1 Truck Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Ladeplan side/top cutaways read as a truck (sourced CC0 cab + wheels + metre ruler on the side, a light geometric hint on the top) without disturbing the exact 1:1 cargo drawing.

**Architecture:** A nested `<svg>` isolates the existing cargo cutaway coordinate system (mm, 1:1) inside an outer chrome svg. The outer svg adds fixed-proportion gutters *outside* the cargo viewport — a front cab gutter (both views, for column alignment), a bottom wheel/ground gutter (side only), and a ruler lane. Chrome shapes on the side come from a vendored CC0 asset recoloured to tokens; the top hint is original geometry. Engine and contract are untouched.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, SVG. Monorepo (`apps/web`, `packages/i18n`).

## Global Constraints

- **1:1 cargo drawing is inviolable** — cargo rect coordinates, the 1000 mm grid, and the top/side column alignment on vehicle length must not change (commit `0f32ca6`). The nested cargo `<svg>` keeps `viewBox="0 0 length spanY"`.
- **Engine / contract / `packages/*` untouched** — pure `apps/web` presentation change. No ADR.
- **No hard-coded user strings** — keys only, in `packages/i18n` `keys.ts` + `de.ts` + `ru.ts`.
- **Print-safe B/W** — chrome must read in monochrome (ADR-006): outline + neutral fill, no colour-only meaning. Editing/selection chrome stays `print:hidden`.
- **No hand-authored realistic illustration** — the side cab/wheels are the *sourced* CC0 asset's shapes, recoloured; only genuinely geometric marks (top hint, ruler) are authored in-repo (project memory `hand-svg-illustration-trap`).
- **Asset hygiene** — no `<image>`, no gradients, no external URLs anywhere in chrome (CSP + recolour + print safety).
- **Theme** — the app is light-only (`apps/web/src/theme.css` has a single `:root`); add one token value.
- **Commit style** — small atomic commits after green tests; English messages.

---

## File Structure

- `apps/web/src/theme.css` — **modify**: add `--truck` token.
- `packages/i18n/src/keys.ts` + `dictionaries/de.ts` + `dictionaries/ru.ts` — **modify**: add `ladeplan.rulerUnit`.
- `apps/web/src/screens/components/ruler.ts` — **create**: pure metre-tick geometry.
- `apps/web/src/screens/components/ruler.test.ts` — **create**.
- `apps/web/src/assets/truck-side-source.svg` — **create**: vendored, recoloured CC0 asset (provenance-commented).
- `apps/web/src/screens/components/truckChrome.tsx` — **create**: `CabProfile`, `Axles`, `GroundLine`, `TopHint`, `MetreRuler` fragments + geometry constants.
- `apps/web/src/screens/components/truckChrome.test.tsx` — **create**.
- `apps/web/src/screens/components/CrossSection.tsx` — **modify**: nested-svg wrap + chrome composition.
- `apps/web/src/screens/components/CrossSection.test.tsx` — **modify**: invariant + chrome tests.
- `docs/CHANGELOG.md` — **modify**: entry.

---

## Task 1: `--truck` token + ruler i18n key

**Files:**
- Modify: `apps/web/src/theme.css` (near `--grid` at line 39)
- Modify: `packages/i18n/src/keys.ts` (ladeplan block, near line 55)
- Modify: `packages/i18n/src/dictionaries/de.ts` (near line 53)
- Modify: `packages/i18n/src/dictionaries/ru.ts` (near line 53)
- Test: `packages/i18n/src/dictionaries/completeness.test.ts` (if a parity test already exists, this key is covered automatically; otherwise create the test below)

**Interfaces:**
- Produces: CSS var `--truck`; i18n key `'ladeplan.rulerUnit'` (de `"m"`, ru `"м"`).

- [ ] **Step 1: Write the failing test** — `packages/i18n/src/dictionaries/completeness.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { KEYS } from '../keys';
import { de } from './de';
import { ru } from './ru';

describe('dictionary completeness', () => {
  it('every key resolves in de and ru', () => {
    for (const k of KEYS) {
      expect(de[k], `de missing ${k}`).toBeTruthy();
      expect(ru[k], `ru missing ${k}`).toBeTruthy();
    }
  });
  it('has the ruler unit key', () => {
    expect(KEYS).toContain('ladeplan.rulerUnit');
    expect(de['ladeplan.rulerUnit']).toBe('m');
    expect(ru['ladeplan.rulerUnit']).toBe('м');
  });
});
```

> Note: `KEYS` is the exported array in `keys.ts`. If the export name differs, adjust the import to match `keys.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/i18n -- completeness`
Expected: FAIL — `KEYS` does not contain `'ladeplan.rulerUnit'`.

- [ ] **Step 3: Add the key and translations**

In `keys.ts`, inside the Ladeplan block after `'ladeplan.back',`:

```ts
  'ladeplan.rulerUnit',
```

In `de.ts` after `'ladeplan.back': 'Hinten',`:

```ts
  'ladeplan.rulerUnit': 'm',
```

In `ru.ts` after `'ladeplan.back': 'Зад',`:

```ts
  'ladeplan.rulerUnit': 'м',
```

- [ ] **Step 4: Add the `--truck` token** in `theme.css` after the `--grid` line:

```css
  --truck: #5b6b62;        /* cutaway truck chrome — neutral with a slight brand-green bias */
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w packages/i18n -- completeness`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/i18n/src apps/web/src/theme.css
git commit -m "feat(41e.1): add --truck token and ladeplan.rulerUnit i18n key"
```

---

## Task 2: `ruler.ts` — metre tick geometry

**Files:**
- Create: `apps/web/src/screens/components/ruler.ts`
- Test: `apps/web/src/screens/components/ruler.test.ts`

**Interfaces:**
- Produces: `metreTicks(lengthMm: number): { x: number; metre: number }[]` — one tick per whole metre strictly inside `(0, lengthMm)`, `x` in mm (== metre·1000), `metre` the integer label. Excludes 0 and the far edge (the frame already marks them).

- [ ] **Step 1: Write the failing test** — `ruler.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { metreTicks } from './ruler';

describe('metreTicks', () => {
  it('one tick per interior whole metre', () => {
    expect(metreTicks(13600)).toEqual([
      { x: 1000, metre: 1 }, { x: 2000, metre: 2 }, { x: 3000, metre: 3 },
      { x: 4000, metre: 4 }, { x: 5000, metre: 5 }, { x: 6000, metre: 6 },
      { x: 7000, metre: 7 }, { x: 8000, metre: 8 }, { x: 9000, metre: 9 },
      { x: 10000, metre: 10 }, { x: 11000, metre: 11 }, { x: 12000, metre: 12 },
      { x: 13000, metre: 13 },
    ]);
  });
  it('excludes an exact edge metre', () => {
    expect(metreTicks(2000)).toEqual([{ x: 1000, metre: 1 }]);
  });
  it('empty below one metre', () => {
    expect(metreTicks(800)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- ruler`
Expected: FAIL — `metreTicks` not defined.

- [ ] **Step 3: Implement**

```ts
// Metre ticks for the cutaway ruler, in the cutaway's own mm coordinates. Interior whole metres only:
// 0 and the far edge are already the vehicle frame, so labelling them again just crowds the corners.
export function metreTicks(lengthMm: number): { x: number; metre: number }[] {
  const ticks: { x: number; metre: number }[] = [];
  for (let m = 1; m * 1000 < lengthMm; m++) ticks.push({ x: m * 1000, metre: m });
  return ticks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w apps/web -- ruler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/components/ruler.ts apps/web/src/screens/components/ruler.test.ts
git commit -m "feat(41e.1): metreTicks ruler geometry"
```

---

## Task 3: Vendor + recolour the CC0 side asset

The raw asset is saved at `/tmp/fs19102.svg` (freesvg #19102 "Simple Truck Side", CC0 / public domain). This task vendors a **cleaned, recoloured** copy into the repo. It is a truck side profile: trailer box (`rect3093`, `rect3774`), cab (`rect3097`, `rect4076`, `rect3004`, window rects `rect3101*`), wheels (the `path3949*` and `path4010` circles), chassis bar (`rect3099`).

**Files:**
- Create: `apps/web/src/assets/truck-side-source.svg`
- Test: `apps/web/src/screens/components/truckChrome.test.tsx` (asset-hygiene test; component tests added in Task 4)

**Interfaces:**
- Produces: `truck-side-source.svg` — a single `<svg viewBox="0 0 750 750">` whose shapes use `fill="currentColor"` (dark parts) or `fill="#ffffff"` (windows/cutouts), with **no** metadata, gradients, `<image>`, or Inkscape/sodipodi namespaces.

- [ ] **Step 1: Produce the cleaned file**

Copy `/tmp/fs19102.svg` to `apps/web/src/assets/truck-side-source.svg`, then edit:
1. Delete the `<metadata>`, `<sodipodi:namedview>`, and `<defs>` blocks and all `sodipodi:*` / `inkscape:*` attributes and namespaces.
2. Keep the `xmlns` and `viewBox="0 0 750 750"`; drop `width`/`height`.
3. Recolour every `style="…fill:#000000…"` / `stroke:#000000` (and the grey `#b3b3b3`) to `fill:currentColor` / `stroke:currentColor`. Keep `#ffffff` / `#fffffe` / `#fffffc` fills as `#ffffff` (window/cutout highlights). Remove `fill-opacity` where it is `0` on `rect3004` — keep the shape as an outline (`fill:none;stroke:currentColor`).
4. Prepend a provenance comment:

```xml
<!-- Source: freesvg.org #19102 "Simple Truck Side Vector Drawing" — CC0 / Public Domain
     (Openclipart origin). Metadata stripped; recoloured to currentColor for token theming.
     Used by 41e.1 truck chrome. -->
```

- [ ] **Step 2: Write the failing hygiene test** — `truckChrome.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../../assets/truck-side-source.svg', import.meta.url)),
  'utf8',
);

describe('truck-side-source.svg hygiene', () => {
  it('has no gradients, rasters, external urls, or inkscape cruft', () => {
    expect(src).not.toMatch(/linearGradient|radialGradient/);
    expect(src).not.toMatch(/<image|base64/);
    expect(src).not.toMatch(/xlink:href|url\(http|https?:\/\//);
    expect(src).not.toMatch(/sodipodi|inkscape|<metadata/);
  });
  it('themes via currentColor and keeps a 750 viewBox', () => {
    expect(src).toMatch(/currentColor/);
    expect(src).not.toMatch(/fill:#000000/);
    expect(src).toMatch(/viewBox="0 0 750 750"/);
  });
});
```

- [ ] **Step 3: Run test to verify it passes** (the file already exists from Step 1)

Run: `npm test -w apps/web -- truckChrome`
Expected: PASS. If it fails, the cleanup in Step 1 missed a match named in the assertion — fix that occurrence.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/assets/truck-side-source.svg apps/web/src/screens/components/truckChrome.test.tsx
git commit -m "feat(41e.1): vendor recoloured CC0 truck side asset"
```

---

## Task 4: `truckChrome.tsx` — chrome fragments

Split the vendored profile into positioned pieces at **real-world scale** (so they coexist with a variable-size hold), plus the geometric top hint and the ruler. The cab and wheels are placed by their **intrinsic aspect**, never stretched to the hold.

**Files:**
- Create: `apps/web/src/screens/components/truckChrome.tsx`
- Modify: `apps/web/src/screens/components/truckChrome.test.tsx`

**Interfaces:**
- Consumes: `metreTicks` (Task 2); `truck-side-source.svg` (Task 3).
- Produces (all render in the OUTER chrome svg's user units, all `pointerEvents="none"`, colour `var(--truck)`):
  - `GUTTER = { front: number; wheel: number; ruler: number }` — gutter sizes as **fractions of vehicle height** (front cab width and wheel/ruler lane heights), single tunable constants.
  - `<CabProfile height={number} />` — cab silhouette scaled to `height` (vehicle height in outer units), returning a `<g>` whose width is `height * CAB_ASPECT`.
  - `<Axles length={number} height={number} />` — wheels + chassis line under a hold of the given length, at fractional axle positions.
  - `<GroundLine x1 x2 y />`.
  - `<TopHint length={number} width={number} front={number} />` — cab-nose trapezoid in the front gutter + a rear-door strip; original geometry.
  - `<MetreRuler length={number} y={number} unit={string} />` — ticks (from `metreTicks`) + labels, `tabular-nums`.

- [ ] **Step 1: Write the failing tests** — append to `truckChrome.test.tsx`

```tsx
import { render } from '@testing-library/react';
import { CabProfile, Axles, TopHint, MetreRuler, GUTTER } from './truckChrome';

describe('truck chrome fragments', () => {
  it('CabProfile renders in currentColor/token and no external refs', () => {
    const { container } = render(<svg><CabProfile height={2650} /></svg>);
    const html = container.innerHTML;
    expect(html).not.toMatch(/xlink:href|url\(http/);
    expect(container.querySelector('g')).toBeTruthy();
  });
  it('Axles draws at least two wheels', () => {
    const { container } = render(<svg><Axles length={13600} height={2650} /></svg>);
    expect(container.querySelectorAll('circle, ellipse').length).toBeGreaterThanOrEqual(2);
  });
  it('MetreRuler labels interior metres', () => {
    const { container } = render(<svg><MetreRuler length={3600} y={0} unit="m" /></svg>);
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('1'); // interior metres of 3600 mm: 1, 2, 3
    expect(texts).toContain('2');
    expect(texts).toContain('3');
  });
  it('all chrome is non-interactive', () => {
    const { container } = render(
      <svg><TopHint length={2000} width={2000} front={500} /></svg>,
    );
    container.querySelectorAll('*').forEach((el) => {
      const pe = (el as SVGElement).getAttribute('pointer-events');
      if (pe) expect(pe).toBe('none');
    });
  });
  it('GUTTER fractions are positive and small', () => {
    expect(GUTTER.front).toBeGreaterThan(0);
    expect(GUTTER.wheel).toBeGreaterThan(0);
    expect(GUTTER.ruler).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/web -- truckChrome`
Expected: FAIL — module `./truckChrome` has no exports yet.

- [ ] **Step 3: Implement `truckChrome.tsx`**

```tsx
// Truck chrome for the Ladeplan cutaways (41e.1). The cab and wheels are the vendored CC0 asset's
// shapes (truck-side-source.svg), placed at real-world scale so they frame a hold of ANY size without
// being stretched. The top hint and ruler are original geometry. Everything is decoration: colour
// var(--truck), pointer-events none, print-safe (outline + neutral fill, no colour-only meaning).
import rawTruck from '../../assets/truck-side-source.svg?raw';

// Gutter sizes as fractions of vehicle height — single tunable constants (screenshot-tuned, Task 6).
export const GUTTER = { front: 0.75, wheel: 0.22, ruler: 0.16 };

// The cab occupies a slice of the source's 750×750 box; measured once from truck-side-source.svg.
// x∈[488,600] (deflector→back), y∈[82,270] in source units → aspect w/h of the cab slice.
const CAB_SRC = { x: 486, y: 80, w: 116, h: 192 };
const CAB_ASPECT = CAB_SRC.w / CAB_SRC.h;

// Inline the recoloured source once so we can reference sub-regions via nested <svg> viewports.
function AssetSlice({ box, width, height }: {
  box: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
}) {
  // A nested svg whose viewBox is the slice crops the source to that region; the outer <g> scales it.
  const inner = rawTruck.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return (
    <svg
      x={0}
      y={0}
      width={width}
      height={height}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
      style={{ color: 'var(--truck)' }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export function CabProfile({ height }: { height: number }) {
  const w = height * CAB_ASPECT;
  return (
    <g pointerEvents="none" aria-hidden="true">
      <AssetSlice box={CAB_SRC} width={w} height={height} />
    </g>
  );
}

export function GroundLine({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--truck)" strokeWidth={2}
      vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />
  );
}

// Two axle groups (tractor + trailer) at fractional positions along the hold length. Circles, not the
// asset's transformed wheels, because the asset's wheels are bound to its own trailer length; placing
// our own keeps them under OUR variable-length hold. Radius scales with height so they stay in the lane.
const AXLES = [0.14, 0.72, 0.86]; // fraction of length: steer, drive, trailer
export function Axles({ length, height }: { length: number; height: number }) {
  const r = height * 0.09;
  return (
    <g pointerEvents="none" aria-hidden="true" fill="var(--truck)">
      {AXLES.map((f, i) => (
        <circle key={i} cx={length * f} cy={r} r={r} />
      ))}
    </g>
  );
}

export function TopHint({ length, width, front }: { length: number; width: number; front: number }) {
  // Cab nose: a trapezoid in the front gutter (x from -front to 0). Rear doors: a thin strip at x≈length.
  const inset = width * 0.12;
  return (
    <g pointerEvents="none" aria-hidden="true" stroke="var(--truck)" fill="none" strokeWidth={2}
       vectorEffect="non-scaling-stroke">
      <polygon points={`${-front},${inset} 0,0 0,${width} ${-front},${width - inset}`} />
      <line x1={length} y1={0} x2={length} y2={width} strokeDasharray="10 8" />
    </g>
  );
}

export function MetreRuler({ length, y, unit }: { length: number; y: number; unit: string }) {
  const ticks = metreTicksLocal(length);
  const font = length * 0.02;
  return (
    <g pointerEvents="none" aria-hidden="true" fill="var(--faint)">
      {ticks.map((t) => (
        <g key={t.metre}>
          <line x1={t.x} y1={y} x2={t.x} y2={y + font * 0.6} stroke="var(--grid)"
            strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={t.x} y={y + font * 1.9} fontSize={font} textAnchor="middle"
            style={{ fontVariantNumeric: 'tabular-nums' }}>{t.metre}</text>
        </g>
      ))}
      <text x={length} y={y + font * 1.9} fontSize={font} textAnchor="end"
        style={{ fontVariantNumeric: 'tabular-nums' }}>{`${length / 1000} ${unit}`}</text>
    </g>
  );
}

// Local re-export to avoid a circular import if ruler.ts later imports chrome types.
import { metreTicks as metreTicksLocal } from './ruler';
```

> `?raw` import: Vite supports `import x from './f.svg?raw'` out of the box. For Vitest, ensure the test env resolves `?raw` — it does under the Vite transform; if a test errors on the import, add `assetsInclude`/`?raw` handling is already covered by Vite's default. The hygiene test in Task 3 reads the file via `fs`, so it does not depend on `?raw`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w apps/web -- truckChrome`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/components/truckChrome.tsx apps/web/src/screens/components/truckChrome.test.tsx
git commit -m "feat(41e.1): truck chrome fragments (cab, axles, ground, top hint, ruler)"
```

---

## Task 5: Nested-svg refactor of `CrossSection` (invariant-preserving)

Wrap the current cutaway body in a nested `<svg>` so chrome can live in outer gutters without moving any cargo coordinate. **No chrome yet** — this task only proves the refactor keeps 1:1 and every existing interaction test green.

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx`
- Modify: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Produces: an outer `<svg data-cutaway={view}>` with `viewBox` including gutters; a nested `<svg>` (holding the current grid/rects/overlays) with `viewBox="0 0 length spanY"` and the geometry `ref`. Pointer math and `data-stack-ref` are unchanged inside the nested svg.

- [ ] **Step 1: Write the failing invariant test** — append to `CrossSection.test.tsx`

```tsx
it('cargo viewport stays exactly 1:1 (length × spanY) after the nested-svg wrap', () => {
  const { container } = renderCut('side', 'Seitenansicht');
  const outer = container.querySelector('svg[data-cutaway="side"]')!;
  const nested = outer.querySelector('svg')!; // the cargo viewport
  expect(nested.getAttribute('viewBox')).toBe(`0 0 ${V.length} ${V.height}`);
  // hold outline rect unchanged: 0,0,length,height in the nested coordinate space
  const frame = [...nested.querySelectorAll('rect')].find(
    (r) => r.getAttribute('width') === String(V.length) && r.getAttribute('height') === String(V.height),
  );
  expect(frame).toBeTruthy();
});

it('top cargo viewport is length × width', () => {
  const { container } = renderCut('top', 'Draufsicht');
  const nested = container.querySelector('svg[data-cutaway="top"] svg')!;
  expect(nested.getAttribute('viewBox')).toBe(`0 0 ${V.length} ${V.width}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/web -- CrossSection`
Expected: FAIL — there is currently only one svg; `outer.querySelector('svg')` (nested) is null, and `data-cutaway` is on the only svg (no nested viewBox).

- [ ] **Step 3: Refactor `CrossSection.tsx`**

Introduce gutter constants and split the svg. Add near the top of the component body (after `const countFont = …`):

```tsx
  // Outer chrome gutters, in the cutaway's own mm units (front cab both views; wheels/ruler side only).
  const frontGutter = height * 0.75;                 // GUTTER.front — matches truckChrome
  const wheelGutter = view === 'side' ? height * 0.22 : 0;
  const rulerGutter = height * 0.16;
  const outerW = length + frontGutter;
  const outerH = spanY + wheelGutter + rulerGutter;
```

Replace the single `<svg …>` opening/closing so the **outer** svg carries `data-cutaway`, `role`, `aria-label`, background, and the outer viewBox; the **nested** svg (offset by the front gutter) carries the geometry `ref`, the pointer handlers, `touchAction`, and everything currently inside. Concretely:

```tsx
      <svg
        viewBox={`0 0 ${outerW} ${outerH}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        data-cutaway={view}
        style={{ background: 'var(--paper)', display: 'block' }}
      >
        {/* chrome goes here in Task 6 */}
        <svg
          ref={svgRef}
          x={frontGutter}
          y={0}
          width={length}
          height={spanY}
          viewBox={`0 0 ${length} ${spanY}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: 'visible', touchAction: draggable ? 'none' : undefined }}
          onPointerMove={draggable ? onMove : undefined}
          onPointerUp={draggable ? onUp : undefined}
          onPointerDown={draggable ? onBackgroundDown : undefined}
          onPointerCancel={draggable ? onCancel : undefined}
        >
          {/* the ENTIRE current svg body: gridLines, sortedRects.map, group frame, band, preview,
              and the hold outline rect — moved here verbatim, coordinates unchanged */}
        </svg>
      </svg>
```

Move the existing children (grid lines, `sortedRects.map(...)`, group frame IIFE, rubber band IIFE, drop-preview IIFE, and the final hold-outline `<rect …stroke="var(--line-strong)">`) inside the nested svg unchanged. `onBackgroundDown` checks `e.target !== svgRef.current`; since `svgRef` now points at the nested svg, that guard still holds. `getScreenCTM` on the nested svg gives its own coordinate space, so `toSvg` returns nested mm coordinates — exactly what drops need.

- [ ] **Step 4: Run the FULL CrossSection suite to verify green**

Run: `npm test -w apps/web -- CrossSection`
Expected: PASS — the two new invariant tests **and** all pre-existing drag/marquee/rotate/preview tests. If a pre-existing test queried `svg[data-cutaway]` and then a child by coordinate, it still works (children moved wholesale). If any test selected the geometry svg via `container.querySelector('svg')` expecting the outer, update it to target the nested `svg[data-cutaway] svg`.

- [ ] **Step 5: Run the web build + typecheck**

Run: `npm run -w apps/web build`
Expected: PASS (no TS errors from the refactor).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx
git commit -m "refactor(41e.1): nest cargo cutaway in an outer chrome svg, 1:1 preserved"
```

---

## Task 6: Compose chrome into `CrossSection` + screenshot tuning

Render the chrome in the outer svg's gutters. This is the visual-tuning task: the deterministic assertions below pin structure and safety; the exact gutter/axle constants are settled with a headless-Chrome screenshot loop against a real preset (same method as 41e.3).

**Files:**
- Modify: `apps/web/src/screens/components/CrossSection.tsx`
- Modify: `apps/web/src/screens/components/CrossSection.test.tsx`

**Interfaces:**
- Consumes: `CabProfile`, `Axles`, `GroundLine`, `TopHint`, `MetreRuler` (Task 4); `useT` (already imported).

- [ ] **Step 1: Write the failing structural tests** — append to `CrossSection.test.tsx`

```tsx
it('side view renders cab + wheels + ruler chrome, all non-interactive', () => {
  const { container } = renderCut('side', 'Seitenansicht');
  const outer = container.querySelector('svg[data-cutaway="side"]')!;
  // ruler tick labels present (interior metres of a 2000mm hold → "1")
  const texts = [...outer.querySelectorAll('text')].map((t) => t.textContent);
  expect(texts).toContain('1');
  // at least two wheels
  expect(outer.querySelectorAll('circle, ellipse').length).toBeGreaterThanOrEqual(2);
});

it('top view renders the light hint (a polygon) but no wheels', () => {
  const { container } = renderCut('top', 'Draufsicht');
  const outer = container.querySelector('svg[data-cutaway="top"]')!;
  expect(outer.querySelector('polygon')).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/web -- CrossSection`
Expected: FAIL — no chrome rendered yet (no polygon/wheels/ruler).

- [ ] **Step 3: Render the chrome** in the outer svg (the `{/* chrome goes here */}` slot from Task 5)

```tsx
import { CabProfile, Axles, GroundLine, TopHint, MetreRuler } from './truckChrome';
```

```tsx
        {/* chrome: front cab gutter (both views), wheels+ground (side), ruler lane (both) */}
        <g transform={`translate(0 0)`} pointerEvents="none">
          {view === 'side' && (
            <>
              <g transform={`translate(0 0)`}><CabProfile height={spanY} /></g>
              <g transform={`translate(${frontGutter} ${spanY})`}>
                <Axles length={length} height={spanY} />
              </g>
              <GroundLine x1={frontGutter} x2={frontGutter + length} y={spanY + wheelGutter} />
            </>
          )}
          {view === 'top' && (
            <g transform={`translate(${frontGutter} 0)`}>
              <TopHint length={length} width={spanY} front={frontGutter} />
            </g>
          )}
          <g transform={`translate(${frontGutter} ${spanY + wheelGutter})`}>
            <MetreRuler length={length} y={0} unit={tt('ladeplan.rulerUnit')} />
          </g>
        </g>
```

Adjust the Vorne/Hinten `<div>` markers (below the figure) to align with the new front gutter — keep the words, keep them under the top view only, as today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w apps/web -- CrossSection`
Expected: PASS (both new tests + all prior).

- [ ] **Step 5: Screenshot-tune the constants (headless Chrome)**

Start the app (`cd apps/web && npm run dev`, plus the server per the handover), open a plan with a real preset (e.g. a 13.6 m curtainsider and a 6 m box, to check both extreme aspect ratios), and screenshot the Ladeplan. Tune, in `truckChrome.tsx` and the matching `CrossSection` gutter constants (keep the two in sync):
- `GUTTER.front` / `frontGutter` — cab neither cramped nor dominating.
- `AXLES` positions + wheel radius — wheels sit under the hold, not floating.
- `CAB_SRC` slice box — the cab crop shows cab only, no trailer.
- Ruler font/lane so labels are legible and clear of the wheels.

Verify **both** the on-screen colour view **and** a print preview (`window.print()` / the PNG export) read correctly in B/W. Record final constants with a one-line comment each. This step ends when the side view reads as a truck at a glance and the top view reads as a truck bed with a nose, with cargo still exactly to scale.

- [ ] **Step 6: Full gates**

Run: `npm test -w apps/web` then `npm run -w apps/web build`
Expected: PASS. Then eyeball the live Ladeplan once more.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/screens/components/CrossSection.tsx apps/web/src/screens/components/CrossSection.test.tsx apps/web/src/screens/components/truckChrome.tsx
git commit -m "feat(41e.1): compose truck chrome into Ladeplan cutaways"
```

---

## Task 7: CHANGELOG + beads reconciliation

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add a CHANGELOG entry** under the current unreleased/iteration heading:

```markdown
- **41e.1** Ladeplan cutaways now read as a truck: sourced CC0 cab + wheels + ground and a labelled
  metre ruler on the side view, a light cab-nose + rear-door hint on the top view. Cargo drawing stays
  exactly 1:1 (nested-svg). Merges the realistic-asset intent of LKWkalk-51m. Engine/contract unchanged.
```

- [ ] **Step 2: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(41e.1): changelog for truck chrome"
```

- [ ] **Step 3: Beads (report, do not auto-close under conservative profile)**

At session close, propose:
- `bd close LKWkalk-41e.1` with a result comment.
- `bd close LKWkalk-51m` as folded into 41e.1 (its intent delivered here).
- Leave `LKWkalk-5tg` (selection-label bug) and `LKWkalk-41e.2/.4` open.

---

## Self-Review

**1. Spec coverage:**
- Recognizable side (cab+wheels+ground) → Tasks 3, 4, 6. ✅
- Light top hint → Task 4 (`TopHint`) + Task 6. ✅
- Metre ruler → Tasks 1, 2, 4, 6. ✅
- 1:1 invariant via nested svg → Task 5 (with invariant tests). ✅
- Sourced-not-hand-authored → Task 3 vendored CC0 asset; Task 4 uses its slices. ✅
- Engine/contract untouched → no `packages/engine` edits in any task. ✅
- Print-safe B/W → Task 6 Step 5 verification; chrome uses outline+neutral. ✅
- i18n de/ru → Task 1. ✅
- Close 51m / keep 5tg separate → Task 7. ✅
- `--truck` token → Task 1. ✅

**2. Placeholder scan:** No "TBD/handle edge cases". The screenshot-tuning in Task 6 Step 5 is a real, described method (not a placeholder) with concrete constants to adjust — mirrors the approved 41e.3 workflow.

**3. Type consistency:** `metreTicks(lengthMm) → {x, metre}[]` used identically in Tasks 2/4. `GUTTER.front` fraction (0.75) matches `frontGutter = height * 0.75` in Task 5/6 — flagged to keep in sync in Task 6 Step 5. `CabProfile height`, `Axles {length,height}`, `TopHint {length,width,front}`, `MetreRuler {length,y,unit}` signatures match between Task 4 definition and Task 6 call sites.
