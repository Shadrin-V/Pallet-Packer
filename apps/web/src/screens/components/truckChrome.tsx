// Truck chrome for the Ladeplan cutaways (41e.1). The cab and wheels are the vendored CC0 asset's
// shapes (truck-side-source.svg), placed at real-world scale so they frame a hold of ANY size without
// being stretched. The top hint and ruler are original geometry. Everything is decoration: colour
// var(--truck), pointer-events none, print-safe (outline + neutral fill, no colour-only meaning).
import rawTruck from '../../assets/truck-side-source.svg?raw';
import { metreTicks } from './ruler';

// Gutter sizes as fractions of vehicle height — single tunable constants (screenshot-tuned, Task 6).
export const GUTTER = { front: 0.75, wheel: 0.22, ruler: 0.16 };

// The cab occupies a slice of the source's 750×750 box; measured once from truck-side-source.svg.
// x∈[486,602] (windshield frame→side windows), y∈[80,272] in source units → aspect w/h of the cab slice.
const CAB_SRC = { x: 486, y: 80, w: 116, h: 192 };
const CAB_ASPECT = CAB_SRC.w / CAB_SRC.h;

// Inline the recoloured source once so we can reference sub-regions via nested <svg> viewports.
function AssetSlice({
  box,
  width,
  height,
}: {
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

export function TopHint({
  length,
  width,
  front,
}: {
  length: number;
  width: number;
  front: number;
}) {
  // Cab nose: a trapezoid in the front gutter (x from -front to 0). Rear doors: a thin strip at x≈length.
  const inset = width * 0.12;
  return (
    <g
      pointerEvents="none"
      aria-hidden="true"
      stroke="var(--truck)"
      fill="none"
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
    >
      <polygon points={`${-front},${inset} 0,0 0,${width} ${-front},${width - inset}`} />
      <line x1={length} y1={0} x2={length} y2={width} strokeDasharray="10 8" />
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
  const ticks = metreTicks(length);
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
