// Truck chrome for the Ladeplan cutaways (41e.1). The side view is framed by an aero tractor extracted
// from the owner's vector reference (docs/design/Reference/truck_cargo_focus_top_side_aligned.svg, side
// view) plus the trailer running gear (tridem bogie, landing legs, underrun rail, rear mudflap) drawn
// from the same reference's shapes. Everything is anchored to the cargo box in the reference's own
// coordinate frame and scaled UNIFORMLY to the current vehicle height, so the box stretches to any
// length×height while the tractor never distorts. Top hint and ruler are original geometry. All
// decoration: colour var(--truck), pointer-events none, print-safe (line-art currentColor + white cut-outs).
import frontRaw from '../../assets/truck-front-side.svg?raw';
import topRaw from '../../assets/truck-front-top.svg?raw';
import { metreTicks } from './ruler';

// Reference frame (units of the source vector, docs/design/Reference). The cargo box is y[TOP..FLOOR]
// spanning x[FRONT..REAR]; wheels rest at GROUND. The cap asset's viewBox is "VBX VBY VBW VBH". Chrome
// maps ref→outer at scale s = height/BOX_H so ref(FRONT,FLOOR) lands on (frontGutter, box bottom).
const BOX_H = 335; // cargo box height in ref units (y530..865)
const TOP = 530;
const FLOOR = 865;
const GROUND = 911;
const FRONT = 260; // box front face (ref x)
const REAR = 1530; // box rear face (ref x)
const VBX = 53; // cap asset viewBox origin — tight to the cab's left edge (no wasted front margin)
const VBY = 520;
const VBW = 372; // covers the cab through the drive wheel (ref x417)
const VBH = 400;

// Gutter fractions of vehicle height, derived from the reference so chrome scales with the box.
// front = tractor width ahead of the box; wheel = gap below the floor where wheels hang; ruler = lane.
export const GUTTER = {
  front: (FRONT - VBX) / BOX_H, // 0.657
  wheel: (GROUND - FLOOR) / BOX_H, // 0.137
  ruler: 0.16,
};

// TOP-view reference frame: cargo box y[T_TOP..T_BOT] (= vehicle width) spanning x[T_FRONT..T_REAR];
// the cab-top asset viewBox is "VBX_T VBY_T VBW_T VBH_T". Rear door fittings sit at the box rear.
const BOX_W = 360; // cargo box height in top-view ref units (y60..420 = vehicle width)
const T_TOP = 60;
const T_FRONT = 260;
const T_REAR = 1530;
const VBX_T = 50;
const VBY_T = 55;
const VBW_T = 215;
const VBH_T = 370;

const FRONT_INNER = frontRaw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const TOP_INNER = topRaw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** The reference tractor re-hosted in a nested svg, scaled UNIFORMLY to the vehicle height and anchored
 *  so its box-front/floor land on the front gutter / box bottom. frontGutter = (FRONT-VBX)*s, so the
 *  cap's viewBox left (VBX) sits at outer x=0; overflow visible lets the drive axle reach under the box
 *  front. Note TOP is used implicitly: (FLOOR-VBY)-BOX_H = TOP-VBY, so the box top lands at outer y=0. */
export function FrontCap({ height }: { height: number }) {
  const s = height / BOX_H;
  return (
    <svg
      x={0}
      y={height - (FLOOR - VBY) * s}
      width={VBW * s}
      height={VBH * s}
      viewBox={`${VBX} ${VBY} ${VBW} ${VBH}`}
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
      aria-hidden="true"
      style={{ color: 'var(--truck)', overflow: 'visible' }}
      dangerouslySetInnerHTML={{ __html: FRONT_INNER }}
    />
  );
}

/** Trailer running gear from the reference, drawn under the box (caller translates by the front gutter):
 *  a tridem bogie + rear mudflap anchored to the box REAR, landing legs anchored behind the FRONT, and an
 *  underrun rail across the rear span. Uniformly scaled to match the tractor; all below the floor line. */
export function TrailerUnder({ length, height }: { length: number; height: number }) {
  const s = height / BOX_H;
  const yOf = (ry: number) => height + (ry - FLOOR) * s; // ref y → outer y (floor → box bottom)
  const front = (rx: number) => (rx - FRONT) * s; // ref x → box x, anchored to the front
  const rear = (rx: number) => length - (REAR - rx) * s; // ref x → box x, anchored to the rear
  const r = 33 * s;
  const hub = 14 * s;
  const sw = 4 * s;
  const swD = 3 * s;
  const swM = 2.2 * s;
  const tridem = [1190, 1302, 1414];
  return (
    <g pointerEvents="none" aria-hidden="true" fill="none" stroke="var(--truck)" strokeLinecap="round" strokeLinejoin="round">
      {/* landing legs + foot, anchored behind the front */}
      <line x1={front(690)} y1={yOf(865)} x2={front(690)} y2={yOf(912)} strokeWidth={swD} />
      <line x1={front(703)} y1={yOf(865)} x2={front(703)} y2={yOf(912)} strokeWidth={swD} />
      <path d={`M${front(678)} ${yOf(914)} Q${front(697)} ${yOf(905)} ${front(716)} ${yOf(914)}`} strokeWidth={swD} />
      {/* underrun rail across the rear span */}
      <line x1={rear(1040)} y1={yOf(884)} x2={rear(1468)} y2={yOf(884)} strokeWidth={swM} />
      {/* rear mudflap at the box rear */}
      <rect x={length} y={yOf(829)} width={12 * s} height={38 * s} fill="#ffffff" strokeWidth={swM} />
      {/* tridem bogie */}
      <g fill="#ffffff">
        {tridem.map((rx) => (
          <circle key={rx} cx={rear(rx)} cy={yOf(878)} r={r} strokeWidth={sw} />
        ))}
      </g>
      <g fill="#ffffff">
        {tridem.map((rx) => (
          <circle key={`h${rx}`} cx={rear(rx)} cy={yOf(878)} r={hub} strokeWidth={swD} />
        ))}
      </g>
    </g>
  );
}

export function GroundLine({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <line
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke="var(--truck)"
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      aria-hidden="true"
    />
  );
}

/** Top view chrome from the reference: the cab-top (aero cab seen from above, with fifth-wheel coupling
 *  and mirror stubs) re-hosted in a nested svg ahead of the box, plus the two rear door fittings at the
 *  box rear. Scaled by s = width/BOX_W so the cab spans the vehicle width; anchored to the box front and
 *  rear (in outer coordinates — caller does NOT translate this group). */
export function TopChrome({
  length,
  width,
  frontGutter,
}: {
  length: number;
  width: number;
  frontGutter: number;
}) {
  const s = width / BOX_W;
  const rearX = frontGutter + length;
  return (
    <g pointerEvents="none" aria-hidden="true">
      <svg
        x={frontGutter - (T_FRONT - VBX_T) * s}
        y={-(T_TOP - VBY_T) * s}
        width={VBW_T * s}
        height={VBH_T * s}
        viewBox={`${VBX_T} ${VBY_T} ${VBW_T} ${VBH_T}`}
        preserveAspectRatio="xMidYMid meet"
        pointerEvents="none"
        aria-hidden="true"
        style={{ color: 'var(--truck)', overflow: 'visible' }}
        dangerouslySetInnerHTML={{ __html: TOP_INNER }}
      />
      {/* rear door fittings, anchored to the box rear (ref rects x1530 y112/y328, 12×40) */}
      <g fill="none" stroke="var(--truck)" strokeWidth={2.2 * s} strokeLinejoin="round">
        <rect x={rearX} y={(112 - T_TOP) * s} width={12 * s} height={40 * s} />
        <rect x={rearX} y={(328 - T_TOP) * s} width={12 * s} height={40 * s} />
      </g>
    </g>
  );
}

export function MetreRuler({
  length,
  y,
  unit,
}: {
  length: number;
  y: number;
  unit: string;
}) {
  // Drop interior ticks that would collide with the total-length label at the end (design 2026-07-22).
  const ticks = metreTicks(length).filter((t) => length - t.x > 800);
  const font = length * 0.02;
  return (
    <g pointerEvents="none" aria-hidden="true" fill="var(--faint)">
      {ticks.map((t) => (
        <g key={t.metre}>
          <line
            x1={t.x}
            y1={y}
            x2={t.x}
            y2={y + font * 0.6}
            stroke="var(--grid)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={t.x}
            y={y + font * 1.9}
            fontSize={font}
            textAnchor="middle"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {t.metre}
          </text>
        </g>
      ))}
      <text
        x={length}
        y={y + font * 1.9}
        fontSize={font}
        textAnchor="end"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >{`${length / 1000} ${unit}`}</text>
    </g>
  );
}
