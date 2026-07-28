// The warehouse (LKWkalk-wxi): everything that is NOT in the hold — units the packer could not place,
// plus stacks the user pulled out by hand. It replaces the card strip that came before it.
//
// Owner, on the cards: "в буфере для каждой стопки не надо делать карточку — лучше нарисовать
// квадраты, которые выглядят так же, как в грузовике". On the live plan that strip was six identical
// cards repeating "EPAL 3 · 1000×1200 · ×18"; six squares say the same thing without saying it six
// times, and — being drawn at the hold's own scale — they also answer the question the cards could
// not: will this fit, and which way round?
//
// Масштаб 1:1 структурен, а не измерен: viewBox этого svg ровно той же ширины, что ВНЕШНИЙ viewBox
// разреза (`truckFrame(vehicle, 'top').outerW` — поле под кабину плюс длина кузова), и оба рисуются
// width:100% внутри одной колонки, так что множитель мм→px одинаков by construction. Число считает
// truckFrame.ts, а не эти два компонента порознь — порознь они уже разъезжались (LKWkalk-6n4).
// Двор растёт в ГЛУБИНУ, что заодно не даёт ему читаться вторым грузовиком.
//
// That construction is fragile in one specific way, and it has already bitten once: ANY horizontal
// padding, border or scrollbar between this section and the column narrows the svg, and the scale
// drifts while the viewBox still matches. So the section carries no horizontal padding or border —
// the header is padded on its own — and the floor does not scroll: a scrollbar that takes width
// (Windows, Linux) would silently break the very thing this surface exists to promise. A unit test
// can only pin the viewBox; the pixels are checked in a real browser.
//
// It is a workbench, not a document: screen-only (print:hidden), and the PNG export ignores it — it
// picks up `svg[data-cutaway]` only, and nothing here carries that marker.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { type Load } from '@shadrin-v/engine';
import { orderColorToken } from '../../lib/orderColor';
import { useT } from '../../i18n/LocaleContext';
import { fillTemplate } from './stackFormula';
import { orderIndexMap } from './cutaway';
import { StackShape } from './StackShape';
import { RotateHandle } from './RotateHandle';
import { WarehouseBackdrop, FLOOR } from './WarehouseBackdrop';
import { WarehouseBay } from './WarehouseBay';
import { reorderBaysAt, warehouseFloor, type BufferTile } from './warehouseLayout';

export type { BufferTile };

/** Below this pointer travel (px) a press is a click (select), not a drag (carry). */
const CLICK_SLOP_PX = 5;

/** Совпадают ли два порядка загонов поэлементно. */
const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export function WarehouseFloor({
  load,
  tiles,
  orderColors,
  onRotate,
  onPickUp,
  dragging,
  phantomAt,
  grouped = false,
  onGroupedChange,
  bayOrder,
  onBayOrderChange,
}: {
  load: Load;
  tiles: BufferTile[];
  orderColors?: Map<string, number>;
  onRotate: (index: number) => void;
  /** Pointer went down on a tile: the parent takes over and drags it to the hold. */
  onPickUp: (index: number, e: ReactPointerEvent) => void;
  /** Index of the tile currently being dragged (dimmed in place), or null. */
  dragging: number | null;
  /** The live gap preview (B): while a stack is carried in from the hold and hovers over this floor,
   *  the parent computes where it would land (`insertionIndexAt`) and hands it here as a slot to open
   *  — not a real tile, so it carries no count and takes no pointer at all. Absent/null while nothing
   *  is being carried. */
  phantomAt?: { index: number; tile: BufferTile } | null;
  /** Разбит ли двор на загоны заказов. По умолчанию НЕТ (LKWkalk-77g): владелец после прода —
   *  «без неё удобнее», так что загоны 41e.2 стали режимом, который включают явно. */
  grouped?: boolean;
  /** Отсутствует — переключатель не рисуется (двор без органов управления, например в тестах
   *  соседних экранов). */
  onGroupedChange?: (next: boolean) => void;
  /** Пользовательский порядок загонов (41e.6): упомянутые заказы идут первыми. Владеет им
   *  `LadeplanScreen` — тот же список обязаны получать все его вызовы `warehouseFloor`. */
  bayOrder?: string[];
  /** Перенос загона завершён. Отсутствует — бирки инертны, переноса загонов нет. */
  onBayOrderChange?: (next: string[]) => void;
}) {
  const tt = useT();
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const oidx = orderIndexMap(load);
  const total = tiles.reduce((s, t) => s + t.units, 0);
  const [sel, setSel] = useState<number | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  // Жест переноса загона живёт ЗДЕСЬ, а не в родителе, в отличие от переноса стопки: тот уходит на
  // разрез, и ни один элемент не видит его целиком, — а этот начинается и кончается во дворе.
  // `order` — ПРОВИЗОРНЫЙ порядок: им рисуется двор, пока идёт жест, и это и есть обратная связь
  // (загон едет целиком со стопками, соседи расступаются). Родителю он не поднимается на каждый
  // кадр: тому он нужен только по завершении, а перерисовывать весь экран на каждый pointermove
  // незачем.
  // `from` — порядок, от которого жест начался; с ним сверяется итог, чтобы жест, ничего не
  // изменивший, ничего и не фиксировал (спека §3, решение 6).
  const [dragBay, setDragBay] = useState<
    { orderId: string; pointerId: number; from: string[]; order: string[] } | null
  >(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /** Точка указателя в мм двора. Как и всюду в проекте, через CTM самого svg, а не через замеры
   *  бокса: viewBox и есть система координат раскладки. `null`, когда SVG-геометрии нет. */
  const toYardMm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm || !svg.createSVGPoint) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const q = p.matrixTransform(ctm.inverse());
    return { x: q.x, y: q.y };
  };

  // Слушатели глобальные и без списка зависимостей — тот же приём, что у переноса стопки в
  // LadeplanScreen: жест продолжается и когда указатель ушёл с бирки, а переподписка на каждый
  // рендер держит `floor` и `dragBay` в замыкании свежими.
  useEffect(() => {
    if (!dragBay) return;
    /** Чужой указатель жеста не ведёт: второй палец не должен ни двигать, ни завершать этот
     *  перенос. `pointerId` фиксируется на `pointerdown` и дальше только сверяется. */
    const mine = (e: PointerEvent) => e.pointerId === dragBay.pointerId;
    const orderAt = (e: PointerEvent) => {
      const pt = toYardMm(e.clientX, e.clientY);
      return pt ? reorderBaysAt(floor, dragBay.orderId, pt) : null;
    };
    const move = (e: PointerEvent) => {
      if (!mine(e)) return;
      const order = orderAt(e);
      // Порядок, ничего не изменивший, не перекладывает двор: иначе каждый кадр движения внутри
      // одного и того же слота пересобирал бы раскладку и переподписывал слушателей впустую.
      if (order && !sameOrder(order, dragBay.order)) setDragBay({ ...dragBay, order });
    };
    const up = (e: PointerEvent) => {
      if (!mine(e)) return;
      // Порядок считается от координат ОТПУСКАНИЯ, а не берётся из состояния последнего
      // `pointermove`: браузер вправе слить движения и отпустить указатель там, где ни одного
      // `pointermove` не пришло, — и тогда зафиксировался бы предпоследний слот. Перенос стопки в
      // LadeplanScreen по той же причине резолвит бросок из `pointerup` по `e.clientX/clientY`.
      // Точка вне SVG-геометрии (её нет) — падаем на последний известный порядок.
      const next = orderAt(e) ?? dragBay.order;
      // Жест, не сдвинувший ни одного загона, не фиксирует НИЧЕГО (спека §3, решение 6): клик по
      // бирке — это `pointerdown` + `pointerup` без движения, и он не должен превращать порядок по
      // умолчанию (заявка) в ЯВНЫЙ пользовательский. Иначе после случайного клика перестановка
      // грузов на экране «Настройка» перестала бы двигать загоны — и причину этого никто бы с
      // кликом не связал. Сверяется с началом жеста, а не с последним кадром: уехать и вернуться
      // на своё место — тоже ничего не изменить.
      if (!sameOrder(next, dragBay.from)) onBayOrderChange?.(next);
      setDragBay(null);
    };
    // Указатель забрала система (жест ОС, переключение приложения): фиксировать нечего, а без этой
    // ветки провизорная раскладка залипла бы до следующего клика.
    const cancel = (e: PointerEvent) => {
      if (mine(e)) setDragBay(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  });

  // The phantom is spliced into the FLOW, not overlaid afterwards — inserting it before real tiles
  // at `phantomAt.index` is what pushes them aside in `warehouseFloor`'s row-wrap layout, the same way
  // a real drop would once it lands there for real.
  const renderTiles: BufferTile[] = phantomAt
    ? [...tiles.slice(0, phantomAt.index), { ...phantomAt.tile, phantom: true }, ...tiles.slice(phantomAt.index)]
    : tiles;
  const floor = warehouseFloor(load, renderTiles, { grouped, bayOrder: dragBay?.order ?? bayOrder });
  // Сколько различимых заказов лежит во дворе — по тому же ключу, по которому группирует раскладка
  // (груз без номера — это тоже группа). Меньше двух — делить нечего, и переключатель был бы мёртвым.
  const distinctOrders = new Set(
    tiles.map((t) => byId.get(t.cargoTypeId)).filter(Boolean).map((c) => c!.orderId ?? ''),
  ).size;
  const empty = total === 0;
  // A minimum depth of one vehicle width, always: empty, the floor still needs a comfortable drop
  // target (8fy — a stack pulled out of the hold must have somewhere to land); with content, a single
  // shallow row must not shrink the surface (nor its scenery) to a sliver. A deeper buffer grows past
  // it.
  const yardUnit = Math.round(load.vehicle.width);
  const floorHeight = Math.max(floor.height, yardUnit);
  // Uniform ×N label size, in the same mm units the hold uses for its own counts.
  const countFont = load.vehicle.width * 0.05;

  return (
    <section aria-label={tt('warehouse.title')} data-testid="warehouse-floor" className="select-none print:hidden">
      {/* Caption ABOVE the card, on the page background (like the cutaway's own labels). Keeping it out
          of the card means the card is 100% yard — textured floor top to bottom, no differently-filled
          strip, and nothing overlapping the top row of stacks (owner feedback). */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <span className="text-label uppercase tracking-wide text-faint">{tt('warehouse.title')}</span>
        {total > 0 && (
          <span className="text-caption font-semibold text-danger" data-testid="warehouse-count">
            {fillTemplate(tt('warehouse.count'), { n: total })}
          </span>
        )}
        <span className="text-caption text-muted">
          {total > 0 ? tt('warehouse.dropHint') : tt('warehouse.empty')}
        </span>
        {/* Режим двора живёт над двором, а не в панели плана: «Dichte vor Auftragstrennung» рядом с
            ней — стратегия ДВИЖКА (часть Load, гоняет пересчёт), а это чистое представление склада.
            Соседство двух одинаковых на вид флажков разной природы путало бы. */}
        {onGroupedChange && distinctOrders > 1 && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
            <input
              type="checkbox"
              aria-label={tt('warehouse.groupByOrder')}
              checked={grouped}
              onChange={(e) => onGroupedChange(e.target.checked)}
            />
            <span>{tt('warehouse.groupByOrder')}</span>
          </label>
        )}
      </div>

      {/* The yard card: the floor svg is full-bleed (no padding strips), overflow-hidden clips the
          asphalt to the rounded corners, and the asphalt tone is a fallback behind the svg. */}
      <div className="overflow-hidden rounded-card" style={{ background: FLOOR }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${floor.width} ${floorHeight}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={tt('warehouse.title')}
          // A stable selector for the parent (LadeplanScreen's `toWarehouseMm`): it cannot reach into
          // this component's own refs, and `role="img"` alone also matches the top/side cutaways.
          data-warehouse
          style={{ background: FLOOR, display: 'block', touchAction: 'none' }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSel(null);
          }}
        >
          {/* The yard behind everything: dock scenery at the edges, tiled asphalt between. Inert
              decoration under the real stacks — it replaces the old ForkliftMark (41e.5). */}
          {/* Доки меряются `yardUnit` — МИНИМАЛЬНОЙ глубиной двора, а не текущей: иначе сценерия
              растёт вместе с буфером и начинает доминировать над грузом (LKWkalk-jen). */}
          <WarehouseBackdrop width={floor.width} height={floorHeight} dockHeight={yardUnit} />
          {/* Загоны заказов (41e.2): пустой массив, когда различимых заказов меньше двух — тогда
              двор выглядит как раньше. Рисуются между фоном и стопками, указателя не берут. */}
          {floor.bays.map((bay) => {
            const slot = orderColors?.get(bay.orderId) ?? oidx.get(bay.orderId) ?? 0;
            return (
              <WarehouseBay
                key={bay.orderId}
                bay={bay}
                series={orderColorToken(slot).series}
                label={bay.orderId || tt('warehouse.bay.noOrder')}
                reorderLabel={tt('warehouse.bay.reorder')}
                onTagDown={
                  onBayOrderChange
                    ? (e) => {
                        // Отсчёт ведётся от того, что СЕЙЧАС на экране: порядок по умолчанию уже
                        // мог быть перекрыт пропом, и переносить надо видимую расстановку.
                        const start = floor.bays.map((b) => b.orderId);
                        setDragBay({
                          orderId: bay.orderId,
                          pointerId: e.pointerId,
                          from: start,
                          order: start,
                        });
                      }
                    : undefined
                }
              />
            );
          })}
          {empty && (
            // A one-line invitation centred on the empty yard: the surface catches a stack pulled out
            // of the hold. The dashed outline is gone (owner feedback) — the yard art already reads as
            // a place to set things down. Decoration only; the drop is handled by the parent, which
            // hit-tests this whole section.
            <g data-testid="warehouse-dropzone" pointerEvents="none">
              <text
                x={floor.width / 2}
                y={floorHeight / 2}
                fill="var(--faint)"
                fontSize={countFont}
                textAnchor="middle"
                dominantBaseline="central"
                stroke="var(--paper)"
                strokeWidth={countFont * 0.18}
                strokeLinejoin="round"
                style={{ paintOrder: 'stroke' }}
              >
                {tt('warehouse.dropZone')}
              </text>
            </g>
          )}
          {floor.tiles.map((pt, i) => {
              const cargo = byId.get(pt.tile.cargoTypeId);
              if (!cargo) return null;
              // The gap preview stands in for a real tile in the flow (so its neighbours reflow
              // around it) but must not look, click or focus like one — no count, no rotate handle,
              // nothing for the pointer to catch. Just the promise of where the drop would land.
              if (pt.tile.phantom) {
                return (
                  <rect
                    key={`phantom-${pt.tile.cargoTypeId}-${i}`}
                    data-testid="warehouse-phantom"
                    x={pt.x}
                    y={pt.y}
                    width={pt.dx}
                    height={pt.dy}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    strokeDasharray="10 8"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                );
              }
              const slot = orderColors?.get(cargo.orderId ?? '') ?? oidx.get(cargo.orderId ?? '') ?? 0;
              const { series } = orderColorToken(slot);
              const rotatable = cargo.rotation !== 'none';
              // Two index spaces to cross before an index may be handed up to the parent, which
              // indexes its own `tiles` prop:
              //  1. `i` runs over `floor.tiles`, which `warehouseFloor` GROUPS BY ORDER — with two or
              //     more orders the drawing order is not the input order at all, so `pt.srcIndex`
              //     (the tile's position in `renderTiles`) is what to carry, never `i` (41e.2, final
              //     review);
              //  2. `renderTiles` SPLICES IN the phantom, which the parent's array does not have, so
              //     everything after it shifts back by one (dwc.11). Reachable only with a second
              //     pointer mid-carry, when phantomAt is live and a buffer tile is pressed.
              const realIndex =
                phantomAt && pt.srcIndex > phantomAt.index ? pt.srcIndex - 1 : pt.srcIndex;
              return (
                <g
                  key={`${pt.tile.cargoTypeId}-${i}`}
                  data-testid="warehouse-tile"
                  role="button"
                  tabIndex={0}
                  aria-label={`${cargo.name} ×${pt.tile.units}`}
                  opacity={dragging === realIndex ? 0.3 : undefined}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    downAt.current = { x: e.clientX, y: e.clientY };
                    onPickUp(realIndex, e);
                  }}
                  onClick={(e) => {
                    // A press that barely travelled is a click: select the stack (revealing the
                    // rotate action) rather than treating it as a carry that went nowhere.
                    const d = downAt.current;
                    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_SLOP_PX) return;
                    setSel((cur) => (cur === i ? null : i));
                  }}
                  onKeyDown={(e) => {
                    // The ⟳ button is gone — without this, so is rotation from the keyboard.
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSel((cur) => (cur === i ? null : i));
                    }
                  }}
                >
                  <title>{`${cargo.name} ×${pt.tile.units}`}</title>
                  <StackShape x={pt.x} y={pt.y} w={pt.dx} h={pt.dy} series={series} hatchSpacing={180} backing />
                  <text
                    x={pt.x + pt.dx / 2}
                    y={pt.y + pt.dy / 2}
                    fill="var(--ink)"
                    fontSize={countFont}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    ×{pt.tile.units}
                  </text>
                  {sel === i && (
                    <>
                      <rect
                        x={pt.x}
                        y={pt.y}
                        width={pt.dx}
                        height={pt.dy}
                        fill="none"
                        stroke="var(--brand)"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                      {rotatable && (
                        <RotateHandle
                          cx={pt.x + pt.dx - Math.min(countFont * 0.8, pt.dx / 2)}
                          cy={pt.y + Math.min(countFont * 0.8, pt.dy / 2)}
                          size={countFont * 0.8}
                          label={tt('warehouse.rotate')}
                          onRotate={() => onRotate(realIndex)}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}
        </svg>
      </div>
    </section>
  );
}
