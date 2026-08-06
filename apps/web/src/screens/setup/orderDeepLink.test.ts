import { describe, expect, it } from 'vitest';
import { orderParam, urlWithoutOrderParam } from './orderDeepLink';

describe('orderParam', () => {
  it('достаёт номер заказа', () => {
    expect(orderParam('?order=SO-1234')).toBe('SO-1234');
  });

  it('не путается в соседних параметрах и порядке', () => {
    expect(orderParam('?lang=de&order=SO-7&x=1')).toBe('SO-7');
  });

  it('пустое значение и отсутствие параметра дают null', () => {
    expect(orderParam('?order=')).toBeNull();
    expect(orderParam('?order=%20%20')).toBeNull(); // пробелы — не номер заказа
    expect(orderParam('?lang=de')).toBeNull();
    expect(orderParam('')).toBeNull();
  });

  it('обрезает пробелы по краям — ссылку могли скопировать с хвостом', () => {
    expect(orderParam('?order=%20SO-9%20')).toBe('SO-9');
  });
});

describe('urlWithoutOrderParam', () => {
  it('убирает order, сохраняя путь, прочие параметры и якорь', () => {
    expect(urlWithoutOrderParam('https://h.de/app?lang=de&order=SO-1#plan')).toBe(
      '/app?lang=de#plan',
    );
  });

  it('после удаления единственного параметра не оставляет висячего «?»', () => {
    expect(urlWithoutOrderParam('https://h.de/?order=SO-1')).toBe('/');
  });

  it('адрес без order возвращается как есть', () => {
    expect(urlWithoutOrderParam('https://h.de/?lang=de')).toBe('/?lang=de');
  });
});
