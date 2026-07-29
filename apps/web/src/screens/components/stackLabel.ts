// Подпись артикула на стопке (LKWkalk-ayg, спека docs/superpowers/specs/2026-07-29-stack-article-labels-design.md).
// Чистая функция: решает, влезает ли имя в прямоугольник стопки и в каком виде. Компоненты
// (CrossSection, WarehouseFloor) только рисуют то, что она вернула.
//
// Ширина текста ОЦЕНИВАЕТСЯ арифметически, а не меряется через getComputedTextLength: измерение по
// DOM недоступно в jsdom, и юнит-тесты разошлись бы с продом. Ошибка в пределах одного знака
// приемлема — результат решает лишь «сколько знаков оставить», не позиционирование.

/** Имя тише количества: оно подпись, а не главное число схемы. */
export const NAME_FONT_RATIO = 0.7;
// Ширины глифов в долях кегля — замерены в Chrome через getBBox на --font-sans, вес 600:
// прописные 0,65 · строчные 0,50 · цифры 0,63 · многоточие 0,65. Единый коэффициент на знак здесь
// не работает в обе стороны: 0,58 выпускал бы «SONDERPALETTE» (0,62 замеренных) за край стопки и
// одновременно резал бы «Viertelpalette» (0,43) на треть раньше, чем нужно.
const W_UPPER = 0.66;
const W_LOWER = 0.5;
const W_NARROW = 0.32; // пробел, скобки, дефис, точка — всё узкое
const W_ELLIPSIS = 0.65;
const NARROW_CHARS = ` .,;:!?()[]{}-'"/|·`;

/** Оценка ширины строки в тех же единицах, в которых заданы кегль и габариты стопки. */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch === '…') em += W_ELLIPSIS;
    else if (NARROW_CHARS.includes(ch)) em += W_NARROW;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += W_UPPER;
    else if (ch >= '0' && ch <= '9') em += W_UPPER;
    else em += W_LOWER;
  }
  return em * fontSize;
}
/** Огрызок короче трёх знаков не опознаёт артикул — лучше ничего. */
const MIN_VISIBLE_CHARS = 3;
/** Две строки (имя + ×N) требуют столько высоты стопки в единицах countFont. */
const TWO_LINE_HEIGHT = 1.9;

/**
 * @param name имя артикула; `null`/пустое — у групповой стопки смешанного типа одного артикула нет
 * @returns готовую подпись (уже обрезанную) либо `null` — «рисовать только ×N»
 */
export function stackLabel(
  name: string | null,
  boxW: number,
  boxH: number,
  countFont: number,
): string | null {
  if (!name) return null;
  if (boxH < countFont * TWO_LINE_HEIGHT) return null;

  const font = countFont * NAME_FONT_RATIO;
  if (estimateTextWidth(name, font) <= boxW) return name;

  // Самый длинный префикс, который вместе с многоточием ещё влезает.
  let visible = 0;
  while (
    visible < name.length &&
    estimateTextWidth(`${name.slice(0, visible + 1)}…`, font) <= boxW
  ) {
    visible += 1;
  }
  if (visible < MIN_VISIBLE_CHARS) return null;
  return `${name.slice(0, visible)}…`;
}
