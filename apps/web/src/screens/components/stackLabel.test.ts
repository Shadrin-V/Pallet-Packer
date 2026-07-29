import { describe, it, expect } from 'vitest';
import { stackLabel, estimateTextWidth, NAME_FONT_RATIO } from './stackLabel';

// Все размеры — в мм-единицах вида сверху, как их видят CrossSection/WarehouseFloor.
// countFont у обоих равен vehicle.width * 0.05 → для кузова 2450 это ≈122.
const FONT = 122;
// Порог по высоте: две строки требуют countFont * 1.9 ≈ 232.
const TALL = 800;

describe('stackLabel', () => {
  it('returns a name that fits the footprint unchanged', () => {
    expect(stackLabel('EPAL 1', 1200, TALL, FONT)).toBe('EPAL 1');
  });

  it('truncates with an ellipsis when the name is wider than the stack', () => {
    const label = stackLabel('EPAL 2 (2-seitig)', 600, TALL, FONT);
    expect(label).not.toBeNull();
    expect(label!.endsWith('…')).toBe(true);
    expect(label!.length).toBeLessThan('EPAL 2 (2-seitig)'.length);
    expect('EPAL 2 (2-seitig)'.startsWith(label!.slice(0, -1))).toBe(true);
  });

  it('keeps the truncated label inside the footprint', () => {
    const boxW = 600;
    const label = stackLabel('EPAL 2 (2-seitig)', boxW, TALL, FONT)!;
    expect(estimateTextWidth(label, FONT * NAME_FONT_RATIO)).toBeLessThanOrEqual(boxW);
  });

  // Прописные в этом шрифте шире строчных (0,65 em против 0,5 — замерено в Chrome), поэтому
  // единый коэффициент на знак либо режет строчные имена зря, либо выпускает прописные за
  // пределы стопки. Оценка считает знаки по классам.
  it('truncates an all-caps name harder than the same lowercase one', () => {
    const caps = stackLabel('SONDERPALETTE', 600, TALL, FONT)!;
    const lower = stackLabel('sonderpalette', 600, TALL, FONT)!;
    expect(caps.length).toBeLessThan(lower.length);
  });

  it('measures capitals as wider than lowercase', () => {
    expect(estimateTextWidth('MMM', 100)).toBeGreaterThan(estimateTextWidth('mmm', 100));
  });

  it('drops the name when the stack is too low for two lines', () => {
    expect(stackLabel('EPAL 1', 1200, FONT * 1.5, FONT)).toBeNull();
  });

  it('drops the name when fewer than three characters would survive truncation', () => {
    // 150 мм при глифе ≈49 мм оставляют место под 3 знака, из которых один съест многоточие.
    expect(stackLabel('Sonderpalette', 150, TALL, FONT)).toBeNull();
  });

  it('drops the name of a mixed group, which has no single article', () => {
    expect(stackLabel(null, 1200, TALL, FONT)).toBeNull();
    expect(stackLabel('', 1200, TALL, FONT)).toBeNull();
  });
});
