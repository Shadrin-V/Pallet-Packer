import { maxUnitsInVehicle, type Load } from '@shadrin-v/engine';

/** Максимум единиц каждой позиции в пустом кузове выбранной машины (ключ — cargoTypeId).
 * Единственное место, где UI спрашивает ядро об этом числе; арифметики здесь нет. Зависит только
 * от load (машина, режим погрузки, зазор, габариты и правила позиции), не от раскладки. */
export function capacityMap(load: Load): Map<string, number> {
  const options = { loadingMode: load.loadingMode, clearance: load.clearance };
  return new Map(load.cargo.map((c) => [c.id, maxUnitsInVehicle(c, load.vehicle, options)]));
}
