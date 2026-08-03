// Прижать к упору (ADR 024, api-contract 0.15.0). Отвечает на ОДИН вопрос: насколько выделенное
// может проехать по оси до первого упора — стенки кузова или чужой напольной стопки.
//
// Почему в ядре: «куда стопка может доехать» — доменное правило, а не деталь клавиатуры. UI,
// который считал бы ход сам, стал бы вторым местом, знающим правила размещения (ADR 019).
//
// Почему запрос, а не операция: мутации здесь нет вовсе — дельту применяет `moveStacks`, он же и
// валидирует результат. Тот же раздел труда, что у `resolveDrop` с `placeStack`.
import type { Layout, Load } from '../model/index';
import { orientedDims } from '../model/orientation';
import { refKey } from './edit';
import type { StackRef } from './edit';
import { floorBoxes, overlaps1d, type Box } from './resolveDrop';

/** Ось кузова и знак хода: x — длина, y — ширина. */
export type SlideDir = '-x' | '+x' | '-y' | '+y';

export interface SlideDelta {
  dx: number;
  dy: number;
}

const ZERO: SlideDelta = { dx: 0, dy: 0 };

export function resolveSlide(
  load: Load,
  layout: Layout,
  refs: StackRef[],
  dir: SlideDir,
): SlideDelta {
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  if (unique.length === 0) return ZERO;

  // Габариты участниц берутся из РАСКЛАДКИ (их собственная ориентация), а не угадываются.
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const members: Box[] = [];
  for (const ref of unique) {
    const column = layout.placements.find(
      (p) => p.cargoTypeId === ref.cargoTypeId && p.x === ref.x && p.y === ref.y,
    );
    const cargo = byId.get(ref.cargoTypeId);
    // Стопки нет — ехать нечему. Запрос тотален: он не бросает и не жалуется, а сообщает, что
    // хода нет; вызывающий на нулевой дельте просто ничего не делает.
    if (!column || !cargo) return ZERO;
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, column.orientation);
    members.push({ ...ref, dx, dy });
  }

  const selected = new Set(members.map(refKey));
  const boxes = floorBoxes(load, layout, (r) => selected.has(refKey(r)));

  const horizontal = dir === '-x' || dir === '+x';
  const forward = dir === '+x' || dir === '+y';
  const wall = horizontal ? load.vehicle.length : load.vehicle.width;

  // Блок едет общей дельтой (ADR 021): её задаёт самая стеснённая участница, иначе ведущая
  // въехала бы в препятствие, а взаимная расстановка блока разъехалась бы.
  let travel = Infinity;
  for (const m of members) {
    const pos = horizontal ? m.x : m.y;
    const size = horizontal ? m.dx : m.dy;
    let free = forward ? wall - (pos + size) : pos;
    for (const b of boxes) {
      // Мешает только то, что стоит в той же полосе. Полуоткрытое пересечение: стопка, лежащая
      // впритык БОКОМ, полосу не занимает и проехать мимо не мешает.
      const across = horizontal
        ? overlaps1d(m.y, m.y + m.dy, b.y, b.y + b.dy)
        : overlaps1d(m.x, m.x + m.dx, b.x, b.x + b.dx);
      if (!across) continue;
      const bPos = horizontal ? b.x : b.y;
      const bSize = horizontal ? b.dx : b.dy;
      const gap = forward ? bPos - (pos + size) : pos - (bPos + bSize);
      // Отрицательный зазор — препятствие ПОЗАДИ хода: оно ничего не ограничивает.
      if (gap >= 0) free = Math.min(free, gap);
    }
    travel = Math.min(travel, Math.max(0, free));
  }

  if (travel === 0 || !Number.isFinite(travel)) return ZERO;
  const signed = forward ? travel : -travel;
  return horizontal ? { dx: signed, dy: 0 } : { dx: 0, dy: signed };
}
