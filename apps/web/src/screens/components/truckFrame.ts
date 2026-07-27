// Рамка чертежа кузова: поля вокруг грузового объёма и внешние габариты svg, в миллиметрах кузова.
//
// Живёт отдельно от CrossSection, потому что этими числами владеет НЕ ОДИН компонент: двор склада
// обещает груз в том же масштабе, что кузов, а масштаб держится равенством ширин ВНЕШНИХ viewBox при
// width:100% в одной колонке. Пока outerW считал сам CrossSection, двор держал это равенство
// комментарием — и молча потерял его, когда 41e.1 добавила поле под кабину (LKWkalk-6n4).
//
// Значения дробные: это доли от высоты кузова, презентация, а не домен (ADR 002 про целые мм — о
// домене). Округление здесь и есть тот дрейф, который модуль убирает.
import type { Vehicle } from '@shadrin-v/engine';
import { GUTTER, RULER_FONT } from './truckChrome';

export interface TruckFrame {
  /** мм слева под кабину — поле разреза, которое не принадлежит кузову. */
  frontGutter: number;
  /** мм сверху под полосу линейки длины. */
  topGutter: number;
  /** мм снизу под ходовую; 0 на виде сверху. */
  wheelGutter: number;
  /** мм — ширина внешнего viewBox. Равенством ЭТОГО числа держится общий масштаб мм→px. */
  outerW: number;
  /** мм — высота внешнего viewBox. */
  outerH: number;
}

export function truckFrame(vehicle: Vehicle, view: 'top' | 'side'): TruckFrame {
  const { length, width, height } = vehicle;
  const spanY = view === 'top' ? width : height;
  // Переднее поле резервируется в ОБОИХ видах: одинаковый outerW → одинаковый мм→px → виды стоят
  // в колонке друг под другом по длине кузова. Колёса — только сбоку. Сзади ничего не рисуется.
  const frontGutter = height * GUTTER.front;
  const wheelGutter = view === 'side' ? height * GUTTER.wheel : 0;
  // Линейка длины идёт НАД коробом; её полосе нужно вместить число, растущее вверх от кромки на
  // ~1.9 кегля плюс полстроки. Кегль = length * RULER_FONT.
  const topGutter = length * RULER_FONT * 2.8;
  return {
    frontGutter,
    topGutter,
    wheelGutter,
    outerW: frontGutter + length,
    outerH: topGutter + spanY + wheelGutter,
  };
}
