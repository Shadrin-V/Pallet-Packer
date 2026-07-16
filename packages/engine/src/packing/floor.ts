import type { RotationRule, ForkAccess, ForkAxis } from '../model/index';
import { floorOrientations, forkPinnedOrientation } from '../model/orientation';

export type LoadingMode = 'rear' | 'side' | 'combined';
export type FloorOrientation = 'lwh' | 'wlh';

export interface FloorRequest {
  cargoTypeId: string;
  length: number; // родная длина футпринта, мм > 0
  width: number; //  родная ширина футпринта, мм > 0
  rotation: RotationRule;
  count: number; // сколько пытаться разместить (fill → большое число)
  forkAccess?: ForkAccess; // доступ погрузчика (ADR 018); default 'all4' — без ограничения
  forkAxis?: ForkAxis; // ось захода вил для 'twoSides'; default 'length'
}

export interface FloorPlacement {
  cargoTypeId: string;
  x: number;
  y: number;
  dx: number; // занятый размер по оси x
  dy: number; // занятый размер по оси y
  orientation: FloorOrientation;
}

export interface PackFloorOptions {
  clearance?: number;
  loadingMode?: LoadingMode;
}

interface Region {
  length: number;
  width: number;
}
interface Footprint {
  dx: number;
  dy: number;
  orientation: FloorOrientation;
}

/** Сколько единиц размера `dim` влезает в `span` с равномерным зазором `clearance` между ними. */
export function fitCount(span: number, dim: number, clearance: number): number {
  if (dim <= 0 || span < dim) return 0;
  return Math.floor((span + clearance) / (dim + clearance));
}

function gridCapacity(region: Region, fp: Footprint, clearance: number): number {
  return fitCount(region.length, fp.dx, clearance) * fitCount(region.width, fp.dy, clearance);
}

/**
 * Выбор yaw-ориентации: сперва жёсткий фильтр доступа погрузчика (ADR 018) — двусторонняя стопка
 * пиннится под одну ориентацию при односторонней двери; затем макс-влезание (ADR 011) среди
 * оставшихся. yaw-набор — из floorOrientations (ADR 013). Тай-брейк → 'lwh'.
 */
export function chooseOrientation(
  req: FloorRequest,
  region: Region,
  clearance: number,
  loadingMode: LoadingMode = 'combined',
): Footprint {
  const lwh: Footprint = { dx: req.length, dy: req.width, orientation: 'lwh' };
  const canYaw = floorOrientations(req.rotation).includes('wlh');
  if (!canYaw) return lwh; // rotation none: ориентация фиксирована, констрейнту нечего пиннить
  const wlh: Footprint = { dx: req.width, dy: req.length, orientation: 'wlh' };
  const pinned =
    req.forkAccess === 'twoSides'
      ? forkPinnedOrientation(loadingMode, req.forkAxis ?? 'length')
      : null;
  if (pinned) return pinned === 'lwh' ? lwh : wlh;
  return gridCapacity(region, wlh, clearance) > gridCapacity(region, lwh, clearance) ? wlh : lwh;
}

function pushPlacement(
  out: FloorPlacement[],
  cargoTypeId: string,
  fp: Footprint,
  mode: 'rear' | 'side',
  fillCursor: number,
  growCursor: number,
): void {
  // side: fill=x, grow=y. rear: fill=y, grow=x.
  const x = mode === 'side' ? fillCursor : growCursor;
  const y = mode === 'side' ? growCursor : fillCursor;
  out.push({ cargoTypeId, x, y, dx: fp.dx, dy: fp.dy, orientation: fp.orientation });
}

function packShelf(
  region: Region,
  requests: FloorRequest[],
  clearance: number,
  mode: 'rear' | 'side',
  loadingMode: LoadingMode,
): FloorPlacement[] {
  const out: FloorPlacement[] = [];
  const fillSpan = mode === 'side' ? region.length : region.width;
  const growSpan = mode === 'side' ? region.width : region.length;

  let growCursor = 0; // начало активной полки по оси роста
  let fillCursor = 0; // позиция в активной полке по оси укладки
  let shelfDepth = 0; // максимальный размер по оси роста в активной полке

  for (const req of requests) {
    if (req.count <= 0) continue;
    const fp = chooseOrientation(req, region, clearance, loadingMode);
    if (fp.dx <= 0 || fp.dy <= 0) continue;
    const fillExtent = mode === 'side' ? fp.dx : fp.dy;
    const growExtent = mode === 'side' ? fp.dy : fp.dx;

    for (let i = 0; i < req.count; i++) {
      const fitsCurrent =
        fillCursor + fillExtent <= fillSpan &&
        growCursor + Math.max(shelfDepth, growExtent) <= growSpan;
      if (fitsCurrent) {
        pushPlacement(out, req.cargoTypeId, fp, mode, fillCursor, growCursor);
        fillCursor += fillExtent + clearance;
        if (growExtent > shelfDepth) shelfDepth = growExtent;
        continue;
      }
      // текущая полка не вмещает — открываем следующую
      const nextGrow = growCursor + shelfDepth + (shelfDepth > 0 ? clearance : 0);
      if (nextGrow + growExtent <= growSpan && fillExtent <= fillSpan) {
        growCursor = nextGrow;
        fillCursor = 0;
        shelfDepth = growExtent;
        pushPlacement(out, req.cargoTypeId, fp, mode, fillCursor, growCursor);
        fillCursor += fillExtent + clearance;
      } else {
        break; // оставшиеся единицы этого запроса не размещаются
      }
    }
  }
  return out;
}

/**
 * Детерминированная shelf/next-fit укладка футпринтов по области пола (ADR 004, 011, 012).
 * Ориентация — по макс-влезанию на уровне типа; ось полки — по `loadingMode`; порядок входа =
 * приоритет (переполнение → хвост не размещается). Координаты — от origin области (0,0).
 */
export function packFloor(
  region: Region,
  requests: FloorRequest[],
  opts: PackFloorOptions = {},
): FloorPlacement[] {
  const clearance = opts.clearance ?? 0;
  const mode = opts.loadingMode ?? 'combined';
  // The pass axis (rear/side) maps coordinates; `mode` also carries fork-access door availability
  // (ADR 018), so both combined passes see 'combined' and never pin.
  if (mode === 'rear') return packShelf(region, requests, clearance, 'rear', 'rear');
  if (mode === 'side') return packShelf(region, requests, clearance, 'side', 'side');
  // combined: плотнейшая из двух; при равенстве — rear (детерминированный тай-брейк).
  const rear = packShelf(region, requests, clearance, 'rear', 'combined');
  const side = packShelf(region, requests, clearance, 'side', 'combined');
  return side.length > rear.length ? side : rear;
}
