// Знак позиции плана (сборка для ERP, условие утверждения макета): различитель, который не зависит
// от цвета. Цветов заказов в палитре Schäfer три, позиций на рейсе до десяти — поэтому у каждой
// позиции своя буква, одинаковая на грузе в обоих видах, на плитке «Lager», в таблице позиций, в
// «Nicht im LKW» и в картинке. Буквы, а не цифры: цифры уже заняты линейкой метров в обоих видах.
// Это подпись, не доменная логика: порядок задан списком позиций рейса (`PlanContext.positionOrder`).
import { estimateTextWidth } from './stackLabel';

/** Буквенный знак по номеру (с нуля): 0 → A, 25 → Z, 26 → AA, 701 → ZZ, 702 → AAA. */
export function positionMark(index: number): string {
  let mark = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    mark = String.fromCharCode(65 + ((n - 1) % 26)) + mark;
  }
  return mark;
}

/** id позиции → знак по порядку показа (размещаемые и неразмещаемые вместе). Повтор id знак не
 *  тратит: знак остаётся за первым появлением, следующие позиции идут без пропуска. */
export function positionMarks(positionIds: readonly string[]): Map<string, string> {
  const marks = new Map<string, string>();
  for (const id of positionIds) if (!marks.has(id)) marks.set(id, positionMark(marks.size));
  return marks;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Строгое пересечение прямоугольников: касание краями — не пересечение. */
export const boxesIntersect = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Где стоит знак стопки (мм чертежа). Кегль ВСЕГДА равен кеглю «×N» (`countFont`) — меньше знак не
 *  бывает ни на экране, ни в картинке (картинка рисует те же svg). */
export interface MarkPlacement {
  /** Точка текста; `y` — середина строки (`dominantBaseline="central"`). */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  fontSize: number;
  strokeWidth: number;
  /** Знак вынесен за стопку: её след или полоса слишком малы для него. */
  outside: boolean;
  /** Выноска от стопки к вынесенному знаку (вид сверху). */
  leader?: { x1: number; y1: number; x2: number; y2: number };
  /** Место знака вместе с полем под обводку-подложку — по нему проверяется, не закрыт ли знак. */
  box: Box;
  /** Где центрировать имя артикула и «×N» (вид сверху и «Lager»): ниже полосы знака, если знак
   *  внутри, — подпись и знак не пересекаются. */
  labelArea: Box;
}

// Доли кегля. Поле под обводку — со всех сторон; полоса знака = поле + строка + поле = 1,4 кегля.
const MARGIN = 0.2;
const INSET = 0.25;
const BAND = 1 + 2 * MARGIN;
/** Меньшая сторона следа/полосы, начиная с которой знак стоит внутри стопки. */
const INSIDE_MIN_SIDE = 1.6;
/** Вид сверху: под полосой знака должна остаться строка «×N». */
const TOP_INSIDE_MIN_H = BAND + 1;
/** Вынесенный знак — на таком расстоянии от следа (вид сверху). */
const OUTSIDE_GAP = 0.5;
/** Буквы знака жирные (700), а `estimateTextWidth` замерена на 600 — запас ширины. */
const BOLD_WIDTH = 1.1;

/**
 * Место знака у стопки. Внутри — в левом верхнем углу, если меньшая сторона ≥ 1,6 кегля и знак
 * помещается по ширине (а в виде сверху под ним ещё остаётся строка «×N»). Иначе знак выносится:
 * сбоку — строго над полосой, по её середине; сверху — рядом со следом, с короткой выноской (справа,
 * а у правого края `bounds` — слева).
 */
export function placeMark(
  view: 'top' | 'side',
  rect: Box,
  mark: string,
  countFont: number,
  bounds: { length: number },
): MarkPlacement {
  const f = countFont;
  const m = MARGIN * f;
  const textW = estimateTextWidth(mark, f) * BOLD_WIDTH;
  const common = { fontSize: f, strokeWidth: f * MARGIN };
  const fitsInside =
    Math.min(rect.w, rect.h) >= INSIDE_MIN_SIDE * f &&
    rect.w >= textW + 2 * INSET * f &&
    (view === 'side' || rect.h >= TOP_INSIDE_MIN_H * f);
  if (fitsInside) {
    const x = rect.x + INSET * f;
    return {
      ...common,
      x,
      y: rect.y + m + f / 2,
      anchor: 'start',
      outside: false,
      box: { x: x - m, y: rect.y, w: textW + 2 * m, h: BAND * f },
      labelArea: { x: rect.x, y: rect.y + BAND * f, w: rect.w, h: rect.h - BAND * f },
    };
  }
  if (view === 'side') {
    const x = rect.x + rect.w / 2;
    return {
      ...common,
      x,
      y: rect.y - m - f / 2,
      anchor: 'middle',
      outside: true,
      box: { x: x - textW / 2 - m, y: rect.y - BAND * f, w: textW + 2 * m, h: BAND * f },
      labelArea: rect,
    };
  }
  const cy = rect.y + rect.h / 2;
  const right = rect.x + rect.w + OUTSIDE_GAP * f;
  const toRight = right + textW <= bounds.length;
  const x = toRight ? right : rect.x - OUTSIDE_GAP * f;
  const edge = toRight ? rect.x + rect.w : rect.x;
  return {
    ...common,
    x,
    y: cy,
    anchor: toRight ? 'start' : 'end',
    outside: true,
    leader: { x1: edge, y1: cy, x2: toRight ? x - m : x + m, y2: cy },
    box: { x: (toRight ? x : x - textW) - m, y: cy - f / 2 - m, w: textW + 2 * m, h: BAND * f },
    labelArea: rect,
  };
}

/** Вид сбоку: знак рисуется, только если его место не закрыто ни одной БЛИЖНЕЙ стопкой (`nearer` —
 *  их полосы). Закрытый знак не рисуется вовсе: обрезок буквы читается как другая буква. */
export const sideMarkVisible = (p: MarkPlacement, nearer: readonly Box[]): boolean =>
  !nearer.some((o) => boxesIntersect(p.box, o));
