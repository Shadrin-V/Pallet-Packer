import { describe, expect, it } from 'vitest';
import { compartmentsOf, compartmentSpanning, fitsInSomeCompartment } from './compartments';
import type { Vehicle } from './types';

const single: Vehicle = { id: 'v', name: 'v', length: 13600, width: 2450, height: 2650 };
const train: Vehicle = {
  id: 't', name: 't', length: 16600, width: 2450, height: 3050,
  compartments: [
    { id: 'tractor', x: 0, length: 7700 },
    { id: 'trailer', x: 8900, length: 7700 },
  ],
};

describe('compartmentsOf', () => {
  it('односоставный кузов = один неявный отсек во всю длину', () => {
    expect(compartmentsOf(single)).toEqual([{ id: 'v', x: 0, length: 13600, name: undefined }]);
  });

  it('многосоставный отдаёт свои отсеки', () => {
    expect(compartmentsOf(train).map((c) => [c.x, c.length])).toEqual([[0, 7700], [8900, 7700]]);
  });

  it('пустой массив compartments тоже читается как односоставный кузов', () => {
    const empty: Vehicle = { ...single, compartments: [] };
    expect(compartmentsOf(empty)).toEqual([{ id: 'v', x: 0, length: 13600, name: undefined }]);
  });
});

describe('compartmentSpanning', () => {
  it('интервал целиком внутри отсека', () => {
    expect(compartmentSpanning(train, 0, 1200)?.id).toBe('tractor');
    expect(compartmentSpanning(train, 8900, 7700)?.id).toBe('trailer');
  });

  it('интервал в разрыве — ничей', () => {
    expect(compartmentSpanning(train, 7800, 1000)).toBeNull();
  });

  it('интервал, оседлавший границу машин, — ничей', () => {
    // Начинается в тягаче, кончается за его стенкой: сумма длин влезла бы, отсек — нет.
    expect(compartmentSpanning(train, 7000, 1200)).toBeNull();
  });

  it('за бортом — ничей', () => {
    expect(compartmentSpanning(train, 16000, 1200)).toBeNull();
    expect(compartmentSpanning(train, -1, 100)).toBeNull();
  });

  it('интервал длиннее любого отсека — ничей, даже если укладывается в машину целиком по x', () => {
    expect(compartmentSpanning(train, 0, 10000)).toBeNull();
  });
});

describe('fitsInSomeCompartment', () => {
  it('односоставный ведёт себя как прежняя проверка границ', () => {
    expect(fitsInSomeCompartment(single, 12400, 1200)).toBe(true);
    expect(fitsInSomeCompartment(single, 12401, 1200)).toBe(false);
  });
});
