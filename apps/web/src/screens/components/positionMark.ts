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
 * сбоку — строго над полосой, по её середине; сверху — рядом со следом, с короткой выноской: справа,
 * иначе слева — туда, где место не выходит за `bounds` и не ложится на `obstacles` (чужие следы с их
 * подписями, уже поставленные знаки). Места нет ни там, ни там — знак встаёт в центр своего следа,
 * поверх «×N»: подложка-обводка держит его читаемым.
 */
export function placeMark(
  view: 'top' | 'side',
  rect: Box,
  mark: string,
  countFont: number,
  bounds: { length: number },
  obstacles: readonly Box[] = [],
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
  const box = (left: number): Box => ({ x: left - m, y: cy - f / 2 - m, w: textW + 2 * m, h: BAND * f });
  const free = (b: Box) => b.x >= 0 && b.x + b.w <= bounds.length && !obstacles.some((o) => boxesIntersect(b, o));
  const rightX = rect.x + rect.w + OUTSIDE_GAP * f;
  if (free(box(rightX))) {
    return {
      ...common,
      x: rightX,
      y: cy,
      anchor: 'start',
      outside: true,
      leader: { x1: rect.x + rect.w, y1: cy, x2: rightX - m, y2: cy },
      box: box(rightX),
      labelArea: rect,
    };
  }
  const leftX = rect.x - OUTSIDE_GAP * f;
  if (free(box(leftX - textW))) {
    return {
      ...common,
      x: leftX,
      y: cy,
      anchor: 'end',
      outside: true,
      leader: { x1: rect.x, y1: cy, x2: leftX + m, y2: cy },
      box: box(leftX - textW),
      labelArea: rect,
    };
  }
  const cx = rect.x + rect.w / 2;
  return { ...common, x: cx, y: cy, anchor: 'middle', outside: false, box: box(cx - textW / 2), labelArea: rect };
}

/** Вид сбоку: знак рисуется, только если его место не закрыто ни одной БЛИЖНЕЙ стопкой (`nearer` —
 *  их полосы). Закрытый знак не рисуется вовсе: обрезок буквы читается как другая буква. */
export const sideMarkVisible = (p: MarkPlacement, nearer: readonly Box[]): boolean =>
  !nearer.some((o) => boxesIntersect(p.box, o));

/** Стопка для раскладки знаков: ключ, знак, полоса/след; в виде сбоку — ряд (`rowY`, больше = ближе). */
export interface MarkItem {
  key: string;
  mark: string;
  rect: Box;
  rowY?: number;
}

/** Полоса целиком закрыта ближними: полосы стоят на полу, так что закрывает только ближняя не ниже
 *  этой, и их x-интервалы вместе покрывают её x-интервал. */
function fullyCovered(r: Box, nearer: readonly Box[]): boolean {
  const spans = nearer
    .filter((o) => o.y <= r.y && o.y + o.h >= r.y + r.h)
    .map((o) => [Math.max(o.x, r.x), Math.min(o.x + o.w, r.x + r.w)] as const)
    .filter(([a, b]) => a < b)
    .sort((p, q) => p[0] - q[0]);
  let reach = r.x;
  for (const [a, b] of spans) {
    if (a > reach) return false;
    reach = Math.max(reach, b);
  }
  return reach >= r.x + r.w;
}

/**
 * Знаки вида сбоку. Ближние ряды ставятся первыми; знак стопки НЕ рисуется, если (1) её полоса
 * целиком закрыта ближними, (2) место знака задевает полосу ближнего ряда, (3) место знака задевает
 * уже поставленный знак, (4) вынесенный знак вышел бы за крышу кузова (в поле линейки). Позиция при
 * этом всё равно читается: в виде сверху, в таблице и в «Nicht im LKW». Итог — ни одна пара мест
 * знаков не пересекается.
 */
export function sideMarkPlacements(
  items: readonly MarkItem[],
  countFont: number,
  bounds: { length: number },
): Map<string, MarkPlacement> {
  const order = [...items].sort((a, b) => (b.rowY ?? 0) - (a.rowY ?? 0) || a.rect.x - b.rect.x);
  const placed = new Map<string, MarkPlacement>();
  for (const it of order) {
    const nearer = items.filter((o) => (o.rowY ?? 0) > (it.rowY ?? 0)).map((o) => o.rect);
    if (fullyCovered(it.rect, nearer)) continue;
    const p = placeMark('side', it.rect, it.mark, countFont, bounds);
    if (p.box.y < 0) continue;
    if (!sideMarkVisible(p, nearer)) continue;
    if ([...placed.values()].some((q) => boxesIntersect(p.box, q.box))) continue;
    placed.set(it.key, p);
  }
  return placed;
}

/** Знаки вида сверху (и «Lager»): следы не перекрываются, знак есть у каждого; вынесенный знак
 *  обходит чужие следы (с подписями внутри них) и уже поставленные знаки. */
export function topMarkPlacements(
  items: readonly MarkItem[],
  countFont: number,
  bounds: { length: number },
): Map<string, MarkPlacement> {
  const placed = new Map<string, MarkPlacement>();
  for (const it of items) {
    const others = items.filter((o) => o !== it).map((o) => o.rect);
    const marksSoFar = [...placed.values()].map((q) => q.box);
    placed.set(it.key, placeMark('top', it.rect, it.mark, countFont, bounds, [...others, ...marksSoFar]));
  }
  return placed;
}
