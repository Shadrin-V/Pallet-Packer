// Единственное место, знающее, что такое отсек. Все проверки границ в ядре (валидация, геометрия,
// правки, магнит, упор) обязаны спрашивать здесь, а не считать `vehicle.length` сами: инвариант
// «единица лежит целиком внутри ОДНОГО отсека» иначе расползётся по пяти файлам и разойдётся молча.
import type { Vehicle } from './types';

export interface CompartmentSpan {
  id: string;
  name?: string;
  x: number;
  length: number;
}

/** Отсеки транспорта. Односоставный кузов — один неявный отсек [0, length).
 *
 *  Пустой массив тоже читается как односоставный, хотя валидация его отвергает: функция зовётся и
 *  из путей, где вход ещё не проверен (ручные правки, магнит), и обязана быть тотальной. Отказ за
 *  пустой массив — работа `validateLoad`, а не этой функции. */
export function compartmentsOf(vehicle: Vehicle): CompartmentSpan[] {
  const cs = vehicle.compartments;
  if (cs === undefined || cs.length === 0) {
    return [{ id: vehicle.id, name: undefined, x: 0, length: vehicle.length }];
  }
  return cs.map((c) => ({ id: c.id, name: c.name, x: c.x, length: c.length }));
}

/** Отсек, вмещающий интервал [x, x + dx) ЦЕЛИКОМ. `null` — интервал в разрыве, за бортом или
 *  оседлал границу между машинами. Именно это `null` и запрещает поставить поддон в сцепку. */
export function compartmentSpanning(vehicle: Vehicle, x: number, dx: number): CompartmentSpan | null {
  for (const c of compartmentsOf(vehicle)) {
    if (x >= c.x && x + dx <= c.x + c.length) return c;
  }
  return null;
}

export const fitsInSomeCompartment = (vehicle: Vehicle, x: number, dx: number): boolean =>
  compartmentSpanning(vehicle, x, dx) !== null;
