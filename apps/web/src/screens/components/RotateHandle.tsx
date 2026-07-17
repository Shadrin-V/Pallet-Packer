// The "turn this stack 90°" affordance, in the caller's units (mm). Screen-only: a printed Ladeplan
// shows the load, not the editing UI.
//
// Shared by the hold and the warehouse floor — turning a stack is one gesture, and it should not
// depend on which surface the stack happens to stand on (LKWkalk-wxi).
export function RotateHandle({
  cx,
  cy,
  size,
  label,
  onRotate,
}: {
  cx: number;
  cy: number;
  size: number;
  label: string;
  onRotate: () => void;
}) {
  const a = size * 0.5; // arc radius
  const t = size * 0.22; // arrowhead half-height
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      role="button"
      aria-label={label}
      tabIndex={0}
      className="print:hidden"
      style={{ cursor: 'pointer' }}
      // stop the press from starting a drag of the stack underneath
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onRotate();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onRotate();
      }}
    >
      <circle
        r={size}
        fill="var(--card)"
        stroke="var(--brand)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* 270° arc + arrowhead: the universal "rotate 90°" mark */}
      <path
        d={`M 0 ${-a} A ${a} ${a} 0 1 1 ${-a} 0`}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path d={`M 0 ${-a - t} L 0 ${-a + t} L ${t * 1.6} ${-a} Z`} fill="var(--brand)" />
    </g>
  );
}
