# 41e.3 — Axonometric pallet + stack diagram (Setup screen)

> Design doc (brainstorming phase, 2026-07-22). Epic **LKWkalk-41e** «Дизайн-батч», subtask
> **LKWkalk-41e.3** «наглядная отрисовка поддона и стопки». Vetted via the visual companion
> (`.superpowers/brainstorm/`) with headless-Chrome screenshots.

## Goal

Replace the flat side-elevation stack preview in the **Настройка (Setup)** screen with a legible
**axonometric (pseudo-3D) pallet+stack** that reads as a real pallet, reflects the cargo type's real
dimensions, and makes the entschachtelt/verschachtelt difference obvious.

## Scope (what changes, what does NOT)

- **Only the Setup screen's `StackDiagram`** ([apps/web/src/screens/components/StackDiagram.tsx](../../../apps/web/src/screens/components/StackDiagram.tsx),
  rendered in [SetupScreen.tsx:1037](../../../apps/web/src/screens/SetupScreen.tsx#L1037)).
- **Ladeplan cutaways (`CrossSection`) are unchanged** — the plan keeps its flat top/side rects.
- **Engine/contract unchanged** — this is a pure `apps/web` rendering change; it consumes the existing
  `StackPreview` (`count`, `base`, `height`, `hold`, `mode`, `stepHeight`) plus the cargo type's
  `length`/`width`/`height`.
- **Applies to every cargo type for now** (decision 2026-07-22: «пока все грузы = паллеты»). There is
  no `kind` field in `CargoType` yet; a future gate (`kind === 'pallet'`) is tracked in a follow-up
  bead and applied when non-pallet kinds (Gestelle/racks, LKWkalk-qrd.17) land. See [Open items](#open-items).

## Visual language

- **Projection:** oblique / gentle dimetric with a *small* rotation — the front face (length × height)
  is true, depth (width) recedes up-and-right. Screen mapping for a model point `(l, w, h)` with
  origin `(ox, oy)` (front-bottom-left, y-down):
  - `sx = ox + l + w · DX`
  - `sy = oy − h − w · DY`
  - `DX = 0.44`, `DY = 0.30` (tunable single constants; "небольшой разворот"). Visible faces: front,
    top, right.
- **Dimension-aware:** `l ∈ [0, length]`, `w ∈ [0, width]`, `h` in mm. The top parallelogram encodes
  the L:W footprint ratio; the extrusion encodes real height; so 1200×800, 800×1200 and 1140×1140
  read as visibly different shapes and heights, to scale, against the hold.
- **Unit = neutral pallet base + coloured goods box.** Each stacked unit is drawn as:
  - **Pallet base** (bottom band, height `ph = min(150, H·0.2)` mm): neutral tokens
    (`--card`/`--sub`/`--muted`), with fork-pocket gaps cut on the visible front and right faces so it
    reads as a pallet.
  - **Goods box** (remaining height): order-palette faces — front `--sN` tint `.16` **+ hatch**
    `url(#pat-N)`, top the lighter shade, right the darker shade (flat shading, no gradients). Order
    identity stays colour **and** hatch, consistent with the design system.
- **Hold headroom frame:** a light dashed 3D wireframe of the hold box (`length × width × hold`) so the
  remaining headroom above the stack is visible (replaces the current 2D dashed rect).
- **Screen-only:** the Setup diagram is not printed (only Ladeplan prints), so face shading in colour
  is fine — the ADR-006 B/W-print constraint does **not** apply here.

## Stack construction

- `n = preview.count` tiers, drawn **bottom → top** so an upper unit overlaps the one below.
- **entschachtelt:** `step = unitH` → units sit flush, each tier fully visible.
- **verschachtelt (nested):** `step = Δh` (`< unitH`) → units telescope; the overlap reads as a denser
  stack with more tiers in the same headroom. `Δh` comes from the engine preview
  (`(height − base)/(count − 1)` today; the component derives it from `base`/`height`/`count`, never
  from tier count directly — same rule the current diagram follows).
- `count = 0` (unit does not fit, `H ≤ 0` or `hold < H`): draw the empty hold frame only.

## Component shape

- Rewrite `StackDiagram` (keep the name and props, or add `StackDiagram` v2 and swap the call site).
  Props stay: `{ preview: StackPreview, length, width, height, hold, label, series }` — add `width`
  and `height`/`hold` as needed (today it takes `length` + reads `preview`). All values already
  available where it is rendered.
- Keep the readable **formula + result** text next to the diagram (`stackFormula.ts`,
  `stack.formula.*` i18n) unchanged — the picture is illustrative, the exact maths stays beside it.
- Pure SVG in `viewBox` mm-coordinates, `vector-effect="non-scaling-stroke"`, one `<pattern>` per
  series for the front-face hatch. No new engine calls.

## Testing

- Deterministic projection → structural/unit tests: viewBox spans the projected bounds; tier count
  equals `preview.count`; nested vs flush step is derived from the preview (nested draws overlapping
  units); `count = 0` renders only the frame. Geometry is validated structurally, not by pixel
  snapshot (repo convention).
- Manual browser check of the real Setup screen for the three example footprints.

## Open items

- **Future `kind` gate.** When a non-pallet cargo kind exists, gate the axonometric-pallet rendering
  to `kind === 'pallet'` and fall back for others. Tracked as a follow-up bead (contract change →
  ADR + api-contract update first, per «сначала документация»).
- **Projection constants** `DX`/`DY` are a single tunable pair; final values confirmed against the
  real screen during implementation.

## Non-goals

- No change to the Ladeplan cutaways, the packing engine, the API contract, or print output.
- No literal wood-grain / photoreal rendering — this is a clean technical axonometric, not the
  marketing-illustration register spun out for the truck asset (LKWkalk-51m).
