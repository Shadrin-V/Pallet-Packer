// Плашка счётчика группового выделения (LKWkalk-5tg). Чистая геометрия: компонент рисует то, что
// вернула эта функция, и ничего не считает сам.
//
// Голый текст цвета --brand поверх зелёной штриховки поддонов не читался, а у выделения в первом
// ряду уезжал за переднюю стенку кузова. Отсюда два правила: под текстом всегда залитая подложка, и
// подложка всегда внутри кузова — если над рамкой места нет, она переворачивается ВНУТРЬ рамки.
//
// Ширина текста оценивается арифметически (`estimateTextWidth`), как и у подписей на стопках:
// getComputedTextLength в jsdom нет, и тесты разошлись бы с продом.

import { estimateTextWidth } from './stackLabel';

/** Поля вокруг текста и зазор до рамки — в долях кегля, чтобы плашка масштабировалась вместе с ним. */
const PAD_X = 0.45;
const PAD_Y = 0.28;
const GAP = 0.2;

export interface Badge {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Левый край текста (text-anchor="start"). */
  textX: number;
  /** Середина текста по вертикали (dominant-baseline="central"). */
  textY: number;
}

export function selectionBadge(
  box: { x: number; y: number; w: number; h: number },
  text: string,
  fontSize: number,
  hold: { width: number; height: number },
): Badge {
  const w = estimateTextWidth(text, fontSize) + 2 * PAD_X * fontSize;
  const h = fontSize + 2 * PAD_Y * fontSize;
  const gap = GAP * fontSize;

  // Над рамкой, если плашка целиком помещается между ней и передней стенкой; иначе — внутрь рамки.
  const above = box.y - gap - h;
  const y = above >= 0 ? above : Math.min(box.y + gap, Math.max(box.y, box.y + box.h - h));

  // Прижать к кромкам кузова. Левый край выигрывает у правого: плашка шире кузова должна начинаться
  // от 0 и обрезаться справа, а не уезжать в минус и терять начало строки.
  const x = Math.max(0, Math.min(box.x, hold.width - w));

  return { x, y, w, h, textX: x + PAD_X * fontSize, textY: y + h / 2 };
}
