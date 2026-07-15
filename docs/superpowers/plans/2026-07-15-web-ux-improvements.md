# Web UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Six `apps/web` UX improvements — single page (no state reset), nesting-formula editor, cutaway rendering polish, manual stack drag, de/ru switcher, EPAL/vehicle presets.

**Architecture:** All in `apps/web`; engine (`@shadrin-v/engine`) and contract unchanged. Spec: [2026-07-15-web-ux-improvements-design.md](../specs/2026-07-15-web-ux-improvements-design.md).

**Tech Stack:** React 18, Vite, Tailwind (design tokens), Vitest + @testing-library, `@shadrin-v/engine`, `@shadrin-v/i18n`.

## Global Constraints

- **Token-only** (no hex in JSX); i18n de/ru (no string literals in code — only keys); integer mm (ADR 002).
- **Geometry invariant:** every rendered/edited layout satisfies `findGeometryViolations(load, layout) === []`.
- Engine API reused verbatim: `computeStack(cargo, vehicle): StackPreview` (`{ count, height, mode, base, hold, stepHeight?, rawCount, cappedBy?, cap? }`), `calculateLayout`, `findGeometryViolations(load, layout)`, `orientedDims`.
- Reuse `NESTING_MODES = ['sequential','pairwise']`, `RotationRule`, `NestingState`.
- TDD: failing test → minimal code → green → commit. Branch per task → green gates → merge.

---

## Task 1 (bd LKWkalk-l20): Single page — no state reset

**Files:** Modify `apps/web/src/App.tsx`, `apps/web/src/screens/LadeplanScreen.tsx` (drop mandatory Back), `apps/web/src/App.test.tsx`.

**Interfaces:** `App` keeps `result: {load, layout} | null`; renders `<SetupScreen>` always + `<LadeplanScreen>` below when `result`. `SetupScreen` stays mounted → its `useState` persists. Remove the `onBack`-driven unmount.

- [ ] **Step 1: Failing test** — `App.test.tsx`: render `<App/>`, edit an order-id input, click Berechnen, then edit again — assert the edited value persists (SetupScreen not remounted) and a Ladeplan region appears below.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `App` renders both; `onCalculate` sets `result`; a "recompute/close" affordance replaces Back. `SetupScreen` always visible.
- [ ] **Step 4: Run → pass; typecheck; commit.**

---

## Task 2 (bd LKWkalk-yxr): Language switcher DE|RU

**Files:** Create `apps/web/src/ui/LocaleSwitch.tsx` + test; Modify `LocaleContext.tsx` (persist to `localStorage` key `ladungsplaner.locale`), header in `SetupScreen.tsx`.

- [ ] **Step 1: Failing test** — render app with LocaleSwitch, click "RU", assert a known string switches (e.g. `Berechnen`→`Рассчитать`).
- [ ] **Step 2: fail → implement** — `LocaleSwitch` = `Segmented` of de/ru calling `setLocale`; `LocaleProvider` initializes from `localStorage` and writes on change.
- [ ] **Step 3: pass; commit.**

---

## Task 3 (bd LKWkalk-cqg): Presets (LKW Standard + EPAL)

**Files:** Create `apps/web/src/data/presets.ts` + test; Modify `SetupScreen.tsx` (vehicle preset select uses `VEHICLE_PRESETS`, position gets a "Palette" preset select).

**Interfaces:**
```ts
export const VEHICLE_PRESETS = [{ key:'lkw-standard', name:'LKW Standard', length:13600, width:2430, height:2650 }];
export const PALLET_PRESETS = [
  { key:'epal1', name:'EPAL 1', length:1200, width:800,  height:144 },
  { key:'epal2', name:'EPAL 2', length:1200, width:1000, height:162 },
  { key:'epal3', name:'EPAL 3', length:1000, width:1200, height:144 },
  { key:'epal6', name:'EPAL 6', length:800,  width:600,  height:144 },
  { key:'quarter', name:'Viertelpalette', length:600, width:400, height:144 },
];
```
- [ ] **Step 1: Failing test** — `presets.test.ts`: `PALLET_PRESETS` by key `epal2` → 1200×1000×162; `VEHICLE_PRESETS[0]` = LKW Standard 13600×2430×2650.
- [ ] **Step 2: implement presets.ts (mirror qrd-17); wire selects.** Vehicle default = LKW Standard. Position palette select default "Eigene Maße"; picking a preset sets `name`+L/W/H, leaves rules.
- [ ] **Step 3: SetupScreen test** — selecting EPAL 2 fills the row dims (assert Load cargo dims). pass; commit.

---

## Task 4 (bd LKWkalk-0f6): Nesting formula + validation

**Files:** Create `apps/web/src/screens/components/stackFormula.ts` + test; Modify `SetupScreen.tsx` (PositionState fields, rules panel, formula display, disable Berechnen), i18n `packages/i18n` (keys de/ru).

**Interfaces:**
```ts
// stackFormula.ts — pick + fill the formula template from a StackPreview + i18n templates.
export function formulaKey(s: StackPreview): TranslationKey; // entschachtelt|sequential|pairwise|notStackable
export function fillTemplate(tpl: string, vars: Record<string, string|number>): string; // {x} substitution
export function stepInvalid(state: NestingState, stepHeight: number|'', height: number|''): boolean;
```
`PositionState` adds `nestingMode:'sequential'|'pairwise'`, `maxNested:Num`, `allowUnpairedTop:boolean` (stepHeight/maxTiers already present).

- [ ] **Step 1: Failing test (stackFormula.test.ts)** — `formulaKey` returns `stack.formula.sequential` for a sequential preview, `stack.formula.entschachtelt` for entschachtelt, `stack.formula.notStackable` when `cappedBy==='notStackable'`; `fillTemplate('⌊{hold}/{base}⌋',{hold:2650,base:144})` → `⌊2650/144⌋`; `stepInvalid('verschachtelt','',144)===true`, `stepInvalid('verschachtelt',30,144)===false`.
- [ ] **Step 2: implement stackFormula.ts.**
- [ ] **Step 3: i18n keys (de/ru)** — `cargoType.nesting.mode/.modeSequential/.modePairwise/.stepHeightSeq/.stepHeightPair/.stepHeightHint/.maxNested/.allowUnpairedTop`, `stack.preview/.result`, `stack.formula.label/.entschachtelt/.sequential/.pairwise/.cap/.notStackable`. Run i18n parity test; rebuild dist.
- [ ] **Step 4: SetupScreen** — rules panel: nestingMode select + stepHeight (label by mode) + maxNested + allowUnpairedTop (pairwise); formula plate (mono `--sub`) from `computeStack`; disable Berechnen when any `stepInvalid`. `toCargo` builds `nesting` (mode/stepHeight/maxNested/allowUnpairedTop).
- [ ] **Step 5: test** — invalid Δh disables Berechnen; pairwise preview shows pairwise formula. pass; commit.

---

## Task 5 (bd LKWkalk-k7q): Cutaway rendering polish

**Files:** Modify `apps/web/src/screens/components/CrossSection.tsx`; add front/back labels; `cutaway.test.ts` (unchanged geometry).

- [ ] **Step 1:** grid/frame/rect strokes → `vectorEffect="non-scaling-stroke"` + px widths (frame 2, grid 1, rect outline 1.5). `×N` label size ∝ `min(w,h)` (clamped). Side view: `Vorne`/`Hinten` labels (`ladeplan.front/back`), optional direction arrow from `loadingMode`.
- [ ] **Step 2:** render test asserts `vector-effect` present on frame and a `×N` text renders; visual compare to `ladeplan-reference.html`. commit.

---

## Task 6 (bd LKWkalk-8hg): Manual stack drag (top view, snap)

**Files:** Create `apps/web/src/screens/components/dragLayout.ts` + test; Modify `CrossSection.tsx` (draggable stacks in top view), `LadeplanScreen.tsx` (holds editable layout copy), `App.tsx` (pass editable layout / reset on recompute).

**Interfaces:**
```ts
export const SNAP_MM = 100;
export function snap(v: number, grid?: number): number;
// Move all placements of the stack at (fromX,fromY,cargoTypeId) to snapped (toX,toY); returns a new
// Layout if findGeometryViolations(load, moved) === [], else the ORIGINAL layout (reject).
export function moveStack(load: Load, layout: Layout, sel: {cargoTypeId:string;x:number;y:number}, toX:number, toY:number): Layout;
```
- [ ] **Step 1: Failing test (dragLayout.test.ts)** — `snap(1240)===1200`; moving a stack to a free snapped position returns a layout with updated x,y and 0 violations; moving it to overlap another stack returns the ORIGINAL layout (rejected).
- [ ] **Step 2: implement dragLayout.ts** (pure: clone placements, translate the selected stack's units, revalidate, accept/reject).
- [ ] **Step 3: wire drag** — top-view `<rect>` pointer handlers compute mm delta from SVG coords, call `moveStack` on pointer-up; LadeplanScreen holds `editedLayout` state (init = props.layout; reset when props.layout changes). Cutaways/legend/metrics render `editedLayout`.
- [ ] **Step 4: test** — after a valid programmatic move the rendered rect position updates; invalid move leaves it. commit.

---

## Self-Review

- **Spec coverage:** §1 single-page → T1; §2 formula → T4; §3 cutaway → T5; §4 drag → T6; §5 languages → T2; §6 presets → T3. ✅
- **Placeholders:** none — interfaces + test intents concrete; formula templates come from qrd-13 keys.
- **Type consistency:** `StackPreview` fields (`base/hold/stepHeight/rawCount/cappedBy/cap/count/mode`) used consistently in T4; `moveStack`/`snap` signatures consistent T6; `PositionState` extended fields (`nestingMode/maxNested/allowUnpairedTop`) match `toCargo` in T3/T4.
- **Invariant:** geometry validator enforced in T6 (drag reject) and T1 (render guard already present).
