// The warehouse floor's scenery (LKWkalk-41e.5) — a top-down yard: a flat floor with the owner's dock
// illustrations at the left and right edges (crates/pallets on the left; a forklift facing UP toward the
// truck, racks and a pallet on the right). It replaces the hand-drawn ForkliftMark: the surface reads as
// a yard, and the real buffer stacks (hatched, coloured, ×N) sit on top and dominate.
//
// Why a flat floor and not a tiled asphalt pattern (owner's call): the floor is a variable-aspect
// rectangle — width = vehicle length (a van to a road train), height grows with the buffer's depth. No
// fixed-aspect image fills that without distorting or seaming; tiling a raster centre slice left faint
// seams. A flat fill is seamless at ANY width or depth, full stop. The docks are the only art, pinned to
// the edges where the aspect never bites.
//
// Why raster docks and not the flat currentColor vector the original brief asked for: the docks are a
// pencil-textured render whose value IS their texture and shading — flattening them to line-art throws
// that away. They are transparent-background cutouts, so they drop straight onto the flat floor with
// their own soft shadows. Trade-off: they do not recolour with the theme token (fixed warm palette).
//
// Why it lives INSIDE the floor's <svg> (mm space) and not as a CSS background: this surface's whole
// contract is a 1:1 scale locked to the hold by a shared viewBox width, and the file that hosts it warns
// that ANY px-level drift breaks that. Embedded in the same mm coordinates, the backdrop can never drift.
//
// Размер доков задаёт `dockHeight` — ПОСТОЯННАЯ мера двора (минимальная глубина = ширина кузова), а не
// его текущая глубина: каждый док масштабируется по своей высоте и прижимается к своему краю СВЕРХУ,
// ширина следует родной пропорции, так что ничто не растягивается.
//
// Почему не «100% высоты пола», как было в 41e.5 (LKWkalk-jen): при глубоком буфере погрузчик и ящики
// росли линейно вместе с двором и начинали доминировать над грузом. Прежняя модель держалась на том,
// что глубина двора почти всегда упиралась в минимум; как только буфер стал глубже, инвариант «unit
// постоянен» тихо перестал выполняться. Теперь мера сценерии не зависит от содержимого двора вообще, а
// лишняя глубина остаётся просто асфальтом под доками.
import leftUrl from '../../assets/warehouse-floor-left.png';
import rightUrl from '../../assets/warehouse-floor-right.png';

/** Native pixel dimensions of the owner's dock cutouts (transparent background). Each is scaled to the
 *  dock height by its own ratio, so neither distorts. */
export const WAREHOUSE_ASSET = {
  left: { w: 203, h: 902 },
  right: { w: 323, h: 949 },
} as const;

/** The flat floor tone (owner's pick). Exported so the section around this svg paints the same colour —
 *  one seamless surface, no differently-coloured strip. */
export const FLOOR = '#cbcdcd';

/** Muted a touch so the coloured stacks (drawn opaque over the floor) still lead, but the docks read. */
const SCENERY_OPACITY = 0.9;

/** The yard behind the buffer's stacks. `width`/`height` are the floor surface in mm (the same units
 *  the tiles are laid out in): width = vehicle length, height grows with the buffer's depth. */
export function WarehouseBackdrop({
  width,
  height,
  /** Высота доков, мм — постоянная мера двора (минимальная глубина, она же ширина кузова), НЕ текущая
   *  глубина пола. Обязательный параметр, а не «по умолчанию `height`»: умолчание вернуло бы ровно ту
   *  зависимость от содержимого, из-за которой сценерия и разъезжалась (LKWkalk-jen). */
  dockHeight,
}: {
  width: number;
  height: number;
  dockHeight: number;
}) {
  const { left, right } = WAREHOUSE_ASSET;
  // Выше пола док не бывает: на мелком дворе постоянная мера обрезается его собственной глубиной.
  const dockH = Math.min(dockHeight, height);
  const capL = (left.w / left.h) * dockH; // width follows each dock's own ratio — nothing distorts
  const capR = (right.w / right.h) * dockH;
  return (
    <g aria-hidden="true" pointerEvents="none" data-testid="warehouse-backdrop">
      {/* Flat floor — one tone, seamless at any width or depth. */}
      <rect data-floor x={0} y={0} width={width} height={height} fill={FLOOR} />
      {/* Left dock, pinned to the top-left corner. */}
      <image
        data-cap="left"
        href={leftUrl}
        x={0}
        y={0}
        width={capL}
        height={dockH}
        opacity={SCENERY_OPACITY}
        preserveAspectRatio="none"
      />
      {/* Right dock (the forklift, facing up toward the truck), pinned to the top-right corner. */}
      <image
        data-cap="right"
        href={rightUrl}
        x={width - capR}
        y={0}
        width={capR}
        height={dockH}
        opacity={SCENERY_OPACITY}
        preserveAspectRatio="none"
      />
    </g>
  );
}
