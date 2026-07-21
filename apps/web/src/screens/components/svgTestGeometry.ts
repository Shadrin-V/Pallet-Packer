// Test-only: jsdom ships no SVG geometry (createSVGPoint, getScreenCTM) and returns a zero
// getBoundingClientRect, so a pointer gesture over a cutaway collapses to a zero-length drag and
// every such test silently asserts nothing.
//
// These stubs install the IDENTITY transform: one client pixel is one millimetre of hold, and the
// svg occupies the rect it is given. That makes gesture tests honest — the component's own
// arithmetic still runs, only the browser's missing plumbing is supplied.
// Returns an uninstall function. Prototype patches outlive the test that made them — they are not
// undone by Testing Library's cleanup — so a test file that forgets to restore silently changes the
// geometry every later file in the same worker sees. Always restore in afterEach.
export function installSvgGeometry(rect = { left: 0, top: 0, width: 4000, height: 2000 }): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  // jsdom has no PointerEvent either, so Testing Library falls back to a bare Event — which silently
  // drops clientX/clientY, and every coordinate the component computes comes out NaN. A MouseEvent
  // subclass carries the coordinates and the modifier keys; pointerId is all that is added.
  const hadPointerEvent = 'PointerEvent' in g;
  if (!hadPointerEvent) {
    g.PointerEvent = class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    };
  }
  const proto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  const elProto = Element.prototype as unknown as Record<string, unknown>;
  const saved = {
    createSVGPoint: proto.createSVGPoint,
    getScreenCTM: proto.getScreenCTM,
    getBoundingClientRect: proto.getBoundingClientRect,
    setPointerCapture: elProto.setPointerCapture,
    releasePointerCapture: elProto.releasePointerCapture,
  };
  const hadOwn = {
    createSVGPoint: Object.prototype.hasOwnProperty.call(proto, 'createSVGPoint'),
    getScreenCTM: Object.prototype.hasOwnProperty.call(proto, 'getScreenCTM'),
    getBoundingClientRect: Object.prototype.hasOwnProperty.call(proto, 'getBoundingClientRect'),
  };
  proto.createSVGPoint = function () {
    return {
      x: 0,
      y: 0,
      matrixTransform(this: { x: number; y: number }) {
        return { x: this.x, y: this.y }; // identity: client px === hold mm
      },
    };
  };
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  proto.getScreenCTM = function () {
    return { ...identity, inverse: () => identity };
  };
  proto.getBoundingClientRect = function () {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    };
  };
  // jsdom throws InvalidPointerId for a pointer it never saw; capture is irrelevant to the logic.
  elProto.setPointerCapture = function () {};
  elProto.releasePointerCapture = function () {};

  return () => {
    if (!hadPointerEvent) delete g.PointerEvent;
    // SVGSVGElement.prototype inherits these from Element/SVGElement; a plain re-assignment would
    // leave an own property shadowing the inherited one forever. Delete when there was none.
    if (hadOwn.createSVGPoint) proto.createSVGPoint = saved.createSVGPoint;
    else delete proto.createSVGPoint;
    if (hadOwn.getScreenCTM) proto.getScreenCTM = saved.getScreenCTM;
    else delete proto.getScreenCTM;
    if (hadOwn.getBoundingClientRect) proto.getBoundingClientRect = saved.getBoundingClientRect;
    else delete proto.getBoundingClientRect;
    elProto.setPointerCapture = saved.setPointerCapture;
    elProto.releasePointerCapture = saved.releasePointerCapture;
  };
}
