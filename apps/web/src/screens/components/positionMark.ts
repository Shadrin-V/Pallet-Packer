// Знак позиции плана (сборка для ERP, условие утверждения макета): различитель, который не зависит
// от цвета. Цветов заказов в палитре Schäfer три, позиций на рейсе до десяти — поэтому у каждой
// позиции своя буква, одинаковая на грузе в обоих видах, на плитке «Lager», в таблице позиций, в
// «Nicht im LKW» и в картинке. Буквы, а не цифры: цифры уже заняты линейкой метров в обоих видах.
// Это подпись, не доменная логика: порядок задан списком позиций рейса (`PlanContext.positionOrder`).

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

/** Доля кегля знака от кегля «×N» и предел — треть меньшей стороны стопки: маленькая стопка знак
 *  не теряет, он лишь мельче. */
const MARK_FONT_RATIO = 0.8;
const MARK_MAX_SIDE_SHARE = 1 / 3;

/** Где и каким кеглем стоит знак на стопке (мм чертежа): левый верхний угол, отступ — треть кегля;
 *  `y` — середина строки (`dominantBaseline="central"`), обводка-подложка — доля кегля. */
export function markGlyph(
  rect: { x: number; y: number; w: number; h: number },
  countFont: number,
): { x: number; y: number; fontSize: number; strokeWidth: number } {
  const fontSize = Math.min(countFont * MARK_FONT_RATIO, Math.min(rect.w, rect.h) * MARK_MAX_SIDE_SHARE);
  const pad = fontSize / 3;
  return { x: rect.x + pad, y: rect.y + pad + fontSize / 2, fontSize, strokeWidth: fontSize * 0.2 };
}
