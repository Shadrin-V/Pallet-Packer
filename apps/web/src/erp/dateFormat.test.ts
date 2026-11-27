import { describe, expect, it } from 'vitest';
import { formatIsoDate } from './dateFormat';

describe('formatIsoDate', () => {
  it('календарная дата ERP в формате локали, без сдвига часового пояса', () => {
    expect(formatIsoDate('2026-11-24', 'de')).toBe('24.11.2026');
    expect(formatIsoDate('2026-01-01', 'ru')).toBe('01.01.2026');
  });

  it('не дата ГГГГ-ММ-ДД — как пришла', () => {
    expect(formatIsoDate('24.11.2026', 'de')).toBe('24.11.2026');
    expect(formatIsoDate('', 'de')).toBe('');
  });
});
