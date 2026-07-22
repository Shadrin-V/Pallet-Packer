# 41e.3 Axonometric pallet + stack diagram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat side-elevation stack preview in the Setup screen with a dimension-aware axonometric (pseudo-3D) pallet+stack, in `apps/web` only.

**Architecture:** A pure geometry module (`stack3d.ts`) does the oblique projection and stack math; the `StackDiagram` component consumes it and the existing `StackPreview` to render SVG `<polygon>` faces. No engine, contract, or Ladeplan change.

**Tech Stack:** TypeScript, React (Vite SPA), vitest + @testing-library/react. Inline SVG in mm `viewBox` coordinates.

**Spec:** [docs/superpowers/specs/2026-07-22-41e3-axonometric-pallet-stack-design.md](../specs/2026-07-22-41e3-axonometric-pallet-stack-design.md)

## Global Constraints

- **Tokens only** — no hex in JSX; colours are `var(--sN)` / `var(--sub)` / `var(--card)` / `var(--muted)` / `var(--faint)` / `var(--line-strong)` / `var(--paper)`.
- **All strokes** use `vector-effect="non-scaling-stroke"` with px widths.
- **Integer millimetres** for all model coordinates (ADR 002).
- **Screen-only** — this diagram is never printed (only Ladeplan prints); colour face-shading is allowed.
- **No engine / contract change** — consume the existing `StackPreview` (`count`, `base`, `height`, `hold`) plus cargo `length`/`width`.
- **i18n** — user-facing strings stay i18n keys; this component only receives a `label` string prop (already keyed at the call site).
- The Setup call site already guards `preview.count > 0`, so the diagram is only mounted for a fitting stack.

---

### Task 1: `stack3d.ts` — pure projection + stack geometry

**Files:**
- Create: `apps/web/src/screens/components/stack3d.ts`
- Test: `apps/web/src/screens/components/stack3d.test.ts`

**Interfaces:**
- Produces:
  - `DX: number`, `DY: number` (projection constants)
  - `interface Pt { x: number; y: number }`
  - `project(l: number, w: number, h: number, ox?: number, oy?: number): Pt`
  - `tierStep(base: number, height: number, count: number): number`
  - `interface Faces { front: Pt[]; top: Pt[]; right: Pt[] }`
  - `boxFaces(z0: number, L: number, W: number, H: number, ox?: number, oy?: number): Faces`
  - `polyPoints(pts: Pt[]): string`
  - `interface ViewBox { minX: number; minY: number; w: number; h: number }`
  - `stackViewBox(length: number, width: number, hold: number, pad?: number): ViewBox`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/screens/components/stack3d.test.ts
import { describe, it, expect } from 'vitest';
import { DX, DY, project, tierStep, boxFaces, stackViewBox } from './stack3d';

describe('project (oblique axonometric)', () => {
  it('projects the origin to itself', () => {
    expect(project(0, 0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
  });
  it('height rises (y decreases); depth recedes up-and-right', () => {
    const up = project(0, 0, 100);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-100);
    const back = project(0, 100, 0);
    expect(back.x).toBeCloseTo(100 * DX);
    expect(back.y).toBeCloseTo(-100 * DY);
  });
});

describe('tierStep', () => {
  it('equals the base height for entschachtelt (flush stacking)', () => {
    expect(tierStep(820, 2460, 3)).toBe(820);
  });
  it('is smaller than base for nested (telescoped)', () => {
    expect(tierStep(820, 2420, 6)).toBe(320);
  });
  it('is 0 for a single tier', () => {
    expect(tierStep(200, 200, 1)).toBe(0);
  });
});

describe('boxFaces', () => {
  it('front face has four corners with the top edge risen', () => {
    const f = boxFaces(0, 1200, 800, 1000, 0, 0).front;
    expect(f).toHaveLength(4);
    expect(f[2]).toEqual({ x: 1200, y: -1000 });
  });
  it('top and right faces each have four corners', () => {
    const b = boxFaces(0, 1200, 800, 1000, 0, 0);
    expect(b.top).toHaveLength(4);
    expect(b.right).toHaveLength(4);
  });
});

describe('stackViewBox', () => {
  it('spans the hold box plus padding', () => {
    const vb = stackViewBox(1200, 800, 2650, 40);
    expect(vb.minX).toBe(-40);
    expect(vb.minY).toBe(-40);
    expect(vb.w).toBeCloseTo(1200 + 800 * DX + 80);
    expect(vb.h).toBeCloseTo(2650 + 800 * DY + 80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- stack3d`
Expected: FAIL — `Cannot find module './stack3d'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/screens/components/stack3d.ts
// Oblique axonometric projection + stack geometry for the Setup stack diagram (41e.3).
// Front face (length × height) is true; depth (width) recedes up-and-right by (DX, DY) per mm.
// Pure and DOM-free so the geometry is unit-tested without rendering.

export const DX = 0.44;
export const DY = 0.3;

export interface Pt {
  x: number;
  y: number;
}

/** Project a model point (l along length, w along width/depth, h up) to 2-D screen (y grows down). */
export function project(l: number, w: number, h: number, ox = 0, oy = 0): Pt {
  return { x: ox + l + w * DX, y: oy - h - w * DY };
}

/** Increment between tier bottoms: entschachtelt → base (flush); nested → < base (telescoped). */
export function tierStep(base: number, height: number, count: number): number {
  return count > 1 ? (height - base) / (count - 1) : 0;
}

export interface Faces {
  front: Pt[];
  top: Pt[];
  right: Pt[];
}

/** The three visible faces of a box spanning l∈[0,L], w∈[0,W], h∈[z0,z0+H] at origin (ox,oy). */
export function boxFaces(z0: number, L: number, W: number, H: number, ox = 0, oy = 0): Faces {
  const p = (l: number, w: number, h: number) => project(l, w, h, ox, oy);
  return {
    front: [p(0, 0, z0), p(L, 0, z0), p(L, 0, z0 + H), p(0, 0, z0 + H)],
    top: [p(0, 0, z0 + H), p(L, 0, z0 + H), p(L, W, z0 + H), p(0, W, z0 + H)],
    right: [p(L, 0, z0), p(L, W, z0), p(L, W, z0 + H), p(L, 0, z0 + H)],
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** SVG `points` attribute string for a polygon. */
export function polyPoints(pts: Pt[]): string {
  return pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

export interface ViewBox {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

/** viewBox spanning the whole hold box (length × width × hold) plus uniform padding. */
export function stackViewBox(length: number, width: number, hold: number, pad = 40): ViewBox {
  return {
    minX: -pad,
    minY: -pad,
    w: length + width * DX + 2 * pad,
    h: hold + width * DY + 2 * pad,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web -- stack3d`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/components/stack3d.ts apps/web/src/screens/components/stack3d.test.ts
git commit -m "feat(web): axonometric projection + stack geometry for stack diagram (41e.3)"
```

---

### Task 2: Rewrite `StackDiagram` to render the axonometric pallet stack

**Files:**
- Modify: `apps/web/src/screens/components/StackDiagram.tsx` (full rewrite)
- Test: `apps/web/src/screens/components/StackDiagram.test.tsx` (full rewrite)

**Interfaces:**
- Consumes (from Task 1): `DX`, `DY`, `project`, `tierStep`, `boxFaces`, `polyPoints`, `stackViewBox`.
- Produces: `StackDiagram(props: { preview: StackPreview; length: number; width: number; label: string; series?: number }): JSX.Element`. **Note the new required `width` prop** (Task 3 supplies it at the call site).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/screens/components/StackDiagram.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { StackPreview } from '@shadrin-v/engine';
import { StackDiagram } from './StackDiagram';

const preview = (over: Partial<StackPreview>): StackPreview => ({
  count: 3,
  height: 2460,
  mode: 'entschachtelt',
  base: 820,
  hold: 2650,
  stepHeight: 0,
  rawCount: 3,
  ...over,
});

describe('StackDiagram (axonometric)', () => {
  it('draws one tier group per stacked unit', () => {
    const { container } = render(
      <StackDiagram preview={preview({ count: 3 })} length={1200} width={800} label="Stapel" />,
    );
    expect(container.querySelectorAll('[data-tier]').length).toBe(3);
  });

  it('renders the dashed hold headroom frame (top face + 3 risers)', () => {
    const { container } = render(
      <StackDiagram preview={preview({ count: 1 })} length={1200} width={800} label="s" />,
    );
    expect(container.querySelectorAll('[stroke-dasharray]').length).toBeGreaterThanOrEqual(4);
  });

  it('is an accessible image labelled by its caption', () => {
    const { getByRole } = render(
      <StackDiagram preview={preview({})} length={1200} width={800} label="Stapel 3" />,
    );
    expect(getByRole('img', { name: 'Stapel 3' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- StackDiagram`
Expected: FAIL — the current component renders `<rect>`s and has no `width` prop / `[data-tier]` groups.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/screens/components/StackDiagram.tsx
// Axonometric (pseudo-3D) stack preview for the Setup screen (41e.3). Screen-only; the Ladeplan
// cutaways are unchanged. Dimension-aware: the model's length/width/height drive the projection.
// A neutral pallet base (with fork pockets) carries an order-coloured goods box; nested stacks
// telescope (step < base), entschachtelt sit flush (step = base). Heights come from the engine's
// StackPreview, never from tier counts.
import type { StackPreview } from '@shadrin-v/engine';
import { DX, DY, boxFaces, polyPoints, project, stackViewBox, tierStep } from './stack3d';

/** Pallet-base band height cap, mm (a real EUR pallet is ~144). */
const PALLET_MAX = 150;

export function StackDiagram({
  preview,
  length,
  width,
  label,
  series = 1,
}: {
  preview: StackPreview;
  length: number;
  width: number;
  label: string;
  /** Order palette series (1..8) so the stack colour matches its order. */
  series?: number;
}) {
  const { count, height, base, hold } = preview;
  const step = tierStep(base, height, count);
  const oy = hold + width * DY;
  const vb = stackViewBox(length, width, hold);
  const color = `var(--s${series})`;
  const patId = `stack3d-h${series}`;
  const ph = Math.min(PALLET_MAX, base * 0.2);

  const p = (l: number, w: number, h: number) => project(l, w, h, 0, oy);

  return (
    <svg
      viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
      height={150}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={label}
      style={{ background: 'var(--paper)', display: 'block' }}
    >
      <defs>
        <pattern id={patId} width={150} height={150} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x2={0} y2={150} stroke={color} strokeWidth={30} opacity={0.5} />
        </pattern>
      </defs>

      {/* hold headroom frame: top face + three vertical risers, dashed */}
      <polygon
        points={polyPoints([p(0, 0, hold), p(length, 0, hold), p(length, width, hold), p(0, width, hold)])}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={1}
        strokeDasharray="7 6"
        vectorEffect="non-scaling-stroke"
      />
      {[
        [p(0, width, 0), p(0, width, hold)],
        [p(length, width, 0), p(length, width, hold)],
        [p(length, 0, 0), p(length, 0, hold)],
      ].map(([a, b], i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--line-strong)"
          strokeWidth={1}
          strokeDasharray="7 6"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* tiers, bottom → top so an upper unit overlaps the one below */}
      {Array.from({ length: count }, (_, i) => {
        const z0 = i * step;
        const pal = boxFaces(z0, length, width, ph, 0, oy);
        const goods = boxFaces(z0 + ph, length, width, base - ph, 0, oy);
        return (
          <g key={i} data-tier={i}>
            {/* pallet base — neutral */}
            <polygon points={polyPoints(pal.right)} fill="var(--sub)" stroke="var(--muted)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(pal.top)} fill="var(--card)" stroke="var(--muted)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(pal.front)} fill="var(--card)" stroke="var(--muted)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {/* fork pockets on the front face */}
            {[0.3, 0.58].map((gx) => (
              <polygon
                key={gx}
                points={polyPoints([
                  p(length * gx, 0, z0 + ph * 0.15),
                  p(length * (gx + 0.12), 0, z0 + ph * 0.15),
                  p(length * (gx + 0.12), 0, z0 + ph * 0.85),
                  p(length * gx, 0, z0 + ph * 0.85),
                ])}
                fill="var(--sub)"
                stroke="var(--faint)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* goods — order colour, shaded faces + front hatch */}
            <polygon points={polyPoints(goods.right)} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(goods.top)} fill={color} fillOpacity={0.34} stroke={color} strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(goods.front)} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={polyPoints(goods.front)} fill={`url(#${patId})`} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/web -- StackDiagram`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/components/StackDiagram.tsx apps/web/src/screens/components/StackDiagram.test.tsx
git commit -m "feat(web): render Setup stack diagram as axonometric pallet stack (41e.3)"
```

---

### Task 3: Pass `width` from the Setup call site

**Files:**
- Modify: `apps/web/src/screens/SetupScreen.tsx:1037`

**Interfaces:**
- Consumes (from Task 2): `StackDiagram` now requires `width: number`.

- [ ] **Step 1: Add the `width` prop at the call site**

Change the single `<StackDiagram ... />` usage (currently near line 1037) from:

```tsx
<StackDiagram preview={preview} length={numOr0(p.length)} label={tt('stack.diagram')} series={orderColorToken(index).series} />
```

to:

```tsx
<StackDiagram preview={preview} length={numOr0(p.length)} width={numOr0(p.width)} label={tt('stack.diagram')} series={orderColorToken(index).series} />
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w apps/web`
Expected: exit 0 (no missing-prop error on `StackDiagram`).

- [ ] **Step 3: Run the web test + lint + build**

Run: `npm run test -w apps/web && npm run lint -w apps/web`
Expected: PASS / 0 problems.

- [ ] **Step 4: Manual browser check**

Run the app (`cd apps/web && npm run dev`), open a cargo position in **Настройка**, and confirm the stack diagram shows the axonometric pallet: dimension-aware footprint, pallet base with fork pockets, flush tiers for `Entschachtelt` and telescoped tiers for `Verschachtelt`. jsdom cannot verify pixels — check in a real browser.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/SetupScreen.tsx
git commit -m "feat(web): feed cargo width into the axonometric stack diagram (41e.3)"
```

---

## Self-Review

- **Spec coverage:** projection + small rotation (Task 1 `project`/`DX`/`DY`), dimension-aware (Task 1 `boxFaces`/`stackViewBox` from length/width/height + Task 3 `width`), pallet base + fork pockets and order-coloured shaded goods (Task 2), hold headroom frame (Task 2), ent vs nested step from preview (Task 1 `tierStep`, Task 2 tier loop), Setup-only / no engine or Ladeplan change (only these three files touched), tokens-only + non-scaling-stroke (Task 2). Future `kind` gate is out of scope (tracked in LKWkalk-b09).
- **Placeholder scan:** none — every code step carries complete, paste-ready code and exact commands with expected output.
- **Type consistency:** `project`, `boxFaces`, `polyPoints`, `tierStep`, `stackViewBox` signatures match between Task 1 (produced) and Task 2 (consumed); `StackDiagram` gains `width` in Task 2 and is supplied it in Task 3.
