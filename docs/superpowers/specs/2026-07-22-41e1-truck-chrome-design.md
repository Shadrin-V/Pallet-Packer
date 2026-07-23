# 41e.1 — Recognizable truck chrome around the Ladeplan cutaways

> Design doc (brainstorming phase, 2026-07-22). Epic **LKWkalk-41e** «Дизайн-батч», subtask
> **LKWkalk-41e.1** «узнаваемая графика кузова (вид сверху и сбоку)». **Merged with LKWkalk-51m**
> (realistic Sattelzug asset) per owner decision 2026-07-22 — see [Beads reconciliation](#beads-reconciliation).
> Supersedes the abandoned hand-authored-silhouette attempt of the earlier 2026-07-22 session
> (rejected twice; see project memory `hand-svg-illustration-trap`).

## Goal

Make the **Ladeplan cutaways read as a truck at a glance** instead of two bare rectangles, **without
disturbing the exact 1:1 cargo drawing**. The side view carries the recognizability (cab + wheels +
ground); the top view gets only a light directional hint. Both views gain a **labelled metre ruler**
(currently only a mute 1000 mm grid exists).

## Key decisions (brainstorm, 2026-07-22)

1. **41e.1 and 51m are one deliverable.** The recognizable truck lives *in the cutaways*, not as a
   separate marketing illustration. `LKWkalk-51m` is folded into this task.
2. **Source, do not hand-author.** The side chrome is built from a **CC0 open-license vector**
   (freesvg #19102 "Simple Truck Side", public domain), recoloured to tokens — not hand-rolled
   realistic paths. This directly honours the `hand-svg-illustration-trap` lesson: hand-SVG is
   reserved for genuinely geometric marks (the top-view hint), never for realistic illustration.
3. **Asymmetric treatment.** Rich sourced chrome on the **side**; a **light geometric hint** on the
   **top** (cab nose + rear-door strip). Rationale: from above a truck bed *is* essentially the
   cargo rectangle the cutaway already draws — a full top illustration adds noise, not information.
4. **No clean CC0 top view exists.** The only clean top-down truck vector found is CC BY-SA 3.0
   (attribution + share-alike) — a licensing burden for a commercial product. Confirms decision 3.

## Scope (what changes, what does NOT)

- **Changes:** the **Ladeplan** side + top cutaways only
  ([apps/web/src/screens/components/CrossSection.tsx](../../../apps/web/src/screens/components/CrossSection.tsx),
  rendered in [LadeplanScreen.tsx:445](../../../apps/web/src/screens/LadeplanScreen.tsx#L445) and
  [:449](../../../apps/web/src/screens/LadeplanScreen.tsx#L449)).
- **Engine / contract / `packages/*` — untouched.** This is a pure `apps/web` presentation change;
  the headless core and `api-contract.md` do not change. No ADR required (no architectural/API
  decision — a rendering choice). Provenance of the CC0 asset is recorded in this doc.
- **Cargo geometry is untouched.** The cutaway rects come from the engine `Layout` via
  [cutaway.ts](../../../apps/web/src/screens/components/cutaway.ts) exactly as today; the chrome never
  reads or moves them.
- **Setup screen `StackDiagram` (41e.3) — unchanged.** This task is Ladeplan-only.
- **One generic truck silhouette for every vehicle.** Box vs tilt (Tent) vs specific bodies are not
  differentiated. Multi-compartment vehicles (tractor+trailer, `LKWkalk-p3p`) are **out of scope** —
  the chrome assumes a single hold.

## The 1:1 invariant and its mechanism (the main risk)

The cargo drawing must stay exactly 1:1 and keep the top and side views **column-aligned on vehicle
length** (commit `0f32ca6`: "SVG must occupy the column exactly"). Chrome must not perturb this.

**Mechanism: a nested `<svg>`.** The cargo cutaway keeps its own coordinate system
(`viewBox="0 0 length spanY"`, mm) inside a **nested `<svg>`** placed within an **outer chrome svg**.
The nested viewport preserves the internal mm→unit mapping regardless of the outer coordinate system,
so every cargo rect, grid line, drag target and drop preview keeps its current maths verbatim.

The **outer svg** adds fixed-proportion gutters *outside* the nested cargo viewport:

- **Front gutter** (left, before the hold): the cab. **Both views get the same front gutter width**
  so their cargo columns stay left-aligned — the top view fills its gutter with the cab-nose hint,
  the side view with the cab silhouette.
- **Bottom gutter** (side view only): wheels + ground line, below the hold.
- **Ruler lane** (below the bottom gutter): the labelled metre scale.

Gutters are sized in **real-world mm** (e.g. cab ≈ 1.8 m long, ≈ vehicle-height tall; wheel gutter a
fixed fraction of height), so the chrome scales with zoom but the hold still stretches to the true
`length × height` / `length × width`. This is what lets a fixed-shape asset coexist with a
variable-dimension cutaway — the failure mode the memory warned about is avoided by attaching the
asset's **cab and wheel pieces** at real-world scale rather than stretching a whole fixed-aspect truck.

## Components

- **`truckChrome.ts`** (new, pure) — geometry + token-recoloured SVG fragments extracted from the CC0
  asset: `CabSilhouette` (side), `Wheel`/axle set (side), and the geometric top hint (`cabNose`,
  `rearDoors`). Extraction recolours all fills/strokes to tokens (`--truck`, neutrals); no external
  refs, no gradients, no rasters — inline paths only.
- **`ruler.ts`** (new, pure) — metre tick positions + labels for a given axis length (mm → "1 m",
  "2 m", …). Shared by both views (side uses length; top uses length too, along the shared x-axis).
- **`CrossSection.tsx`** — wraps its current `<svg>` body in the nested viewport and renders the outer
  chrome. All existing interaction (drag/drop/marquee/rotate) stays on the nested cargo svg untouched;
  the chrome is `pointerEvents="none"` decoration.

## Visual language

- **Side chrome:** cab silhouette flush to the hold's front-left, wheels sitting on a ground line
  under the hold, in `--truck` (a neutral with a slight brand-green bias) — quiet, so the coloured
  cargo stays the focus. The hold's own frame stays the current strong outline.
- **Top hint:** a thin cab-nose trapezoid in the front gutter + a short rear-door strip at the back;
  same `--truck`, deliberately minimal.
- **Metre ruler:** labelled ticks along the bottom, tokens `--faint`/`--grid`, `tabular-nums`.
- **Print / B&W:** chrome is print-visible and must read in monochrome (ADR-006) — achieved with
  outline + neutral fill, no colour-dependent meaning. Selection/editing chrome stays `print:hidden`
  as today.
- **Front markers:** the existing Vorne/Hinten labels are absorbed into the chrome (the cab already
  says "front"); keep the words for accessibility/print but align them to the new gutters.

## Testing (TDD)

- **Invariant — 1:1 preserved:** cargo rect coordinates and the grid are byte-identical before/after
  the nested-svg wrap (unit test over `topRects`/`sideRects` consumers + a render assertion that the
  nested viewport `viewBox` is `0 0 length spanY`).
- **Chrome does not intrude:** cab/wheels/ruler render only in the gutters, never inside the cargo
  viewport; `pointerEvents="none"` on all chrome (a press in the hold still hits a stack, not chrome).
- **Interaction intact:** existing CrossSection drag/marquee/rotate tests still pass unchanged.
- **Column alignment:** top and side nested viewports share the same left origin (front gutter width).
- **Ruler:** `ruler.ts` unit tests — correct tick count/labels for representative lengths (e.g. 13600
  mm → 1..13 m); pure-function, no DOM.
- **Print/B&W:** snapshot of the cutaway with `--truck` forced to greyscale stays legible (no
  colour-only distinctions).
- **Asset hygiene:** `truckChrome.ts` fragments contain no `<image>`, no gradients, no external URLs
  (guards recolour + print safety and CSP).

## i18n

- New user-facing strings are keys only, **de + ru**: ruler unit ("m"/"м" or numeric+unit), any new
  aria-label additions. No hard-coded strings (project invariant). The cutaway `aria-label` stays.

## Asset provenance / license

- **Side chrome source:** freesvg.org #19102 "Simple Truck Side Vector Drawing", **CC0 / Public
  Domain** (Openclipart origin) — commercial use OK, **no attribution required**. Only the cab and
  wheel shapes are used, recoloured to tokens. The upstream file's boilerplate metadata is stripped.
- **Top hint:** original geometric shapes authored in-repo (trapezoid + strip) — no third-party asset.
- CC BY-SA candidates (Wikimedia 18-wheeler side/top) were **rejected** to avoid share-alike on a
  commercial derivative.
- A short provenance note (source + CC0) goes in a comment atop `truckChrome.ts`.

## Beads reconciliation

- **`LKWkalk-51m`** (realistic truck asset) → **close as folded into `LKWkalk-41e.1`** on completion;
  its intent (recognizable truck in the cutaways) is delivered here via the CC0-asset route.
- **`LKWkalk-5tg`** (unreadable "N stacks selected" label) stays separate — it is a selection-chrome
  bug, not truck graphics, and belongs with `41e.4` (UI system).

## Open items

- Exact gutter proportions (cab length/height fraction, wheel gutter height) are tuning constants,
  settled during implementation against a real vehicle preset with headless-Chrome screenshots — same
  loop as 41e.3. Single named constants, documented in `truckChrome.ts`.
- Non-pallet / multi-compartment vehicles remain future work (`LKWkalk-p3p`); the chrome is written so
  a later per-compartment variant can wrap each hold without re-plumbing the cargo viewport.
