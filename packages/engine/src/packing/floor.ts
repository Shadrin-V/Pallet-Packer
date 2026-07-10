import type { RotationRule } from '../model/index';

export type LoadingMode = 'rear' | 'side' | 'combined';
export type FloorOrientation = 'lwh' | 'wlh';

export interface FloorRequest {
  cargoTypeId: string;
  length: number; // родная длина футпринта, мм > 0
  width: number; //  родная ширина футпринта, мм > 0
  rotation: RotationRule;
  count: number; // сколько пытаться разместить (fill → большое число)
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

/** Выбор yaw-ориентации по макс-влезанию (ADR 011). Тай-брейк → 'lwh'. */
export function chooseOrientation(req: FloorRequest, region: Region, clearance: number): Footprint {
  const lwh: Footprint = { dx: req.length, dy: req.width, orientation: 'lwh' };
  const canYaw = req.rotation === 'yawOnly' || req.rotation === 'full';
  if (!canYaw) return lwh;
  const wlh: Footprint = { dx: req.width, dy: req.length, orientation: 'wlh' };
  return gridCapacity(region, wlh, clearance) > gridCapacity(region, lwh, clearance) ? wlh : lwh;
}
