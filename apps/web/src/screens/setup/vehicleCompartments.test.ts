import { describe, expect, it } from 'vitest';
import { setCompartmentLength } from './vehicleCompartments';
import type { Vehicle } from '@shadrin-v/engine';

const train: Vehicle = {
  id: 't', name: 't', length: 16600, width: 2450, height: 3050,
  compartments: [
    { id: 'tractor', x: 0, length: 7700 },
    { id: 'trailer', x: 8900, length: 7700 },
  ],
};

describe('setCompartmentLength', () => {
  it('удлинение первого отсека сдвигает второй и полный пролёт, сохраняя разрыв', () => {
    const v = setCompartmentLength(train, 0, 8000);
    expect(v.compartments).toEqual([
      { id: 'tractor', x: 0, length: 8000 },
      { id: 'trailer', x: 9200, length: 7700 },   // разрыв те же 1200
    ]);
    expect(v.length).toBe(16900);
  });

  it('правка последнего отсека меняет только его и полный пролёт', () => {
    const v = setCompartmentLength(train, 1, 8300);
    expect(v.compartments?.[0]).toEqual({ id: 'tractor', x: 0, length: 7700 });
    expect(v.length).toBe(17200);
  });

  it('инвариант «конец последнего = length» держится после любой правки', () => {
    for (const [i, len] of [[0, 1], [1, 12345], [0, 20000]] as const) {
      const v = setCompartmentLength(train, i, len);
      const last = v.compartments![v.compartments!.length - 1];
      expect(last.x + last.length).toBe(v.length);
    }
  });

  it('односоставный кузов правится как прежде: одно поле длины, отсеков не заводится', () => {
    const plain: Vehicle = { id: 'v', name: 'v', length: 13600, width: 2450, height: 2650 };
    const v = setCompartmentLength(plain, 0, 13000);
    expect(v.length).toBe(13000);
    expect(v.compartments).toBeUndefined();
  });
});
