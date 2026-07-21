// Cutaway SVG in mm coordinates (design-system §7). Calque background + 1000mm grid, thick vehicle
// frame, per-order colour+hatch rects. Strokes use non-scaling-stroke (px widths) so lines stay
// crisp regardless of the mm→px scale. Heights from the engine (z+dz), never tier counts.
// Top view supports manual stack drag when onMoveStack is provided, and a click-to-select + 90° yaw
// rotate affordance when onRotateStack is (T5). Selection chrome is screen-only (print:hidden) — the
// printed Ladeplan shows the load, not the editing UI.
//
// A drag shows its outcome BEFORE the release (ADR 020): the engine resolves the aim on every move,
// the ghost sits where the stack would actually land — green if it may, red on the aim plus red
// outlines on whatever is in the way if it may not. The release then applies exactly what was shown;
// anything else would make the preview a lie.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  resolveDrop,
  resolveGroupDrop,
  type GroupDropResolution,
  type Layout,
  type Load,
  type StackRef,
} from '@shadrin-v/engine';
import { StackShape } from './StackShape';
import { RotateHandle } from './RotateHandle';
import { useT } from '../../i18n/LocaleContext';
import { topRects, sideRects, type CutRect } from './cutaway';
import { snap, type StackSel } from './editLayout';
import { normalizeRect, stacksInRect, hasRef, toggleRef, groupBBox, refKey } from './marquee';
import { fillTemplate } from './stackFormula';

/** Where a dragged stack would land, and whether it may — the engine's answer, drawn. */
export interface DropPreview {
  x: number;
  y: number;
  dx: number;
  dy: number;
  ok: boolean;
  blocking: StackRef[];
}

function gridLines(max: number, step = 1000): number[] {
  const lines: number[] = [];
  for (let v = step; v < max; v += step) lines.push(v);
  return lines;
}

interface DragState {
  /** Everything being carried. One stack for a plain drag, the whole selection for a group drag. */
  refs: StackRef[];
  /** The stack under the finger. A click resolves to THIS one, whatever else is being carried. */
  pressed: StackRef;
  /** Was `pressed` the entire selection when it was pressed? Then a click deselects it again —
   *  the toggle has to look at the selection BEFORE the press, which the press itself already
   *  changed. */
  wasSole: boolean;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  /** The engine's verdict for the current pointer position, or null before the first move. */
  preview: DropPreview | null;
  /** Group drags resolve a DELTA, not a position — the engine's verdict is kept whole so the drop
   *  applies what was previewed, and so a refusal can be told apart from a move. */
  resolution: GroupDropResolution | null;
}

/** Below this pointer travel (mm) a press counts as a click (select), not a drag (move). */
const CLICK_SLOP_MM = 40;

export function CrossSection({
  load,
  layout,
  view,
  label,
  orderColors,
  onMoveStack,
  onMoveStacks,
  onRotateStack,
  onDropOutside,
  preview,
}: {
  load: Load;
  layout: Layout;
  view: 'top' | 'side';
  label: string;
  /** Stable orderId→palette slot so stack colours match the Setup screen after reorder (QA #2). */
  orderColors?: Map<string, number>;
  /** When provided (top view), stacks are draggable; called with the drop target in mm. */
  onMoveStack?: (sel: StackSel, toX: number, toY: number) => void;
  /** When provided (top view), a group of 2+ selected stacks moves by a common delta. */
  onMoveStacks?: (refs: StackRef[], dx: number, dy: number) => void;
  /** When provided (top view), a selected stack offers a 90° yaw rotation. */
  onRotateStack?: (sel: StackSel) => void;
  /** Stacks dragged off the cutaway and dropped elsewhere (e.g. onto the buffer strip). Pointer
   *  capture keeps the events coming here even once the pointer has left this svg.
   *  Returns whether the parent actually took them: a release next to the strip rather than on it
   *  changes nothing, and the selection must then survive — the stacks are still on the floor. */
  onDropOutside?: (refs: StackRef[], clientX: number, clientY: number) => boolean;
  /** Preview for a drag the PARENT owns (a stack carried in from the warehouse). The component's own
   *  drags preview themselves; whichever is live gets drawn. */
  preview?: DropPreview | null;
}) {
  const tt = useT();
  const { length, width, height } = load.vehicle;
  const spanY = view === 'top' ? width : height;
  const rects: CutRect[] = view === 'top' ? topRects(load, layout, orderColors) : sideRects(load, layout, height, orderColors);
  // Side view: draw far rows before near ones, so a nearer stack overlays what it really hides.
  // Sorting by `depth` would be wrong: "hidden by two" does not mean "further back than hidden by
  // one" — that is a count, not an order. `rowY` is the order; x breaks ties, for determinism.
  const sortedRects =
    view === 'side'
      ? [...rects].sort((a, b) => (a.rowY ?? 0) - (b.rowY ?? 0) || a.x - b.x)
      : rects;
  // Uniform ×N label size across all stacks (independent of footprint), in top-view mm units.
  const countFont = width * 0.05;
  const draggable = view === 'top' && !!onMoveStack;
  const rotatable = view === 'top' && !!onRotateStack;

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sel, setSel] = useState<StackRef[]>([]);
  /** Live rubber band, in mm: the press origin plus the current pointer. */
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** A band is a band only past the same slop that separates a click from a drag (design 2026-07-21,
   *  gesture table). Below it the press is a click on empty floor — a few mm of jitter next to a
   *  stack must not select that stack instead of clearing the selection. */
  const bandIsDrag = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    Math.hypot(b.x1 - b.x0, b.y1 - b.y0) >= CLICK_SLOP_MM;

  // Escape is the way out of any selection gesture — a half-drawn band, a carried group, or just a
  // selection the user no longer wants.
  useEffect(() => {
    if (!draggable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setBand(null);
      setSel([]);
      setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draggable]);

  const toSvg = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm || !svg.createSVGPoint) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /** Ask the engine where this drag would land. Cheap enough for every pointermove: only bounds and
   *  overlap depend on position (ADR 020), so no throttling — and the ghost cannot promise what
   *  the drop would refuse, because both ask the same function. */
  const previewFor = (s: StackSel, dx: number, dy: number): DropPreview => {
    const r = rects.find((c) => c.cargoTypeId === s.cargoTypeId && c.x === s.x && c.y === s.y);
    const orientation = r?.orientation === 'wlh' ? 'wlh' : 'lwh';
    // The snap grid is the UI's own (it tidies the aim); the magnet then refines it to a real spot,
    // so the resolved coordinates are used as-is — snapping them again would undo a flush fit.
    const res = resolveDrop(
      load,
      layout,
      { cargoTypeId: s.cargoTypeId, x: snap(s.x + dx), y: snap(s.y + dy), orientation },
      { exclude: s },
    );
    return { x: res.x, y: res.y, dx: r?.w ?? 0, dy: r?.h ?? 0, ok: res.ok, blocking: res.blocking };
  };

  /** The group ghost: the selection's bounding box at the resolved delta, plus whatever blocks it. */
  const groupPreview = (refs: StackRef[], res: GroupDropResolution): DropPreview | null => {
    const box = groupBBox(rects, refs);
    if (!box) return null;
    return {
      x: box.x + res.dx,
      y: box.y + res.dy,
      dx: box.w,
      dy: box.h,
      ok: res.ok,
      blocking: res.blocking,
    };
  };

  const onDown = (r: CutRect) => (e: ReactPointerEvent) => {
    if (!draggable) return;
    const ref: StackRef = { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y };
    // Shift/Ctrl-click adds or drops this one stack and starts no drag: the user is composing a
    // selection, not moving anything yet.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSel((cur) => toggleRef(cur, ref));
      return;
    }
    const s = toSvg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // Pressing a stack that is already selected carries the WHOLE selection; pressing one outside it
    // is a fresh single-stack drag, and the old selection is abandoned.
    const inGroup = hasRef(sel, ref);
    if (!inGroup) setSel([ref]);
    // One gesture at a time: a second finger landing on a stack mid-band abandons the band rather
    // than leaving both live (touchAction is none here, so multi-touch really does reach us).
    setBand(null);
    setDrag({
      refs: inGroup ? sel : [ref],
      pressed: ref,
      wasSole: sel.length === 1 && inGroup,
      startX: s.x,
      startY: s.y,
      dx: 0,
      dy: 0,
      preview: null,
      resolution: null,
    });
  };

  /** A press on bare floor draws a rubber band. Only on the svg itself — a stack handled its own. */
  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.target !== svgRef.current) return;
    const s = toSvg(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // Symmetrically to onDown: a press on bare floor during a live stack drag ends that drag rather
    // than leaving it carried forever with its stacks visually translated.
    setDrag(null);
    setBand({ x0: s.x, y0: s.y, x1: s.x, y1: s.y });
  };

  /** The browser took the pointer away (scroll takeover, palm rejection, a lost capture). Neither
   *  gesture can be completed, so neither may be left half-applied. */
  const onCancel = () => {
    setBand(null);
    setDrag(null);
  };

  const onMove = (e: ReactPointerEvent) => {
    if (band) {
      const s = toSvg(e);
      setBand({ ...band, x1: s.x, y1: s.y });
      return;
    }
    if (!drag) return;
    const s = toSvg(e);
    const dx = s.x - drag.startX;
    const dy = s.y - drag.startY;
    if (drag.refs.length > 1) {
      // A rigid block asks about a DELTA, not a position — one answer for all its members (ADR 021).
      const res = resolveGroupDrop(load, layout, drag.refs, { dx: snap(dx), dy: snap(dy) });
      setDrag({ ...drag, dx, dy, resolution: res, preview: groupPreview(drag.refs, res) });
    } else {
      setDrag({ ...drag, dx, dy, resolution: null, preview: previewFor(drag.refs[0], dx, dy) });
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    if (band) {
      // A press that did not travel past the slop is a click on empty floor: nothing is caught and
      // the selection is cleared. Past it, the band selects everything it touches.
      setSel(
        bandIsDrag(band) ? stacksInRect(rects, normalizeRect(band.x0, band.y0, band.x1, band.y1)) : [],
      );
      setBand(null);
      return;
    }
    if (!drag) return;
    // Dropped outside the hold? Hand it to whoever owns that space (the buffer strip) rather than
    // clamping it back onto the floor.
    const box = svgRef.current?.getBoundingClientRect();
    const outside =
      !!box && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
    if (outside && onDropOutside) {
      // Only the parent knows whether the release landed on something that takes cargo. It says so;
      // clear the selection only then — a release into empty page space moved nothing, and throwing
      // away the user's block for it would be a lie about where the stacks are.
      if (onDropOutside(drag.refs, e.clientX, e.clientY)) setSel([]);
      setDrag(null);
      return;
    }
    // A press that barely travelled is a click: select the stack (revealing the rotate action)
    // instead of moving it. Beyond the slop it is a drag → drop it at the pointer.
    if (Math.hypot(drag.dx, drag.dy) < CLICK_SLOP_MM) {
      setSel(drag.wasSole ? [] : [drag.pressed]);
    } else if (drag.refs.length > 1) {
      // Apply exactly the delta the ghost promised, and KEEP the selection so the user can nudge
      // the same block again without re-drawing the marquee. A refused delta is handed over too —
      // the engine owns the last word and its reason is what the user is shown (dwc.4) — but then
      // the stacks have not moved, so the selection must not be shifted either.
      // No group handler at all? Then nothing moved: shifting the selection would point it at
      // coordinates where no stack stands.
      if (onMoveStacks) {
        const res =
          drag.resolution ??
          resolveGroupDrop(load, layout, drag.refs, { dx: snap(drag.dx), dy: snap(drag.dy) });
        onMoveStacks(drag.refs, res.dx, res.dy);
        setSel(res.ok ? drag.refs.map((r) => ({ ...r, x: r.x + res.dx, y: r.y + res.dy })) : drag.refs);
      } else {
        setSel(drag.refs);
      }
    } else {
      // Apply what the ghost promised. Falling back to the raw aim would let the drop land somewhere
      // other than where the user watched it hover.
      const to = drag.preview ?? previewFor(drag.refs[0], drag.dx, drag.dy);
      onMoveStack?.(drag.refs[0], to.x, to.y);
      setSel([]);
    }
    setDrag(null);
  };

  return (
    <figure className="m-0 select-none">
      <figcaption className="mb-1 text-label uppercase font-semibold text-faint">{label}</figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${length} ${spanY}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        // Marks this svg as a projection of the plan: the PNG export picks the cutaways by this
        // attribute. role="img" alone would also match legend swatches and the stack diagram.
        data-cutaway={view}
        style={{ background: 'var(--paper)', display: 'block', touchAction: draggable ? 'none' : undefined }}
        onPointerMove={draggable ? onMove : undefined}
        onPointerUp={draggable ? onUp : undefined}
        onPointerDown={draggable ? onBackgroundDown : undefined}
        onPointerCancel={draggable ? onCancel : undefined}
      >
        {/* The grid is decoration, and must not be a hit target: a press landing on a stroke would
            otherwise reach neither the svg nor a stack, and start no band at all — a dead stripe
            every 1000 mm. Same pointerEvents="none" every other overlay here carries. */}
        {gridLines(length).map((x) => (
          <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={spanY} stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {gridLines(spanY).map((y) => (
          <line key={`hy${y}`} x1={0} y1={y} x2={length} y2={y} stroke="var(--grid)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {sortedRects.map((r, i) => {
          const ref: StackRef = { cargoTypeId: r.cargoTypeId, x: r.x, y: r.y };
          const isDragging = !!drag && hasRef(drag.refs, ref);
          const tf = isDragging ? `translate(${drag!.dx} ${drag!.dy})` : undefined;
          // Rear rows: dim the FILL, never the outline. A low rear stack (a quarter-pallet at 864 of
          // 2650 mm) vanished when the whole group went to 0.4 — and the side view is now the first
          // thing on the sheet, so it has to stay readable behind the front row.
          const behind = view === 'side' && (r.depth ?? 0) > 0;
          const isSelected = view === 'top' && hasRef(sel, ref);
          return (
            <g
              key={i}
              // A stable handle on this particular floor column: the render index is not one.
              data-stack-ref={view === 'top' ? refKey(ref) : undefined}
              transform={tf}
              onPointerDown={draggable ? onDown(r) : undefined}
              style={draggable ? { cursor: 'grab' } : undefined}
            >
              <StackShape x={r.x} y={r.y} w={r.w} h={r.h} series={r.series} muted={behind} hatchSpacing={180} />
              {view === 'top' && (r.count ?? 1) > 1 && (
                <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill="var(--ink)" fontSize={countFont} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                  ×{r.count}
                </text>
              )}
              {isSelected && (
                <>
                  <rect
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    fill="none" stroke="var(--brand)" strokeWidth={2} strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke" pointerEvents="none" className="print:hidden"
                  />
                  {/* Rotation is a single-stack operation: turning a block is a different question,
                      deliberately out of scope (ADR 021). */}
                  {rotatable && sel.length === 1 && (
                    <RotateHandle
                      // inset by one radius from the top-right corner so the whole handle sits inside
                      // the stack — a corner-anchored handle is clipped (and unclickable) for stacks at
                      // the truck edge (QA). Clamp the inset so it never crosses the rect's far side.
                      cx={r.x + r.w - Math.min(countFont * 0.8, r.w / 2)}
                      cy={r.y + Math.min(countFont * 0.8, r.h / 2)}
                      size={countFont * 0.8}
                      label={tt('ladeplan.rotateStack')}
                      onRotate={() => onRotateStack?.({ cargoTypeId: r.cargoTypeId, x: r.x, y: r.y })}
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
        {/* The block the user has selected, drawn as one frame with its count. Screen only. */}
        {(() => {
          if (view !== 'top' || sel.length < 2) return null;
          const box = groupBBox(rects, sel);
          if (!box) return null;
          const d = drag && drag.refs.length > 1 ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          return (
            <g className="print:hidden" pointerEvents="none" transform={`translate(${d.x} ${d.y})`}>
              <rect
                data-testid="group-frame"
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                fill="none"
                stroke="var(--brand)"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                data-testid="group-count"
                x={box.x}
                y={box.y - countFont * 0.3}
                fill="var(--brand)"
                fontSize={countFont * 0.7}
                fontWeight={700}
              >
                {fillTemplate(tt('ladeplan.selection.count'), { n: sel.length })}
              </text>
            </g>
          );
        })()}
        {/* The rubber band itself, once the press has become a drag. */}
        {band && bandIsDrag(band) && view === 'top' && (() => {
          const r = normalizeRect(band.x0, band.y0, band.x1, band.y1);
          return (
            <rect
              data-testid="marquee"
              className="print:hidden"
              pointerEvents="none"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="var(--brand)"
              fillOpacity={0.08}
              stroke="var(--brand)"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })()}
        {(() => {
          const shown = drag?.preview ?? preview;
          if (!shown || view !== 'top') return null;
          const tint = shown.ok ? 'var(--brand)' : 'var(--danger)';
          return (
            <g className="print:hidden" pointerEvents="none">
              {/* what is in the way — named by the engine, not guessed here */}
              {shown.blocking.map((b, i) => {
                const hit = rects.find((c) => c.cargoTypeId === b.cargoTypeId && c.x === b.x && c.y === b.y);
                return hit ? (
                  <rect
                    key={`blk${i}`}
                    data-testid="drop-blocker"
                    x={hit.x}
                    y={hit.y}
                    width={hit.w}
                    height={hit.h}
                    fill="var(--danger)"
                    fillOpacity={0.12}
                    stroke="var(--danger)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null;
              })}
              <rect
                data-testid="drop-preview"
                x={shown.x}
                y={shown.y}
                width={shown.dx}
                height={shown.dy}
                fill={tint}
                fillOpacity={0.14}
                stroke={tint}
                strokeWidth={2.5}
                strokeDasharray={shown.ok ? undefined : '8 5'}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })()}
        <rect x={0} y={0} width={length} height={spanY} fill="none" stroke="var(--line-strong)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </svg>
      {/* Vorne / Hinten belong to the TOP view and sit under it, inside its own figure (QA): both
          cutaways share the x axis (vehicle length), so one set of markers labels the pair — and
          hanging them above the side view read as if only that view had a front and a back. */}
      {view === 'top' && (
        <div className="mt-0.5 flex justify-between px-0.5 text-[10px] uppercase tracking-wide text-faint">
          <span>{tt('ladeplan.front')}</span>
          <span>{tt('ladeplan.back')}</span>
        </div>
      )}
    </figure>
  );
}
