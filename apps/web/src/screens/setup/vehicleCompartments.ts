// Правка длин отсеков в редакторе кузова. Отдельно от компонента, потому что правка одного отсека
// двигает СОСЕДЕЙ: разрывы между машинами сохраняются, `x` последующих отсеков и полный пролёт
// пересчитываются, а инвариант «конец последнего = vehicle.length» (ADR 026, ERR_INVALID_COMPARTMENTS)
// обязан пережить каждое нажатие в поле.
import type { Vehicle } from '@shadrin-v/engine';

/** Поставить отсеку `index` длину `length`, сохранив разрывы между отсеками. Односоставный кузов
 *  (нет `compartments`) правится как прежде: меняется только `vehicle.length`. */
export function setCompartmentLength(vehicle: Vehicle, index: number, length: number): Vehicle {
  const cs = vehicle.compartments;
  if (cs === undefined || cs.length === 0) return { ...vehicle, length };
  if (index < 0 || index >= cs.length) return vehicle;

  const gaps = cs.map((c, i) => (i === 0 ? c.x : c.x - (cs[i - 1].x + cs[i - 1].length)));
  const lengths = cs.map((c, i) => (i === index ? length : c.length));

  let x = gaps[0];
  const next = cs.map((c, i) => {
    if (i > 0) x += gaps[i];
    const placed = { ...c, x, length: lengths[i] };
    x += lengths[i];
    return placed;
  });
  return { ...vehicle, compartments: next, length: x };
}
