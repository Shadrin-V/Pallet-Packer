# 41e.1 — Contract for the user-supplied truck SVG (side view)

> Brief for the asset the owner draws by hand (Illustrator/Inkscape/whatever). Fills the truck chrome
> in the Ladeplan **side** cutaway. The cargo box itself is drawn by the app at exact 1:1 — your asset
> is the **cab + wheels around it**, never the cargo area.

## The one idea that makes it fit everything

The cargo box is a **different aspect ratio for every vehicle** (a 13.6 m × 2.7 m curtainsider is long
and low; a 6 m × 2.4 m box is short and tall). A single whole-truck drawing **cannot** wrap both
without stretching the cab into a funhouse mirror — that is exactly why the last attempt looked wrong.

**Solution: draw two separate end-caps, not one truck.**

```
   ┌─────────── FRONT CAP ──────────┐┌════ app-drawn 1:1 cargo box ════┐┌─ REAR CAP ─┐
   │   cab + windscreen             ││  (any length × any height,      ││  doors +   │
   │   + steer & drive wheels       ││   your asset never touches it)  ││  bogie     │
   │                                ││                                 ││  wheels    │
   ●──ground──────────────────────────────────────────────────────────────────────●
```

The app places the **front cap** flush to the box's front face and the **rear cap** flush to its rear
face, and scales each **uniformly** to the current vehicle height. Uniform scale = no distortion, ever.
The box in the middle stretches; your caps do not.

## Coordinate contract (this is the important part)

Draw everything in **millimetres at real-world scale**, using a **reference trailer height of 2700 mm**.
Use these exact vertical reference lines in **both** caps:

| y (mm) | meaning | what sits here |
|-------:|---------|----------------|
| `0`    | trailer **roof** line (top of cargo box) | cab roof ≈ here (a little lower is fine) |
| `2700` | trailer **floor** line (bottom of cargo box) | chassis top / where the box rests |
| `3600` | **ground** line | wheels sit tangent to this |

So both cap files use **`viewBox="0 0 W 3600"`** (height 3600 = 2700 trailer + 900 wheel gap). Height is
fixed at 3600; only the **width `W`** differs per cap.

**Horizontal anchors:**

- **Front cap** (`truck-front-side.svg`): the **right edge `x = W`** is the trailer **front face** (back
  of the cab). Everything is drawn to the left of it. Suggested `W ≈ 2300` (a tractor is ~2.3 m long in
  side profile). The cab occupies roughly `y 200 … 2700`; steer wheel near `x ≈ 500`, drive wheel near
  `x ≈ 1900`, wheel radius ≈ `450`, wheels tangent to `y = 3600`.
- **Rear cap** (`truck-rear-side.svg`): the **left edge `x = 0`** is the trailer **rear face** (the
  doors). Everything is drawn to the right. Suggested `W ≈ 1300`. Rear bogie: 2 wheels near `x ≈ 300`
  and `x ≈ 900`, same radius, tangent to `y = 3600`; an underride bar around `y ≈ 3100` is a nice touch.

You do **not** need to be surgically precise on the suggested x/radius numbers — those are yours to make
look good. The **only** hard requirements are: real-mm scale, `viewBox` height exactly `3600`, roof at
`y=0`, floor at `y=2700`, ground at `y=3600`, and the front/rear faces on the correct viewBox edge.

## Hard format rules (so it drops straight in, recolours, and prints)

1. **`viewBox="0 0 W 3600"`**, no `width`/`height` on the root `<svg>`.
2. **Colour = `currentColor`.** Every fill/stroke that should be the truck colour must be literally
   `fill="currentColor"` / `stroke="currentColor"` (or `fill:currentColor` in a `style`). The app sets
   the colour via the `--truck` token. Use `#ffffff` (or `fill="none"`) only for genuine cut-outs
   (windows, wheel hubs).
3. **Flat only.** No `<linearGradient>`/`<radialGradient>`, no filters, no `<image>`/embedded rasters,
   no `xlink:href`, no external URLs. Must read in solid black-and-white (it gets printed).
4. **No `<text>`** — outline any lettering to paths, or omit it.
5. **Clean output.** Strip editor cruft: no `<metadata>`, no `sodipodi:*` / `inkscape:*` attributes or
   namespaces, no `<defs>` you don't use. Plain `<path>`/`<rect>`/`<circle>`/`<g>` only. All tags closed,
   attributes double-quoted, well-formed XML.
6. Keep each file small (a handful of shapes). Line-art or flat-fill both fine — quiet and schematic,
   the coloured cargo is the star.

## Style direction

- A recognisable European **Sattelzug** tractor in the front cap: sloped windscreen, aero cab, mirror
  arm optional. Rear cap: swing/roller doors hint + trailer bogie.
- Weight: like a clean technical side elevation, not a cartoon. One flat tone (`currentColor`) plus
  white cut-outs. It should look right at ~120 px tall and in monochrome print.

## Deliverables

- `truck-front-side.svg`
- `truck-rear-side.svg`
- (Top view is **not** needed from you — the top cutaway keeps a light geometric nose+doors hint the app
  draws itself. Say if you'd rather supply top caps too.)

Drop the two files anywhere (e.g. `apps/web/src/assets/`) and tell me — I strip any leftover cruft,
wire them into `truckChrome.tsx` (replacing the CC0 cab slice + circle wheels), set
`frontGutter = frontW × scale`, `rearGutter = rearW × scale`, `scale = vehicleHeight / 2700`, and
re-render the artifact for your sign-off.

## What I do on my side once the files land

- Replace `CabProfile`'s asset slice with the front cap; replace `Axles` circles with the caps' wheels.
- Add a `rearGutter` so the rear cap has room past the box (mirror of the existing front gutter).
- Keep the metre ruler and the 1:1 cargo drawing exactly as they are.
- Update `truckChrome.tsx` tests for the new shapes; keep all CrossSection invariants green.
