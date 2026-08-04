import { describe, expect, it } from 'vitest';
import { reconcileYardOrder, yardOrderKey } from './yardOrder';

const t = (cargoTypeId: string, units: number) => ({ cargoTypeId, units });

describe('yardOrderKey', () => {
  // Количество впереди: ПЕРВОЕ двоеточие делит ключ однозначно при любом id из пользовательского
  // справочника — включая id, который сам содержит двоеточия.
  it('делит ключ однозначно даже когда id содержит двоеточие', () => {
    expect(yardOrderKey(t('a:b:c', 17))).toBe('17:a:b:c');
    expect(yardOrderKey(t('a', 17))).not.toBe(yardOrderKey(t('a', 12)));
  });
});

describe('reconcileYardOrder', () => {
  it('без порядка отдаёт плитки как есть', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1)];
    expect(reconcileYardOrder(tiles, [])).toEqual(tiles);
  });

  it('различает плитки одного типа по количеству — остаток можно поставить первым', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['12:p3', '17:p3', '1:p1']);
    expect(out.map((x) => x.units)).toEqual([12, 17, 1]);
  });

  it('повторённый ключ снимает столько же плиток этого ключа', () => {
    const tiles = [t('p3', 17), t('p3', 17), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['1:p1', '17:p3', '17:p3']);
    expect(out.map((x) => x.cargoTypeId)).toEqual(['p1', 'p3', 'p3']);
  });

  it('неупомянутые плитки дописываются в конце в своём порядке', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['1:p1']);
    expect(out.map((x) => x.units)).toEqual([1, 17, 12]);
  });

  // Запасная фаза. Буфер пере-нарезается на каждом рендере, а бросок из кузова записывает порядок
  // ДО того, как плитки появятся, — предсказанное количество может не совпасть ни с одной плиткой.
  // Тогда ключ снимает любую плитку СВОЕГО ТИПА, то есть ведёт себя как прежняя модель «по типу».
  it('ключ с несуществующим количеством снимает любую плитку своего типа', () => {
    const tiles = [t('p1', 1), t('p3', 17), t('p3', 12)];
    const out = reconcileYardOrder(tiles, ['5:p3', '1:p1', '17:p3', '7:p3']);
    expect(out.map((x) => `${x.cargoTypeId}×${x.units}`)).toEqual(['p3×17', 'p1×1', 'p3×12']);
  });

  it('ключ типа, которого во дворе нет вовсе, просто пропускается', () => {
    const tiles = [t('p1', 1)];
    expect(reconcileYardOrder(tiles, ['4:gone', '1:p1'])).toEqual([t('p1', 1)]);
  });

  it('не теряет и не дублирует плитки ни при каком порядке', () => {
    const tiles = [t('p3', 17), t('p3', 12), t('p1', 1), t('p1', 1)];
    const out = reconcileYardOrder(tiles, ['9:p3', '1:p1', '12:p3', '99:zzz']);
    // Мультимножество, а не порядок: сравниваем отсортированные КЛЮЧИ (объекты сортировкой не
    // сравнить — `Array.prototype.sort` приведёт их к «[object Object]» и ничего не упорядочит).
    expect(out.map(yardOrderKey).sort()).toEqual(tiles.map(yardOrderKey).sort());
  });
});
