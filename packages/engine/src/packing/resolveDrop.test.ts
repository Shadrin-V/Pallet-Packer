import { describe, expect, it } from 'vitest';
import type { CargoType, Layout, Load, Vehicle } from '../model/index';
import { calculateLayout } from '../api/api';
import { moveStacks, placeStack } from './edit';
import type { StackRef } from './edit';
import { packLoad } from './orchestrator';
import { resolveDrop, resolveGroupDrop } from './resolveDrop';

const V = { id: 'v', name: 'LKW', length: 10000, width: 2400, height: 2650 };
const pallet = {
  id: 'p',
  name: 'P',
  length: 1200,
  width: 800,
  height: 1000,
  quantity: 10,
  rotation: 'yawOnly' as const,
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt' as const,
  orderId: 'SO-1',
};
const load: Load = { vehicle: V, cargo: [pallet] };
const at = (x: number, y: number) => ({
  cargoTypeId: 'p',
  x,
  y,
  z: 0,
  orientation: 'lwh' as const,
  tier: 1,
  state: 'entschachtelt' as const,
});
const layoutOf = (placements: Layout['placements'], unplaced = 5): Layout => ({
  placements,
  unplaced: [{ cargoTypeId: 'p', count: unplaced }],
  metrics: {
    totalPlaced: placements.length,
    usedFloorPositions: placements.length,
    floorFillPercent: 0,
    volumeFillPercent: 0,
  },
  contractVersion: '0.13.0',
});
const spec = (x: number, y: number) => ({
  cargoTypeId: 'p',
  x,
  y,
  orientation: 'lwh' as const,
  units: 1,
});

describe('resolveDrop', () => {
  it('returns the aim untouched when it is free and nothing is near enough to snap to', () => {
    const r = resolveDrop(load, layoutOf([]), spec(5000, 800));
    expect(r).toMatchObject({ x: 5000, y: 800, ok: true, blocking: [] });
  });

  it('snaps flush when the aim overlaps a neighbour', () => {
    // сосед занимает 0…1200; целимся в 1080 → налезаем на 120 мм. Впритык = 1200.
    const r = resolveDrop(load, layoutOf([at(0, 0)]), spec(1080, 0));
    expect(r).toMatchObject({ x: 1200, y: 0, ok: true });
  });

  it('closes a gap: a valid aim still snaps flush to the neighbour', () => {
    // 1260 свободно (сосед кончается на 1200), но оставляет щель 60 мм → прижать к 1200.
    const r = resolveDrop(load, layoutOf([at(0, 0)]), spec(1260, 0));
    expect(r).toMatchObject({ x: 1200, y: 0, ok: true });
  });

  it('refuses and names the blocking stack when nothing fits within tolerance', () => {
    const packed = layoutOf([at(0, 0), at(1200, 0), at(2400, 0)]);
    const r = resolveDrop(load, packed, spec(1250, 0), { tolerance: 100 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(r.blocking.length).toBeGreaterThan(0);
  });

  it('does not search when fork access pins the orientation — no position can fix it', () => {
    const pinned: Load = {
      vehicle: V,
      cargo: [{ ...pallet, forkAccess: 'twoSides', forkAxis: 'length' }],
      loadingMode: 'rear',
    };
    const r = resolveDrop(pinned, layoutOf([]), { ...spec(5000, 800), orientation: 'wlh' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
    expect(r.blocking).toEqual([]);
  });

  it('refuses an orientation the rotation rule forbids', () => {
    const fixed: Load = { vehicle: V, cargo: [{ ...pallet, rotation: 'none' }] };
    const r = resolveDrop(fixed, layoutOf([]), { ...spec(5000, 800), orientation: 'wlh' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
  });

  it('excludes the moved stack from its own collision check', () => {
    const one = layoutOf([at(0, 0)]);
    const r = resolveDrop(load, one, spec(60, 0), { exclude: { cargoTypeId: 'p', x: 0, y: 0 } });
    expect(r.ok).toBe(true); // не считает себя помехой; прижмётся к стенке x=0
    expect(r.x).toBe(0);
  });

  it('pulls an aim just outside the hold back inside', () => {
    const r = resolveDrop(load, layoutOf([]), spec(-50, -30));
    expect(r).toMatchObject({ x: 0, y: 0, ok: true });
  });

  it('refuses an aim far outside the hold rather than teleporting it', () => {
    const r = resolveDrop(load, layoutOf([]), spec(-5000, 800));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('is deterministic', () => {
    const l = layoutOf([at(0, 0), at(2400, 0)]);
    expect(resolveDrop(load, l, spec(1250, 0))).toEqual(resolveDrop(load, l, spec(1250, 0)));
  });

  // Подсветка не может врать: зелёное обещание обязано выполняться.
  it('never returns ok for a position placeStack would refuse', () => {
    const l = layoutOf([at(0, 0), at(2400, 0)]);
    for (let x = -200; x <= 4000; x += 100) {
      for (const y of [0, 400, 800, 1600]) {
        const r = resolveDrop(load, l, spec(x, y));
        if (!r.ok) continue;
        const applied = placeStack(load, l, {
          cargoTypeId: 'p',
          x: r.x,
          y: r.y,
          orientation: 'lwh',
          units: 1,
        });
        expect(
          applied.error,
          `resolveDrop said ok at ${r.x},${r.y} but placeStack refused`,
        ).toBeUndefined();
      }
    }
  });
});

const gcargo = (over: Partial<CargoType> & Pick<CargoType, 'id' | 'name'>): CargoType => ({
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: 1,
  rotation: 'yawOnly',
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt',
  ...over,
});

describe('resolveGroupDrop', () => {
  /** 4×2 m hold, 1×1 m cubes → 8 floor positions in a 4×2 grid. */
  const grid: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [gcargo({ id: 'c', name: 'Cube', quantity: 8 })],
  };
  const refsAt = (...pts: [number, number][]): StackRef[] =>
    pts.map(([x, y]) => ({ cargoTypeId: 'c', x, y }));

  it('accepts the zero delta — a group that already stands legally may stay put', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const refs = refsAt([sorted[0].x, sorted[0].y]);

    const r = resolveGroupDrop(grid, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.blocking).toEqual([]);
  });

  it('pulls a near miss flush — flush beats near, as for a single stack', () => {
    // One lone stack in an otherwise empty hold, aimed 60 mm short of the far wall.
    const lone: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
      cargo: [gcargo({ id: 'c', name: 'Cube', quantity: 1 })],
    };
    const layout = calculateLayout(lone);
    const start = layout.placements[0];
    const refs = refsAt([start.x, start.y]);
    // aim so the stack's far edge sits 60 mm short of x = 4000
    const aimDx = 4000 - 1000 - 60 - start.x;

    const r = resolveGroupDrop(lone, layout, refs, { dx: aimDx, dy: 0 });

    expect(r.ok).toBe(true);
    expect(start.x + r.dx).toBe(3000); // flush against the far wall, not 60 mm short of it
  });

  it('refuses as a whole when no delta in reach works, and names what is in the way', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const one = refsAt([sorted[0].x, sorted[0].y]);

    // aim straight onto an occupied neighbour, with a tolerance too small to escape it
    const r = resolveGroupDrop(grid, layout, one, { dx: 1000, dy: 0 }, { tolerance: 0 });

    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(r.blocking.length).toBeGreaterThan(0);
  });

  it('reports out-of-bounds rather than overlap when the aim leaves the hold', () => {
    const layout = calculateLayout(grid);
    const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
    const one = refsAt([sorted[0].x, sorted[0].y]);

    const r = resolveGroupDrop(grid, layout, one, { dx: 100000, dy: 0 }, { tolerance: 0 });

    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('never counts a group member as an obstacle to another member', () => {
    const layout = calculateLayout(grid);
    const all = layout.placements.map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    // The entire floor moves as one: any delta that keeps it in bounds must be legal, because the
    // only things in the way are members.
    const r = resolveGroupDrop(grid, layout, all, { dx: 0, dy: 0 });
    expect(r.ok).toBe(true);
    expect(r.blocking).toEqual([]);
  });

  it('resolves the same delta regardless of ref order or duplicates — the selection is a set', () => {
    // 3 cubes in a single-file row (4 m long, 1-cell-wide hold) with one free cell past the end.
    // Selecting the WHOLE row and aiming 60 mm short of a one-cell shift snaps the group flush
    // against the far wall — a genuinely non-zero delta, unlike (37, 12) against a fully packed
    // grid, which collapses to (0, 0) at the origin wall and never touches the tie-break chain.
    const row: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 1000, height: 1000 },
      cargo: [gcargo({ id: 'c', name: 'Cube', quantity: 3 })],
    };
    const layout = calculateLayout(row);
    const refs = [...layout.placements]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    const aim = { dx: 940, dy: 0 }; // 60 mm short of a clean 1000 mm shift

    const base = resolveGroupDrop(row, layout, refs, aim);
    expect(base.ok).toBe(true);
    expect(base.dx).not.toBe(0); // genuinely exercises the tie-break chain, not a trivial no-op
    expect(base).toMatchObject({ dx: 1000, dy: 0 });

    const reversed = resolveGroupDrop(row, layout, [...refs].reverse(), aim);
    const duplicated = resolveGroupDrop(row, layout, [refs[0], refs[1], refs[2], refs[0], refs[1]], aim);

    expect(reversed).toEqual(base);
    expect(duplicated).toEqual(base);
  });

  it('refuses an empty selection and a ref that names no column', () => {
    const layout = calculateLayout(grid);
    expect(resolveGroupDrop(grid, layout, [], { dx: 0, dy: 0 }).error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(resolveGroupDrop(grid, layout, refsAt([12345, 0]), { dx: 0, dy: 0 }).error?.code).toBe('ERR_EDIT_NO_STACK');
  });

  // LKWkalk-v1m: групповой магнит проверял только габариты и пересечения, а moveStacks гоняет ещё и
  // findGeometryViolations (orientation + fork access). Когда load изменён ПОСЛЕ расчёта layout
  // (смена loadingMode/forkAxis/rotation), магнит обещал ok:true для дельты, которую moveStacks
  // отвергнет. ADR 020 прямо требует: превью не обещает того, что бросок отвергнет. Одиночный
  // resolveDrop этой дырой не страдает — проверяет обе позиции-независимые правила до поиска.
  it('refuses when fork access pins members to another orientation (load changed after layout, v1m)', () => {
    const base: Load = {
      vehicle: { id: 'v', name: 'V', length: 13600, width: 2480, height: 2650 },
      cargo: [{ ...pallet, quantity: 6, forkAccess: 'twoSides', forkAxis: 'length' }],
      loadingMode: 'rear',
    };
    const layout = calculateLayout(base);
    const first = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y)[0];
    expect(first.orientation).toBe('lwh'); // rear+length пришпиливает lwh — предпосылка репро
    // После расчёта пользователь сменил ось вил — раскладка осталась прежней. rear+width
    // пришпиливает wlh, а колонны стоят в lwh.
    const after: Load = {
      ...base,
      cargo: [{ ...base.cargo[0], forkAxis: 'width' }],
    };
    const refs: StackRef[] = [{ cargoTypeId: 'p', x: first.x, y: first.y }];

    const r = resolveGroupDrop(after, layout, refs, { dx: 2500, dy: 0 }, { tolerance: 400 });

    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
  });

  it('refuses when a member stands in an orientation the rotation rule now forbids (v1m)', () => {
    // Кузов, в который поддон 1200×800 входит только повёрнутым (wlh: 800×1200) — yawOnly-упаковщик
    // обязан выбрать wlh. Затем вращение запрещают: колонна раскладки стоит в ориентации, которой
    // rotation:'none' больше не разрешает.
    const base: Load = {
      vehicle: { id: 'v', name: 'V', length: 800, width: 1200, height: 1000 },
      cargo: [{ ...pallet, quantity: 1 }],
    };
    const layout = calculateLayout(base);
    expect(layout.placements[0]?.orientation).toBe('wlh'); // предпосылка репро
    const after: Load = { ...base, cargo: [{ ...base.cargo[0], rotation: 'none' as const }] };
    const refs: StackRef[] = [{ cargoTypeId: 'p', x: layout.placements[0].x, y: layout.placements[0].y }];

    const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
  });

  // LKWkalk-s9o: rotation и forkAccess — свойства ТИПА груза, а нарушение зависит от ОРИЕНТАЦИИ
  // колонны. Пара колонн ОДНОГО типа в РАЗНЫХ ориентациях — единственная фикстура, на которой
  // мутация «проверить каждый cargoTypeId один раз» отличима от корректного кода: на двух разных
  // типах такой дедуп законен и прошёл бы незамеченным. Смесь ориентаций достижима вживую —
  // rotateStack (edit.ts:233) флипает одну колонну на месте, а правило типа меняют уже потом.
  //
  // Порядок refs параметризован: нарушителем (колонна в 'wlh') побывает и первая участница, и
  // последняя. Один только порядок [A, B] доказывал бы «судят не первую», но не «судят каждую» —
  // мутация «судить только unique.at(-1)» его пережила бы.
  const mixedOrientationPair = (
    order: 'AB' | 'BA',
  ): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load: Load = { vehicle: V, cargo: [{ ...pallet, quantity: 2 }] };
    const a = at(0, 0); // 'lwh' → footprint 1200 × 800
    const b = { ...at(4000, 0), orientation: 'wlh' as const }; // footprint 800 × 1200
    const refs: StackRef[] = [
      { cargoTypeId: 'p', x: a.x, y: a.y },
      { cargoTypeId: 'p', x: b.x, y: b.y },
    ];
    return {
      load,
      layout: layoutOf([a, b], 0),
      refs: order === 'AB' ? refs : [refs[1], refs[0]],
    };
  };

  it('не запрещает законной паре в разных ориентациях остаться на месте (s9o)', () => {
    // Контроль на ложный отказ: без него тесты ниже неотличимы от «фикстура нелегальна сама по
    // себе». Обе колонны в габаритах и не пересекаются, обе выбраны — значит препятствий нет, и
    // нулевая дельта обязана пройти.
    const { load, layout, refs } = mixedOrientationPair('AB');

    const r = resolveGroupDrop(load, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });

  // Прицел {0, 0} во всех негативных сценариях ниже: «остаться на месте» законно геометрически,
  // поэтому отказ может прийти ТОЛЬКО от пер-участница проверки, а не от поиска дельты.
  for (const order of ['AB', 'BA'] as const) {
    it(`refuses when a member's orientation is forbidden by the rotation rule — порядок ${order} (s9o)`, () => {
      const { load, layout, refs } = mixedOrientationPair(order);
      // Правило вращения ужесточили ПОСЛЕ расчёта: rotation:'none' разрешает только 'lwh', а
      // колонна B стоит в 'wlh'.
      const after: Load = { ...load, cargo: [{ ...load.cargo[0], rotation: 'none' as const }] };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
      // orientation:'wlh' есть только у колонны B — именно он доказывает, что судили её, а не
      // законную A. cargoTypeId у обеих один ('p'), поэтому он проверяет контракт ошибки, но
      // ничего не доказывает про обход.
      expect(r.error?.details).toMatchObject({ cargoTypeId: 'p', orientation: 'wlh' });
    });
  }

  for (const order of ['AB', 'BA'] as const) {
    it(`refuses when fork access pins a member to another orientation — порядок ${order} (s9o)`, () => {
      const { load, layout, refs } = mixedOrientationPair(order);
      // Режим погрузки и ось вил задали ПОСЛЕ расчёта: rear+length пришпиливает 'lwh', а колонна B
      // стоит в 'wlh'. rotation остаётся 'yawOnly' НАМЕРЕННО: в цикле rotation проверяется раньше
      // forkAccess, и при 'none' колонна B упала бы на вращении — тест доказывал бы не то правило.
      const after: Load = {
        ...load,
        cargo: [
          { ...load.cargo[0], forkAccess: 'twoSides' as const, forkAxis: 'length' as const },
        ],
        loadingMode: 'rear' as const,
      };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
      expect(r.error?.details).toMatchObject({ cargoTypeId: 'p', orientation: 'wlh', loadingMode: 'rear' });
    });
  }

  // LKWkalk-5iw: группа из ДВУХ РАЗНЫХ типов груза. Пробел, осознанно оставленный s9o: там обе
  // колонны были одного типа, поэтому резолв «один раз по unique[0].cargoTypeId» и резолв на каждую
  // участницу давали ОДИН И ТОТ ЖЕ объект cargo — мутация «вынести резолв из цикла» была
  // неотличима от здорового кода. Здесь типы различаются и правилами, и габаритами, поэтому чужой
  // cargo виден и в вердикте правила (тесты ниже), и в footprint участницы (последний тест).
  const other: CargoType = {
    ...pallet,
    id: 'q',
    name: 'Q',
    length: 1000,
    width: 600,
    height: 900,
    quantity: 1,
  };

  // Нарушителем всегда назначается колонна B (тип 'q'), а правило ужесточается ТОЛЬКО у 'q': тип
  // 'p' остаётся законным. Именно это делает подстановку чужого cargo наблюдаемой — под мутацией B
  // судится правилами 'p' и проходит.
  const twoTypePair = (
    order: 'AB' | 'BA',
  ): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load: Load = { vehicle: V, cargo: [{ ...pallet, quantity: 1 }, other] };
    const a = at(0, 0); // тип 'p', 'lwh' → footprint 1200 × 800
    const b = { ...at(4000, 0), cargoTypeId: 'q', orientation: 'wlh' as const }; // 600 × 1000
    const refs: StackRef[] = [
      { cargoTypeId: 'p', x: a.x, y: a.y },
      { cargoTypeId: 'q', x: b.x, y: b.y },
    ];
    return {
      load,
      // unplaced переопределён: файловый layoutOf зашивает cargoTypeId 'p', и на двухтипной
      // загрузке это была бы ложь в фикстуре. resolveGroupDrop поля не читает, но фикстура не врёт.
      layout: { ...layoutOf([a, b], 0), unplaced: [] },
      refs: order === 'AB' ? refs : [refs[1], refs[0]],
    };
  };

  it('не запрещает законной паре из двух типов остаться на месте (5iw)', () => {
    // Контроль на ложный отказ: без него негативные тесты ниже неотличимы от «фикстура нелегальна
    // сама по себе». Обе колонны в габаритах и не пересекаются, обе выбраны — нулевая дельта обязана
    // пройти.
    const { load, layout, refs } = twoTypePair('AB');

    const r = resolveGroupDrop(load, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });

  // Прицел {0, 0} в обоих негативных тестах: «остаться на месте» законно геометрически, поэтому
  // отказ может прийти ТОЛЬКО от пер-участница проверки, а не от поиска дельты.
  for (const order of ['AB', 'BA'] as const) {
    it(`refuses by the violator's own rotation rule in a two-type group — порядок ${order} (5iw)`, () => {
      const { load, layout, refs } = twoTypePair(order);
      // Вращение ужесточили ПОСЛЕ расчёта и только у типа 'q': 'none' разрешает лишь 'lwh', а
      // колонна B стоит в 'wlh'. Тип 'p' остаётся 'yawOnly', то есть законным.
      const after: Load = {
        ...load,
        cargo: [load.cargo[0], { ...load.cargo[1], rotation: 'none' as const }],
      };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
      // cargoTypeId:'q' и есть доказательство: правило взято у нарушившей участницы, а не у первой.
      // Под резолвом по unique[0] в порядке AB участница B судилась бы правилом 'p' (yawOnly),
      // прошла бы, и отказа не было бы вовсе.
      expect(r.error?.details).toMatchObject({ cargoTypeId: 'q', orientation: 'wlh' });
    });
  }

  for (const order of ['AB', 'BA'] as const) {
    it(`refuses by the violator's own fork-access rule in a two-type group — порядок ${order} (5iw)`, () => {
      const { load, layout, refs } = twoTypePair(order);
      // Двусторонние вилы заданы ТОЛЬКО у 'q'; rear+length пришпиливает 'lwh', а колонна B стоит в
      // 'wlh'. У 'p' forkAccess не задан вовсе — под резолвом по unique[0] ветка вил для B не
      // сработала бы. rotation у 'q' остаётся 'yawOnly' НАМЕРЕННО: в цикле rotation проверяется
      // раньше forkAccess, и при 'none' колонна B упала бы на вращении — тест доказывал бы не то
      // правило.
      const after: Load = {
        ...load,
        cargo: [
          load.cargo[0],
          { ...load.cargo[1], forkAccess: 'twoSides' as const, forkAxis: 'length' as const },
        ],
        loadingMode: 'rear' as const,
      };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
      expect(r.error?.details).toMatchObject({
        cargoTypeId: 'q',
        orientation: 'wlh',
        loadingMode: 'rear',
        forkAxis: 'length',
      });
    });
  }

  it('снапит группу к стенке по СОБСТВЕННОМУ footprint участницы, а не первой (5iw)', () => {
    // Правиловые тесты выше убивают резолв по unique[0] целиком — но только потому, что отказ
    // приходит РАНЬШЕ геометрии. Живой остаётся более узкая мутация: правила пер-ref честные, а
    // orientedDims (resolveDrop.ts:322) считается от unique[0]. Ловит её только этот тест.
    //
    // Флеш даёт колонна B: дальняя стенка отсека минус её СОБСТВЕННЫЙ footprint по длине
    // (10000 − 600 = 9400, resolveDrop.ts:387), минус её текущая координата 4000 → дельта 5400.
    // Под габаритами 'p' в 'wlh' (800 × 1200) кандидат стал бы 10000 − 800 − 4000 = 5200.
    // Прицел промахивается мимо флеша на 20 мм — это внутри толеранса группы (min(600,1000)/2 = 300
    // у B, что меньше 400 у A), поэтому «флеш бьёт промах» (сортировка кандидатов по flush в
    // resolveDrop.ts) и побеждает кандидат от стенки, а не сам прицел.
    //
    // Порядок только AB: при BA чужие габариты достались бы законной A, дельта B осталась бы 5400 и
    // мутация выжила бы — второй инстанс не доказывал бы ничего. Асимметрия с тестами выше
    // намеренная.
    const { load, layout, refs } = twoTypePair('AB');

    const r = resolveGroupDrop(load, layout, refs, { dx: 5380, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(5400);
    expect(r.dy).toBe(0);
  });
});

// LKWkalk-p3p: два отсека (тягач [0, 2400) и прицеп [3400, 5800)) с физическим разрывом между ними.
// Стенок по оси длины теперь столько же, сколько отсеков; позиция в разрыве не годна ни при каком
// раскладе. Числа ниже — независимо пересчитаны по фактической реализации resolveDrop, а НЕ взяты
// из брифа: кубик 1200×1200×1200, rotation:'none' → dx=dy=1200, tol = min(dx,dy)/2 = 600.
describe('resolveDrop — стенки каждого отсека (p3p)', () => {
  const twoBays: Vehicle = {
    id: 't',
    name: 't',
    length: 5800,
    width: 2400,
    height: 2400,
    compartments: [
      { id: 'a', x: 0, length: 2400 },
      { id: 'b', x: 3400, length: 2400 },
    ],
  };
  const cube = (over: Partial<CargoType> = {}): CargoType => ({
    id: 'c',
    name: 'c',
    length: 1200,
    width: 1200,
    height: 1200,
    quantity: 8,
    rotation: 'none',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...over,
  });

  it('прицел, оседлавший стенку тягача, примагничивается к ней', () => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
    // Прицел 1500: footprint [1500, 2700) оседлал стенку отсека a (2400) и сам по себе негоден
    // (вылезает за a, не дотягивается до b). До кромки a=1200 — 300 мм, в пределах допуска 600.
    const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 1500, y: 0, orientation: 'lwh' });
    expect(res.ok).toBe(true);
    expect(res.x).toBe(1200); // дальняя кромка вплотную к стенке тягача: 1200 + 1200 = 2400
  });

  it('прицел глубоко в разрыве — отказ, стопку туда не телепортируют', () => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
    // Прицел 2300: до ближней годной позиции 1200 — 1100 мм, до 3400 — 1100 мм. Оба вне допуска 600.
    const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 2300, y: 0, orientation: 'lwh' });
    expect(res.ok).toBe(false);
  });

  it('стенка второго отсека — такой же кандидат, как стенка первого', () => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
    // Прицел 3500: сам годен (footprint [3500, 4700) целиком внутри b), но 3400 «впритык» к стенке
    // отсека — правило «впритык бьёт близкое» отдаёт победу ему, а не самому прицелу.
    const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 3500, y: 0, orientation: 'lwh' });
    expect(res.ok).toBe(true);
    expect(res.x).toBe(3400); // притянуло к передней стенке прицепа
  });

  // Восстановленный головной сценарий брифа (Minor 3, review round 2): прицел 2900 сам по себе
  // в разрыве (2900 не укладывается ни в a, ни в b), но лежит в пределах допуска (500 ≤ 600) от
  // ближней стенки прицепа — «магнит вытягивает прицел из сцепки», а не просто отказывает.
  it('прицел в разрыве, но в пределах допуска от стенки соседнего отсека — магнит вытягивает наружу', () => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
    const res = resolveDrop(load, empty, { cargoTypeId: 'c', x: 2900, y: 0, orientation: 'lwh' });
    expect(res.ok).toBe(true);
    expect(res.x).toBe(3400); // до 3400 — 500 мм, в пределах допуска 600
  });

  // ADR 020: если resolveDrop сказала ok, placeStack по этой точке не откажет. Сквозной прогон по
  // разрыву и обеим стенкам — ровно там, где новая логика могла бы соврать.
  it('never returns ok for a position placeStack would refuse (compartment gap swept)', () => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const empty: Layout = { ...packLoad(load), placements: [], unplaced: [{ cargoTypeId: 'c', count: 8 }] };
    for (let x = -200; x <= 6000; x += 100) {
      for (const y of [0, 400, 800, 1200]) {
        const r = resolveDrop(load, empty, { cargoTypeId: 'c', x, y, orientation: 'lwh' });
        if (!r.ok) continue;
        const applied = placeStack(load, empty, {
          cargoTypeId: 'c',
          x: r.x,
          y: r.y,
          orientation: 'lwh',
          units: 1,
        });
        expect(
          applied.error,
          `resolveDrop said ok at ${r.x},${r.y} (aim ${x},${y}) but placeStack refused`,
        ).toBeUndefined();
      }
    }
  });
});

// Critical 1 (review round 2): resolveGroupDrop не знал про отсеки — тот же прицел, что и одиночный
// путь, но по цепочке дельты, а не абсолютной цели. Числа пересчитаны самостоятельно тем же
// способом, что и для resolveDrop: кубик 1200×1200×1200 в отсеке a, стоит впритык к его дальней
// стенке (x=1200), tol по умолчанию для одного участника = min(dx,dy)/2 = 600.
describe('resolveGroupDrop — стенки каждого отсека (p3p)', () => {
  const twoBays: Vehicle = {
    id: 't',
    name: 't',
    length: 5800,
    width: 2400,
    height: 2400,
    compartments: [
      { id: 'a', x: 0, length: 2400 },
      { id: 'b', x: 3400, length: 2400 },
    ],
  };
  const cube = (over: Partial<CargoType> = {}): CargoType => ({
    id: 'c',
    name: 'c',
    length: 1200,
    width: 1200,
    height: 1200,
    quantity: 8,
    rotation: 'none',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...over,
  });
  const atC = (x: number, y: number) => ({
    cargoTypeId: 'c',
    x,
    y,
    z: 0,
    orientation: 'lwh' as const,
    tier: 1,
    state: 'entschachtelt' as const,
  });
  const singleAtWall = (): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const layout: Layout = {
      ...packLoad(load),
      placements: [atC(1200, 0)], // впритык к дальней стенке отсека a — та же позиция, что тест выше
      unplaced: [{ cargoTypeId: 'c', count: 7 }],
    };
    return { load, layout, refs: [{ cargoTypeId: 'c', x: 1200, y: 0 }] };
  };

  /** Две участницы в РАЗНЫХ отсеках. Порядок refs — [A, B]: нарушителем во всех сценариях ниже
   *  сделана ВТОРАЯ участница. Иначе проверка «судим только members[0]» отвергала бы дельту по той
   *  же причине, что и корректный код, и тест не отличил бы одно от другого. */
  const pairAcrossBays = (
    xa: number,
    xb: number,
  ): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const layout: Layout = {
      ...packLoad(load),
      placements: [atC(xa, 0), atC(xb, 0)],
      unplaced: [{ cargoTypeId: 'c', count: 6 }],
    };
    return {
      load,
      layout,
      refs: [
        { cargoTypeId: 'c', x: xa, y: 0 },
        { cargoTypeId: 'c', x: xb, y: 0 },
      ],
    };
  };

  it('группу не телепортирует в разрыв — прицел вглубь разрыва снапится к ближней стенке прицепа', () => {
    const { load, layout, refs } = singleAtWall();
    // Дельта 2000: наивная цель x=1200+2000=3200 — внутри разрыва (2400,3400), туда нельзя. До
    // ближней стенки прицепа (target x=3400, дельта 2200) — 200 мм от наивной цели, в пределах
    // допуска 600 от прицела (|2200-2000|=200≤600) — магнит обязан вытянуть группу туда же, куда и
    // одиночную стопку.
    const res = resolveGroupDrop(load, layout, refs, { dx: 2000, dy: 0 });
    expect(res.ok).toBe(true);
    expect(res.dx).toBe(2200); // 1200 + 2200 = 3400 — впритык к передней стенке прицепа
  });

  // ADR 020 для группы: если resolveGroupDrop сказала ok, moveStacks по этой дельте не откажет.
  // Прогоняется по ОБЕИМ фикстурам: у группы из одной стопки `members.every(…)` вырождается в
  // `members[0]`, поэтому одиночка этот инвариант для группы не стережёт — пару нужно гонять
  // отдельно.
  const sweepFixtures: [string, () => { load: Load; layout: Layout; refs: StackRef[] }][] = [
    ['одна стопка у стенки тягача', singleAtWall],
    ['пара в разных отсеках', () => pairAcrossBays(0, 3600)],
  ];

  for (const [name, fixture] of sweepFixtures) {
    it(`never returns ok for a group delta moveStacks would refuse — ${name}`, () => {
      const { load, layout, refs } = fixture();
      for (let dx = -1600; dx <= 4600; dx += 100) {
        for (const dy of [0, 400, 800, 1200]) {
          const r = resolveGroupDrop(load, layout, refs, { dx, dy });
          if (!r.ok) continue;
          const moved = moveStacks(load, layout, refs, r.dx, r.dy);
          expect(
            moved.error,
            `resolveGroupDrop said ok at dx=${r.dx},dy=${r.dy} (aim ${dx},${dy}) but moveStacks refused`,
          ).toBeUndefined();
        }
      }
    });
  }

  it('отказывает, когда в разрыв попадает НЕ первая участница группы', () => {
    const { load, layout, refs } = pairAcrossBays(1200, 3400);
    // A@1200 — у дальней стенки тягача, B@3400 — у ближней стенки прицепа. Дельта −1000 ставит A в
    // [200, 1400) (законно, тягач), а B — в [2400, 3600): начало в разрыве. Ни один кандидат в
    // допуске 600 не устраивает ОБЕИХ: ближайший (−1200, при котором A встаёт к стенке x=0) уводит
    // B в [2200, 3400) — снова разрыв.
    const res = resolveGroupDrop(load, layout, refs, { dx: -1000, dy: 0 });

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('корректирует дельту по замыкающей участнице, а не по первой', () => {
    const { load, layout, refs } = pairAcrossBays(0, 3600);
    // Прицел 1200 — ровно та дельта, при которой A встаёт впритык к дальней стенке тягача. Для A она
    // законна, для B — нет: [4800, 6000) торчит за корму прицепа (5800). Магнит обязан отступить к
    // 1000, где к дальней стенке встаёт B, а A остаётся внутри тягача. 1000 и 1200 одинаково
    // «впритык», поэтому 1200 проверяется первой как ближняя к прицелу — и отвергается из-за B.
    const res = resolveGroupDrop(load, layout, refs, { dx: 1200, dy: 0 });

    expect(res.ok).toBe(true);
    expect(res.dx).toBe(1000);
    expect(res.dy).toBe(0);
  });

  it('не запрещает группе, законно стоящей сразу в двух отсеках, остаться на месте', () => {
    const { load, layout, refs } = pairAcrossBays(0, 3600);
    // Контроль на ложный отказ: проверка обязана отвергать нелегальное, не запрещая легального.
    // Краснеет, если отсек ищут один раз по первой участнице и её границами судят остальных —
    // тогда группа, живущая в двух отсеках, не может даже остаться на месте.
    const res = resolveGroupDrop(load, layout, refs, { dx: 0, dy: 0 });

    expect(res.ok).toBe(true);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
  });
});
